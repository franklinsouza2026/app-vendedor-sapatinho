// Sincronização de uma integração (D1, T6; Linx L2): adapter → contrato →
// ingestão → reconciliação → registro da execução. Cada execução fica
// registrada (IntegracaoExecucao) para a Saúde dos Dados — sucesso, contagens e
// erro já sanitizado (nunca credencial, nunca URL com segredo).
//
// Dois caminhos, escolhidos pelo adapter:
//   - JANELA DE DATA (`buscarEventos`): MOCK/CONTROLADO — cursorSync − 30 min;
//   - INCREMENTAL POR CURSOR (`buscarLote`): Linx Microvix — timestamp por
//     (método, escopo), página a página. Regra de checkpoint:
//       BUSCAR → VALIDAR → PERSISTIR → RECONCILIAR → CONFIRMAR → AVANÇAR CURSOR.
//     Falha em qualquer passo antes do avanço deixa o cursor onde estava: a
//     página é buscada de novo e a ingestão idempotente absorve o replay.
//
// Uma execução por integração por vez (trava com expiração). A reconciliação
// periódica relê uma janela curta SEM tocar nos cursores.
import { FaseCursorIntegracao } from '@prisma/client';
import { prisma } from '../../db';
import { env } from '../../config';
import { createLogger } from '../../utils/logger';
import { adapterDoProvedor, ConsultaIncremental, CursorFonte, ErpAdapter, ErroIntegracao, LoteIncremental, PROVEDORES_SO_DESENVOLVIMENTO } from '../../integracoes/erp';
import { timezoneDaEmpresa } from '../../tempo/empresa';
import { ingerirEventos, ResultadoIngestao } from '../vendas/ingestao.service';
import { reconciliarVendedor } from '../reconciliacao/motor';
import { credencialEmClaro } from './integracoes.service';
import { avancarCursores, carregarCursores, compararCursor, CursorInvalido, normalizarCursor, proximaFase } from './cursor.service';
import { janelaDeBackfill, janelaDeReabertura, janelaDeReconciliacao } from './janela';
import { adquirirTrava, liberarTrava } from './trava';
// Registra o reconciliador de missões governadas no motor (efeito colateral do import).
import '../missoes/missoes.service';

const log = createLogger('fase1:sync');

/** Primeira sincronização olha 2 dias para trás; depois, sobreposição de 30 min com a anterior (idempotência absorve). */
const JANELA_INICIAL_MS = 2 * 24 * 3600 * 1000;
const SOBREPOSICAO_MS = 30 * 60 * 1000;

export interface ResumoSync {
  integracaoId: string;
  status: 'SUCESSO' | 'ERRO' | 'IGNORADA';
  eventosRecebidos: number;
  vendasNovas: number;
  ajustesNovos: number;
  ignorados: number;
  paginas?: number;
  haMais?: boolean;
  erro?: string;
  motivo?: string;
}

interface Totais {
  recebidos: number;
  vendasNovas: number;
  ajustesNovos: number;
  cancelamentos: number;
  devolucoes: number;
  pendentes: number;
  ignorados: number;
  paginas: number;
  motivosIgnorados: Record<string, number>;
  ultimaVendaEm: Date | null;
}

const zerados = (): Totais => ({ recebidos: 0, vendasNovas: 0, ajustesNovos: 0, cancelamentos: 0, devolucoes: 0, pendentes: 0, ignorados: 0, paginas: 0, motivosIgnorados: {}, ultimaVendaEm: null });

function acumular(t: Totais, r: ResultadoIngestao) {
  t.recebidos += r.recebidos;
  t.vendasNovas += r.vendasNovas;
  t.ajustesNovos += r.ajustesNovos;
  t.cancelamentos += r.cancelamentos;
  t.devolucoes += r.devolucoes;
  t.pendentes += r.pendentes;
  t.ignorados += r.ignorados;
  for (const [k, v] of Object.entries(r.motivosIgnorados)) t.motivosIgnorados[k] = (t.motivosIgnorados[k] ?? 0) + (v ?? 0);
  if (r.ultimaVendaEm && (!t.ultimaVendaEm || r.ultimaVendaEm > t.ultimaVendaEm)) t.ultimaVendaEm = r.ultimaVendaEm;
}

function mensagemSegura(err: unknown): string {
  if (err instanceof ErroIntegracao) return err.message.slice(0, 500);
  if (err instanceof CursorInvalido) return 'A fonte devolveu um cursor inválido; nada foi avançado.';
  return 'Falha inesperada na sincronização (detalhe técnico registrado no log do servidor).';
}

