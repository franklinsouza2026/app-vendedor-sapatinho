// Celebração e atividades recentes (Etapa 2B.1) — TESTES CRÍTICOS #4 e #7.
//
// A 2B.0 encontrou um motor de celebração com 9 tipos de sinal detectados... e
// ligado só ao gerente. O Conselheiro não consumia nenhum. Ao mesmo tempo,
// `recentTrainings` estava fixo em `[]` desde a Fatia 4, com o comentário
// "// Academia é Fatia 6" — oito fatias depois.
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../db';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { listarSinaisPositivosDoVendedor } from './celebracao.service';
import { listarAtividadesRecentes } from './atividades.service';
import { classificarIntencao } from '../pertinencia/classificador.service';
import { buildCoachContext } from './context-builder.service';
import { formatarContextoParaPrompt } from './prompts/context-formatter';
import { decidirPertinencia } from '../pertinencia/gate.service';

async function aulaConcluida(fixture: Awaited<ReturnType<typeof criarFixtureEmpresa>>, titulo: string, quizScore: number | null) {
  const trilha = await prisma.academyTrack.create({
    data: { code: `t-${randomUUID()}`, title: 'Trilha', description: 'd', status: 'PUBLISHED' },
  });
  const aula = await prisma.academyLesson.create({
    data: { trackId: trilha.id, code: `a-${randomUUID()}`, title: titulo, description: 'd', content: 'c', estimatedMinutes: 5, status: 'PUBLISHED' },
  });
  await prisma.academyProgress.create({
    data: {
      empresaId: fixture.empresa.id,
      lojaId: fixture.loja.id,
      vendedorId: fixture.vendedor.id,
      lessonId: aula.id,
      status: 'COMPLETED',
      completedAt: new Date(),
      quizScore,
      quizPassed: quizScore !== null ? quizScore >= 70 : null,
    },
  });
  return aula;
}

