// Continuidade relacional (Etapa 2B.2) — os testes que definem a fatia.
//
// O que provam: o Conselheiro deixa de agir como se nunca tivesse conversado
// com aquela pessoa — sem virar memória de vigilância.
//
// Comportamento medido ANTES desta etapa, contra o servidor real: a mesma
// certificação foi celebrada, com texto idêntico, em três conversas seguidas.
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../db';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import {
  MAX_INTERVENCOES_NO_CONTEXTO,
  listarContinuidadeRelevante,
  montarDedupeKey,
  registrarIntervencao,
  transicaoPermitida,
  transicionarIntervencao,
} from './intervencao.service';
import { listarSinaisPositivosDoVendedor } from './celebracao.service';
import { classificarRespostaDeterministicamente, classificarResposta } from './resposta-classificador.service';
import { confirmarDeclaracaoDeConclusao, reconciliarConclusoes } from './conclusao.service';
import { buildCoachContext } from './context-builder.service';
import { formatarContextoParaPrompt } from './prompts/context-formatter';
import { decidirPertinencia } from '../pertinencia/gate.service';
import { processarRespostaASugestao, registrarIntervencaoApresentada } from './continuidade.service';
import { criarNovaConversa, getOrCreateConversaAtual } from './conversation.service';

async function conquistaReal(fixture: Awaited<ReturnType<typeof criarFixtureEmpresa>>, nome = 'Certificação de Abordagem') {
  return prisma.feedEvent.create({
    data: {
      lojaId: fixture.loja.id,
      subjectId: fixture.vendedor.id,
      eventType: 'CERTIFICATION_ISSUED',
      visibility: 'STORE',
      sourceType: 'USER_CERTIFICATION',
      sourceId: randomUUID(),
      templateData: { certificationName: nome },
    },
  });
}

async function sugestaoPendente(fixture: Awaited<ReturnType<typeof criarFixtureEmpresa>>, sourceId: string = randomUUID()) {
  return registrarIntervencao({
    empresaId: fixture.empresa.id,
    vendedorId: fixture.vendedor.id,
    tipo: 'SUGERIU',
    sourceType: 'COMPETENCY',
    sourceId,
    metadata: { titulo: 'trabalhar Quebra de Objeções' },
  });
}

describe('TESTES 1-3 — celebração acontece uma vez, não vira spam', () => {
  it('a conquista é oferecida na primeira vez', async () => {
    const f = await criarFixtureEmpresa();
    await conquistaReal(f);

    const sinais = await listarSinaisPositivosDoVendedor(f.vendedor.id);
    expect(sinais).toHaveLength(1);
    expect(sinais[0].descricao).toContain('Certificação de Abordagem');
  });

  it('REGRESSÃO: depois de celebrada, NÃO volta sozinha na conversa seguinte', async () => {
    const f = await criarFixtureEmpresa();
    const evento = await conquistaReal(f);

    // Turno 1: o sistema ofereceu o fato numa conversa de CELEBRAR.
    await registrarIntervencao({
      empresaId: f.empresa.id,
      vendedorId: f.vendedor.id,
      tipo: 'CELEBROU',
      sourceType: 'FEED_EVENT',
      sourceId: evento.id,
      metadata: { titulo: 'certificação' },
    });

    // Turno 2: mesma conquista, nova conversa — silêncio.
    expect(await listarSinaisPositivosDoVendedor(f.vendedor.id)).toEqual([]);
  });

  it('o cooldown NÃO bloqueia o assunto — só impede o Conselheiro de trazer sozinho', async () => {
    const f = await criarFixtureEmpresa();
    const evento = await conquistaReal(f);
    await registrarIntervencao({ empresaId: f.empresa.id, vendedorId: f.vendedor.id, tipo: 'CELEBROU', sourceType: 'FEED_EVENT', sourceId: evento.id });

    // O fato continua existindo e verdadeiro: se o vendedor perguntar sobre a
    // certificação, a conversa acontece. O que sumiu foi só a iniciativa.
    const aindaExiste = await prisma.feedEvent.count({ where: { id: evento.id } });
    expect(aindaExiste).toBe(1);
    // E a intervenção não é um bloqueio: é registro datado.
    const registro = await prisma.coachIntervention.findFirstOrThrow({ where: { vendedorId: f.vendedor.id, tipo: 'CELEBROU' } });
    expect(registro.status).toBe('REGISTRADA');
  });
});

