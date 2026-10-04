// Sincronização de uma integração (D1, T6): adapter → contrato → ingestão →
// reconciliação → registro da execução. Cada execução fica registrada
// (IntegracaoExecucao) para a Saúde dos Dados — sucesso, contagens e erro já
// sanitizado (nunca credencial, nunca URL com segredo).
import { prisma } from '../../db';
import { env } from '../../config';
import { createLogger } from '../../utils/logger';
import { adapterDoProvedor, ErroIntegracao, PROVEDORES_SO_DESENVOLVIMENTO } from '../../integracoes/erp';
import { ingerirEventos } from '../vendas/ingestao.service';
import { reconciliarVendedor } from '../reconciliacao/motor';
import { credencialEmClaro } from './integracoes.service';
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
  erro?: string;
}

function mensagemSegura(err: unknown): string {
  if (err instanceof ErroIntegracao) return err.message.slice(0, 500);
  return 'Falha inesperada na sincronização (detalhe técnico registrado no log do servidor).';
}

export async function sincronizarIntegracao(integracaoId: string, agora: Date = new Date()): Promise<ResumoSync> {
  const integracao = await prisma.integracao.findUnique({ where: { id: integracaoId }, include: { lojas: true } });
  if (!integracao || integracao.status !== 'ATIVA') return { integracaoId, status: 'IGNORADA', eventosRecebidos: 0, vendasNovas: 0, ajustesNovos: 0, ignorados: 0 };
  if (env.NODE_ENV === 'production' && PROVEDORES_SO_DESENVOLVIMENTO.includes(integracao.provedor)) {
    log.error({ integracaoId }, 'provedor de desenvolvimento ativo em produção — sincronização recusada');
    return { integracaoId, status: 'ERRO', eventosRecebidos: 0, vendasNovas: 0, ajustesNovos: 0, ignorados: 0, erro: 'Provedor de demonstração não pode rodar em produção.' };
  }

  const execucao = await prisma.integracaoExecucao.create({ data: { integracaoId, empresaId: integracao.empresaId } });
  const desde = integracao.cursorSync ? new Date(integracao.cursorSync.getTime() - SOBREPOSICAO_MS) : new Date(agora.getTime() - JANELA_INICIAL_MS);

  try {
    const adapter = adapterDoProvedor(integracao.provedor);
    const eventos = await adapter.buscarEventos({
      integracaoId,
      empresaId: integracao.empresaId,
      lojasExternas: integracao.lojas.map((l) => l.codigoExterno),
      desde,
      ate: agora,
      credencial: credencialEmClaro(integracao),
      configuracao: integracao.configuracao as Record<string, unknown>,
    });
    const r = await ingerirEventos({ empresaId: integracao.empresaId, integracaoId, eventos });

    for (const [vendedorId, dias] of r.afetados) {
      try {
        await reconciliarVendedor(vendedorId, [...dias], { agora });
      } catch (err) {
        // Falha de um vendedor não derruba o sync: o fato já está gravado e a
        // próxima execução (ou o reprocesso) reconcilia de novo.
        log.error({ err, vendedorId }, 'falha ao reconciliar vendedor após sync');
      }
    }

    await prisma.$transaction([
      prisma.integracaoExecucao.update({ where: { id: execucao.id }, data: { status: 'SUCESSO', finalizadaEm: new Date(), eventosRecebidos: r.recebidos, vendasNovas: r.vendasNovas, ajustesNovos: r.ajustesNovos, ignorados: r.ignorados, erro: r.ignorados ? `Ignorados: ${JSON.stringify(r.motivosIgnorados)}` : null } }),
      prisma.integracao.update({
        where: { id: integracaoId },
        data: { cursorSync: agora, ultimaSyncEm: new Date(), ultimaSyncSucessoEm: new Date(), ...(r.ultimaVendaEm && (!integracao.ultimaVendaEm || r.ultimaVendaEm > integracao.ultimaVendaEm) ? { ultimaVendaEm: r.ultimaVendaEm } : {}) },
      }),
    ]);
    return { integracaoId, status: 'SUCESSO', eventosRecebidos: r.recebidos, vendasNovas: r.vendasNovas, ajustesNovos: r.ajustesNovos, ignorados: r.ignorados };
  } catch (err) {
    const erro = mensagemSegura(err);
    log.error({ err: err instanceof ErroIntegracao ? err.message : err, integracaoId }, 'sincronização falhou');
    await prisma.$transaction([
      prisma.integracaoExecucao.update({ where: { id: execucao.id }, data: { status: 'ERRO', finalizadaEm: new Date(), erro } }),
      prisma.integracao.update({ where: { id: integracaoId }, data: { ultimaSyncEm: new Date() } }),
    ]);
    return { integracaoId, status: 'ERRO', eventosRecebidos: 0, vendasNovas: 0, ajustesNovos: 0, ignorados: 0, erro };
  }
}

export async function sincronizarTodasAtivas(agora: Date = new Date()) {
  const ativas = await prisma.integracao.findMany({ where: { status: 'ATIVA' }, select: { id: true } });
  const resumos: ResumoSync[] = [];
  for (const i of ativas) resumos.push(await sincronizarIntegracao(i.id, agora));
  return resumos;
}
