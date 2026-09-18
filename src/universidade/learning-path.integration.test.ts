// "Para Você" (Etapa 2A) — a única superfície de "próxima ação" do produto.
//
// POR QUE ESTE ARQUIVO EXISTE: até aqui `learning-path.service.ts` tinha ZERO
// testes, e por isso 5 dos 6 `href` que ele emitia apontavam para rotas
// `/evoluir/*` que nunca existiram em `App.tsx`. Como o app não tem rota
// curinga, cada clique levava o vendedor a uma TELA EM BRANCO.
//
// O teste mais importante deste arquivo é o que confronta os href emitidos com
// as rotas realmente declaradas no frontend — é o que impede a regressão.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { prisma } from '../db';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { montarParaVoce } from './learning-path.service';

/** Lê as rotas REAIS declaradas em `web/src/App.tsx` — fonte de verdade do que existe. */
function rotasDeclaradasNoFrontend(): string[] {
  const appTsx = readFileSync(join(__dirname, '../../web/src/App.tsx'), 'utf8');
  return [...appTsx.matchAll(/path="([^"]+)"/g)].map((m) => m[1]);
}

/** Casa um href (com query/params) contra a lista de rotas declaradas. */
function rotaExiste(href: string, rotas: string[]): boolean {
  const caminho = href.split('?')[0];
  return rotas.some((rota) => {
    if (rota === caminho) return true;
    // Rota com parâmetro (`/x/:id`) casa com qualquer valor no lugar dele.
    const padrao = new RegExp(`^${rota.replace(/:[^/]+/g, '[^/]+')}$`);
    return padrao.test(caminho);
  });
}

describe('montarParaVoce — próxima ação do vendedor', () => {
  it('REGRESSÃO: TODO href emitido aponta pra uma rota que existe de verdade no App.tsx', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const rotas = rotasDeclaradasNoFrontend();
    expect(rotas.length).toBeGreaterThan(10); // sanidade: o arquivo foi lido mesmo

    // Cria condição pra o máximo de tipos de item aparecer de uma vez.
    const trilha = await prisma.academyTrack.create({
      data: { code: `onb-${randomUUID()}`, title: 'Integração', description: 'd', status: 'PUBLISHED', onboarding: true },
    });
    await prisma.academyLesson.create({
      data: { trackId: trilha.id, code: `a-${randomUUID()}`, title: 'Aula', description: 'd', content: 'c', estimatedMinutes: 5, status: 'PUBLISHED' },
    });

    const itens = await montarParaVoce(vendedor.id, 'VENDEDOR');
    expect(itens.length).toBeGreaterThan(0);

    for (const item of itens) {
      expect(rotaExiste(item.href, rotas), `href "${item.href}" (item ${item.tipo}) não existe em App.tsx`).toBe(true);
    }
  });

  it('nenhum href aponta pro prefixo /evoluir/ — era ele que dava tela em branco', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const trilha = await prisma.academyTrack.create({
      data: { code: `onb-${randomUUID()}`, title: 'Integração', description: 'd', status: 'PUBLISHED', onboarding: true },
    });
    await prisma.academyLesson.create({
      data: { trackId: trilha.id, code: `a-${randomUUID()}`, title: 'Aula', description: 'd', content: 'c', estimatedMinutes: 5, status: 'PUBLISHED' },
    });

    const itens = await montarParaVoce(vendedor.id, 'VENDEDOR');
    for (const item of itens) {
      expect(item.href.startsWith('/evoluir/')).toBe(false);
    }
  });

  it('respeita o limite e nunca polui a tela', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const itens = await montarParaVoce(vendedor.id, 'VENDEDOR', 2);
    expect(itens.length).toBeLessThanOrEqual(2);
  });

  it('nunca inventa item pessoal pra quem não tem registro nenhum', async () => {
    const { vendedor } = await criarFixtureEmpresa();

    // PDI, revisão e certificação exigem uma linha PRÓPRIA do vendedor no
    // banco — nenhuma existe pra alguém recém-criado. (Onboarding e missão vêm
    // do catálogo global, que outros testes populam, então não entram aqui.)
    const itens = await montarParaVoce(vendedor.id, 'VENDEDOR');
    for (const tipo of ['PDI', 'REVIEW', 'CERTIFICATION'] as const) {
      expect(itens.find((i) => i.tipo === tipo), `item ${tipo} inventado sem registro no banco`).toBeUndefined();
    }

    expect(await prisma.developmentPlan.count({ where: { subjectUserId: vendedor.id } })).toBe(0);
    expect(await prisma.reviewSchedule.count({ where: { userId: vendedor.id } })).toBe(0);
  });

  it('cada item traz título e descrição legíveis — nunca UUID cru na cara do vendedor', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const trilha = await prisma.academyTrack.create({
      data: { code: `onb-${randomUUID()}`, title: 'Trilha de Integração', description: 'd', status: 'PUBLISHED', onboarding: true },
    });
    await prisma.academyLesson.create({
      data: { trackId: trilha.id, code: `a-${randomUUID()}`, title: 'Aula', description: 'd', content: 'c', estimatedMinutes: 5, status: 'PUBLISHED' },
    });

    const itens = await montarParaVoce(vendedor.id, 'VENDEDOR');
    const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    for (const item of itens) {
      expect(item.titulo).not.toMatch(uuid);
      expect(item.descricao).not.toMatch(uuid);
      expect(item.titulo.length).toBeGreaterThan(3);
    }
  });
});