describe('TESTES 4-7 — recusa, adiamento e aceite', () => {
  it('sugestão RECUSADA sai da continuidade — não é repetida automaticamente', async () => {
    const f = await criarFixtureEmpresa();
    const sugestao = await sugestaoPendente(f);

    expect(await listarContinuidadeRelevante(f.vendedor.id)).toHaveLength(1);
    expect(await transicionarIntervencao(sugestao.id, f.vendedor.id, 'RECUSADA')).toBe(true);
    expect(await listarContinuidadeRelevante(f.vendedor.id)).toEqual([]);
  });

  it('RECUSADA é contextual — não bloqueia a categoria inteira', async () => {
    const f = await criarFixtureEmpresa();
    const a = await sugestaoPendente(f, 'competencia-A');
    await transicionarIntervencao(a.id, f.vendedor.id, 'RECUSADA');

    // Outra competência é outro assunto: recusar uma não veta todas. E o
    // índice único parcial não atrapalha, porque o dedupeKey é diferente.
    const b = await sugestaoPendente(f, 'competencia-B');
    expect(b.status).toBe('REGISTRADA');
    expect(await listarContinuidadeRelevante(f.vendedor.id)).toHaveLength(1);
  });

  it('ADIADA não inventa data nem prazo', async () => {
    const f = await criarFixtureEmpresa();
    const sugestao = await sugestaoPendente(f);

    await transicionarIntervencao(sugestao.id, f.vendedor.id, 'ADIADA');
    const depois = await prisma.coachIntervention.findFirstOrThrow({ where: { id: sugestao.id } });

    expect(depois.status).toBe('ADIADA');
    // Não existe coluna de prazo, e nada foi fabricado no metadata.
    expect(JSON.stringify(depois.metadata ?? {})).not.toMatch(/due|prazo|deadline|lembrete/i);
    // Continua viva: adiar não é encerrar.
    expect(await listarContinuidadeRelevante(f.vendedor.id)).toHaveLength(1);
  });

  it('ACEITA não é CONCLUIDA — "vou fazer" não é "fiz"', async () => {
    const f = await criarFixtureEmpresa();
    const sugestao = await sugestaoPendente(f);

    await transicionarIntervencao(sugestao.id, f.vendedor.id, 'ACEITA');
    const depois = await prisma.coachIntervention.findFirstOrThrow({ where: { id: sugestao.id } });

    expect(depois.status).toBe('ACEITA');
    expect(depois.status).not.toBe('CONCLUIDA');
    expect(await listarContinuidadeRelevante(f.vendedor.id)).toHaveLength(1);
  });

  it('transições proibidas são recusadas — estado terminal não revive', async () => {
    const f = await criarFixtureEmpresa();
    const sugestao = await sugestaoPendente(f);
    await transicionarIntervencao(sugestao.id, f.vendedor.id, 'RECUSADA');

    expect(transicaoPermitida('RECUSADA', 'ACEITA')).toBe(false);
    expect(await transicionarIntervencao(sugestao.id, f.vendedor.id, 'ACEITA')).toBe(false);
    expect((await prisma.coachIntervention.findFirstOrThrow({ where: { id: sugestao.id } })).status).toBe('RECUSADA');
  });
});

