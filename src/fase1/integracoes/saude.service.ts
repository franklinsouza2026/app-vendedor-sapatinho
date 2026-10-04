// Saúde dos Dados (T6) — o mínimo que o Admin precisa para operar o piloto sem
// terminal: a integração está viva? Quando chegou a última venda? O worker
// está batendo? A fila está acumulando? Houve erro recente?
//
//   🟢 OPERACIONAL  último sync com sucesso há ≤ 90 min, sem erro na última execução
//   🟡 ATENCAO      entre 90 min e 3 h, ou erro recente com sucesso depois, ou
//                   eventos ignorados (loja/vendedor sem vínculo)
//   🔴 FALHA        > 3 h sem sucesso, última execução com erro, worker sem
//                   batida há > 5 min, ou nenhuma integração ativa
import { prisma } from '../../db';

export const LIMITE_ATENCAO_MIN = 90;
export const LIMITE_FALHA_MIN = 180;
export const LIMITE_WORKER_MIN = 5;

export type Estado = 'OPERACIONAL' | 'ATENCAO' | 'FALHA';

export interface ItemSaude {
  estado: Estado;
  motivo: string;
}

/** Regra pura (testada): estado da integração a partir dos fatos. */
export function avaliarIntegracao(p: { agora: Date; ultimaSucessoEm: Date | null; ultimaExecucao: { status: string; ignorados: number } | null; erroRecenteComSucessoDepois: boolean }): ItemSaude {
  if (!p.ultimaSucessoEm) return { estado: 'FALHA', motivo: 'Ainda não houve nenhuma sincronização com sucesso.' };
  const min = (p.agora.getTime() - p.ultimaSucessoEm.getTime()) / 60000;
  if (p.ultimaExecucao?.status === 'ERRO') return { estado: 'FALHA', motivo: 'A última sincronização falhou.' };
  if (min > LIMITE_FALHA_MIN) return { estado: 'FALHA', motivo: `Sem sincronizar com sucesso há ${Math.round(min / 60)} h.` };
  if (min > LIMITE_ATENCAO_MIN) return { estado: 'ATENCAO', motivo: `Último dado há ${Math.round(min)} min — acima do esperado.` };
  if (p.ultimaExecucao && p.ultimaExecucao.ignorados > 0) return { estado: 'ATENCAO', motivo: `${p.ultimaExecucao.ignorados} evento(s) ignorado(s) na última sincronização (loja ou vendedor sem vínculo).` };
  if (p.erroRecenteComSucessoDepois) return { estado: 'ATENCAO', motivo: 'Houve erro nas últimas 24 h, já recuperado.' };
  return { estado: 'OPERACIONAL', motivo: 'Sincronizando normalmente.' };
}

export function avaliarWorker(agora: Date, ultimoEm: Date | null): ItemSaude {
  if (!ultimoEm) return { estado: 'FALHA', motivo: 'O processador de tarefas (worker) nunca deu sinal de vida.' };
  const min = (agora.getTime() - ultimoEm.getTime()) / 60000;
  if (min > LIMITE_WORKER_MIN) return { estado: 'FALHA', motivo: `O processador de tarefas (worker) não dá sinal há ${Math.round(min)} min.` };
  return { estado: 'OPERACIONAL', motivo: 'Processador de tarefas ativo.' };
}

const PESO: Record<Estado, number> = { OPERACIONAL: 0, ATENCAO: 1, FALHA: 2 };
export function pior(...estados: Estado[]): Estado {
  return estados.reduce((a, b) => (PESO[b] > PESO[a] ? b : a), 'OPERACIONAL' as Estado);
}

export type ContadorFila = () => Promise<{ aguardando: number; falhas: number } | null>;

