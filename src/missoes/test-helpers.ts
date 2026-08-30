// Helper só pra testes — garante o catálogo global de MissionDefinition/
// ChallengeDefinition antes de qualquer teste que atribua missões (mesmo
// raciocínio de garantirCatalogoBadges em gamificacao/test-helpers.ts: o
// banco de teste nunca roda scripts/seed.ts, só as fixtures dos próprios testes).
import { seedMissoesEDesafios } from './catalogo-seed';

export async function garantirCatalogoMissoes() {
  await seedMissoesEDesafios();
}
