import { describe, expect, it } from 'vitest';
import { registrarCheckin, getCheckinHoje } from './checkin.service';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { prisma } from '../db';

describe('CoachCheckIn', () => {
  it('registra o check-in do dia', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const checkin = await registrarCheckin(vendedor.id, 'GOOD');

    expect(checkin.mood).toBe('GOOD');
    const hoje = await getCheckinHoje(vendedor.id);
    expect(hoje?.id).toBe(checkin.id);
  });

  it('é idempotente por dia: refazer o check-in atualiza, não duplica', async () => {
    const { vendedor } = await criarFixtureEmpresa();

    await registrarCheckin(vendedor.id, 'GOOD');
    await registrarCheckin(vendedor.id, 'NOT_GOOD');

    const registros = await prisma.coachCheckIn.findMany({ where: { vendedorId: vendedor.id } });
    expect(registros).toHaveLength(1);
    expect(registros[0].mood).toBe('NOT_GOOD');
  });

  it('não mistura check-ins de vendedores diferentes', async () => {
    const { vendedor: vendedorA } = await criarFixtureEmpresa();
    const { vendedor: vendedorB } = await criarFixtureEmpresa();

    await registrarCheckin(vendedorA.id, 'VERY_GOOD');
    await registrarCheckin(vendedorB.id, 'NOT_GOOD');

    expect((await getCheckinHoje(vendedorA.id))?.mood).toBe('VERY_GOOD');
    expect((await getCheckinHoje(vendedorB.id))?.mood).toBe('NOT_GOOD');
  });
});
