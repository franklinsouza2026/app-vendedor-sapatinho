// Quiz dinâmico (Fatia 7.5C, seção 30-34/81) — banco SINTÉTICO de 15
// questões de teste, quiz pede 5 por tentativa. Nunca usa conteúdo real.
import { describe, expect, it } from 'vitest';
import { prisma } from '../db';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { criarTrilhaTeste, criarAulaTeste } from './test-helpers';
import { getQuizParaResponder, responderQuiz } from './quiz.service';

async function criarQuizComBanco(quantidadeQuestoes: number, questionsPerAttempt: number | null) {
  const trilha = await criarTrilhaTeste();
  const aula = await criarAulaTeste(trilha.id);
  const quiz = await prisma.academyQuiz.create({ data: { lessonId: aula.id, passingScore: 70, questionsPerAttempt } });

  for (let i = 0; i < quantidadeQuestoes; i++) {
    await prisma.academyQuestion.create({
      data: {
        quizId: quiz.id,
        question: `Questão sintética de teste #${i}?`,
        sortOrder: i,
        opcoes: { create: [{ text: 'Certa', correct: true, sortOrder: 0 }, { text: 'Errada', correct: false, sortOrder: 1 }] },
      },
    });
  }

  return { aula, quiz };
}

describe('Quiz dinâmico — banco maior que a tentativa', () => {
  it('banco de 15, quiz pede 5 — sempre mostra exatamente 5, todas pertencentes ao banco', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const { aula, quiz } = await criarQuizComBanco(15, 5);

    const resultado = await getQuizParaResponder(aula.id, vendedor.id);
    expect(resultado.perguntas).toHaveLength(5);

    const idsDoBanco = new Set((await prisma.academyQuestion.findMany({ where: { quizId: quiz.id } })).map((q) => q.id));
    for (const p of resultado.perguntas) {
      expect(idsDoBanco.has(p.id)).toBe(true);
    }
  });

  it('nunca expõe o gabarito nas perguntas sorteadas', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const { aula } = await criarQuizComBanco(15, 5);

    const resultado = await getQuizParaResponder(aula.id, vendedor.id);
    for (const p of resultado.perguntas) {
      for (const o of p.opcoes) {
        expect(o).not.toHaveProperty('correct');
      }
    }
  });

  it('a tentativa seguinte tenta evitar repetir exatamente o mesmo conjunto de 5', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const { aula } = await criarQuizComBanco(15, 5);

    const primeira = await getQuizParaResponder(aula.id, vendedor.id);
    const segunda = await getQuizParaResponder(aula.id, vendedor.id);

    const idsIguais = (a: string[], b: string[]) => [...a].sort().join() === [...b].sort().join();
    // Com 15 escolhe 5, a chance de duas tentativas realmente precisarem
    // colidir E o retry também colidir é desprezível — se acontecer, o teste
    // falha de forma óbvia (flaky de propósito zero: só valida que o
    // mecanismo de reshuffle existe, não que NUNCA pode repetir).
    expect(idsIguais(primeira.perguntas.map((p) => p.id), segunda.perguntas.map((p) => p.id))).toBe(false);
  });

  it('banco pequeno (<=N) sempre usa TODAS as questões — fallback documentado, nunca falha', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const { aula } = await criarQuizComBanco(3, 5); // banco menor que o blueprint pede

    const resultado = await getQuizParaResponder(aula.id, vendedor.id);
    expect(resultado.perguntas).toHaveLength(3);
  });

  it('sem blueprint configurado (questionsPerAttempt null), comportamento é o legado: mostra TODAS as perguntas', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const { aula } = await criarQuizComBanco(15, null);

    const resultado = await getQuizParaResponder(aula.id, vendedor.id);
    expect(resultado.perguntas).toHaveLength(15);
  });
});

describe('Quiz dinâmico — anti-fraude (seção 40)', () => {
  it('responder com um conjunto de perguntas DIFERENTE do sorteado é rejeitado', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const { aula, quiz } = await criarQuizComBanco(15, 5);

    await getQuizParaResponder(aula.id, vendedor.id); // sorteia e persiste 5 ids
    const todasAsQuestoes = await prisma.academyQuestion.findMany({ where: { quizId: quiz.id }, include: { opcoes: true } });

    // tenta responder TODAS as 15 (nunca as 5 apresentadas)
    const respostasForjadas = todasAsQuestoes.map((q) => ({ questionId: q.id, optionId: q.opcoes[0].id }));

    await expect(responderQuiz(aula.id, vendedor.id, respostasForjadas)).rejects.toMatchObject({ type: 'quiz_obrigatorio' });
  });

  it('responder exatamente o conjunto apresentado, todas certas, aprova com score 100', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const { aula } = await criarQuizComBanco(15, 5);

    const apresentado = await getQuizParaResponder(aula.id, vendedor.id);
    const questoesComGabarito = await prisma.academyQuestion.findMany({
      where: { id: { in: apresentado.perguntas.map((p) => p.id) } },
      include: { opcoes: true },
    });

    const respostas = questoesComGabarito.map((q) => ({ questionId: q.id, optionId: q.opcoes.find((o) => o.correct)!.id }));
    const resultado = await responderQuiz(aula.id, vendedor.id, respostas);

    expect(resultado.score).toBe(100);
    expect(resultado.passed).toBe(true);
  });

  it('questão arquivada (active=false) não entra no sorteio', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const { aula, quiz } = await criarQuizComBanco(15, 5);

    const questoes = await prisma.academyQuestion.findMany({ where: { quizId: quiz.id } });
    // arquiva 10 das 15, sobrando só 5 ativas — exatamente o blueprint
    for (const q of questoes.slice(0, 10)) {
      await prisma.academyQuestion.update({ where: { id: q.id }, data: { active: false } });
    }

    const resultado = await getQuizParaResponder(aula.id, vendedor.id);
    const idsAtivos = new Set(questoes.slice(10).map((q) => q.id));
    expect(resultado.perguntas).toHaveLength(5);
    for (const p of resultado.perguntas) {
      expect(idsAtivos.has(p.id)).toBe(true);
    }
  });
});
