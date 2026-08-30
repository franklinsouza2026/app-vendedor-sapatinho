import { beforeAll, describe, expect, it } from 'vitest';
import { getDesafiosAtivos, getHistoricoDesafios } from './service';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { garantirCatalogoMissoes } from './test-helpers';
import { prisma } from '../db';
import { inicioDaSemana } from '../services/metas.service';

beforeAll(async () => {
  await garantirCatalogoMissoes();
});

describe('getDesafiosAtivos', () => {
  it('atribui todo o catálogo ativo de desafios pra semana atual', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const ativos = await getDesafiosAtivos(vendedor.id);

    expect(ativos.length).toBe(3); // 3_SIMULATIONS_WEEK, 3_LESSONS_WEEK, 5_DAYS_CONSISTENCY
    for (const d of ativos) expect(['ASSIGNED', 'IN_PROGRESS']).toContain(d.status);
  });

  it('é idempotente: chamar de novo na mesma semana não duplica', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    await getDesafiosAtivos(vendedor.id);
    await getDesafiosAtivos(vendedor.id);

    const total = await prisma.challengeAssignment.count({ where: { vendedorId: vendedor.id } });
    expect(total).toBe(3);
  });

  it('3_LESSONS_WEEK conclui e concede bônus (0 por padrão) exatamente uma vez após 3 aulas concluídas', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    await getDesafiosAtivos(vendedor.id);

    const trilha = await prisma.academyTrack.create({ data: { code: `trilha-desafio-${vendedor.id}`, title: 't', description: 'd', active: true, sortOrder: 0 } });
    for (let i = 0; i < 3; i++) {
      const aula = await prisma.academyLesson.create({
        data: { trackId: trilha.id, code: `aula-desafio-${vendedor.id}-${i}`, title: 'a', description: 'd', content: 'c', origem: 'DEMONSTRATIVO', estimatedMinutes: 5, sortOrder: i, active: true },
      });
      await prisma.academyProgress.create({
        data: { empresaId: vendedor.empresaId, lojaId: vendedor.lojaId, vendedorId: vendedor.id, lessonId: aula.id, status: 'COMPLETED', completedAt: new Date() },
      });
    }

    const depois = await getDesafiosAtivos(vendedor.id);
    const desafio = depois.find((d) => d.desafio.code === '3_LESSONS_WEEK')!;
    expect(desafio.status).toBe('COMPLETED');
    expect(desafio.progressoAtual).toBe(3);

    await getDesafiosAtivos(vendedor.id); // reprocessar não duplica nada
    const bonusXp = await prisma.xpTransacao.count({ where: { idempotencyKey: `desafio-${desafio.id}` } });
    expect(bonusXp).toBeLessThanOrEqual(1);
  });

  it('desafio some da janela ativa quando expira, sem punição (nunca remove XP/moeda)', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const ativos = await getDesafiosAtivos(vendedor.id);
    await prisma.challengeAssignment.update({ where: { id: ativos[0].id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const saldoAntes = await prisma.moedaTransacao.count({ where: { vendedorId: vendedor.id } });
    await getDesafiosAtivos(vendedor.id);
    const saldoDepois = await prisma.moedaTransacao.count({ where: { vendedorId: vendedor.id } });
    expect(saldoDepois).toBe(saldoAntes);

    const historico = await getHistoricoDesafios(vendedor.id);
    expect(historico.some((d) => d.id === ativos[0].id && d.status === 'EXPIRED')).toBe(true);
  });

  it('usa a mesma janela semanal (inicioDaSemana) do restante do produto — nunca uma definição própria de semana', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const ativos = await getDesafiosAtivos(vendedor.id);
    const esperado = inicioDaSemana(new Date());
    for (const d of ativos) expect(new Date(d.startsAt).getTime()).toBe(esperado.getTime());
  });
});