export async function saudeDaEmpresa(empresaId: string, contarFila: ContadorFila, agora: Date = new Date()) {
  const [integracoes, heartbeat, fila] = await Promise.all([
    prisma.integracao.findMany({ where: { empresaId }, include: { lojas: true } }),
    prisma.workerHeartbeat.findUnique({ where: { nome: 'worker' } }),
    contarFila().catch(() => null),
  ]);
  const desde24h = new Date(agora.getTime() - 24 * 3600 * 1000);
  const lojas = await prisma.loja.findMany({ where: { empresaId, ativa: true }, select: { id: true, nome: true } });

  const itens = await Promise.all(
    integracoes.map(async (i) => {
      const execucoes = await prisma.integracaoExecucao.findMany({ where: { integracaoId: i.id }, orderBy: { iniciadaEm: 'desc' }, take: 10 });
      const ultima = execucoes[0] ?? null;
      const errosRecentes = execucoes.filter((e) => e.status === 'ERRO' && e.iniciadaEm >= desde24h);
      const avaliacao = i.status !== 'ATIVA'
        ? { estado: 'ATENCAO' as Estado, motivo: i.status === 'DESATIVADA' ? 'Integração desativada.' : 'Integração em configuração.' }
        : avaliarIntegracao({ agora, ultimaSucessoEm: i.ultimaSyncSucessoEm, ultimaExecucao: ultima ? { status: ultima.status, ignorados: ultima.ignorados } : null, erroRecenteComSucessoDepois: errosRecentes.length > 0 });
      return {
        id: i.id,
        provedor: i.provedor,
        status: i.status,
        ...avaliacao,
        ultimaSyncEm: i.ultimaSyncEm,
        ultimaSyncSucessoEm: i.ultimaSyncSucessoEm,
        ultimaVendaEm: i.ultimaVendaEm,
        lojasVinculadas: i.lojas.map((l) => ({ lojaId: l.lojaId, codigoExterno: l.codigoExterno, nome: lojas.find((x) => x.id === l.lojaId)?.nome ?? '—' })),
        execucoes: execucoes.map((e) => ({ id: e.id, iniciadaEm: e.iniciadaEm, finalizadaEm: e.finalizadaEm, status: e.status, eventosRecebidos: e.eventosRecebidos, vendasNovas: e.vendasNovas, ajustesNovos: e.ajustesNovos, ignorados: e.ignorados, erro: e.erro })),
        errosUltimas24h: errosRecentes.length,
      };
    })
  );

  const worker = avaliarWorker(agora, heartbeat?.ultimoEm ?? null);
  const ativas = itens.filter((i) => i.status === 'ATIVA');
  const filaItem: ItemSaude = fila === null ? { estado: 'ATENCAO', motivo: 'Não foi possível consultar a fila de tarefas.' } : fila.aguardando > 20 ? { estado: 'ATENCAO', motivo: `${fila.aguardando} tarefas aguardando na fila.` } : { estado: 'OPERACIONAL', motivo: 'Fila em dia.' };
  const geral: ItemSaude =
    ativas.length === 0
      ? { estado: 'FALHA', motivo: 'Nenhuma integração de vendas ativa — o app não recebe vendas.' }
      : { estado: pior(worker.estado, filaItem.estado, ...ativas.map((i) => i.estado)), motivo: '' };
  if (!geral.motivo) geral.motivo = geral.estado === 'OPERACIONAL' ? 'Tudo operando.' : [worker, filaItem, ...ativas].filter((x) => x.estado !== 'OPERACIONAL').map((x) => x.motivo).join(' ');

  const ultimaVendaEm = itens.map((i) => i.ultimaVendaEm).filter((d): d is Date => Boolean(d)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const ultimaSyncSucessoEm = itens.map((i) => i.ultimaSyncSucessoEm).filter((d): d is Date => Boolean(d)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  return { geral, worker: { ...worker, ultimoEm: heartbeat?.ultimoEm ?? null }, fila: { ...filaItem, ...(fila ?? {}) }, integracoes: itens, ultimaVendaEm, ultimaSyncSucessoEm, lojasSemVinculo: lojas.filter((l) => !itens.some((i) => i.lojasVinculadas.some((v) => v.lojaId === l.id))).map((l) => l.nome) };
}

/** Frescor do dado para o VENDEDOR (sem detalhe técnico): quando foi a última sincronização com sucesso das lojas dele. */
export async function frescorParaLoja(empresaId: string, lojaId: string, agora: Date = new Date()) {
  const integracoes = await prisma.integracao.findMany({ where: { empresaId, status: 'ATIVA', lojas: { some: { lojaId } } }, select: { ultimaSyncSucessoEm: true } });
  const ultima = integracoes.map((i) => i.ultimaSyncSucessoEm).filter((d): d is Date => Boolean(d)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const desatualizado = !ultima || (agora.getTime() - ultima.getTime()) / 60000 > LIMITE_ATENCAO_MIN;
  return { sincronizadoEm: ultima, desatualizado };
}