/** Reconcilia os vendedores/dias afetados. Falha de um vendedor não derruba os outros (o fato já está gravado). */
async function reconciliarAfetados(r: ResultadoIngestao, agora: Date) {
  for (const [vendedorId, dias] of r.afetados) {
    try {
      await reconciliarVendedor(vendedorId, [...dias], { agora });
    } catch (err) {
      log.error({ err, vendedorId }, 'falha ao reconciliar vendedor após sync');
    }
  }
}

type IntegracaoComLojas = NonNullable<Awaited<ReturnType<typeof carregarIntegracao>>>;
const carregarIntegracao = (id: string) => prisma.integracao.findUnique({ where: { id }, include: { lojas: true } });

async function registrarFim(execucaoId: string, integracaoId: string, t: Totais, erro: string | null, integracao: IntegracaoComLojas, opcoes: { avancarCursorData?: Date; agora: Date }) {
  const ignoradosTexto = t.ignorados ? `Ignorados: ${JSON.stringify(t.motivosIgnorados)}` : null;
  await prisma.$transaction([
    prisma.integracaoExecucao.update({
      where: { id: execucaoId },
      data: { status: erro ? 'ERRO' : 'SUCESSO', finalizadaEm: new Date(), eventosRecebidos: t.recebidos, vendasNovas: t.vendasNovas, ajustesNovos: t.ajustesNovos, cancelamentos: t.cancelamentos, devolucoes: t.devolucoes, pendentes: t.pendentes, paginas: t.paginas, ignorados: t.ignorados, erro: erro ?? ignoradosTexto },
    }),
    prisma.integracao.update({
      where: { id: integracaoId },
      data: erro
        ? { ultimaSyncEm: new Date() }
        : {
            ...(opcoes.avancarCursorData ? { cursorSync: opcoes.avancarCursorData } : {}),
            ultimaSyncEm: new Date(),
            ultimaSyncSucessoEm: new Date(),
            ...(t.ultimaVendaEm && (!integracao.ultimaVendaEm || t.ultimaVendaEm > integracao.ultimaVendaEm) ? { ultimaVendaEm: t.ultimaVendaEm } : {}),
          },
    }),
  ]);
}

function consultaBase(integracao: IntegracaoComLojas) {
  return {
    integracaoId: integracao.id,
    empresaId: integracao.empresaId,
    lojasExternas: integracao.lojas.map((l) => l.codigoExterno),
    credencial: credencialEmClaro(integracao),
    configuracao: integracao.configuracao as Record<string, unknown>,
  };
}

/** Cursores devolvidos pela fonte, validados (inteiros BIGINT) e nunca abaixo do atual em memória. */
function validarCursoresDoLote(lote: LoteIncremental, atuais: Map<string, string>): { metodo: string; escopo: string; valor: string }[] {
  if (!lote || !Array.isArray(lote.eventos) || !Array.isArray(lote.cursores) || typeof lote.haMais !== 'boolean') throw new ErroIntegracao('A fonte devolveu uma página em formato inesperado.');
  return lote.cursores.map((c) => {
    if (typeof c?.metodo !== 'string' || !c.metodo || typeof c?.escopo !== 'string' || !c.escopo) throw new ErroIntegracao('A fonte devolveu um cursor sem método/escopo.');
    const valor = normalizarCursor(c.valor);
    const atual = atuais.get(`${c.metodo}|${c.escopo}`);
    // Nunca retrocede: um cursor menor é ignorado (o gravado continua valendo).
    return { metodo: c.metodo, escopo: c.escopo, valor: atual && compararCursor(valor, atual) < 0 ? atual : valor };
  });
}