describe('TESTES 8-9 — conclusão vem de FATO, nunca de declaração', () => {
  it('atividade realmente concluída fecha a sugestão, determinísticamente', async () => {
    const f = await criarFixtureEmpresa();
    const trilha = await prisma.academyTrack.create({ data: { code: `t-${randomUUID()}`, title: 'T', description: 'd', status: 'PUBLISHED' } });
    const aula = await prisma.academyLesson.create({
      data: { trackId: trilha.id, code: `a-${randomUUID()}`, title: 'Aula', description: 'd', content: 'c', estimatedMinutes: 5, status: 'PUBLISHED' },
    });
    const sugestao = await registrarIntervencao({
      empresaId: f.empresa.id,
      vendedorId: f.vendedor.id,
      tipo: 'SUGERIU',
      sourceType: 'ACADEMY_LESSON',
      sourceId: aula.id,
    });

    // O fato de sistema acontece DEPOIS da sugestão.
    await prisma.academyProgress.create({
      data: { empresaId: f.empresa.id, lojaId: f.loja.id, vendedorId: f.vendedor.id, lessonId: aula.id, status: 'COMPLETED', completedAt: new Date() },
    });

    expect(await reconciliarConclusoes(f.vendedor.id)).toBe(1);
    expect((await prisma.coachIntervention.findFirstOrThrow({ where: { id: sugestao.id } })).status).toBe('CONCLUIDA');
    // E some da continuidade: o Conselheiro não pergunta "você fez?".
    expect(await listarContinuidadeRelevante(f.vendedor.id)).toEqual([]);
  });

  it('atividade concluída ANTES da sugestão não a fecha — não se credita o que já estava feito', async () => {
    const f = await criarFixtureEmpresa();
    const trilha = await prisma.academyTrack.create({ data: { code: `t-${randomUUID()}`, title: 'T', description: 'd', status: 'PUBLISHED' } });
    const aula = await prisma.academyLesson.create({
      data: { trackId: trilha.id, code: `a-${randomUUID()}`, title: 'Aula', description: 'd', content: 'c', estimatedMinutes: 5, status: 'PUBLISHED' },
    });
    await prisma.academyProgress.create({
      data: {
        empresaId: f.empresa.id,
        lojaId: f.loja.id,
        vendedorId: f.vendedor.id,
        lessonId: aula.id,
        status: 'COMPLETED',
        completedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      },
    });

    await registrarIntervencao({ empresaId: f.empresa.id, vendedorId: f.vendedor.id, tipo: 'SUGERIU', sourceType: 'ACADEMY_LESSON', sourceId: aula.id });
    expect(await reconciliarConclusoes(f.vendedor.id)).toBe(0);
  });

  it('DECLARAÇÃO sem fato NÃO cria conclusão falsa', async () => {
    const f = await criarFixtureEmpresa();
    const sugestao = await sugestaoPendente(f, 'competencia-sem-evidencia');

    // "Já fiz" é reconhecido pelo classificador...
    expect(classificarRespostaDeterministicamente('já fiz isso')).toBe('DECLAROU_CONCLUSAO');
    // ...mas sem fato de sistema, nada é confirmado.
    const verificado = await confirmarDeclaracaoDeConclusao(f.vendedor.id, 'COMPETENCY', 'competencia-sem-evidencia', sugestao.ocorridoEm);
    expect(verificado).toBe(false);
    expect((await prisma.coachIntervention.findFirstOrThrow({ where: { id: sugestao.id } })).status).toBe('REGISTRADA');
  });
});

describe('TESTE 10 — ambiguidade NÃO altera estado', () => {
  it.each(['talvez', 'vamos ver', 'quem sabe', 'pode ser que eu faça', 'não sei'])('"%s" fica INDETERMINADO', (msg) => {
    expect(classificarRespostaDeterministicamente(msg)).toBe('INDETERMINADO');
  });

  it('"talvez eu faça" não vira ACEITOU — a pessoa não se comprometeu', () => {
    // Sem a precedência da ambiguidade, isto casaria com o padrão de aceite
    // ("vou/posso fazer") e gravaria um compromisso que ninguém assumiu.
    expect(classificarRespostaDeterministicamente('talvez eu faça depois')).toBe('INDETERMINADO');
  });

  it('mudar de assunto não é recusa; silêncio não é recusa', () => {
    expect(classificarRespostaDeterministicamente('e como está a loja hoje?')).toBeNull();
    expect(classificarRespostaDeterministicamente('')).toBeNull();
  });

  it.each([
    ['saída inválida do provider', '__FORCE_INVALID_JSON__'],
    ['enum inválido', '__FORCE_RESPOSTA_INVALIDA__'],
  ])('%s → INDETERMINADO, estado preservado', async (_t, marcador) => {
    const f = await criarFixtureEmpresa();
    const sugestao = await sugestaoPendente(f);

    const r = await classificarResposta({ empresaId: f.empresa.id, vendedorId: f.vendedor.id, mensagem: `resposta ambígua ${marcador}` });
    expect(r).toBe('INDETERMINADO');
    expect((await prisma.coachIntervention.findFirstOrThrow({ where: { id: sugestao.id } })).status).toBe('REGISTRADA');
  });
});

