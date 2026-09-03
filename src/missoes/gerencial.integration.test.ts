// Missões do Gerente (Fatia 9.6, seção 42-44) — mesmo motor de
// MissionAssignment/critério/recompensa dos vendedores; evidência sempre
// real (Recognition/OneOnOne/ManagerAssessment já existentes), nunca
// client-side complete=true.
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../db';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { seedMissoesEDesafios } from './catalogo-seed';
import { garantirMissoesGerenciaisDoDia, garantirMissoesGerenciaisDaSemana, getMissoesGerenciaisAtivas } from './gerencial.service';
import { avaliarMissoesDoVendedor } from './avaliacao.service';

async function criarGerente(empresaId: string, lojaId: string) {
  return prisma.vendedor.create({ data: { empresaId, lojaId, matriculaErp: `GER-${randomUUID()}`, nome: 'Gerente Missões', senhaHash: 'x', papel: 'GERENTE' } });
}

describe('Missões gerenciais — atribuição e critérios com evidência real', () => {
  it('garante as missões diárias e semanais do gerente, nunca as do vendedor', async () => {
    await seedMissoesEDesafios();
    const { empresa, loja } = await criarFixtureEmpresa();
    const gerente = await criarGerente(empresa.id, loja.id);

    const diarias = await garantirMissoesGerenciaisDoDia(gerente.id);
    const semanais = await garantirMissoesGerenciaisDaSemana(gerente.id);

    expect(diarias.every((m) => m.definicao.targetPapel === 'GERENTE')).toBe(true);
    expect(semanais.every((m) => m.definicao.targetPapel === 'GERENTE')).toBe(true);
    expect(diarias.some((m) => m.definicao.criterionType === 'RECOGNITION_CREATED')).toBe(true);
    expect(semanais.some((m) => m.definicao.criterionType === 'ONE_ON_ONE_COMPLETED')).toBe(true);
    expect(semanais.some((m) => m.definicao.criterionType === 'PDI_REVIEWED')).toBe(true);
  });

  it('missão RECOGNITION_CREATED só completa com um Recognition real do próprio gerente', async () => {
    await seedMissoesEDesafios();
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const gerente = await criarGerente(empresa.id, loja.id);
    await getMissoesGerenciaisAtivas(gerente.id);

    let missoes = await getMissoesGerenciaisAtivas(gerente.id);
    const missaoReconhecimento = missoes.find((m) => m.definicao.criterionType === 'RECOGNITION_CREATED')!;
    expect(missaoReconhecimento.status).toBe('ASSIGNED');

    await prisma.recognition.create({ data: { tipo: 'PERFORMANCE', authorId: gerente.id, subjectId: vendedor.id, message: 'Ótimo trabalho' } });
    await avaliarMissoesDoVendedor(gerente.id);

    const atualizada = await prisma.missionAssignment.findUniqueOrThrow({ where: { id: missaoReconhecimento.id } });
    expect(atualizada.status).toBe('COMPLETED');
  });

  it('missão ONE_ON_ONE_COMPLETED nunca completa por um 1:1 de OUTRO gerente', async () => {
    await seedMissoesEDesafios();
    const { empresa, loja, vendedor } = await criarFixtureEmpresa();
    const gerente = await criarGerente(empresa.id, loja.id);
    const outroGerente = await criarGerente(empresa.id, loja.id);
    await getMissoesGerenciaisAtivas(gerente.id);

    // 1:1 concluído por OUTRO gerente — nunca conta pra missão deste gerente.
    await prisma.oneOnOne.create({
      data: { empresaId: empresa.id, lojaId: loja.id, managerId: outroGerente.id, sellerId: vendedor.id, status: 'COMPLETED', completedAt: new Date() },
    });
    await avaliarMissoesDoVendedor(gerente.id);

    const missoes = await getMissoesGerenciaisAtivas(gerente.id);
    const missao1a1 = missoes.find((m) => m.definicao.criterionType === 'ONE_ON_ONE_COMPLETED')!;
    expect(missao1a1.status).not.toBe('COMPLETED');

    // Agora o PRÓPRIO gerente conclui um 1:1 — a missão completa de verdade.
    await prisma.oneOnOne.create({
      data: { empresaId: empresa.id, lojaId: loja.id, managerId: gerente.id, sellerId: vendedor.id, status: 'COMPLETED', completedAt: new Date() },
    });
    await avaliarMissoesDoVendedor(gerente.id);
    const missaoDepois = await prisma.missionAssignment.findUniqueOrThrow({ where: { id: missao1a1.id } });
    expect(missaoDepois.status).toBe('COMPLETED');
  });

  it('GET /gerente/missoes nunca mostra missões de vendedor (RBAC + catálogo separado)', async () => {
    await seedMissoesEDesafios();
    const { empresa, loja } = await criarFixtureEmpresa();
    const gerente = await criarGerente(empresa.id, loja.id);

    const { assinarToken } = await import('../middlewares/auth');
    const { app } = await import('../app');
    const request = (await import('supertest')).default;

    const token = assinarToken({ vendedorId: gerente.id, empresaId: empresa.id, lojaId: loja.id, papel: 'GERENTE' });
    const res = await request(app).get('/gerente/missoes').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.missoes.every((m: { definicao: { targetPapel: string } }) => m.definicao.targetPapel === 'GERENTE')).toBe(true);
  });
});