describe('TESTE CRÍTICO #4 — celebração vem de fato real, nunca inventada', () => {
  it('conquista real do próprio vendedor chega ao contexto', async () => {
    const { empresa, vendedor, loja } = await criarFixtureEmpresa();
    await prisma.feedEvent.create({
      data: {
        lojaId: loja.id,
        subjectId: vendedor.id,
        eventType: 'CERTIFICATION_ISSUED',
        visibility: 'STORE',
        sourceType: 'USER_CERTIFICATION',
        sourceId: randomUUID(),
        templateData: { certificationName: 'Certificação de Abordagem' },
      },
    });

    const sinais = await listarSinaisPositivosDoVendedor(vendedor.id);
    expect(sinais).toHaveLength(1);
    expect(sinais[0].descricao).toContain('Certificação de Abordagem');

    const pertinencia = decidirPertinencia('CELEBRACAO', null, 'LLM');
    const contexto = await buildCoachContext(vendedor.id, pertinencia);
    const prompt = formatarContextoParaPrompt(contexto);
    expect(prompt).toContain('Certificação de Abordagem');
    expect(prompt).toMatch(/Conquista recente que vale reconhecer/);
    // Fixture nova: sem empresa/loja no filtro, o teste passaria por acidente.
    // Etapa 2B.3: o contexto carrega UMA intervenção selecionada, não a lista
    // de candidatos — é o que impede um candidato não apresentado de queimar.
    expect(contexto.desenvolvimento!.intervencaoDoTurno?.tipo).toBe('CELEBROU');
  });

  it('sem conquista nenhuma, NÃO fabrica elogio genérico', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    expect(await listarSinaisPositivosDoVendedor(vendedor.id)).toEqual([]);

    const contexto = await buildCoachContext(vendedor.id, decidirPertinencia('CELEBRACAO', null, 'LLM'));
    expect(formatarContextoParaPrompt(contexto)).not.toMatch(/Conquista recente que vale reconhecer/);
  });

  it('CELEBRAR não puxa contexto comercial — parabéns não vem emendado com cobrança', async () => {
    const { vendedor, loja } = await criarFixtureEmpresa();
    await prisma.feedEvent.create({
      data: { lojaId: loja.id, subjectId: vendedor.id, eventType: 'PDI_COMPLETED', visibility: 'STORE', sourceType: 'DEVELOPMENT_PLAN', sourceId: randomUUID(), templateData: { competencyName: 'Fechamento' } },
    });

    const contexto = await buildCoachContext(vendedor.id, decidirPertinencia('CELEBRACAO', null, 'LLM'));
    const prompt = formatarContextoParaPrompt(contexto);

    expect(contexto.comercial).toBeNull();
    expect(prompt).toContain('Fechamento');
    expect(prompt).not.toMatch(/Meta de hoje|PA hoje|Ticket hoje/);
    // E o prompt instrui explicitamente contra o padrão "parabéns, mas...".
    expect(prompt).toMatch(/Não emende cobrança no reconhecimento/i);
  });

  it('conquista de um vendedor nunca aparece no contexto de outro', async () => {
    const a = await criarFixtureEmpresa();
    const b = await criarFixtureEmpresa();
    await prisma.feedEvent.create({
      data: { lojaId: a.loja.id, subjectId: a.vendedor.id, eventType: 'CERTIFICATION_ISSUED', visibility: 'STORE', sourceType: 'USER_CERTIFICATION', sourceId: randomUUID(), templateData: { certificationName: 'Só do A' } },
    });

    expect(await listarSinaisPositivosDoVendedor(b.vendedor.id)).toEqual([]);
  });

  it('conquista antiga sai da janela — não é novidade pra sempre', async () => {
    const { vendedor, loja } = await criarFixtureEmpresa();
    await prisma.feedEvent.create({
      data: {
        lojaId: loja.id,
        subjectId: vendedor.id,
        eventType: 'CERTIFICATION_ISSUED',
        visibility: 'STORE',
        sourceType: 'USER_CERTIFICATION',
        sourceId: randomUUID(),
        templateData: { certificationName: 'Antiga' },
        createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      },
    });

    expect(await listarSinaisPositivosDoVendedor(vendedor.id)).toEqual([]);
  });
});

describe('TESTE CRÍTICO #7 — atividades recentes chegam ao contexto', () => {
  it('aula concluída e quiz aprovado viram atividades distintas, com a nota real', async () => {
    const fixture = await criarFixtureEmpresa();
    await aulaConcluida(fixture, 'Como abrir bem um atendimento', 85);

    const atividades = await listarAtividadesRecentes(fixture.vendedor.id);

    expect(atividades.find((a) => a.tipo === 'AULA')?.titulo).toBe('Como abrir bem um atendimento');
    const quiz = atividades.find((a) => a.tipo === 'QUIZ');
    expect(quiz?.resultado).toBe(85); // nota REAL do backend, nunca inventada
  });

  it('aula sem quiz não inventa nota', async () => {
    const fixture = await criarFixtureEmpresa();
    await aulaConcluida(fixture, 'Aula sem quiz', null);

    const atividades = await listarAtividadesRecentes(fixture.vendedor.id);
    expect(atividades).toHaveLength(1);
    expect(atividades[0].resultado).toBeNull();
  });

  it('as atividades chegam ao prompt quando DESENVOLVIMENTO está autorizado', async () => {
    const fixture = await criarFixtureEmpresa();
    await aulaConcluida(fixture, 'Quebra de objeções', null);

    const contexto = await buildCoachContext(fixture.vendedor.id, decidirPertinencia('DESENVOLVIMENTO', null, 'DETERMINISTICO'));
    expect(formatarContextoParaPrompt(contexto)).toContain('Quebra de objeções');
  });

  it('em ACOLHER não entram nem as atividades — a pessoa vem primeiro', async () => {
    const fixture = await criarFixtureEmpresa();
    await aulaConcluida(fixture, 'Quebra de objeções', null);

    const contexto = await buildCoachContext(fixture.vendedor.id, decidirPertinencia('DESABAFO', 'NOT_GOOD', 'DETERMINISTICO'));
    expect(contexto.desenvolvimento).toBeNull();
    expect(formatarContextoParaPrompt(contexto)).not.toContain('Quebra de objeções');
  });

  it('atividade de um vendedor nunca aparece na de outro', async () => {
    const a = await criarFixtureEmpresa();
    const b = await criarFixtureEmpresa();
    await aulaConcluida(a, 'Só do A', null);

    expect(await listarAtividadesRecentes(b.vendedor.id)).toEqual([]);
  });
});