describe('TESTES 11-12 — idempotência e concorrência', () => {
  it('a mesma identidade não cria duas intervenções ativas', async () => {
    const f = await criarFixtureEmpresa();
    const a = await sugestaoPendente(f, 'mesma-competencia');
    const b = await sugestaoPendente(f, 'mesma-competencia');

    expect(b.id).toBe(a.id);
    expect(await prisma.coachIntervention.count({ where: { vendedorId: f.vendedor.id } })).toBe(1);
  });

  it('CONCORRÊNCIA: 5 requisições simultâneas produzem UMA intervenção ativa', async () => {
    const f = await criarFixtureEmpresa();

    // Sem o índice único parcial no banco, o SELECT-depois-INSERT deixaria
    // passar duplicatas nesta janela.
    const resultados = await Promise.allSettled(Array.from({ length: 5 }, () => sugestaoPendente(f, 'competencia-concorrente')));
    expect(resultados.every((r) => r.status === 'fulfilled')).toBe(true);
    expect(await prisma.coachIntervention.count({ where: { vendedorId: f.vendedor.id, status: { in: ['REGISTRADA', 'ACEITA', 'ADIADA'] } } })).toBe(1);
  });

  it('o dedupeKey inclui o vendedor — catálogo global não colide entre pessoas', async () => {
    const a = await criarFixtureEmpresa();
    const b = await criarFixtureEmpresa();
    const competenciaCompartilhada = 'competencia-do-catalogo-global';

    await sugestaoPendente(a, competenciaCompartilhada);
    await sugestaoPendente(b, competenciaCompartilhada);

    expect(montarDedupeKey(a.vendedor.id, 'SUGERIU', 'COMPETENCY', competenciaCompartilhada)).not.toBe(
      montarDedupeKey(b.vendedor.id, 'SUGERIU', 'COMPETENCY', competenciaCompartilhada)
    );
    expect(await listarContinuidadeRelevante(a.vendedor.id)).toHaveLength(1);
    expect(await listarContinuidadeRelevante(b.vendedor.id)).toHaveLength(1);
  });

  it('depois de RECUSADA, o mesmo assunto pode voltar como intervenção NOVA', async () => {
    const f = await criarFixtureEmpresa();
    const primeira = await sugestaoPendente(f, 'competencia-que-volta');
    await transicionarIntervencao(primeira.id, f.vendedor.id, 'RECUSADA');

    // Estado terminal sai do índice único: recusa é contextual, não permanente.
    const segunda = await sugestaoPendente(f, 'competencia-que-volta');
    expect(segunda.id).not.toBe(primeira.id);
    expect(segunda.status).toBe('REGISTRADA');
  });
});

