// DevelopmentPlan / PDI (Fatia 7.5E, seção 31-36) — todo item é validado
// contra conteúdo real PUBLISHED; conclusão nasce de evidência real (hooks
// de conclusão), nunca de um clique livre do vendedor.
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../db';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { criarPDI, concluirItemPDIPorConteudo, buscarPDI } from './pdi.service';
import { UniversidadeError } from './constantes';

async function criarCompetenciaTeste() {
  return prisma.competency.create({ data: { code: `comp-pdi-${randomUUID()}`, name: 'C', description: 'd' } });
}

describe('PDI — criação valida cada item contra conteúdo real', () => {
  it('rejeita LESSON inexistente', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const competencia = await criarCompetenciaTeste();
    await expect(
      criarPDI({ subjectUserId: vendedor.id, competencyId: competencia.id, targetScore: 80, createdBy: vendedor.id, itens: [{ tipo: 'LESSON', sourceId: randomUUID() }] })
    ).rejects.toThrow(UniversidadeError);
  });

  it('rejeita LESSON em DRAFT (não publicada) — mesmo existindo de verdade', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const competencia = await criarCompetenciaTeste();
    const trilha = await prisma.academyTrack.create({ data: { code: `trilha-pdi-${randomUUID()}`, title: 'T', description: 'd', status: 'PUBLISHED' } });
    const aulaDraft = await prisma.academyLesson.create({ data: { trackId: trilha.id, code: `aula-pdi-draft-${randomUUID()}`, title: 'A', description: 'd', content: 'c', estimatedMinutes: 5, status: 'DRAFT' } });

    await expect(
      criarPDI({ subjectUserId: vendedor.id, competencyId: competencia.id, targetScore: 80, createdBy: vendedor.id, itens: [{ tipo: 'LESSON', sourceId: aulaDraft.id }] })
    ).rejects.toThrow(UniversidadeError);
  });

  it('cria com itens válidos, captura baselineScore no momento da criação', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const competencia = await criarCompetenciaTeste();
    const trilha = await prisma.academyTrack.create({ data: { code: `trilha-pdi2-${randomUUID()}`, title: 'T', description: 'd', status: 'PUBLISHED' } });
    const aula = await prisma.academyLesson.create({ data: { trackId: trilha.id, code: `aula-pdi2-${randomUUID()}`, title: 'A', description: 'd', content: 'c', estimatedMinutes: 5, status: 'PUBLISHED' } });

    const plano = await criarPDI({ subjectUserId: vendedor.id, competencyId: competencia.id, targetScore: 80, createdBy: vendedor.id, itens: [{ tipo: 'LESSON', sourceId: aula.id }, { tipo: 'PRACTICE' }] });
    expect(plano.status).toBe('ACTIVE');
    expect(plano.baselineScore).toBeNull(); // sem evidência ainda -> NOT_ENOUGH_DATA -> null
    expect(plano.itens).toHaveLength(2);
  });

  it('concluir o único item obrigatório completa o plano automaticamente', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const competencia = await criarCompetenciaTeste();
    const trilha = await prisma.academyTrack.create({ data: { code: `trilha-pdi3-${randomUUID()}`, title: 'T', description: 'd', status: 'PUBLISHED' } });
    const aula = await prisma.academyLesson.create({ data: { trackId: trilha.id, code: `aula-pdi3-${randomUUID()}`, title: 'A', description: 'd', content: 'c', estimatedMinutes: 5, status: 'PUBLISHED' } });

    const plano = await criarPDI({ subjectUserId: vendedor.id, competencyId: competencia.id, targetScore: 80, createdBy: vendedor.id, itens: [{ tipo: 'LESSON', sourceId: aula.id, required: true }] });

    await concluirItemPDIPorConteudo(vendedor.id, 'LESSON', aula.id);

    const final = await buscarPDI(plano.id);
    expect(final.status).toBe('COMPLETED');
    expect(final.itens[0].status).toBe('COMPLETED');
  });

  it('item SKIPPED/não-obrigatório pendente não impede a conclusão do plano', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const competencia = await criarCompetenciaTeste();
    const trilha = await prisma.academyTrack.create({ data: { code: `trilha-pdi4-${randomUUID()}`, title: 'T', description: 'd', status: 'PUBLISHED' } });
    const aulaObrigatoria = await prisma.academyLesson.create({ data: { trackId: trilha.id, code: `aula-pdi4a-${randomUUID()}`, title: 'A', description: 'd', content: 'c', estimatedMinutes: 5, status: 'PUBLISHED' } });

    const plano = await criarPDI({
      subjectUserId: vendedor.id,
      competencyId: competencia.id,
      targetScore: 80,
      createdBy: vendedor.id,
      itens: [
        { tipo: 'LESSON', sourceId: aulaObrigatoria.id, required: true },
        { tipo: 'PRACTICE', required: false },
      ],
    });

    await concluirItemPDIPorConteudo(vendedor.id, 'LESSON', aulaObrigatoria.id);

    const final = await buscarPDI(plano.id);
    expect(final.status).toBe('COMPLETED'); // item PRACTICE não-obrigatório continua PENDING, mas não bloqueia
    const practice = final.itens.find((i) => i.tipo === 'PRACTICE');
    expect(practice?.status).toBe('PENDING');
  });
});

describe('PDI — só 1 plano ACTIVE por (vendedor, competência), inclusive sob concorrência real (seção 79)', () => {
  it('rejeita criar um 2º PDI ativo pra mesma competência', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const competencia = await criarCompetenciaTeste();

    await criarPDI({ subjectUserId: vendedor.id, competencyId: competencia.id, targetScore: 80, createdBy: vendedor.id, itens: [{ tipo: 'PRACTICE' }] });
    await expect(criarPDI({ subjectUserId: vendedor.id, competencyId: competencia.id, targetScore: 90, createdBy: vendedor.id, itens: [{ tipo: 'PRACTICE' }] })).rejects.toThrow(UniversidadeError);

    const ativos = await prisma.developmentPlan.count({ where: { subjectUserId: vendedor.id, competencyId: competencia.id, status: 'ACTIVE' } });
    expect(ativos).toBe(1);
  });

  it('2 criações concorrentes da mesma competência: só 1 vira PDI ativo de verdade', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const competencia = await criarCompetenciaTeste();

    const resultados = await Promise.allSettled([
      criarPDI({ subjectUserId: vendedor.id, competencyId: competencia.id, targetScore: 80, createdBy: vendedor.id, itens: [{ tipo: 'PRACTICE' }] }),
      criarPDI({ subjectUserId: vendedor.id, competencyId: competencia.id, targetScore: 80, createdBy: vendedor.id, itens: [{ tipo: 'PRACTICE' }] }),
    ]);

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(resultados.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const ativos = await prisma.developmentPlan.count({ where: { subjectUserId: vendedor.id, competencyId: competencia.id, status: 'ACTIVE' } });
    expect(ativos).toBe(1);
  });
});