describe('TESTE CRÍTICO #7 (fallback) — provider quebrado nunca libera performance', () => {
  it.each([
    ['provider fora do ar', '__SIMULATE_ERROR__'],
    ['timeout', '__SIMULATE_TIMEOUT__'],
    ['JSON inválido', '__FORCE_INVALID_JSON__'],
    ['enum inválido', '__FORCE_INTENCAO_INVALIDA__'],
  ])('%s → conversa segue, contexto humano vive, COMERCIAL não é liberado', async (_titulo, marcador) => {
    const { empresa, vendedor } = await criarFixtureEmpresa();

    const pertinencia = await classificarIntencao({ empresaId: empresa.id, vendedorId: vendedor.id, mensagem: `mensagem ambígua ${marcador}`, checkin: null });

    expect(pertinencia.origem).toBe('FALLBACK');
    expect(pertinencia.dominios).not.toContain('COMERCIAL');
    expect(pertinencia.dominios).toContain('HUMANO');

    // E o contexto continua montável — a conversa não morre.
    const contexto = await buildCoachContext(vendedor.id, pertinencia);
    expect(contexto.comercial).toBeNull();
    expect(formatarContextoParaPrompt(contexto)).toContain('CONTEXTO ATUAL');
  });

  it('o curto-circuito determinístico funciona mesmo com o provider fora', async () => {
    const { empresa, vendedor } = await criarFixtureEmpresa();

    // Pedido explícito não depende de IA nenhuma pra ser reconhecido — por isso
    // o vendedor não perde acesso aos próprios números quando o provider cai.
    const pertinencia = await classificarIntencao({
      empresaId: empresa.id,
      vendedorId: vendedor.id,
      mensagem: 'Quanto falta para minha meta? __SIMULATE_ERROR__',
      checkin: null,
    });

    expect(pertinencia.origem).toBe('DETERMINISTICO');
    expect(pertinencia.dominios).toContain('COMERCIAL');
  });
});

describe('custo do classificador entra no orçamento da empresa', () => {
  it('a chamada de classificação é registrada em AIUsage — o budget não subconta', async () => {
    const { empresa, vendedor } = await criarFixtureEmpresa();
    const antes = await prisma.aIUsage.count({ where: { empresaId: empresa.id } });

    // Mensagem ambígua: o curto-circuito não resolve, então a IA é chamada.
    const pertinencia = await classificarIntencao({ empresaId: empresa.id, vendedorId: vendedor.id, mensagem: 'aconteceu uma coisa hoje', checkin: null });
    expect(pertinencia.origem).toBe('LLM');

    // Sem este registro, cada mensagem gastaria DUAS chamadas de provider e o
    // orçamento mensal contaria uma — subcontagem sistemática.
    expect(await prisma.aIUsage.count({ where: { empresaId: empresa.id } })).toBe(antes + 1);
  });

  it('curto-circuito determinístico NÃO gera custo nenhum', async () => {
    const { empresa, vendedor } = await criarFixtureEmpresa();
    const antes = await prisma.aIUsage.count({ where: { empresaId: empresa.id } });

    const pertinencia = await classificarIntencao({ empresaId: empresa.id, vendedorId: vendedor.id, mensagem: 'Quanto falta para minha meta?', checkin: null });
    expect(pertinencia.origem).toBe('DETERMINISTICO');

    expect(await prisma.aIUsage.count({ where: { empresaId: empresa.id } })).toBe(antes);
  });
});
