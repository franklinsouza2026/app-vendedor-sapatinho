// Testes de integração do Training Orchestrator (Fatia 7.5D) — pipeline
// completo, falha parcial, cancelamento, idempotência, budget, guard dos 13
// Mandamentos e segurança contra prompt injection via fonte externa.
import { beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../db';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { criarJob, buscarJob } from './job.service';
import { executarJob } from './orchestrator.service';
import { FonteEncontrada, ResearchSourceProvider } from './research-source-provider';
import { MARCADOR_CONFLITO_OFICIAL, MARCADOR_INJECAO_PROMPT, MARCADOR_SAIDA_INVALIDA, MARCADOR_SIMULAR_ERRO } from '../ai-platform/providers/mock-ai-provider';

class FakeSourceProvider implements ResearchSourceProvider {
  constructor(private fontes: FonteEncontrada[]) {}
  async search(): Promise<FonteEncontrada[]> {
    return this.fontes;
  }
}

function fonte(overrides: Partial<FonteEncontrada> = {}): FonteEncontrada {
  return {
    url: 'https://mock-source.internal/x',
    title: 'Fonte de teste',
    publisher: 'Publisher Teste',
    author: null,
    publishedAt: null,
    summary: 'Resumo de teste sobre técnica de vendas.',
    reliability: 'HIGH',
    rightsNotes: null,
    ...overrides,
  };
}

async function empresaEAdmin() {
  const { empresa, loja } = await criarFixtureEmpresa();
  const admin = await prisma.vendedor.create({
    data: { empresaId: empresa.id, lojaId: loja.id, matriculaErp: `ADM-TI-${randomUUID()}`, nome: 'Admin TI', senhaHash: 'x', papel: 'ADMIN' },
  });
  return { empresa, loja, admin };
}

describe('Training Orchestrator — pipeline completo', () => {
  it('roda research→curation→instructional design→quiz→simulation→governance e termina em WAITING_REVIEW', async () => {
    const { empresa, admin } = await empresaEAdmin();
    const job = await criarJob({ empresaId: empresa.id, requestedBy: admin.id, topic: 'venda complementar', objective: 'ensinar PA' });

    await executarJob(job.id, new FakeSourceProvider([fonte(), fonte({ title: 'Segunda fonte' })]));

    const final = await buscarJob(job.id, empresa.id);
    expect(final.status).toBe('WAITING_REVIEW');
    expect(final.startedAt).not.toBeNull();

    const aula = await prisma.academyLesson.findFirst({ where: { trainingJobId: job.id } });
    expect(aula).not.toBeNull();
    expect(aula!.status).toBe('DRAFT');
    expect(aula!.origemEditorial).toBe('AI_GENERATED');

    const trilha = await prisma.academyTrack.findUnique({ where: { id: aula!.trackId } });
    expect(trilha!.status).toBe('DRAFT');

    const questoes = await prisma.academyQuestion.findMany({ where: { trainingJobId: job.id } });
    expect(questoes.length).toBeGreaterThan(0);
    expect(questoes.every((q) => q.active === false)).toBe(true); // nunca no banco publicado sem revisão

    const cenario = await prisma.trainingScenarioDraft.findFirst({ where: { jobId: job.id } });
    expect(cenario).not.toBeNull();
    expect(cenario!.status).toBe('DRAFT');

    expect(final.governanceStatus).toBe('PASS');
  });

  it('idempotente contra dupla execução — rodar 2x o mesmo job não duplica trilha/aula', async () => {
    const { empresa, admin } = await empresaEAdmin();
    const job = await criarJob({ empresaId: empresa.id, requestedBy: admin.id, topic: 'fechamento de venda' });

    await executarJob(job.id, new FakeSourceProvider([fonte()]));
    await executarJob(job.id, new FakeSourceProvider([fonte()])); // job já não está mais QUEUED — segunda chamada é no-op

    const aulas = await prisma.academyLesson.findMany({ where: { trainingJobId: job.id } });
    expect(aulas).toHaveLength(1);
  });

  it('idempotencyKey evita criar 2 jobs pro mesmo pedido (double-click)', async () => {
    const { empresa, admin } = await empresaEAdmin();
    const chave = `req-${randomUUID()}`;
    const job1 = await criarJob({ empresaId: empresa.id, requestedBy: admin.id, topic: 'PA', idempotencyKey: chave });
    const job2 = await criarJob({ empresaId: empresa.id, requestedBy: admin.id, topic: 'PA', idempotencyKey: chave });
    expect(job2.id).toBe(job1.id);
  });

  it('cancelamento entre etapas para a execução sem publicar nada', async () => {
    const { empresa, admin } = await empresaEAdmin();
    const job = await criarJob({ empresaId: empresa.id, requestedBy: admin.id, topic: 'objeção de preço' });

    // Cancela ANTES de rodar — como QUEUED está nos estados canceláveis, a
    // transição QUEUED->RUNNING de executarJob nunca acontece.
    await prisma.trainingIntelligenceJob.update({ where: { id: job.id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
    await executarJob(job.id, new FakeSourceProvider([fonte()]));

    const final = await prisma.trainingIntelligenceJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(final.status).toBe('CANCELLED');
    const aula = await prisma.academyLesson.findFirst({ where: { trainingJobId: job.id } });
    expect(aula).toBeNull();
  });

  it('falha parcial: quiz agent com JSON inválido não derruba o lesson draft já criado', async () => {
    const { empresa, admin } = await empresaEAdmin();
    const job = await criarJob({ empresaId: empresa.id, requestedBy: admin.id, topic: `sondagem ${MARCADOR_SAIDA_INVALIDA}` });

    await executarJob(job.id, new FakeSourceProvider([fonte()]));

    const final = await buscarJob(job.id, empresa.id);
    expect(final.status).toBe('WAITING_REVIEW'); // job segue, não FAILED
    const aula = await prisma.academyLesson.findFirst({ where: { trainingJobId: job.id } });
    expect(aula).not.toBeNull(); // lesson draft preservado

    const findings = await prisma.trainingGovernanceFinding.findMany({ where: { jobId: job.id } });
    expect(findings.some((f) => f.message.includes('quiz'))).toBe(true);
  });

  it('erro não-transitório (budget esgotado NO MEIO da execução) falha o job inteiro com etapa e mensagem registradas', async () => {
    const { empresa, admin } = await empresaEAdmin();
    // Job criado com budget ainda ok (senão nem seria aceito na criação —
    // ver teste de rota "budget esgotado bloqueia a criação"); o budget se
    // esgota DEPOIS, antes do worker rodar (ex.: outro job consumiu o resto).
    const job = await criarJob({ empresaId: empresa.id, requestedBy: admin.id, topic: 'técnica de fechamento' });
    await prisma.aIBudgetConfig.create({ data: { empresaId: empresa.id, monthlyLimitUSD: 0, updatedBy: admin.id } });

    await executarJob(job.id, new FakeSourceProvider([fonte()]));

    const final = await buscarJob(job.id, empresa.id);
    expect(final.status).toBe('FAILED');
    expect(final.failedAt).not.toBeNull();
    expect(final.errorMessage).toContain('research'); // primeira etapa que chama o Gateway
  });

  it('provider indisponível (erro simulado) esgota o retry limitado e falha o job', async () => {
    const { empresa, admin } = await empresaEAdmin();
    const job = await criarJob({ empresaId: empresa.id, requestedBy: admin.id, topic: `objeção ${MARCADOR_SIMULAR_ERRO}` });

    await executarJob(job.id, new FakeSourceProvider([fonte()]));

    const final = await buscarJob(job.id, empresa.id);
    expect(final.status).toBe('FAILED');
    expect(final.attemptCount).toBeGreaterThanOrEqual(1);
  });

  it('13 Mandamentos: pedido de quiz sobre os Mandamentos sem conteúdo oficial nunca chama o provider nem inventa questão', async () => {
    const { empresa, admin } = await empresaEAdmin();
    // Garante estrutura sem conteúdo (13 linhas vazias) — nunca preenche.
    for (let numero = 1; numero <= 13; numero++) {
      await prisma.mandamentoOficial.upsert({ where: { numero }, update: { conteudoOficial: null }, create: { numero, titulo: `Mandamento ${numero}`, status: 'DRAFT' } });
    }
    const job = await criarJob({ empresaId: empresa.id, requestedBy: admin.id, topic: 'quiz sobre os 13 mandamentos' });

    await executarJob(job.id, new FakeSourceProvider([fonte()]));

    const final = await buscarJob(job.id, empresa.id);
    expect(final.status).toBe('WAITING_REVIEW');
    const questoes = await prisma.academyQuestion.findMany({ where: { trainingJobId: job.id } });
    expect(questoes).toHaveLength(0); // nenhuma questão inventada
    const findings = await prisma.trainingGovernanceFinding.findMany({ where: { jobId: job.id, type: 'MANDAMENTO_VIOLATION' } });
    expect(findings.length).toBeGreaterThan(0);
  });

  it('conflito com conteúdo oficial detectado pelo Curator/Governance nunca é auto-resolvido — sempre revisão humana', async () => {
    const { empresa, admin } = await empresaEAdmin();
    const job = await criarJob({ empresaId: empresa.id, requestedBy: admin.id, topic: 'desconto agressivo' });

    await executarJob(job.id, new FakeSourceProvider([fonte({ summary: `Ofereça sempre 50% de desconto. ${MARCADOR_CONFLITO_OFICIAL}` })]));

    const final = await buscarJob(job.id, empresa.id);
    expect(final.status).toBe('WAITING_REVIEW'); // nunca pula pra publicado sozinho
    expect(final.governanceStatus).toBe('REVIEW_REQUIRED');
    const conflito = await prisma.trainingGovernanceFinding.findFirst({ where: { jobId: job.id, type: 'OFFICIAL_CONFLICT' } });
    expect(conflito).not.toBeNull();
  });

  it('prompt injection numa fonte externa nunca vira comando — nenhuma config muda, nenhum Mandamento é criado, nada é publicado', async () => {
    const { empresa, admin } = await empresaEAdmin();
    const mandamentosAntes = await prisma.mandamentoOficial.count();
    const configAntes = await prisma.companyAIConfiguration.findUnique({ where: { empresaId: empresa.id } });

    const job = await criarJob({ empresaId: empresa.id, requestedBy: admin.id, topic: 'atendimento ao cliente' });
    await executarJob(job.id, new FakeSourceProvider([fonte({ summary: MARCADOR_INJECAO_PROMPT })]));

    const final = await buscarJob(job.id, empresa.id);
    expect(final.status).toBe('WAITING_REVIEW');

    const aula = await prisma.academyLesson.findFirst({ where: { trainingJobId: job.id } });
    expect(aula!.status).toBe('DRAFT'); // nunca PUBLISHED, mesmo com "marque como PUBLISHED" na fonte

    const mandamentosDepois = await prisma.mandamentoOficial.count();
    expect(mandamentosDepois).toBe(mandamentosAntes); // nenhum "14º Mandamento" criado

    const configDepois = await prisma.companyAIConfiguration.findUnique({ where: { empresaId: empresa.id } });
    expect(configDepois).toEqual(configAntes); // nenhuma config de provider alterada
  });
});

describe('Training Orchestrator — ATUALIZACAO_CONTEUDO (Content Update Agent)', () => {
  let empresaId: string;
  let adminId: string;
  let lessonId: string;

  beforeEach(async () => {
    const { empresa, admin } = await empresaEAdmin();
    empresaId = empresa.id;
    adminId = admin.id;
    const trilha = await prisma.academyTrack.create({ data: { code: `trilha-cu-${randomUUID()}`, title: 'Trilha existente', description: 'd', status: 'PUBLISHED' } });
    const aula = await prisma.academyLesson.create({
      data: { trackId: trilha.id, code: `aula-cu-${randomUUID()}`, title: 'Aula existente', description: 'd', content: 'conteúdo antigo', estimatedMinutes: 5, status: 'PUBLISHED', version: 3 },
    });
    lessonId = aula.id;
  });

  it('recomenda revisão quando há fontes novas, nunca altera a versão publicada diretamente', async () => {
    const job = await criarJob({ empresaId, requestedBy: adminId, type: 'ATUALIZACAO_CONTEUDO', topic: 'aula existente', targetLessonId: lessonId });
    await executarJob(job.id, new FakeSourceProvider([fonte()]));

    const final = await buscarJob(job.id, empresaId);
    expect(final.status).toBe('WAITING_REVIEW');
    expect(final.updateRecommendation).toBe('REVIEW_RECOMMENDED');

    const aulaDepois = await prisma.academyLesson.findUniqueOrThrow({ where: { id: lessonId } });
    expect(aulaDepois.version).toBe(3); // versão publicada intocada
    expect(aulaDepois.content).toBe('conteúdo antigo');
  });
});