/** Caminho incremental (Linx): página a página, cursor só avança depois da página processada. */
async function sincronizarIncremental(adapter: ErpAdapter & { buscarLote: NonNullable<ErpAdapter['buscarLote']> }, integracao: IntegracaoComLojas, execucaoId: string, agora: Date): Promise<{ t: Totais; haMais: boolean }> {
  const t = zerados();
  const tz = await timezoneDaEmpresa(integracao.empresaId);
  let haMais = true;
  for (let pagina = 0; pagina < env.ERP_MAX_PAGINAS_POR_EXECUCAO && haMais; pagina++) {
    const cursores = await carregarCursores(integracao.id);
    const faseAtual: FaseCursorIntegracao | null = cursores.length ? (cursores.some((c) => c.fase === 'BACKFILL') ? 'BACKFILL' : cursores.some((c) => c.fase === 'CATCH_UP') ? 'CATCH_UP' : 'LIVE') : null;
    const janela = faseAtual === null || faseAtual === 'BACKFILL' ? janelaDeBackfill(agora, tz, (integracao.configuracao as Record<string, unknown>)?.backfillDesde) : janelaDeReabertura(agora, tz);
    const consulta: ConsultaIncremental = { ...consultaBase(integracao), cursores, janela, modo: 'INCREMENTAL' };

    // 1) BUSCAR  2) VALIDAR
    const lote = await adapter.buscarLote(consulta);
    const atuais = new Map(cursores.map((c) => [`${c.metodo}|${c.escopo}`, c.valor]));
    const novos = validarCursoresDoLote(lote, atuais);

    // 3) PERSISTIR (idempotente)  4) RECONCILIAR
    const r = await ingerirEventos({ empresaId: integracao.empresaId, integracaoId: integracao.id, eventos: lote.eventos });
    await reconciliarAfetados(r, agora);
    acumular(t, r);
    t.paginas++;

    // 5) CONFIRMAR → 6) AVANÇAR (compare-and-set monotônico)
    haMais = lote.haMais;
    await avancarCursores({ empresaId: integracao.empresaId, integracaoId: integracao.id, cursores: novos, fase: proximaFase(faseAtual, haMais), registros: lote.eventos.length });
    await prisma.integracaoExecucao.update({ where: { id: execucaoId }, data: { paginas: t.paginas, eventosRecebidos: t.recebidos } });
  }
  return { t, haMais };
}

export async function sincronizarIntegracao(integracaoId: string, agora: Date = new Date()): Promise<ResumoSync> {
  const vazio = { integracaoId, eventosRecebidos: 0, vendasNovas: 0, ajustesNovos: 0, ignorados: 0 };
  const integracao = await carregarIntegracao(integracaoId);
  if (!integracao || integracao.status !== 'ATIVA') return { ...vazio, status: 'IGNORADA', motivo: 'integração inativa ou inexistente' };
  if (env.NODE_ENV === 'production' && PROVEDORES_SO_DESENVOLVIMENTO.includes(integracao.provedor)) {
    log.error({ integracaoId }, 'provedor de desenvolvimento ativo em produção — sincronização recusada');
    return { ...vazio, status: 'ERRO', erro: 'Provedor de demonstração não pode rodar em produção.' };
  }

  const trava = await adquirirTrava(integracaoId, agora);
  if (!trava) return { ...vazio, status: 'IGNORADA', motivo: 'sincronização já em andamento' };
  const execucao = await prisma.integracaoExecucao.create({ data: { integracaoId, empresaId: integracao.empresaId, tipo: 'SYNC' } });

  try {
    const adapter = adapterDoProvedor(integracao.provedor);
    if (adapter.buscarLote) {
      const { t, haMais } = await sincronizarIncremental(adapter as ErpAdapter & { buscarLote: NonNullable<ErpAdapter['buscarLote']> }, integracao, execucao.id, agora);
      await registrarFim(execucao.id, integracaoId, t, null, integracao, { agora });
      return { integracaoId, status: 'SUCESSO', eventosRecebidos: t.recebidos, vendasNovas: t.vendasNovas, ajustesNovos: t.ajustesNovos, ignorados: t.ignorados, paginas: t.paginas, haMais };
    }

    // Caminho por janela de data (MOCK/CONTROLADO).
    const desde = integracao.cursorSync ? new Date(integracao.cursorSync.getTime() - SOBREPOSICAO_MS) : new Date(agora.getTime() - JANELA_INICIAL_MS);
    const eventos = await adapter.buscarEventos({ ...consultaBase(integracao), desde, ate: agora });
    const r = await ingerirEventos({ empresaId: integracao.empresaId, integracaoId, eventos });
    await reconciliarAfetados(r, agora);
    const t = zerados();
    acumular(t, r);
    t.paginas = 1;
    await registrarFim(execucao.id, integracaoId, t, null, integracao, { avancarCursorData: agora, agora });
    return { integracaoId, status: 'SUCESSO', eventosRecebidos: t.recebidos, vendasNovas: t.vendasNovas, ajustesNovos: t.ajustesNovos, ignorados: t.ignorados, paginas: 1 };
  } catch (err) {
    const erro = mensagemSegura(err);
    log.error({ err: err instanceof ErroIntegracao ? err.message : err, integracaoId }, 'sincronização falhou');
    await registrarFim(execucao.id, integracaoId, zerados(), erro, integracao, { agora });
    return { ...vazio, status: 'ERRO', erro };
  } finally {
    await liberarTrava(integracaoId, trava);
  }
}

