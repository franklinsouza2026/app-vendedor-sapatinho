import { describe, expect, it } from 'vitest';
import { avaliarFechamentoDia } from './streak.service';
import { getSaldoMoedas } from './ledger.service';
import { criarFixtureEmpresa, criarIndicador, criarMeta } from './test-helpers';

function diasAtras(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

describe('avaliarFechamentoDia', () => {
  it('não avalia quando não há meta cadastrada nesse dia (dia neutro)', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const resultado = await avaliarFechamentoDia(vendedor.id, diasAtras(1));
    expect(resultado.avaliado).toBe(false);
  });

  it('conta streak consecutivo em dias seguidos e reseta quando um dia não bate a meta', async () => {
    const { vendedor } = await criarFixtureEmpresa();

    for (let i = 3; i >= 1; i--) {
      const dia = diasAtras(i);
      await criarMeta(vendedor.id, 100, dia);
      await criarIndicador(vendedor.id, new Date(dia.getTime() + 10 * 3600 * 1000), { faturamento: 150 }); // bate meta
    }

    const r3 = await avaliarFechamentoDia(vendedor.id, diasAtras(3));
    const r2 = await avaliarFechamentoDia(vendedor.id, diasAtras(2));
    const r1 = await avaliarFechamentoDia(vendedor.id, diasAtras(1));

    expect(r3.streakAtual).toBe(1);
    expect(r2.streakAtual).toBe(2);
    expect(r1.streakAtual).toBe(3);

    // limiar de 3 dias concede XP/moeda (régua v1: STREAK_3 = 75 XP / 25 moedas)
    expect(await getSaldoMoedas(vendedor.id)).toBe(25);

    // dia seguinte não bate a meta — streak reseta
    const hoje = diasAtras(0);
    await criarMeta(vendedor.id, 100, hoje);
    await criarIndicador(vendedor.id, new Date(hoje.getTime() + 10 * 3600 * 1000), { faturamento: 50 });
    const r0 = await avaliarFechamentoDia(vendedor.id, hoje);

    expect(r0.atingiu).toBe(false);
    expect(r0.streakAtual).toBe(0);
  });

  it('dia sem meta cadastrada no meio da sequência é neutro — não quebra a streak', async () => {
    const { vendedor } = await criarFixtureEmpresa();

    // dia 3: bate meta
    await criarMeta(vendedor.id, 100, diasAtras(3));
    await criarIndicador(vendedor.id, new Date(diasAtras(3).getTime() + 10 * 3600 * 1000), { faturamento: 150 });
    const r3 = await avaliarFechamentoDia(vendedor.id, diasAtras(3));
    expect(r3.streakAtual).toBe(1);

    // dia 2: SEM meta cadastrada — fica neutro, não é fechado
    const r2 = await avaliarFechamentoDia(vendedor.id, diasAtras(2));
    expect(r2.avaliado).toBe(false);

    // dia 1: bate meta de novo — a sequência deve CONTINUAR (2), não resetar pra 1,
    // porque o dia 2 nunca teve meta (não é uma falha real, é ausência de dado)
    await criarMeta(vendedor.id, 100, diasAtras(1));
    await criarIndicador(vendedor.id, new Date(diasAtras(1).getTime() + 10 * 3600 * 1000), { faturamento: 150 });
    const r1 = await avaliarFechamentoDia(vendedor.id, diasAtras(1));

    expect(r1.streakAtual).toBe(2);
  });

  it('é idempotente: reprocessar o mesmo dia fechado não conta 2x nem duplica recompensa', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const dia = diasAtras(1);
    await criarMeta(vendedor.id, 100, dia);
    await criarIndicador(vendedor.id, new Date(dia.getTime() + 10 * 3600 * 1000), { faturamento: 150 });

    const primeira = await avaliarFechamentoDia(vendedor.id, dia);
    const segunda = await avaliarFechamentoDia(vendedor.id, dia);

    expect(primeira.avaliado).toBe(true);
    expect(segunda.avaliado).toBe(false); // já fechado — idempotente
  });
});
