// League (Fatia 8, seção 18-20/79/96) — promoção/rebaixamento determinístico
// dentro de cada liga, histórico preservado (nunca edita membership antiga).
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../db';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { criarSeason } from './seasons.service';
import { criarLiga, garantirMembroNaLiga, ligaAtualDoParticipante, processarPromocaoRebaixamento } from './leagues.service';
import { registrarPontosSeason } from './seasons.service';

function datasSeason() {
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + 7 * 24 * 3600 * 1000);
  return { startsAt, endsAt };
}

describe('League — promoção/rebaixamento (seção 18-20)', () => {
  it('top N de uma liga (por Season Points) é promovido pra próxima; membership antiga fecha, nova abre (seção 19)', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const sufixo = randomUUID();
    // sortOrder alto e único (baseado no relógio) — nunca colide/intercala
    // com o seed global (Bronze/Prata/Ouro/Diamante, sortOrder 0-3) nem com
    // ligas de outras rodadas de teste no mesmo banco compartilhado.
    const base = 100000 + Math.floor(Math.random() * 100000); // dentro do range INT4, alto o bastante pra nunca colidir com o seed (0-3)
    const ligaBaixa = await criarLiga({ code: `baixa-${sufixo}`, name: 'Baixa', sortOrder: base, promotionThreshold: 1 }, vendedor.id);
    const ligaAlta = await criarLiga({ code: `alta-${sufixo}`, name: 'Alta', sortOrder: base + 1 }, vendedor.id);
    const season = await criarSeason({ code: `season-liga-${sufixo}`, name: 'S', description: 'd', ...datasSeason() }, vendedor.id);

    const top = randomUUID();
    const resto = randomUUID();
    await prisma.leagueMembership.create({ data: { seasonId: season.id, leagueId: ligaBaixa.id, participantType: 'SELLER', participantId: top } });
    await prisma.leagueMembership.create({ data: { seasonId: season.id, leagueId: ligaBaixa.id, participantType: 'SELLER', participantId: resto } });
    await registrarPontosSeason({ seasonId: season.id, participantType: 'SELLER', participantId: top, eventType: 'T', sourceType: 'T', sourceId: '1', points: 100 });
    await registrarPontosSeason({ seasonId: season.id, participantType: 'SELLER', participantId: resto, eventType: 'T', sourceType: 'T', sourceId: '1', points: 10 });

    await processarPromocaoRebaixamento(season.id);

    const ligaDoTop = await ligaAtualDoParticipante('SELLER', top);
    const ligaDoResto = await ligaAtualDoParticipante('SELLER', resto);
    expect(ligaDoTop?.id).toBe(ligaAlta.id);
    expect(ligaDoResto?.id).toBe(ligaBaixa.id); // não promovido — fica onde estava

    // Histórico preservado: a membership antiga do "top" continua existindo, só fechada.
    const antiga = await prisma.leagueMembership.findFirst({ where: { participantType: 'SELLER', participantId: top, leagueId: ligaBaixa.id } });
    expect(antiga?.exitedAt).not.toBeNull();
  });

  it('garantirMembroNaLiga é idempotente — 2 chamadas não criam 2 memberships ativas', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const sufixo = randomUUID();
    await criarLiga({ code: `unica-${sufixo}`, name: 'Única', sortOrder: 0 }, vendedor.id);
    const season = await criarSeason({ code: `season-idem-${sufixo}`, name: 'S', description: 'd', ...datasSeason() }, vendedor.id);
    const participantId = randomUUID();

    await garantirMembroNaLiga(season.id, 'SELLER', participantId);
    await garantirMembroNaLiga(season.id, 'SELLER', participantId);

    const ativas = await prisma.leagueMembership.findMany({ where: { participantType: 'SELLER', participantId, exitedAt: null } });
    expect(ativas).toHaveLength(1);
  });
});
