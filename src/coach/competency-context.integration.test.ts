// Gap de competência no contexto da IA (Etapa 2A) — o último elo da cadeia.
//
// PROBLEMA QUE ISTO FECHA: o produto tinha DOIS vocabulários de desenvolvimento
// que não se falavam. `ProfessionalMemory` dizia "seu ponto fraco é ticket
// médio" para Conselheiro/Treinador/Simulador; `CompetencyEvidence` dizia "seu
// ponto fraco é QUEBRA_DE_OBJECOES" só para duas telas. Nenhum tradutor entre
// eles — então a IA nunca conseguia orientar a técnica exata a treinar.
//
// As duas origens continuam SEPARADAS de propósito: KPI é KPI, evidência é
// evidência. A régua que converteria KPI em competência é decisão de negócio da
// Etapa 2B e não existe aqui.
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../db';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { seedCompetenciasV1 } from '../universidade/competency.service';
import { gerarEvidenciaDeConclusao, gerarEvidenciaDeQuiz } from '../universidade/evidence.service';
import { getMemoria } from './memory.service';
import { buildCoachContext } from './context-builder.service';
import { decidirPertinencia } from '../pertinencia/gate.service';
import { formatarContextoParaPrompt } from './prompts/context-formatter';

/** Cria 2 evidências fracas numa competência — o mínimo pra sair de NOT_ENOUGH_DATA com gap. */
async function criarGapReal(vendedorId: string, code: string) {
  await seedCompetenciasV1();
  const competencia = await prisma.competency.findFirstOrThrow({ where: { code } });

  const trilha = await prisma.academyTrack.create({
    data: { code: `t-${randomUUID()}`, title: 'T', description: 'd', status: 'PUBLISHED' },
  });
  const aula = await prisma.academyLesson.create({
    data: {
      trackId: trilha.id,
      code: `a-${randomUUID()}`,
      title: 'Aula',
      description: 'd',
      content: 'c',
      estimatedMinutes: 5,
      status: 'PUBLISHED',
      competencyIds: [competencia.id],
    },
  });
  const quiz = await prisma.academyQuiz.create({ data: { lessonId: aula.id, passingScore: 70 } });

  await gerarEvidenciaDeConclusao(vendedorId, aula.id);
  await gerarEvidenciaDeQuiz(vendedorId, aula.id, quiz.id, 20, false); // nota baixa → gap grande
  return competencia;
}

describe('Gap de competência chega ao contexto da IA', () => {
  it('getMemoria devolve os gaps vindos de EVIDÊNCIA, separados dos de KPI', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const competencia = await criarGapReal(vendedor.id, 'QUEBRA_DE_OBJECOES');

    const memoria = await getMemoria(vendedor.id);

    const gap = memoria.competencyGaps.find((g) => g.nome === competencia.name);
    expect(gap).toBeDefined();
    expect(gap!.gap).toBeGreaterThan(0);
    expect(gap!.score).toBeLessThan(gap!.target);

    // As listas de KPI continuam existindo e NÃO foram contaminadas pela
    // competência — as origens permanecem distinguíveis.
    expect(memoria.strengths).not.toContain(competencia.name);
    expect(memoria.developmentAreas).not.toContain(competencia.name);
  });

  it('o gap aparece de fato no prompt do Conselheiro, rotulado como evidência', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const competencia = await criarGapReal(vendedor.id, 'FECHAMENTO');

    const contexto = await buildCoachContext(vendedor.id, decidirPertinencia('DESENVOLVIMENTO', null, 'DETERMINISTICO'));
    const prompt = formatarContextoParaPrompt(contexto);

    expect(prompt).toContain(competencia.name);
    // O rótulo é o que impede a IA de confundir origem de evidência com KPI.
    expect(prompt).toMatch(/avaliadas por evidência/i);
  });

  it('sem evidência suficiente, nenhum gap entra no contexto — a IA nunca fala de gap que o motor não sabe se existe', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    await seedCompetenciasV1();

    const memoria = await getMemoria(vendedor.id);
    expect(memoria.competencyGaps).toEqual([]);

    const contexto = await buildCoachContext(vendedor.id, decidirPertinencia('DESENVOLVIMENTO', null, 'DETERMINISTICO'));
    expect(formatarContextoParaPrompt(contexto)).not.toMatch(/avaliadas por evidência/i);
  });

  it('o contexto nunca leva a matriz inteira — no máximo 3 gaps, os de maior prioridade', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    for (const code of ['ABORDAGEM', 'SONDAGEM', 'ARGUMENTACAO', 'FECHAMENTO', 'COMUNICACAO']) {
      await criarGapReal(vendedor.id, code);
    }

    const memoria = await getMemoria(vendedor.id);
    expect(memoria.competencyGaps.length).toBeLessThanOrEqual(3);
    // Ordenados por prioridade: nenhum LOW aparece antes de um HIGH.
    const ordem = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
    for (let i = 1; i < memoria.competencyGaps.length; i++) {
      expect(ordem[memoria.competencyGaps[i].prioridade]).toBeGreaterThanOrEqual(ordem[memoria.competencyGaps[i - 1].prioridade]);
    }
  });

  it('gap de um vendedor nunca aparece no contexto de outro', async () => {
    const a = await criarFixtureEmpresa();
    const b = await criarFixtureEmpresa();
    const competencia = await criarGapReal(a.vendedor.id, 'VENDA_COMPLEMENTAR');

    const memoriaDeB = await getMemoria(b.vendedor.id);
    expect(memoriaDeB.competencyGaps.find((g) => g.nome === competencia.name)).toBeUndefined();
  });

  it('gap NÃO é persistido em ProfessionalMemory — deriva da matriz, sem segunda fonte de verdade', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    await criarGapReal(vendedor.id, 'ABORDAGEM');
    await getMemoria(vendedor.id);

    const persistida = await prisma.professionalMemory.findUniqueOrThrow({ where: { vendedorId: vendedor.id } });
    // A tabela guarda só o que vem de KPI; competência é sempre recalculada.
    expect(JSON.stringify(persistida)).not.toContain('competencyGaps');
  });
});