describe('TESTES 13-16 — privacidade', () => {
  it('a memória de um vendedor nunca aparece na de outro', async () => {
    const a = await criarFixtureEmpresa();
    const b = await criarFixtureEmpresa();
    await sugestaoPendente(a);

    expect(await listarContinuidadeRelevante(b.vendedor.id)).toEqual([]);
    expect(await prisma.coachIntervention.count({ where: { vendedorId: b.vendedor.id } })).toBe(0);
  });

  it('ninguém transiciona a intervenção de outra pessoa, mesmo com o id em mãos', async () => {
    const a = await criarFixtureEmpresa();
    const b = await criarFixtureEmpresa();
    const sugestao = await sugestaoPendente(a);

    // Defesa em profundidade: o vendedorId entra no WHERE da transição.
    expect(await transicionarIntervencao(sugestao.id, b.vendedor.id, 'RECUSADA')).toBe(false);
    expect((await prisma.coachIntervention.findFirstOrThrow({ where: { id: sugestao.id } })).status).toBe('REGISTRADA');
  });

  it('nenhuma rota de gerente ou admin lê NADA da esfera privada do Conselheiro', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { join } = await import('node:path');

    const arquivos = [
      ...readdirSync(join(__dirname, '../manager')).map((f) => join(__dirname, '../manager', f)),
      ...['manager-panel.ts', 'manager-panel-admin.ts', 'admin.ts', 'admin-ai.ts', 'universidade-manager.ts'].map((f) => join(__dirname, '../routes', f)),
    ].filter((f) => f.endsWith('.ts') && !f.includes('.test.'));

    // Etapa 2B.4: a allowlist cobria só a memória de intervenções. As quatro
    // camadas privadas são as quatro — transcrição, humor, conversa e
    // continuidade. Deixar três de fora era confiar em ninguém ter vontade.
    const privados = [/coachIntervention/, /coachCheckIn/, /coachMessage/, /coachConversation/];

    for (const arquivo of arquivos) {
      const conteudo = readFileSync(arquivo, 'utf8');
      for (const tabela of privados) {
        expect(conteudo, `${arquivo} acessa a esfera privada do Conselheiro (${tabela})`).not.toMatch(tabela);
      }
    }
  });

  it('o metadata não guarda conversa, humor nem KPI', async () => {
    const f = await criarFixtureEmpresa();
    const sugestao = await sugestaoPendente(f);
    const bruto = JSON.stringify(await prisma.coachIntervention.findFirstOrThrow({ where: { id: sugestao.id } }));

    for (const proibido of [/mood/i, /checkin/i, /desabafo/i, /faturamento/i, /\bpa\b.*\d/i, /ticket/i, /meta.*\d/i]) {
      expect(bruto, `metadata contém dado proibido: ${proibido}`).not.toMatch(proibido);
    }
  });
});

describe('TESTES 17-18 — bounded context e a pessoa acima da memória', () => {
  it('mesmo com muitas intervenções, o contexto recebe no máximo o teto', async () => {
    const f = await criarFixtureEmpresa();
    for (let i = 0; i < 10; i++) await sugestaoPendente(f, `competencia-${i}`);

    expect(await prisma.coachIntervention.count({ where: { vendedorId: f.vendedor.id } })).toBe(10);
    expect((await listarContinuidadeRelevante(f.vendedor.id)).length).toBeLessThanOrEqual(MAX_INTERVENCOES_NO_CONTEXTO);

    const contexto = await buildCoachContext(f.vendedor.id, decidirPertinencia('CONVERSA', null, 'LLM'));
    expect(contexto.humano.continuidade.length).toBeLessThanOrEqual(MAX_INTERVENCOES_NO_CONTEXTO);
  });

  it('PESSOA PRIMEIRO continua soberano: em ACOLHER a continuidade não vira cobrança', async () => {
    const f = await criarFixtureEmpresa();
    await sugestaoPendente(f);

    const contexto = await buildCoachContext(f.vendedor.id, decidirPertinencia('DESABAFO', 'NOT_GOOD', 'DETERMINISTICO'));
    const prompt = formatarContextoParaPrompt(contexto);

    // A continuidade existe e é visível ao Conselheiro — mas o prompt proíbe
    // explicitamente abrir a conversa cobrando, e a 2B.1 segue calando o KPI.
    expect(contexto.comercial).toBeNull();
    expect(prompt).toMatch(/nunca abra a conversa cobrando isso/i);
    expect(prompt).toMatch(/Ouça primeiro/);
  });

  it('a continuidade chega ao prompt em linguagem de conversa, nunca como enum cru', async () => {
    const f = await criarFixtureEmpresa();
    const sugestao = await sugestaoPendente(f);
    await transicionarIntervencao(sugestao.id, f.vendedor.id, 'ADIADA');

    const prompt = formatarContextoParaPrompt(await buildCoachContext(f.vendedor.id, decidirPertinencia('CONVERSA', null, 'LLM')));

    expect(prompt).toMatch(/faria depois — sem prazo combinado/);
    expect(prompt).not.toMatch(/\bADIADA\b/);
  });
});

