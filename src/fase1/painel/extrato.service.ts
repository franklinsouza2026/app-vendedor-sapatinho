// Extrato de XP e VendaCoins para o vendedor — leitura do ledger oficial,
// com a ORIGEM em linguagem de loja (nunca código interno). Estornos aparecem
// como estornos: o vendedor vê o crédito e a correção, nada some.
import { TipoEventoGamificacao } from '@prisma/client';
import { prisma } from '../../db';

const ROTULO: Partial<Record<TipoEventoGamificacao, string>> = {
  META_DIARIA_100: 'Meta diária atingida',
  META_DIARIA_110: '110% da meta diária',
  META_DIARIA_120: '120% da meta diária',
  META_DIARIA_150: '150% da meta diária',
  MELHORA_PA: 'Melhora no PA',
  MELHORA_TICKET: 'Melhora no ticket médio',
  STREAK_3: 'Sequência de 3 dias',
  STREAK_5: 'Sequência de 5 dias',
  STREAK_10: 'Sequência de 10 dias',
  ACESSO_DIARIO: 'Check-in diário',
  TREINAMENTO_CONCLUIDO: 'Treinamento concluído',
  QUIZ_APROVADO: 'Quiz aprovado',
  AJUSTE_MANUAL: 'Ajuste do Admin',
};

const ROTULO_REFERENCIA: Record<string, string> = {
  META_DIARIA_TIER: 'meta diária',
  BASELINE_PA: 'melhora no PA',
  BASELINE_TICKET: 'melhora no ticket',
  SEQUENCIA_META: 'sequência de meta',
  MISSAO_GOVERNADA: 'missão',
  COMPETICAO_PREMIO: 'prêmio de competição',
  CAMPANHA_PREMIO: 'prêmio de campanha',
};

interface Linha {
  idempotencyKey: string;
  tipoEvento: TipoEventoGamificacao;
  referenciaTipo: string | null;
  referenciaId: string | null;
  ocorridoEm: Date;
  valor: number;
}

async function nomesDeReferencia(linhas: Linha[]) {
  const assignments = linhas.filter((l) => l.referenciaTipo === 'MISSAO_GOVERNADA' && l.referenciaId).map((l) => l.referenciaId!);
  const competicoes = linhas.filter((l) => l.referenciaTipo === 'COMPETICAO_PREMIO' && l.referenciaId).map((l) => l.referenciaId!.split(':')[0]);
  const campanhas = linhas.filter((l) => l.referenciaTipo === 'CAMPANHA_PREMIO' && l.referenciaId).map((l) => l.referenciaId!.split(':')[0]);
  const [as, cs, ca] = await Promise.all([
    assignments.length ? prisma.missionAssignment.findMany({ where: { id: { in: assignments } }, select: { id: true, definicao: { select: { title: true } } } }) : [],
    competicoes.length ? prisma.competition.findMany({ where: { id: { in: competicoes } }, select: { id: true, name: true } }) : [],
    campanhas.length ? prisma.campanha.findMany({ where: { id: { in: campanhas } }, select: { id: true, nome: true } }) : [],
  ]);
  return {
    missao: new Map(as.map((a) => [a.id, a.definicao.title])),
    competicao: new Map(cs.map((c) => [c.id, c.name])),
    campanha: new Map(ca.map((c) => [c.id, c.nome])),
  };
}

function origem(l: Linha, nomes: Awaited<ReturnType<typeof nomesDeReferencia>>): string {
  const base = (() => {
    if (l.referenciaTipo === 'MISSAO_GOVERNADA') return `Missão “${nomes.missao.get(l.referenciaId ?? '') ?? 'missão'}”`;
    if (l.referenciaTipo === 'COMPETICAO_PREMIO') return `Prêmio da competição “${nomes.competicao.get((l.referenciaId ?? '').split(':')[0]) ?? 'competição'}”`;
    if (l.referenciaTipo === 'CAMPANHA_PREMIO') return `Prêmio da campanha “${nomes.campanha.get((l.referenciaId ?? '').split(':')[0]) ?? 'campanha'}”`;
    return ROTULO[l.tipoEvento] ?? 'Recompensa';
  })();
  if (l.tipoEvento === 'REVERSAO') return `Estorno: ${ROTULO_REFERENCIA[l.referenciaTipo ?? ''] ? `${ROTULO_REFERENCIA[l.referenciaTipo ?? '']} desfeita por venda cancelada/devolvida` : 'correção'}`;
  if (l.tipoEvento === 'AJUSTE_MANUAL' && l.referenciaId) return `Ajuste do Admin: ${l.referenciaId}`;
  return base;
}

export async function extratoDoVendedor(vendedorId: string, limite = 60) {
  const [xps, moedas, totalXp, saldo] = await Promise.all([
    prisma.xpTransacao.findMany({ where: { vendedorId }, orderBy: { ocorridoEm: 'desc' }, take: limite }),
    prisma.moedaTransacao.findMany({ where: { vendedorId }, orderBy: { ocorridoEm: 'desc' }, take: limite }),
    prisma.xpTransacao.aggregate({ where: { vendedorId }, _sum: { quantidade: true } }),
    prisma.moedaTransacao.aggregate({ where: { vendedorId }, _sum: { valor: true } }),
  ]);
  const linhasXp: Linha[] = xps.map((t) => ({ ...t, valor: t.quantidade }));
  const linhasMoeda: Linha[] = moedas.map((t) => ({ ...t, valor: t.valor }));
  const nomes = await nomesDeReferencia([...linhasXp, ...linhasMoeda]);
  return {
    xp: { total: totalXp._sum.quantidade ?? 0, historico: linhasXp.map((l) => ({ id: `xp:${l.idempotencyKey}`, quando: l.ocorridoEm.toISOString(), origem: origem(l, nomes), xp: l.valor })) },
    moedas: { saldo: saldo._sum.valor ?? 0, historico: linhasMoeda.map((l) => ({ id: `m:${l.idempotencyKey}`, quando: l.ocorridoEm.toISOString(), origem: origem(l, nomes), valor: l.valor })) },
  };
}
