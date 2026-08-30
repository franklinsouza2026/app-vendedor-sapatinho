import { describe, expect, it } from 'vitest';
import { getAulaDetalhada, iniciarAula, concluirAula, AcademyError } from './lesson.service';
import { criarTrilhaTeste, criarAulaTeste, criarAulaComQuizTeste } from './test-helpers';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { prisma } from '../db';

describe('getAulaDetalhada', () => {
  it('retorna a aula com status NOT_STARTED quando o vendedor nunca iniciou', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const trilha = await criarTrilhaTeste();
    const aula = await criarAulaTeste(trilha.id);

    const detalhe = await getAulaDetalhada(aula.id, vendedor.id);

    expect(detalhe.status).toBe('NOT_STARTED');
    expect(detalhe.hasQuiz).toBe(false);
    expect(detalhe.origem).toBe('DEMONSTRATIVO');
  });

  it('lança not_found pra aula inexistente ou inativa', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const trilha = await criarTrilhaTeste();
    const aula = await criarAulaTeste(trilha.id, { active: false });

    await expect(getAulaDetalhada(aula.id, vendedor.id)).rejects.toMatchObject({ type: 'not_found' } satisfies Partial<AcademyError>);
    await expect(getAulaDetalhada('00000000-0000-0000-0000-000000000000', vendedor.id)).rejects.toMatchObject({
      type: 'not_found',
    } satisfies Partial<AcademyError>);
  });

  it('traz a seção do playbook relacionada quando a aula aponta pra uma categoria', async () => {
    const { vendedor, empresa } = await criarFixtureEmpresa();
    const { criarPlaybookDraft, publicarPlaybook } = await import('../treinador/playbook.service');
    const draft = await criarPlaybookDraft(empresa.id, 'Playbook Teste', [
      { categoria: 'ABORDAGEM', titulo: 'Mandamento de recepção', conteudo: 'Receba com sorriso.', origem: 'OFICIAL' },
    ]);
    await publicarPlaybook(draft.id, empresa.id, 'tester');
    const trilha = await criarTrilhaTeste();
    const aula = await criarAulaTeste(trilha.id, { playbookCategoria: 'ABORDAGEM' });

    const detalhe = await getAulaDetalhada(aula.id, vendedor.id);
    expect(detalhe.playbookRelacionado.some((s) => s.title === 'Mandamento de recepção')).toBe(true);
  });
});

describe('iniciarAula', () => {
  it('marca IN_PROGRESS e é idempotente ao reabrir', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const trilha = await criarTrilhaTeste();
    const aula = await criarAulaTeste(trilha.id);

    await iniciarAula(aula.id, vendedor.id);
    await iniciarAula(aula.id, vendedor.id);

    const progresso = await prisma.academyProgress.findMany({ where: { vendedorId: vendedor.id, lessonId: aula.id } });
    expect(progresso).toHaveLength(1);
    expect(progresso[0].status).toBe('IN_PROGRESS');
  });
});

describe('concluirAula', () => {
  it('conclui aula sem quiz e concede a recompensa exatamente uma vez', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const trilha = await criarTrilhaTeste();
    const aula = await criarAulaTeste(trilha.id);

    await concluirAula(aula.id, vendedor.id);
    await concluirAula(aula.id, vendedor.id); // segunda chamada — idempotente, nunca duplica

    const progresso = await prisma.academyProgress.findUniqueOrThrow({ where: { vendedorId_lessonId: { vendedorId: vendedor.id, lessonId: aula.id } } });
    expect(progresso.status).toBe('COMPLETED');

    const idempotencyKey = `academia-aula-${vendedor.id}-${aula.id}`;
    const xpTransacoes = await prisma.xpTransacao.findMany({ where: { idempotencyKey } });
    expect(xpTransacoes).toHaveLength(1);
    expect(xpTransacoes[0].quantidade).toBe(20);
  });

  it('rejeita concluirAula diretamente quando a aula tem quiz (quiz_obrigatorio)', async () => {
    const { vendedor } = await criarFixtureEmpresa();
    const trilha = await criarTrilhaTeste();
    const { aula } = await criarAulaComQuizTeste(trilha.id);

    await expect(concluirAula(aula.id, vendedor.id)).rejects.toMatchObject({ type: 'quiz_obrigatorio' } satisfies Partial<AcademyError>);
    const progresso = await prisma.academyProgress.findMany({ where: { vendedorId: vendedor.id, lessonId: aula.id } });
    expect(progresso).toHaveLength(0);
  });
});

describe('isolamento entre vendedores (progresso nunca vaza)', () => {
  it('progresso de um vendedor não aparece pra outro', async () => {
    const { vendedor: vendedorA } = await criarFixtureEmpresa();
    const { vendedor: vendedorB } = await criarFixtureEmpresa();
    const trilha = await criarTrilhaTeste();
    const aula = await criarAulaTeste(trilha.id);

    await concluirAula(aula.id, vendedorA.id);

    const detalheParaB = await getAulaDetalhada(aula.id, vendedorB.id);
    expect(detalheParaB.status).toBe('NOT_STARTED');
  });
});
