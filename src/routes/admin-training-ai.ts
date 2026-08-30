// Admin — IA de Treinamento (Fatia 7.5D, seção 32/38). Só ADMIN. Toda
// mutação de conteúdo real (aula/questão/cenário) continua passando pelos
// mesmos endpoints do CMS manual (Fatia 7.5C) — aqui só existe o que é
// específico do pipeline de IA: criar/acompanhar/cancelar/revisar jobs, e
// listar/transicionar os rascunhos de cenário de simulação.
import { Router } from 'express';
import { z } from 'zod';
import { PublicoConteudo, TipoJobTreinamento } from '@prisma/client';
import { requireAuth } from '../middlewares/auth';
import { asyncHandler } from '../middlewares/async-handler';
import { TrainingIntelligenceError } from '../training-intelligence/types';
import { criarJob, listarJobs, cancelarJob, revisarJob, detalharJobParaRevisao } from '../training-intelligence/job.service';
import { enfileirarJobTreinamento } from '../queues/training-intelligence.queue';
import { registrarEventoAuditoria } from '../identidade/auditoria.service';
import { listarCenariosDraft, transicionarCenarioDraft } from '../training-intelligence/scenario-draft.service';

export const adminTrainingAiRouter = Router();

const STATUS_POR_ERRO: Record<TrainingIntelligenceError['type'], number> = {
  not_found: 404,
  invalid_transition: 409,
  budget_exceeded: 429,
  rate_limited: 429,
  provider_unavailable: 503,
  invalid_ai_output: 502,
  idempotent_replay: 200,
};

function tratarErro(err: unknown, res: import('express').Response) {
  if (err instanceof TrainingIntelligenceError) return res.status(STATUS_POR_ERRO[err.type]).json({ error: err.message, type: err.type });
  throw err;
}

// ===== Jobs =====

const criarJobSchema = z.object({
  // Aceita tanto campos estruturados quanto uma solicitação em linguagem
  // natural (seção 33) — quando só `naturalLanguageRequest` vem, ela vira o
  // `topic` (interpretação mínima e transparente, seção 34: o texto do
  // Admin é sempre tratado como DADO dentro do pipeline, nunca como
  // instrução de sistema — ver src/training-intelligence/prompts.ts).
  topic: z.string().min(1).optional(),
  naturalLanguageRequest: z.string().min(1).optional(),
  objective: z.string().optional(),
  targetAudience: z.nativeEnum(PublicoConteudo).optional(),
  type: z.nativeEnum(TipoJobTreinamento).optional(),
  targetLessonId: z.string().uuid().optional(),
  idempotencyKey: z.string().optional(),
});

adminTrainingAiRouter.post(
  '/admin/training/ai/jobs',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = criarJobSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos', detalhes: parsed.error.flatten() });

    const topic = parsed.data.topic ?? parsed.data.naturalLanguageRequest;
    if (!topic) return res.status(400).json({ error: 'informe "topic" ou "naturalLanguageRequest"' });
    if (parsed.data.type === 'ATUALIZACAO_CONTEUDO' && !parsed.data.targetLessonId) {
      return res.status(400).json({ error: 'ATUALIZACAO_CONTEUDO exige targetLessonId' });
    }

    try {
      const job = await criarJob({
        empresaId: req.auth!.empresaId,
        requestedBy: req.auth!.vendedorId,
        type: parsed.data.type,
        topic,
        objective: parsed.data.objective,
        targetAudience: parsed.data.targetAudience,
        targetLessonId: parsed.data.targetLessonId,
        idempotencyKey: parsed.data.idempotencyKey,
      });
      if (job.status === 'QUEUED') {
        await enfileirarJobTreinamento(job.id);
        await registrarEventoAuditoria({ empresaId: req.auth!.empresaId, acao: 'TRAINING_JOB_CREATED', actorId: req.auth!.vendedorId, metadata: { jobId: job.id, topic, type: job.type } });
      }
      res.status(202).json(job);
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

adminTrainingAiRouter.get(
  '/admin/training/ai/jobs',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    res.json({ jobs: await listarJobs(req.auth!.empresaId) });
  })
);

adminTrainingAiRouter.get(
  '/admin/training/ai/jobs/:id',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    try {
      res.json(await detalharJobParaRevisao(req.params.id, req.auth!.empresaId));
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

adminTrainingAiRouter.post(
  '/admin/training/ai/jobs/:id/cancel',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    try {
      res.json(await cancelarJob(req.params.id, req.auth!.empresaId, req.auth!.vendedorId));
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

const revisarJobSchema = z.object({ outcome: z.enum(['APPROVED', 'REJECTED']), notes: z.string().optional() });

adminTrainingAiRouter.post(
  '/admin/training/ai/jobs/:id/review',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = revisarJobSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });
    try {
      res.json(await revisarJob(req.params.id, req.auth!.empresaId, parsed.data.outcome, parsed.data.notes, req.auth!.vendedorId));
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

// ===== Cenários de simulação (rascunho gerado pelo Simulation Designer) =====

adminTrainingAiRouter.get(
  '/admin/training/ai/scenarios',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    res.json({ cenarios: await listarCenariosDraft(req.auth!.empresaId) });
  })
);

const TRANSICAO_CENARIO = z.enum(['submeter', 'aprovar', 'publicar', 'arquivar']);

adminTrainingAiRouter.post(
  '/admin/training/ai/scenarios/:id/:transicao',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const transicao = TRANSICAO_CENARIO.safeParse(req.params.transicao);
    if (!transicao.success) return res.status(400).json({ error: 'transição desconhecida' });
    try {
      res.json(await transicionarCenarioDraft(req.params.id, req.auth!.empresaId, transicao.data, req.auth!.vendedorId));
    } catch (err) {
      tratarErro(err, res);
    }
  })
);