export async function sincronizarTodasAtivas(agora: Date = new Date()) {
  const ativas = await prisma.integracao.findMany({ where: { status: 'ATIVA' }, select: { id: true } });
  const resumos: ResumoSync[] = [];
  for (const i of ativas) resumos.push(await sincronizarIntegracao(i.id, agora));
  return resumos;
}

/**
 * Reconciliação periódica: relê uma janela curta (ERP_RECONCILIACAO_DIAS) e
 * reaplica pela ingestão idempotente — pega venda tardia, cancelamento ou
 * devolução que tenha escapado do incremental. NUNCA grava cursor (usa
 * cursores zerados só em memória) e nunca apaga fato.
 */
export async function reconciliarIntegracao(integracaoId: string, agora: Date = new Date(), dias: number = env.ERP_RECONCILIACAO_DIAS): Promise<ResumoSync> {
  const vazio = { integracaoId, eventosRecebidos: 0, vendasNovas: 0, ajustesNovos: 0, ignorados: 0 };
  const integracao = await carregarIntegracao(integracaoId);
  if (!integracao || integracao.status !== 'ATIVA') return { ...vazio, status: 'IGNORADA', motivo: 'integração inativa ou inexistente' };
  if (env.NODE_ENV === 'production' && PROVEDORES_SO_DESENVOLVIMENTO.includes(integracao.provedor)) return { ...vazio, status: 'ERRO', erro: 'Provedor de demonstração não pode rodar em produção.' };

  const trava = await adquirirTrava(integracaoId, agora);
  if (!trava) return { ...vazio, status: 'IGNORADA', motivo: 'sincronização já em andamento' };
  const execucao = await prisma.integracaoExecucao.create({ data: { integracaoId, empresaId: integracao.empresaId, tipo: 'RECONCILIACAO' } });
  const t = zerados();
  try {
    const adapter = adapterDoProvedor(integracao.provedor);
    const tz = await timezoneDaEmpresa(integracao.empresaId);
    const janela = janelaDeReconciliacao(agora, tz, dias);
    if (adapter.buscarLote) {
      // Cursores em MEMÓRIA a partir de zero: relê a janela inteira, página a página.
      let memoria: CursorFonte[] = [];
      let haMais = true;
      for (let pagina = 0; pagina < env.ERP_MAX_PAGINAS_POR_EXECUCAO && haMais; pagina++) {
        const lote = await adapter.buscarLote({ ...consultaBase(integracao), cursores: memoria, janela, modo: 'RECONCILIACAO' });
        const novos = validarCursoresDoLote(lote, new Map(memoria.map((c) => [`${c.metodo}|${c.escopo}`, c.valor])));
        const r = await ingerirEventos({ empresaId: integracao.empresaId, integracaoId, eventos: lote.eventos });
        await reconciliarAfetados(r, agora);
        acumular(t, r);
        t.paginas++;
        haMais = lote.haMais;
        const porChave = new Map(memoria.map((c) => [`${c.metodo}|${c.escopo}`, c]));
        for (const n of novos) porChave.set(`${n.metodo}|${n.escopo}`, { ...n, fase: 'BACKFILL' });
        memoria = [...porChave.values()];
      }
    } else {
      const desde = new Date(agora.getTime() - dias * 24 * 3600 * 1000);
      const eventos = await adapter.buscarEventos({ ...consultaBase(integracao), desde, ate: agora });
      const r = await ingerirEventos({ empresaId: integracao.empresaId, integracaoId, eventos });
      await reconciliarAfetados(r, agora);
      acumular(t, r);
      t.paginas = 1;
    }
    await registrarFim(execucao.id, integracaoId, t, null, integracao, { agora });
    return { integracaoId, status: 'SUCESSO', eventosRecebidos: t.recebidos, vendasNovas: t.vendasNovas, ajustesNovos: t.ajustesNovos, ignorados: t.ignorados, paginas: t.paginas };
  } catch (err) {
    const erro = mensagemSegura(err);
    log.error({ err: err instanceof ErroIntegracao ? err.message : err, integracaoId }, 'reconciliação falhou');
    await registrarFim(execucao.id, integracaoId, zerados(), erro, integracao, { agora });
    return { ...vazio, status: 'ERRO', erro };
  } finally {
    await liberarTrava(integracaoId, trava);
  }
}

export async function reconciliarTodasAtivas(agora: Date = new Date()) {
  const ativas = await prisma.integracao.findMany({ where: { status: 'ATIVA' }, select: { id: true } });
  const resumos: ResumoSync[] = [];
  for (const i of ativas) resumos.push(await reconciliarIntegracao(i.id, agora));
  return resumos;
}
