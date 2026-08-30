import { describe, expect, it } from 'vitest';
import { getQuizParaResponder, responderQuiz } from './quiz.service';
import { AcademyError } from './lesson.service';
import { criarTrilhaTeste, criarAulaTeste, criarAulaComQuizTeste } from './test-helpers';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { prisma } from '../db';

describe('getQuizParaResponder', () => {
  it('nunca expõe o campo correct das opções', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const trilha = await criarTrilhaTeste();
    const { aula } = await criarAulaComQuizTeste(trilha.id);

    const quiz = await getQuizParaResponder(aula.id, vendedor.id);

    expect(quiz.perguntas).toHaveLength(1);
    for (const pergunta of quiz.perguntas) {
      for (const opcao of pergunta.opcoes) {
        expect(opcao).not.toHaveProperty('correct');
      }
    }
  });

  it('lança not_found quando a aula não tem quiz', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const trilha = await criarTrilhaTeste();
    const aula = await criarAulaTeste(trilha.id);
    await expect(getQuizParaResponder(aula.id, vendedor.id)).rejects.toMatchObject({ type: 'not_found' } satisfies Partial<AcademyError>);
  });
});

describe('responderQuiz — gabarito e score sempre calculados no backend', () => {
  it('calcula score 100 e aprova quando todas as respostas batem com o gabarito real do banco', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const trilha = await criarTrilhaTeste();
    const { aula, pergunta, opcaoCerta } = await criarAulaComQuizTeste(trilha.id, { passingScore: 70 });

    const resultado = await responderQuiz(aula.id, vendedor.id, [{ questionId: pergunta.id, optionId: opcaoCerta.id }]);

    expect(resultado.score).toBe(100);
    expect(resultado.passed).toBe(true);
  });

  it('ignora um optionId "correct" forjado pelo cliente — só o que está de fato marcado correct no banco conta', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const trilha = await criarTrilhaTeste();
    const { aula, pergunta, opcaoErrada } = await criarAulaComQuizTeste(trilha.id, { passingScore: 70 });

    // Vendedor escolhe a opção real errada, mas o resultado nunca deve
    // confiar em nada além do que veio do banco pra decidir se é `correct`.
    const resultado = await responderQuiz(aula.id, vendedor.id, [{ questionId: pergunta.id, optionId: opcaoErrada.id }]);

    expect(resultado.score).toBe(0);
    expect(resultado.passed).toBe(false);
  });

  it('optionId inexistente/de outra pergunta nunca conta como acerto', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const trilha = await criarTrilhaTeste();
    const { aula, pergunta } = await criarAulaComQuizTeste(trilha.id, { passingScore: 70 });

    const resultado = await responderQuiz(aula.id, vendedor.id, [{ questionId: pergunta.id, optionId: '00000000-0000-0000-0000-000000000000' }]);

    expect(resultado.score).toBe(0);
    expect(resultado.passed).toBe(false);
  });

  it('rejeita quando o número de respostas não bate com o número de perguntas', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const trilha = await criarTrilhaTeste();
    const { aula } = await criarAulaComQuizTeste(trilha.id);

    await expect(responderQuiz(aula.id, vendedor.id, [])).rejects.toMatchObject({ type: 'quiz_obrigatorio' } satisfies Partial<AcademyError>);
  });

  it('ao aprovar, concede QUIZ_APROVADO e TREINAMENTO_CONCLUIDO uma única vez cada, mesmo respondendo de novo', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const trilha = await criarTrilhaTeste();
    const { aula, pergunta, opcaoCerta } = await criarAulaComQuizTeste(trilha.id, { passingScore: 70 });

    await responderQuiz(aula.id, vendedor.id, [{ questionId: pergunta.id, optionId: opcaoCerta.id }]);
    await responderQuiz(aula.id, vendedor.id, [{ questionId: pergunta.id, optionId: opcaoCerta.id }]);

    const xpQuiz = await prisma.xpTransacao.findMany({ where: { idempotencyKey: `academia-quiz-${vendedor.id}-${aula.id}` } });
    const xpAula = await prisma.xpTransacao.findMany({ where: { idempotencyKey: `academia-aula-${vendedor.id}-${aula.id}` } });
    expect(xpQuiz).toHaveLength(1);
    expect(xpAula).toHaveLength(1);
    expect(xpQuiz[0].quantidade).toBe(20);
    expect(xpAula[0].quantidade).toBe(20);

    const progresso = await prisma.academyProgress.findUniqueOrThrow({ where: { vendedorId_lessonId: { vendedorId: vendedor.id, lessonId: aula.id } } });
    expect(progresso.status).toBe('COMPLETED');
    expect(progresso.quizPassed).toBe(true);
  });

  it('não concede nenhuma recompensa quando reprova', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const trilha = await criarTrilhaTeste();
    const { aula, pergunta, opcaoErrada } = await criarAulaComQuizTeste(trilha.id, { passingScore: 70 });

    await responderQuiz(aula.id, vendedor.id, [{ questionId: pergunta.id, optionId: opcaoErrada.id }]);

    const xp = await prisma.xpTransacao.findMany({ where: { idempotencyKey: `academia-quiz-${vendedor.id}-${aula.id}` } });
    expect(xp).toHaveLength(0);
    const progresso = await prisma.academyProgress.findUniqueOrThrow({ where: { vendedorId_lessonId: { vendedorId: vendedor.id, lessonId: aula.id } } });
    expect(progresso.status).toBe('IN_PROGRESS');
  });

  it('reprovar e depois passar concede a recompensa (só na aprovação, exatamente uma vez)', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const trilha = await criarTrilhaTeste();
    const { aula, pergunta, opcaoCerta, opcaoErrada } = await criarAulaComQuizTeste(trilha.id, { passingScore: 70 });

    await responderQuiz(aula.id, vendedor.id, [{ questionId: pergunta.id, optionId: opcaoErrada.id }]);
    const segunda = await responderQuiz(aula.id, vendedor.id, [{ questionId: pergunta.id, optionId: opcaoCerta.id }]);

    expect(segunda.passed).toBe(true);
    const xp = await prisma.xpTransacao.findMany({ where: { idempotencyKey: `academia-quiz-${vendedor.id}-${aula.id}` } });
    expect(xp).toHaveLength(1);
  });
});
