// AI Recommendation (Fatia 7.5E, seção 35-36/86-87) — todo id proposto pelo
// LLM é validado contra o banco; um id inventado ou de conteúdo DRAFT é
// sempre descartado, nunca "buscado mesmo assim".
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../db';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { sugerirSequenciaDeAprendizado } from './ai-recommendation.service';
import { MARCADOR_ID_INVENTADO } from '../ai-platform/providers/mock-ai-provider';

async function criarAulaPublicadaComCompetencia(competencyId: string) {
  const trilha = await prisma.academyTrack.create({ data: { code: `trilha-ai-${randomUUID()}`, title: 'T', description: 'd', status: 'PUBLISHED' } });
  return prisma.academyLesson.create({
    data: { trackId: trilha.id, code: `aula-ai-${randomUUID()}`, title: `Aula sobre ${randomUUID()}`, description: 'd', content: 'c', estimatedMinutes: 5, status: 'PUBLISHED', competencyIds: [competencyId] },
  });
}

describe('AI Recommendation — validação de ID contra o banco', () => {
  it('quando o provider "alucina" um id que não existe, o backend descarta (nunca busca/serve o item)', async () => {
    const { empresa, vendedor } = await criarFixtureEmpresa();
    const competencia = await prisma.competency.create({ data: { code: `${MARCADOR_ID_INVENTADO}-${randomUUID()}`, name: MARCADOR_ID_INVENTADO, description: 'd' } });
    await criarAulaPublicadaComCompetencia(competencia.id); // existe conteúdo real, mas o mock vai "inventar" outro id mesmo assim

    const sugestoes = await sugerirSequenciaDeAprendizado({ empresaId: empresa.id, vendedorId: vendedor.id, papel: 'VENDEDOR', competencyId: competencia.id });
    expect(sugestoes).toHaveLength(0); // id inventado nunca é resolvido a um item real
  });

  it('nunca sugere aula em DRAFT, mesmo que ela esteja mapeada pra competência', async () => {
    const { empresa, vendedor } = await criarFixtureEmpresa();
    const competencia = await prisma.competency.create({ data: { code: `comp-draft-${randomUUID()}`, name: 'C', description: 'd' } });
    const trilha = await prisma.academyTrack.create({ data: { code: `trilha-ai-draft-${randomUUID()}`, title: 'T', description: 'd', status: 'PUBLISHED' } });
    // Aula em DRAFT nunca deve nem entrar na lista de candidatos passada ao LLM.
    await prisma.academyLesson.create({
      data: { trackId: trilha.id, code: `aula-ai-draft-${randomUUID()}`, title: 'Aula rascunho', description: 'd', content: 'c', estimatedMinutes: 5, status: 'DRAFT', competencyIds: [competencia.id] },
    });

    const sugestoes = await sugerirSequenciaDeAprendizado({ empresaId: empresa.id, vendedorId: vendedor.id, papel: 'VENDEDOR', competencyId: competencia.id });
    expect(sugestoes).toHaveLength(0);
  });

  it('sugere corretamente uma aula real, publicada e mapeada pra competência', async () => {
    const { empresa, vendedor } = await criarFixtureEmpresa();
    const competencia = await prisma.competency.create({ data: { code: `comp-ok-${randomUUID()}`, name: 'Fechamento', description: 'd' } });
    const aula = await criarAulaPublicadaComCompetencia(competencia.id);

    const sugestoes = await sugerirSequenciaDeAprendizado({ empresaId: empresa.id, vendedorId: vendedor.id, papel: 'VENDEDOR', competencyId: competencia.id });
    expect(sugestoes.length).toBeGreaterThan(0);
    expect(sugestoes[0].sourceId).toBe(aula.id);
    expect(sugestoes[0].title).toBe(aula.title);
  });
});

describe('AI-off nunca quebra a Universidade determinística (seção 75/98)', () => {
  it('budget mensal esgotado falha graciosamente só a sugestão de IA — nunca um 500/crash', async () => {
    const { empresa, vendedor } = await criarFixtureEmpresa();
    await prisma.aIBudgetConfig.upsert({
      where: { empresaId: empresa.id },
      update: { monthlyLimitUSD: 0 },
      create: { empresaId: empresa.id, monthlyLimitUSD: 0, dailyMessageLimitPerSeller: 20, updatedBy: 'test' },
    });
    const competencia = await prisma.competency.create({ data: { code: `comp-budget-${randomUUID()}`, name: 'C', description: 'd' } });
    await criarAulaPublicadaComCompetencia(competencia.id);

    await expect(sugerirSequenciaDeAprendizado({ empresaId: empresa.id, vendedorId: vendedor.id, papel: 'VENDEDOR', competencyId: competencia.id })).rejects.toMatchObject({
      type: 'budget_exceeded',
    });

    // Score/Gap continuam 100% funcionais — nunca dependem da IA.
    const { calcularScoreCompetencia } = await import('./score-engine.service');
    const score = await calcularScoreCompetencia(vendedor.id, competencia.id);
    expect(score.status).toBe('NOT_ENOUGH_DATA'); // resultado determinístico normal, não um erro
  });
});
