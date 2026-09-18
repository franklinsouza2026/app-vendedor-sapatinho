import { describe, expect, it } from 'vitest';
import { getMemoria } from './memory.service';
import { criarFixtureEmpresa, criarIndicador } from '../gamificacao/test-helpers';
import { AMOSTRA_MINIMA_BASELINE } from '../gamificacao/baseline.service';
import { randomUUID } from 'node:crypto';
import { prisma } from '../db';
import { seedCompetenciasV1 } from '../universidade/competency.service';
import { gerarEvidenciaDeConclusao, gerarEvidenciaDeQuiz } from '../universidade/evidence.service';

function diasAtras(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

describe('getMemoria', () => {
  it('sem baseline suficiente, não deriva nenhum ponto forte/fraco (nunca inventa)', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const memoria = await getMemoria(vendedor.id);

    expect(memoria.strengths).toEqual([]);
    expect(memoria.developmentAreas).toEqual([]);
    expect(memoria.summary).toBeNull();
  });

  it('identifica ticket médio como área de desenvolvimento quando está bem abaixo da baseline', async () => {
    const { vendedor } = await criarFixtureEmpresa();

    for (let i = AMOSTRA_MINIMA_BASELINE; i >= 1; i--) {
      await criarIndicador(vendedor.id, new Date(diasAtras(i).getTime() + 10 * 3600 * 1000), { faturamento: 200, pa: 2, ticketMedio: 100 });
    }
    // hoje: ticket bem abaixo da baseline (100) — usa o instante real
    // (nunca uma hora fixa como "10h de hoje"), senão o teste quebra quando
    // rodado de madrugada, antes desse horário ainda não ter "acontecido".
    await criarIndicador(vendedor.id, new Date(), { faturamento: 60, pa: 2, ticketMedio: 60, numAtendimentos: 1 });

    const memoria = await getMemoria(vendedor.id);

    expect(memoria.developmentAreas).toContain('ticket médio');
    expect(memoria.currentFocus).toBe('ticket médio');
    expect(memoria.summary).toContain('Em desenvolvimento');
  });

  it('nunca guarda conteúdo emocional/pessoal — só métricas de performance e gap de competência', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const memoria = await getMemoria(vendedor.id);

    // Allowlist explícita: qualquer campo novo tem que ser adicionado aqui
    // conscientemente, o que é a barreira contra conteúdo pessoal/emocional
    // entrar na memória por descuido. `competencyGaps` entrou na Etapa 2A.
    const camposPermitidos = ['strengths', 'developmentAreas', 'currentFocus', 'summary', 'competencyGaps'];
    expect(Object.keys(memoria)).toEqual(expect.arrayContaining(camposPermitidos));
    expect(Object.keys(memoria)).toHaveLength(camposPermitidos.length);
  });

  it('competencyGaps carrega só nome de competência e números — nunca texto livre', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    await seedCompetenciasV1();

    // Gera um gap real pra inspecionar o formato do que vai pro prompt.
    const competencia = await prisma.competency.findFirstOrThrow({ where: { code: 'ABORDAGEM' } });
    const trilha = await prisma.academyTrack.create({ data: { code: `t-${randomUUID()}`, title: 'T', description: 'd', status: 'PUBLISHED' } });
    const aula = await prisma.academyLesson.create({
      data: { trackId: trilha.id, code: `a-${randomUUID()}`, title: 'A', description: 'd', content: 'c', estimatedMinutes: 5, status: 'PUBLISHED', competencyIds: [competencia.id] },
    });
    const quiz = await prisma.academyQuiz.create({ data: { lessonId: aula.id, passingScore: 70 } });
    await gerarEvidenciaDeConclusao(vendedor.id, aula.id);
    await gerarEvidenciaDeQuiz(vendedor.id, aula.id, quiz.id, 20, false);

    const memoria = await getMemoria(vendedor.id);
    expect(memoria.competencyGaps.length).toBeGreaterThan(0);

    for (const gap of memoria.competencyGaps) {
      expect(Object.keys(gap).sort()).toEqual(['gap', 'nome', 'prioridade', 'score', 'target']);
      expect(typeof gap.nome).toBe('string');
      expect(typeof gap.score).toBe('number');
    }
  });
});