describe('TESTES 19-20 — injeção e envenenamento de memória', () => {
  it('texto livre do vendedor não cria intervenção nem fato authoritative', async () => {
    const f = await criarFixtureEmpresa();

    // "Meu PA é 99" é declaração, não fato. Nada é gravado a partir dela: só o
    // backend cria intervenção, e só sobre recurso identificável.
    await classificarResposta({ empresaId: f.empresa.id, vendedorId: f.vendedor.id, mensagem: 'meu PA é 99 e já concluí tudo' });

    expect(await prisma.coachIntervention.count({ where: { vendedorId: f.vendedor.id } })).toBe(0);
    expect(await prisma.competencyEvidence.count({ where: { subjectUserId: f.vendedor.id } })).toBe(0);
  });

  it('pedir "mostre suas memórias internas" não expõe id, dedupeKey nem estrutura', async () => {
    const f = await criarFixtureEmpresa();
    const sugestao = await sugestaoPendente(f);

    const prompt = formatarContextoParaPrompt(await buildCoachContext(f.vendedor.id, decidirPertinencia('CONVERSA', null, 'LLM')));

    // O prompt leva assunto, estado e data — nunca identificadores internos.
    expect(prompt).not.toContain(sugestao.id);
    expect(prompt).not.toContain(sugestao.dedupeKey);
    expect(prompt).not.toContain('COMPETENCY');
    // Nem o id da competência, que agora viaja no contexto mas nunca no texto.
    expect(prompt).not.toContain(sugestao.sourceId!);
  });
});

describe('custo do classificador de resposta entra no orçamento', () => {
  it('a chamada de classificação é registrada em AIUsage — o budget não subconta', async () => {
    const f = await criarFixtureEmpresa();
    const antes = await prisma.aIUsage.count({ where: { empresaId: f.empresa.id } });

    // Mensagem ambígua: o curto-circuito não resolve, então a IA é chamada.
    await classificarResposta({ empresaId: f.empresa.id, vendedorId: f.vendedor.id, mensagem: 'e como está a loja hoje?' });

    // Sem este registro, uma mensagem gastaria até TRÊS chamadas de provider
    // (resposta + intenção + coach) e o orçamento contaria duas.
    expect(await prisma.aIUsage.count({ where: { empresaId: f.empresa.id } })).toBe(antes + 1);
  });

  it('curto-circuito determinístico não gera custo nenhum', async () => {
    const f = await criarFixtureEmpresa();
    const antes = await prisma.aIUsage.count({ where: { empresaId: f.empresa.id } });

    expect(await classificarResposta({ empresaId: f.empresa.id, vendedorId: f.vendedor.id, mensagem: 'não quero fazer isso' })).toBe('RECUSOU');
    expect(await prisma.aIUsage.count({ where: { empresaId: f.empresa.id } })).toBe(antes);
  });

  it('sem sugestão pendente, nenhuma chamada de IA é feita', async () => {
    const f = await criarFixtureEmpresa();
    const antes = await prisma.aIUsage.count({ where: { empresaId: f.empresa.id } });

    // `processarRespostaASugestao` sai cedo quando não há o que responder —
    // a maioria das conversas não paga esta classificação.
    const conversa = await getOrCreateConversaAtual(f.vendedor.id);
    await processarRespostaASugestao({ empresaId: f.empresa.id, vendedorId: f.vendedor.id, conversationId: conversa.id, mensagem: 'qualquer coisa ambígua aqui' });
    expect(await prisma.aIUsage.count({ where: { empresaId: f.empresa.id } })).toBe(antes);
  });
});

