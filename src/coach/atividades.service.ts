// Atividades recentes de aprendizagem (Etapa 2B.1).
//
// `CoachContext.development.recentTrainings` existia desde a Fatia 4 e estava
// fixo em `[]`, com o comentário "// Academia é Fatia 6" — oito fatias depois,
// com Academia, Simulador e Universidade em pé, o Conselheiro continuava sem
// saber nada do que a pessoa tinha estudado.
//
// BOUNDED CONTEXT: nunca o catálogo, nunca o histórico inteiro. Só o que a
// pessoa concluiu nos últimos dias, com o mínimo pra conversar a respeito —
// título, quando e a nota quando existir. Nenhum ID interno, nenhum gabarito.
import { prisma } from '../db';
import { AtividadeRecente } from './context.types';

const JANELA_DIAS = 14;
const MAX_ATIVIDADES = 5;

/**
 * Atividades de aprendizagem concluídas recentemente pelo próprio vendedor.
 *
 * Fato puro, sem limiar e sem julgamento: o Conselheiro pode reconhecer,
 * perguntar como foi ou conectar com a prática — mas **estar no contexto não
 * obriga a mencionar** (Constituição §8, SABER ≠ FALAR).
 */
export async function listarAtividadesRecentes(vendedorId: string, agora: Date = new Date()): Promise<AtividadeRecente[]> {
  const desde = new Date(agora.getTime() - JANELA_DIAS * 24 * 60 * 60 * 1000);

  const [progressos, simulacoes] = await Promise.all([
    prisma.academyProgress.findMany({
      where: { vendedorId, status: 'COMPLETED', completedAt: { gte: desde } },
      include: { aula: { select: { title: true } } },
      orderBy: { completedAt: 'desc' },
      take: MAX_ATIVIDADES,
    }),
    prisma.simulationSession.findMany({
      where: { vendedorId, status: 'EVALUATED', evaluatedAt: { gte: desde } },
      include: { cenario: { select: { title: true } }, avaliacoes: { select: { scoreFinal: true }, orderBy: { versao: 'desc' }, take: 1 } },
      orderBy: { evaluatedAt: 'desc' },
      take: MAX_ATIVIDADES,
    }),
  ]);

  const atividades: AtividadeRecente[] = [];

  for (const p of progressos) {
    // Quiz e aula são atividades diferentes para quem conversa: "passei no
    // quiz" e "li a aula" não são a mesma conquista. Uma aula com quiz
    // aprovado gera as duas — é o que de fato aconteceu.
    atividades.push({
      tipo: 'AULA',
      titulo: p.aula.title,
      quando: (p.completedAt ?? p.updatedAt).toISOString(),
      resultado: null,
    });
    if (p.quizPassed && p.quizScore !== null) {
      atividades.push({
        tipo: 'QUIZ',
        titulo: p.aula.title,
        quando: (p.completedAt ?? p.updatedAt).toISOString(),
        resultado: p.quizScore,
      });
    }
  }

  for (const s of simulacoes) {
    atividades.push({
      tipo: 'SIMULACAO',
      titulo: s.cenario.title,
      quando: (s.evaluatedAt ?? s.updatedAt).toISOString(),
      resultado: s.avaliacoes[0]?.scoreFinal ?? null,
    });
  }

  return atividades.sort((a, b) => b.quando.localeCompare(a.quando)).slice(0, MAX_ATIVIDADES);
}
