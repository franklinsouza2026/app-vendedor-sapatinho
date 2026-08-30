// Training Orchestrator (seção 4) — só SEQUENCIA os especialistas lógicos,
// nunca contém conhecimento pedagógico próprio (isso vive em cada
// *.service.ts do diretório). Publicação NUNCA é automática (regra
// fundamental da fonte de verdade): o pipeline termina em WAITING_REVIEW,
// nunca em COMPLETED/PUBLISHED direto.
import { randomUUID } from 'node:crypto';
import { prisma } from '../db';
import { createLogger } from '../utils/logger';
import { registrarEventoAuditoria } from '../identidade/auditoria.service';
import { criarAula, criarTrilha } from '../academia/admin-content.service';
import { definirQuizDaAula, criarQuestao } from '../academia/question-bank.service';
import { listarMandamentosComConteudoAprovado } from '../academia/mandamentos.service';
import { pesquisarFontes, sintetizarPesquisa } from './research.service';
import { curarFontes } from './curator.service';
import { projetarConteudo } from './instructional-designer.service';
import { gerarRascunhoDeQuestoes } from './quiz-agent.service';
import { projetarSimulacao } from './simulation-designer.service';
import { avaliarGovernanca } from './governance.service';
import { avaliarAtualizacaoConteudo } from './content-update.service';
import { MockResearchSourceProvider, ResearchSourceProvider } from './research-source-provider';
import { FonteParaPrompt, TrainingIntelligenceError } from './types';

const log = createLogger('training-intelligence:orchestrator');

async function jobAtual(jobId: string) {
  return prisma.trainingIntelligenceJob.findUniqueOrThrow({ where: { id: jobId } });
}

async function foiCancelado(jobId: string): Promise<boolean> {
  const job = await prisma.trainingIntelligenceJob.findUnique({ where: { id: jobId }, select: { status: true } });
  return job?.status === 'CANCELLED';
}

async function marcarEtapa(jobId: string, currentStep: string) {
  await prisma.trainingIntelligenceJob.update({ where: { id: jobId }, data: { currentStep } });
}

/** Retry limitado (seção 46) — nunca infinito, nunca duplica o efeito
 * colateral (cada tentativa é uma chamada de IA nova, nunca reaplica algo já
 * persistido). */
async function comRetry<T>(jobId: string, fn: () => Promise<T>, maxTentativas = 2): Promise<T> {
  let ultimoErro: unknown;
  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    try {
      return await fn();
    } catch (err) {
      ultimoErro = err;
      await prisma.trainingIntelligenceJob.update({ where: { id: jobId }, data: { attemptCount: { increment: 1 } } });
      if (err instanceof TrainingIntelligenceError && (err.type === 'budget_exceeded' || err.type === 'rate_limited' || err.type === 'invalid_ai_output')) {
        throw err; // nunca adianta retry — erro não é transitório
      }
      log.warn({ jobId, tentativa, err }, 'tentativa falhou — retry limitado em andamento');
    }
  }
  throw ultimoErro;
}

function paraFontePrompt(fontes: { id: string; title: string; summary: string; publisher: string | null; reliability: string }[]): FonteParaPrompt[] {
  return fontes.map((f) => ({ id: f.id, title: f.title, summary: f.summary, publisher: f.publisher, reliability: f.reliability as FonteParaPrompt['reliability'] }));
}

async function marcarFalha(jobId: string, empresaId: string, actorId: string, erro: unknown, etapa: string) {
  const mensagem = erro instanceof Error ? erro.message : 'erro desconhecido';
  await prisma.trainingIntelligenceJob.update({
    where: { id: jobId },
    data: { status: 'FAILED', failedAt: new Date(), errorMessage: `[${etapa}] ${mensagem}` },
  });
  await registrarEventoAuditoria({ empresaId, acao: 'TRAINING_JOB_FAILED', actorId, metadata: { jobId, etapa } });
  log.error({ jobId, etapa, erro }, 'job de Training Intelligence falhou');
}

/**
 * Executa um job do início ao fim (chamado pelo worker BullMQ ou
 * diretamente em teste). Idempotente contra dupla execução: só roda se o
 * job ainda estiver QUEUED (transição atômica pra RUNNING).
 */
export async function executarJob(jobId: string, researchProvider: ResearchSourceProvider = new MockResearchSourceProvider()) {
  const iniciado = await prisma.trainingIntelligenceJob.updateMany({
    where: { id: jobId, status: 'QUEUED' },
    data: { status: 'RUNNING', startedAt: new Date() },
  });
  if (iniciado.count !== 1) {
    log.info({ jobId }, 'job não está QUEUED — execução ignorada (já rodando, concluído ou cancelado)');
    return;
  }

  const job = await jobAtual(jobId);
  await registrarEventoAuditoria({ empresaId: job.empresaId, acao: 'TRAINING_JOB_STARTED', actorId: job.requestedBy, metadata: { jobId } });

  try {
    if (job.type === 'ATUALIZACAO_CONTEUDO') {
      await executarAtualizacaoConteudo(job.id, job.empresaId, job.requestedBy, job.topic, job.targetLessonId, researchProvider);
    } else {
      await executarPacoteTreinamento(job.id, job.empresaId, job.requestedBy, job.topic, job.objective, job.targetAudience, researchProvider);
    }
  } catch (err) {
    if (err instanceof TrainingIntelligenceError && err.type === 'idempotent_replay') return; // já finalizado por outra execução — nunca duplica efeito
    // Relê o job — `currentStep` foi atualizado durante a execução (`marcarEtapa`),
    // usar a variável `job` capturada antes de rodar sempre mostraria null/a etapa inicial.
    const jobNoMomentoDaFalha = await jobAtual(jobId);
    await marcarFalha(jobId, job.empresaId, job.requestedBy, err, jobNoMomentoDaFalha.currentStep ?? 'desconhecida');
  }
}

