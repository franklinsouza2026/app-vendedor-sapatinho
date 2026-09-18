// Cadeia de evidência ponta a ponta (Etapa 2A).
//
// POR QUE ESTE ARQUIVO EXISTE: a auditoria mediu o banco de dev — que já tinha
// rodado todas as fatias e todas as suítes — e encontrou **2 evidências de
// competência e 0 PDIs** para 23 competências e ~2.000 linhas de motor. O
// motor estava correto e testado; ele só nunca recebia combustível, porque
// nenhum seed preenchia `competencyIds` e `evidence.service.ts` retorna cedo
// quando o conteúdo não declara competência.
//
// Estes testes cobrem o elo que faltava: atividade real de aprendizagem/prática
// → CompetencyEvidence → score → gap. Sem eles, a regressão volta em silêncio
// (o produto continua "verde", só que inerte).
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../db';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { seedCompetenciasV1 } from './competency.service';
import { carregarCompetenciasPorCode, resolverCompetencias } from '../academia/content-seed';
import { gerarEvidenciaDeConclusao, gerarEvidenciaDeQuiz, gerarEvidenciaDeSimulacao } from './evidence.service';
import { calcularMatrizCompetencias } from './score-engine.service';

async function competenciaPorCode(code: string) {
  await seedCompetenciasV1();
  return prisma.competency.findFirstOrThrow({ where: { code } });
}

async function criarAulaMapeada(competencyIds: string[]) {
  const trilha = await prisma.academyTrack.create({
    data: { code: `t-${randomUUID()}`, title: 'Trilha', description: 'd', status: 'PUBLISHED' },
  });
  return prisma.academyLesson.create({
    data: {
      trackId: trilha.id,
      code: `a-${randomUUID()}`,
      title: 'Aula',
      description: 'd',
      content: 'c',
      estimatedMinutes: 5,
      status: 'PUBLISHED',
      competencyIds,
    },
  });
}

