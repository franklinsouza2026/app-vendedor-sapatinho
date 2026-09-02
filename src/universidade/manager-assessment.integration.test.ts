// ManagerAssessment (Fatia 7.5E, seção 27-29/79) — nunca sobrescrita
// silenciosamente; sob 2 avaliações concorrentes do mesmo gerente sobre a
// mesma competência, nenhuma se perde e nenhuma repete o número de versão.
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../db';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { registrarAvaliacaoGerente } from './manager-assessment.service';

async function criarCompetenciaTeste() {
  return prisma.competency.create({ data: { code: `comp-mgr-assess-${randomUUID()}`, name: 'C', description: 'd' } });
}

async function criarGerenteTeste(empresaId: string, lojaId: string) {
  return prisma.vendedor.create({ data: { empresaId, lojaId, matriculaErp: `GER-ASSESS-${randomUUID()}`, nome: 'Gerente Teste', senhaHash: 'x', papel: 'GERENTE' } });
}

describe('ManagerAssessment — versionamento sob concorrência real (seção 79)', () => {
  it('2 avaliações concorrentes da mesma competência: ambas persistem, com versões distintas (nunca duplicadas)', async () => {
    const { vendedor, empresa, loja } = await criarFixtureEmpresa();
    const gerente = await criarGerenteTeste(empresa.id, loja.id);
    const competencia = await criarCompetenciaTeste();

    const [a, b] = await Promise.all([
      registrarAvaliacaoGerente({ subjectUserId: vendedor.id, competencyId: competencia.id, authorId: gerente.id, rating: 4 }),
      registrarAvaliacaoGerente({ subjectUserId: vendedor.id, competencyId: competencia.id, authorId: gerente.id, rating: 5 }),
    ]);

    expect(a.version).not.toBe(b.version);
    expect([a.version, b.version].sort()).toEqual([1, 2]);

    const total = await prisma.managerAssessment.count({ where: { subjectUserId: vendedor.id, competencyId: competencia.id } });
    expect(total).toBe(2); // nenhuma avaliação perdida
  });

  it('avaliações sequenciais incrementam version normalmente (histórico nunca sobrescrito)', async () => {
    const { vendedor, empresa, loja } = await criarFixtureEmpresa();
    const gerente = await criarGerenteTeste(empresa.id, loja.id);
    const competencia = await criarCompetenciaTeste();

    const primeira = await registrarAvaliacaoGerente({ subjectUserId: vendedor.id, competencyId: competencia.id, authorId: gerente.id, rating: 3 });
    const segunda = await registrarAvaliacaoGerente({ subjectUserId: vendedor.id, competencyId: competencia.id, authorId: gerente.id, rating: 4, evidenceNote: 'melhorou' });

    expect(primeira.version).toBe(1);
    expect(segunda.version).toBe(2);
    const historico = await prisma.managerAssessment.findMany({ where: { subjectUserId: vendedor.id, competencyId: competencia.id }, orderBy: { version: 'asc' } });
    expect(historico.map((h) => h.rating)).toEqual([3, 4]); // a 1ª nunca foi sobrescrita
  });
});