async function pararSeCancelado(jobId: string) {
  if (await foiCancelado(jobId)) {
    // Worker checa cancelamento ENTRE etapas (seção 45) — nunca no meio de
    // uma persistência já iniciada. O que já foi salvo até aqui (fontes,
    // por exemplo) permanece pra auditoria; só as etapas seguintes não rodam.
    throw new TrainingIntelligenceError('idempotent_replay', 'job cancelado durante a execução');
  }
}

async function executarPacoteTreinamento(
  jobId: string,
  empresaId: string,
  requestedBy: string,
  topic: string,
  objective: string | null,
  targetAudience: 'SELLER' | 'MANAGER' | 'BOTH',
  researchProvider: ResearchSourceProvider
) {
  // 1. RESEARCH
  await marcarEtapa(jobId, 'research');
  const fontesRaw = await comRetry(jobId, () => pesquisarFontes(jobId, topic, researchProvider));
  const fontes = paraFontePrompt(fontesRaw);
  await comRetry(jobId, () => sintetizarPesquisa(jobId, empresaId, requestedBy, topic, fontesRaw));
  await registrarEventoAuditoria({ empresaId, acao: 'RESEARCH_COMPLETED', actorId: requestedBy, metadata: { jobId, fontes: fontes.length } });
  await pararSeCancelado(jobId);

  // 2. CURATOR
  await marcarEtapa(jobId, 'curation');
  const curadoria = await comRetry(jobId, () =>
    curarFontes({ jobId, empresaId, vendedorId: requestedBy, topic, objective, researchSummary: topic, sources: fontes })
  );
  await registrarEventoAuditoria({ empresaId, acao: 'CURATION_COMPLETED', actorId: requestedBy, metadata: { jobId, officialConflict: curadoria.officialConflict } });
  await pararSeCancelado(jobId);

  // 3. INSTRUCTIONAL DESIGNER — etapa obrigatória: sem lesson draft, o
  // pacote não tem nada útil pra revisar (falha aqui derruba o job inteiro).
  await marcarEtapa(jobId, 'instructional_design');
  const mandamentosAprovados = await listarMandamentosComConteudoAprovado();
  const design = await comRetry(jobId, () =>
    projetarConteudo({ jobId, empresaId, vendedorId: requestedBy, topic, objective, curation: curadoria, mandamentosOficiais: mandamentosAprovados })
  );
  await pararSeCancelado(jobId);

  const codeBase = topic
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 40) || 'tema';
  const sufixo = randomUUID().slice(0, 8);

  const trilha = await criarTrilha(
    { code: `ia-${codeBase}-${sufixo}`, title: `IA: ${topic}`, description: `Trilha gerada por IA a partir do pedido: ${objective ?? topic}`, audience: targetAudience },
    requestedBy,
    { origemEditorial: 'AI_GENERATED' }
  );

  const aula = await criarAula(
    {
      trackId: trilha.id,
      code: `ia-${codeBase}-${sufixo}-aula`,
      title: design.title,
      description: design.description,
      content: design.content,
      estimatedMinutes: design.estimatedMinutes,
      audience: targetAudience,
    },
    requestedBy,
    { origemEditorial: 'AI_GENERATED', trainingJobId: jobId }
  );
  await registrarEventoAuditoria({ empresaId, acao: 'LESSON_DRAFT_GENERATED', actorId: requestedBy, metadata: { jobId, lessonId: aula.id } });
  await pararSeCancelado(jobId);

  // 4. QUIZ AGENT — melhor esforço (seção 47: falha aqui nunca derruba o
  // lesson draft já criado).
  await marcarEtapa(jobId, 'quiz');
  if (design.quizRecommended) {
    try {
      const resultadoQuiz = await comRetry(jobId, () => gerarRascunhoDeQuestoes({ jobId, empresaId, vendedorId: requestedBy, topic, lessonContent: design.content }));
      if (resultadoQuiz.bloqueadoPorMandamentosSemConteudo) {
        await prisma.trainingGovernanceFinding.create({
          data: { jobId, type: 'MANDAMENTO_VIOLATION', severity: 'REVIEW_REQUIRED', message: 'quiz sobre os 13 Mandamentos não gerado — nenhum mandamento tem conteúdo oficial cadastrado ainda' },
        });
      } else if (resultadoQuiz.questoesValidas.length > 0) {
        const quiz = await definirQuizDaAula(aula.id, {}, requestedBy);
        for (const questao of resultadoQuiz.questoesValidas) {
          await criarQuestao(
            { quizId: quiz.id, question: questao.statement, difficulty: questao.difficulty, topic: questao.concept, opcoes: questao.options.map((o) => ({ text: o.text, correct: o.correct })) },
            requestedBy,
            { origemEditorial: 'AI_GENERATED', trainingJobId: jobId }
          );
        }
        await registrarEventoAuditoria({ empresaId, acao: 'QUIZ_DRAFT_GENERATED', actorId: requestedBy, metadata: { jobId, questoes: resultadoQuiz.questoesValidas.length } });
      }
      if (resultadoQuiz.questoesRejeitadas.length > 0) {
        await prisma.trainingGovernanceFinding.create({
          data: { jobId, type: 'OTHER', severity: 'REVIEW_REQUIRED', message: `${resultadoQuiz.questoesRejeitadas.length} questão(ões) gerada(s) rejeitada(s) na validação estrutural` },
        });
      }
    } catch (err) {
      log.warn({ jobId, err }, 'quiz agent falhou — pacote segue sem quiz draft (falha parcial, lesson draft preservado)');
      await prisma.trainingGovernanceFinding.create({ data: { jobId, type: 'OTHER', severity: 'REVIEW_REQUIRED', message: 'geração de quiz falhou — revise manualmente se quiser adicionar um' } });
    }
  }
  await pararSeCancelado(jobId);

  // 5. SIMULATION DESIGNER — melhor esforço.
  await marcarEtapa(jobId, 'simulation');
  if (design.simulationRecommended) {
    try {
      const cenario = await comRetry(jobId, () => projetarSimulacao({ jobId, empresaId, vendedorId: requestedBy, topic, lessonContent: design.content }));
      await prisma.trainingScenarioDraft.create({
        data: {
          jobId,
          empresaId,
          title: cenario.title,
          context: cenario.context,
          customerProfile: cenario.customerProfile,
          sellerObjective: cenario.sellerObjective,
          objections: cenario.objections,
          difficulty: cenario.difficulty,
          competencies: cenario.competencies,
          evaluationCriteria: cenario.evaluationCriteria,
        },
      });
      await registrarEventoAuditoria({ empresaId, acao: 'SIMULATION_DRAFT_GENERATED', actorId: requestedBy, metadata: { jobId } });
    } catch (err) {
      log.warn({ jobId, err }, 'simulation designer falhou — pacote segue sem cenário (falha parcial)');
      await prisma.trainingGovernanceFinding.create({ data: { jobId, type: 'OTHER', severity: 'REVIEW_REQUIRED', message: 'geração de cenário de simulação falhou' } });
    }
  }
  await pararSeCancelado(jobId);

  // 6. GOVERNANCE — melhor esforço (nunca decide sozinho o destino do
  // conteúdo; ausência de resultado só significa "sem parecer automático",
  // a revisão humana continua obrigatória de qualquer forma).
  await marcarEtapa(jobId, 'governance');
  try {
    await comRetry(jobId, () => avaliarGovernanca({ jobId, empresaId, vendedorId: requestedBy, draftContent: design.content, sources: fontes }));
    await registrarEventoAuditoria({ empresaId, acao: 'GOVERNANCE_REVIEW_COMPLETED', actorId: requestedBy, metadata: { jobId } });
  } catch (err) {
    log.warn({ jobId, err }, 'governance agent falhou — revisão humana continua obrigatória mesmo sem parecer automático');
  }

  // Nunca publica sozinho — sempre WAITING_REVIEW (regra fundamental).
  await marcarEtapa(jobId, 'waiting_review');
  await prisma.trainingIntelligenceJob.update({ where: { id: jobId }, data: { status: 'WAITING_REVIEW' } });
}

async function executarAtualizacaoConteudo(
  jobId: string,
  empresaId: string,
  requestedBy: string,
  topic: string,
  targetLessonId: string | null,
  researchProvider: ResearchSourceProvider
) {
  if (!targetLessonId) throw new TrainingIntelligenceError('not_found', 'ATUALIZACAO_CONTEUDO exige targetLessonId');

  await marcarEtapa(jobId, 'research');
  const fontesRaw = await comRetry(jobId, () => pesquisarFontes(jobId, topic, researchProvider));
  const fontes = paraFontePrompt(fontesRaw);
  await registrarEventoAuditoria({ empresaId, acao: 'RESEARCH_COMPLETED', actorId: requestedBy, metadata: { jobId, fontes: fontes.length } });
  await pararSeCancelado(jobId);

  await marcarEtapa(jobId, 'content_update_review');
  await comRetry(jobId, () => avaliarAtualizacaoConteudo({ jobId, empresaId, vendedorId: requestedBy, targetLessonId, newSources: fontes }));

  await marcarEtapa(jobId, 'waiting_review');
  await prisma.trainingIntelligenceJob.update({ where: { id: jobId }, data: { status: 'WAITING_REVIEW' } });
}