describe('Cadeia: atividade → evidência → competência → gap', () => {
  it('concluir uma AULA mapeada gera evidência na competência dela', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const abordagem = await competenciaPorCode('ABORDAGEM');
    const aula = await criarAulaMapeada([abordagem.id]);

    await gerarEvidenciaDeConclusao(vendedor.id, aula.id);

    const evidencias = await prisma.competencyEvidence.findMany({
      where: { subjectUserId: vendedor.id, competencyId: abordagem.id },
    });
    expect(evidencias).toHaveLength(1);
    expect(evidencias[0].sourceType).toBe('TRAINING_COMPLETION');
  });

  it('REGRESSÃO DO GARGALO: aula SEM competência mapeada não gera evidência nenhuma', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const aulaSemMapeamento = await criarAulaMapeada([]);

    await gerarEvidenciaDeConclusao(vendedor.id, aulaSemMapeamento.id);

    // Este era o estado do produto inteiro antes desta etapa: motor correto,
    // zero combustível. O teste existe pra deixar o comportamento explícito.
    expect(await prisma.competencyEvidence.count({ where: { subjectUserId: vendedor.id } })).toBe(0);
  });

  it('quiz mapeado gera evidência com o score REAL do backend, nunca um valor fixo', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const sondagem = await competenciaPorCode('SONDAGEM');
    const aula = await criarAulaMapeada([sondagem.id]);
    const quiz = await prisma.academyQuiz.create({ data: { lessonId: aula.id, passingScore: 70 } });

    await gerarEvidenciaDeQuiz(vendedor.id, aula.id, quiz.id, 85, false);

    const evidencia = await prisma.competencyEvidence.findFirstOrThrow({
      where: { subjectUserId: vendedor.id, competencyId: sondagem.id },
    });
    expect(evidencia.sourceType).toBe('QUIZ');
    expect(evidencia.normalizedScore).toBe(85);
  });

  it('simulação mapeada gera evidência com o scoreFinal calculado pelo backend', async () => {
    const { vendedor, empresa, loja } = await criarFixtureEmpresa();
    const fechamento = await competenciaPorCode('FECHAMENTO');
    const cenario = await prisma.simulationScenario.create({
      data: {
        code: `c-${randomUUID()}`,
        title: 'Cenário',
        description: 'd',
        category: 'FECHAMENTO',
        objective: 'o',
        playbookCategorias: [],
        criteriosAvaliacao: ['FECHAMENTO'],
        personasPorDificuldade: {},
        maxTurnsPorDificuldade: { EASY: 8 },
        competencyIds: [fechamento.id],
      },
    });
    const sessao = await prisma.simulationSession.create({
      data: {
        empresaId: empresa.id,
        lojaId: loja.id,
        vendedorId: vendedor.id,
        scenarioId: cenario.id,
        difficulty: 'EASY',
        personaSnapshot: {},
        maxTurns: 8,
      },
    });

    await gerarEvidenciaDeSimulacao(vendedor.id, cenario.id, sessao.id, 72);

    const evidencia = await prisma.competencyEvidence.findFirstOrThrow({
      where: { subjectUserId: vendedor.id, competencyId: fechamento.id },
    });
    expect(evidencia.sourceType).toBe('SIMULATION');
    expect(evidencia.normalizedScore).toBe(72);
  });

  it('CADEIA COMPLETA: 2 atividades na mesma competência saem de NOT_ENOUGH_DATA e viram score + gap', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const argumentacao = await competenciaPorCode('ARGUMENTACAO');
    const aula = await criarAulaMapeada([argumentacao.id]);
    const quiz = await prisma.academyQuiz.create({ data: { lessonId: aula.id, passingScore: 70 } });

    // Antes de qualquer atividade: o motor é honesto sobre não saber.
    const matrizInicial = await calcularMatrizCompetencias(vendedor.id, 'VENDEDOR');
    const antes = matrizInicial.find((c) => c.competencyId === argumentacao.id)!;
    expect(antes.status).toBe('NOT_ENOUGH_DATA');
    expect(antes.score).toBeNull();

    // Duas evidências reais (o mínimo que o score-engine exige).
    await gerarEvidenciaDeConclusao(vendedor.id, aula.id);
    await gerarEvidenciaDeQuiz(vendedor.id, aula.id, quiz.id, 50, false);

    const matrizDepois = await calcularMatrizCompetencias(vendedor.id, 'VENDEDOR');
    const depois = matrizDepois.find((c) => c.competencyId === argumentacao.id)!;

    expect(depois.status).not.toBe('NOT_ENOUGH_DATA');
    expect(depois.score).toBeGreaterThan(0);
    // Score abaixo do target vira gap com prioridade — que é o que alimenta a
    // recomendação e o contexto do Conselheiro.
    expect(depois.gap).toBeGreaterThan(0);
    expect(['HIGH', 'MEDIUM', 'LOW']).toContain(depois.priority);
  });

  it('evidência de um vendedor nunca conta pra competência de outro', async () => {
    const a = await criarFixtureEmpresa();
    const b = await criarFixtureEmpresa();
    const comunicacao = await competenciaPorCode('COMUNICACAO');
    const aula = await criarAulaMapeada([comunicacao.id]);

    await gerarEvidenciaDeConclusao(a.vendedor.id, aula.id);

    expect(await prisma.competencyEvidence.count({ where: { subjectUserId: b.vendedor.id } })).toBe(0);
    const matrizDeB = await calcularMatrizCompetencias(b.vendedor.id, 'VENDEDOR');
    expect(matrizDeB.find((c) => c.competencyId === comunicacao.id)!.status).toBe('NOT_ENOUGH_DATA');
  });

  it('competência arquivada não recebe evidência nova (catálogo é administrável)', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const organizacao = await competenciaPorCode('ORGANIZACAO');
    await prisma.competency.update({ where: { id: organizacao.id }, data: { status: 'ARCHIVED' } });
    const aula = await criarAulaMapeada([organizacao.id]);

    await gerarEvidenciaDeConclusao(vendedor.id, aula.id);

    expect(await prisma.competencyEvidence.count({ where: { competencyId: organizacao.id, subjectUserId: vendedor.id } })).toBe(0);

    // Restaura pra não afetar outros testes que compartilham o catálogo global.
    await prisma.competency.update({ where: { id: organizacao.id }, data: { status: 'ACTIVE' } });
  });
});

describe('Seed de conteúdo: o mapeamento não pode ser apagado por acidente', () => {
  it('recusa seedar conteúdo com o catálogo de competências vazio', async () => {
    // `competencyIds` vai no `update` do upsert (é o que destrava bancos já
    // existentes). O preço disso é que seedar com catálogo vazio gravaria `[]`
    // em TODAS as aulas e cenários — devolvendo o motor ao estado inerte, em
    // silêncio. Recusar é a única saída segura.
    const original = prisma.competency.findMany;
    prisma.competency.findMany = (async () => []) as typeof original;
    try {
      await expect(carregarCompetenciasPorCode()).rejects.toThrow(/catálogo de competências vazio/);
    } finally {
      prisma.competency.findMany = original;
    }
  });

  it('código de competência inexistente é ignorado, nunca vira mapeamento inválido', async () => {
    await seedCompetenciasV1();
    const porCode = await carregarCompetenciasPorCode();

    // O catálogo é administrável: um Admin pode ter arquivado/renomeado algo.
    // Isso não derruba o seed — só não mapeia aquele item.
    expect(resolverCompetencias(['NAO_EXISTE'], porCode)).toEqual([]);
    expect(resolverCompetencias(['ABORDAGEM', 'NAO_EXISTE'], porCode)).toHaveLength(1);
  });
});