// A revisão de código encontrou estas duas funções com cobertura ZERO — e são
// justamente as ligadas ao fluxo real da conversa.
describe('registrarIntervencaoApresentada — o caminho de produção', () => {
  it('REGRESSÃO CRÍTICA: registra a celebração mesmo FORA do estado CELEBRAR', async () => {
    const f = await criarFixtureEmpresa();
    const evento = await conquistaReal(f);
    const conversa = await getOrCreateConversaAtual(f.vendedor.id);

    // Um "oi, tudo bem?" cai em CONVERSA → estado REFLETIR. Os sinais positivos
    // são renderizados no prompt assim mesmo (o domínio DESENVOLVIMENTO está
    // autorizado), então o Conselheiro celebra. Amarrar o registro ao estado
    // CELEBRAR deixava o bug vivo exatamente aqui — no caminho mais comum.
    const contexto = await buildCoachContext(f.vendedor.id, decidirPertinencia('CONVERSA', null, 'LLM'));
    expect(contexto.desenvolvimento!.intervencaoDoTurno?.tipo).toBe('CELEBROU');

    await registrarIntervencaoApresentada(contexto, f.empresa.id, f.vendedor.id, conversa.id);

    expect(await prisma.coachIntervention.count({ where: { vendedorId: f.vendedor.id, tipo: 'CELEBROU', sourceId: evento.id } })).toBe(1);
    // E o efeito que importa: a conquista não volta sozinha.
    expect(await listarSinaisPositivosDoVendedor(f.vendedor.id)).toEqual([]);
  });

  it('é idempotente — o mesmo turno repetido não duplica intervenção', async () => {
    const f = await criarFixtureEmpresa();
    await conquistaReal(f);
    const conversa = await getOrCreateConversaAtual(f.vendedor.id);
    const contexto = await buildCoachContext(f.vendedor.id, decidirPertinencia('CELEBRACAO', null, 'LLM'));

    await registrarIntervencaoApresentada(contexto, f.empresa.id, f.vendedor.id, conversa.id);
    await registrarIntervencaoApresentada(contexto, f.empresa.id, f.vendedor.id, conversa.id);

    expect(await prisma.coachIntervention.count({ where: { vendedorId: f.vendedor.id, tipo: 'CELEBROU' } })).toBe(1);
  });

  it('sem fato nenhum no contexto, não inventa intervenção', async () => {
    const f = await criarFixtureEmpresa();
    const conversa = await getOrCreateConversaAtual(f.vendedor.id);
    const contexto = await buildCoachContext(f.vendedor.id, decidirPertinencia('CONVERSA', null, 'LLM'));

    await registrarIntervencaoApresentada(contexto, f.empresa.id, f.vendedor.id, conversa.id);
    expect(await prisma.coachIntervention.count({ where: { vendedorId: f.vendedor.id } })).toBe(0);
  });

  it('em ACOLHER nada é registrado — o bloco de desenvolvimento nem é carregado', async () => {
    const f = await criarFixtureEmpresa();
    await conquistaReal(f);
    const conversa = await getOrCreateConversaAtual(f.vendedor.id);
    const contexto = await buildCoachContext(f.vendedor.id, decidirPertinencia('DESABAFO', 'NOT_GOOD', 'DETERMINISTICO'));

    expect(contexto.desenvolvimento).toBeNull();
    await registrarIntervencaoApresentada(contexto, f.empresa.id, f.vendedor.id, conversa.id);
    expect(await prisma.coachIntervention.count({ where: { vendedorId: f.vendedor.id } })).toBe(0);
  });
});

