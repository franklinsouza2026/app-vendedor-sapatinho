// Season (Fatia 8, seção 4-8/79/85/101) — lifecycle, Season Points Ledger
// idempotente/append-only, nunca confundido com XP/VendaCoins.
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { criarSeason, transicionarSeason, buscarSeason, registrarPontosSeason, totalPontosSeason, rankingSeason } from './seasons.service';
import { CompeticoesError } from './constantes';

function datasSeason() {
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + 7 * 24 * 3600 * 1000);
  return { startsAt, endsAt };
}

describe('Season — lifecycle', () => {
  it('nasce DRAFT, transições válidas funcionam em sequência', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const { startsAt, endsAt } = datasSeason();
    const season = await criarSeason({ code: `season-${randomUUID()}`, name: 'S', description: 'd', startsAt, endsAt }, vendedor.id);
    expect(season.status).toBe('DRAFT');

    const agendada = await transicionarSeason(season.id, 'agendar', vendedor.id);
    expect(agendada.status).toBe('SCHEDULED');
    const ativa = await transicionarSeason(season.id, 'ativar', vendedor.id);
    expect(ativa.status).toBe('ACTIVE');
  });

  it('rejeita transição inválida (ex.: ativar uma season CANCELLED)', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const { startsAt, endsAt } = datasSeason();
    const season = await criarSeason({ code: `season-${randomUUID()}`, name: 'S', description: 'd', startsAt, endsAt }, vendedor.id);
    await transicionarSeason(season.id, 'cancelar', vendedor.id);
    await expect(transicionarSeason(season.id, 'ativar', vendedor.id)).rejects.toThrow(CompeticoesError);
  });

  it('rejeita endsAt <= startsAt', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const startsAt = new Date();
    await expect(criarSeason({ code: `season-${randomUUID()}`, name: 'S', description: 'd', startsAt, endsAt: startsAt }, vendedor.id)).rejects.toThrow(CompeticoesError);
  });

  it('actorId opcional — ativação/finalização "do sistema" nunca quebra por FK (seção 67)', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const { startsAt, endsAt } = datasSeason();
    const season = await criarSeason({ code: `season-${randomUUID()}`, name: 'S', description: 'd', startsAt, endsAt }, vendedor.id);
    const ativada = await transicionarSeason(season.id, 'ativar'); // sem actorId — simula o worker
    expect(ativada.status).toBe('ACTIVE');
  });
});

describe('SeasonPointLedger — append-only, idempotente (seção 7/79/101)', () => {
  it('mesmo (season, participante, source) 2x nunca duplica pontos', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const { startsAt, endsAt } = datasSeason();
    const season = await criarSeason({ code: `season-ledger-${randomUUID()}`, name: 'S', description: 'd', startsAt, endsAt }, vendedor.id);
    const participantId = randomUUID();

    await registrarPontosSeason({ seasonId: season.id, participantType: 'SELLER', participantId, eventType: 'TESTE', sourceType: 'TESTE', sourceId: 'fonte-1', points: 10 });
    await registrarPontosSeason({ seasonId: season.id, participantType: 'SELLER', participantId, eventType: 'TESTE', sourceType: 'TESTE', sourceId: 'fonte-1', points: 10 });

    expect(await totalPontosSeason(season.id, 'SELLER', participantId)).toBe(10); // não 20
  });

  it('2 registros concorrentes do mesmo evento: só 1 é efetivo', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const { startsAt, endsAt } = datasSeason();
    const season = await criarSeason({ code: `season-conc-${randomUUID()}`, name: 'S', description: 'd', startsAt, endsAt }, vendedor.id);
    const participantId = randomUUID();

    await Promise.all([
      registrarPontosSeason({ seasonId: season.id, participantType: 'SELLER', participantId, eventType: 'TESTE', sourceType: 'TESTE', sourceId: 'fonte-conc', points: 25 }),
      registrarPontosSeason({ seasonId: season.id, participantType: 'SELLER', participantId, eventType: 'TESTE', sourceType: 'TESTE', sourceId: 'fonte-conc', points: 25 }),
    ]);

    expect(await totalPontosSeason(season.id, 'SELLER', participantId)).toBe(25);
  });

  it('reversão (cancelamento/devolução) usa pontos negativos — nunca apaga o registro original (seção 28/102)', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const { startsAt, endsAt } = datasSeason();
    const season = await criarSeason({ code: `season-rev-${randomUUID()}`, name: 'S', description: 'd', startsAt, endsAt }, vendedor.id);
    const participantId = randomUUID();

    await registrarPontosSeason({ seasonId: season.id, participantType: 'SELLER', participantId, eventType: 'VENDA', sourceType: 'VENDA', sourceId: 'venda-1', points: 50 });
    await registrarPontosSeason({ seasonId: season.id, participantType: 'SELLER', participantId, eventType: 'VENDA_CANCELADA', sourceType: 'VENDA_CANCELAMENTO', sourceId: 'venda-1', points: -50 });

    expect(await totalPontosSeason(season.id, 'SELLER', participantId)).toBe(0);
  });

  it('ranking ordena por pontos desc, nunca por ordem de inserção', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const { startsAt, endsAt } = datasSeason();
    const season = await criarSeason({ code: `season-rank-${randomUUID()}`, name: 'S', description: 'd', startsAt, endsAt }, vendedor.id);
    const a = randomUUID();
    const b = randomUUID();

    await registrarPontosSeason({ seasonId: season.id, participantType: 'SELLER', participantId: a, eventType: 'T', sourceType: 'T', sourceId: '1', points: 10 });
    await registrarPontosSeason({ seasonId: season.id, participantType: 'SELLER', participantId: b, eventType: 'T', sourceType: 'T', sourceId: '1', points: 30 });

    const ranking = await rankingSeason(season.id, 'SELLER');
    expect(ranking[0].participantId).toBe(b);
    expect(ranking[0].posicao).toBe(1);
  });
});

describe('Season — não reseta dados de outros domínios (seção 5)', () => {
  it('Season em si nunca guarda XP/moeda — Season Points é um conceito totalmente separado', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const { startsAt, endsAt } = datasSeason();
    const season = await criarSeason({ code: `season-isolada-${randomUUID()}`, name: 'S', description: 'd', startsAt, endsAt }, vendedor.id);
    const buscado = await buscarSeason(season.id);
    expect(Object.keys(buscado)).not.toContain('xp');
    expect(Object.keys(buscado)).not.toContain('moedas');
  });
});
