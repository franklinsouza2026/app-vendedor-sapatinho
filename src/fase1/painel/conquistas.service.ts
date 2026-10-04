// Conquistas do vendedor — catálogo real de badges + concessões vigentes
// (revogadas por correção de venda não contam) + "quanto falta" calculado dos
// dados, nunca texto fixo.
import { prisma } from '../../db';

const ICONE: Record<string, string> = {
  PRIMEIRA_META: '🎯',
  STREAK_7: '🔥',
  PA_MASTER: '👟',
  TICKET_MASTER: '💎',
  CAMPEAO_DA_SEASON: '👑',
  TOP_3: '🥉',
  MAIOR_EVOLUCAO: '🌱',
  CONSISTENCIA: '🧱',
  CAMPEAO_DE_TREINAMENTO: '🎓',
  DESTAQUE_DA_EQUIPE: '🏬',
};

/** Badges que fazem parte da Fase 1 (os de treinamento/temporada ficam fora do piloto). */
const CATALOGO_FASE1 = ['PRIMEIRA_META', 'STREAK_7', 'PA_MASTER', 'TICKET_MASTER', 'MAIOR_EVOLUCAO', 'DESTAQUE_DA_EQUIPE', 'TOP_3'];

export async function conquistasDoVendedor(vendedorId: string, contexto: { sequenciaAtual: number; hojeMeta: number | null; hojeFaturamento: number }) {
  const [catalogo, concessoes] = await Promise.all([
    prisma.badge.findMany({ where: { codigo: { in: CATALOGO_FASE1 } } }),
    prisma.badgeConcessao.findMany({ where: { vendedorId, revogadoEm: null }, include: { badge: true }, orderBy: { concedidoEm: 'asc' } }),
  ]);
  const conquistadas = new Map(concessoes.map((c) => [c.badge.codigo, c]));
  const lista = catalogo.map((b) => {
    const c = conquistadas.get(b.codigo);
    let falta: string | undefined;
    let progresso: number | undefined;
    if (!c && b.codigo === 'STREAK_7') {
      const faltam = Math.max(0, 7 - contexto.sequenciaAtual);
      falta = `faltam ${faltam} ${faltam === 1 ? 'dia' : 'dias'} de meta batida`;
      progresso = (contexto.sequenciaAtual / 7) * 100;
    }
    if (!c && b.codigo === 'PRIMEIRA_META' && contexto.hojeMeta) {
      const falt = Math.max(0, contexto.hojeMeta - contexto.hojeFaturamento);
      falta = `faltam R$ ${Math.ceil(falt).toLocaleString('pt-BR')} na meta de hoje`;
      progresso = Math.min(100, (contexto.hojeFaturamento / contexto.hojeMeta) * 100);
    }
    return { codigo: b.codigo, titulo: b.titulo, descricao: b.descricao, icone: ICONE[b.codigo] ?? '🏅', origem: 'CATALOGO' as const, conquistadaEm: c ? c.concedidoEm.toISOString().slice(0, 10) : null, falta, progresso };
  });
  // Badges de prêmio conquistados (catálogo próprio de cada prêmio).
  for (const c of concessoes.filter((x) => !CATALOGO_FASE1.includes(x.badge.codigo))) {
    if (lista.some((l) => l.codigo === c.badge.codigo)) continue;
    lista.push({ codigo: c.badge.codigo, titulo: c.badge.titulo, descricao: c.badge.descricao, icone: '🏆', origem: 'CATALOGO', conquistadaEm: c.concedidoEm.toISOString().slice(0, 10), falta: undefined, progresso: undefined });
  }
  return lista;
}