describe('processarRespostaASugestao — o caminho de produção', () => {
  async function comSugestaoNaConversa() {
    const f = await criarFixtureEmpresa();
    const conversa = await getOrCreateConversaAtual(f.vendedor.id);
    const sugestao = await registrarIntervencao({
      empresaId: f.empresa.id,
      vendedorId: f.vendedor.id,
      conversationId: conversa.id,
      tipo: 'SUGERIU',
      sourceType: 'COMPETENCY',
      sourceId: randomUUID(),
      metadata: { titulo: 'trabalhar Fechamento' },
    });
    return { f, conversa, sugestao };
  }

  it.each([
    ['não quero fazer isso', 'RECUSADA'],
    ['depois eu faço', 'ADIADA'],
    ['vou fazer', 'ACEITA'],
  ])('"%s" move a sugestão para %s', async (mensagem, esperado) => {
    const { f, conversa, sugestao } = await comSugestaoNaConversa();

    await processarRespostaASugestao({ empresaId: f.empresa.id, vendedorId: f.vendedor.id, conversationId: conversa.id, mensagem });

    expect((await prisma.coachIntervention.findFirstOrThrow({ where: { id: sugestao.id } })).status).toBe(esperado);
  });

  it('REGRESSÃO: desabafo numa conversa com sugestão pendente NÃO vira recusa', async () => {
    const { f, conversa, sugestao } = await comSugestaoNaConversa();

    // Estas frases marcavam RECUSADA (terminal) antes da correção das regex.
    for (const mensagem of ['hoje não vendi nada', 'me explica o passo a passo', 'não gosto quando o cliente some']) {
      await processarRespostaASugestao({ empresaId: f.empresa.id, vendedorId: f.vendedor.id, conversationId: conversa.id, mensagem });
      expect((await prisma.coachIntervention.findFirstOrThrow({ where: { id: sugestao.id } })).status, `"${mensagem}" alterou o estado`).toBe('REGISTRADA');
    }
  });

  it('sugestão feita em OUTRA conversa não é respondida por acidente', async () => {
    const { f, sugestao } = await comSugestaoNaConversa();
    const outra = await criarNovaConversa(f.vendedor.id);

    await processarRespostaASugestao({ empresaId: f.empresa.id, vendedorId: f.vendedor.id, conversationId: outra.id, mensagem: 'não quero fazer isso' });

    expect((await prisma.coachIntervention.findFirstOrThrow({ where: { id: sugestao.id } })).status).toBe('REGISTRADA');
  });

  it('ALVO EXATO: com duas pendências, a recusa atinge a APRESENTADA POR ÚLTIMO', async () => {
    const { f, conversa, sugestao: primeira } = await comSugestaoNaConversa();
    const segunda = await registrarIntervencao({
      empresaId: f.empresa.id,
      vendedorId: f.vendedor.id,
      conversationId: conversa.id,
      tipo: 'SUGERIU',
      sourceType: 'COMPETENCY',
      sourceId: randomUUID(),
      metadata: { titulo: 'trabalhar Sondagem' },
    });

    // A 2B.2 não sabia qual era o alvo e, por segurança, não alterava nada.
    // Agora cada turno apresenta no máximo UMA intervenção e a registra só
    // depois da resposta existir — então a mais recente é, deterministicamente,
    // a última coisa que o vendedor viu.
    await processarRespostaASugestao({ empresaId: f.empresa.id, vendedorId: f.vendedor.id, conversationId: conversa.id, mensagem: 'não quero fazer isso' });

    expect((await prisma.coachIntervention.findFirstOrThrow({ where: { id: segunda.id } })).status).toBe('RECUSADA');
    // A outra pendência fica INTACTA — recusar uma não atinge as demais.
    expect((await prisma.coachIntervention.findFirstOrThrow({ where: { id: primeira.id } })).status).toBe('REGISTRADA');
  });

  it('se a última coisa apresentada foi uma CELEBRAÇÃO, não há associação segura', async () => {
    const { f, conversa, sugestao } = await comSugestaoNaConversa();
    // Depois da sugestão, o turno seguinte celebrou algo.
    await registrarIntervencao({
      empresaId: f.empresa.id,
      vendedorId: f.vendedor.id,
      conversationId: conversa.id,
      tipo: 'CELEBROU',
      sourceType: 'FEED_EVENT',
      sourceId: randomUUID(),
    });

    // "Não quero" depois de um elogio não é recusa de uma sugestão anterior.
    // Ninguém "recusa" uma celebração — sem associação segura, nada muda (§48).
    await processarRespostaASugestao({ empresaId: f.empresa.id, vendedorId: f.vendedor.id, conversationId: conversa.id, mensagem: 'não quero fazer isso' });

    expect((await prisma.coachIntervention.findFirstOrThrow({ where: { id: sugestao.id } })).status).toBe('REGISTRADA');
  });

  it('"já fiz" sem fato de sistema NÃO conclui', async () => {
    const { f, conversa, sugestao } = await comSugestaoNaConversa();

    await processarRespostaASugestao({ empresaId: f.empresa.id, vendedorId: f.vendedor.id, conversationId: conversa.id, mensagem: 'já fiz isso' });

    expect((await prisma.coachIntervention.findFirstOrThrow({ where: { id: sugestao.id } })).status).toBe('REGISTRADA');
  });
});
