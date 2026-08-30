// Rotas do Simulador (Fatia 6). vendedorId/empresaId nunca vêm de parâmetro
// do client — sempre de req.auth (JWT verificado). Frontend nunca envia
// score/reward/completed — o backend calcula e persiste tudo.
import { Response, Router } from 'express';
import { z } from 'zod';
import {
  SimulationError,
  criarSessao,
  encerrarSessao,
  enviarMensagem,
  getHistorico,
  getSessaoDetalhada,
} from '../simulador/session.service';
import { listarCenariosAtivos } from '../simulador/scenario.service';
import { requireAuth } from '../middlewares/auth';
import { asyncHandler } from '../middlewares/async-handler';

export const simuladorRouter = Router();

const STATUS_POR_ERRO: Record<SimulationError['type'], number> = {
  not_found: 404,
  message_too_long: 400,
  rate_limited: 429,
  budget_exceeded: 429,
  generation_in_progress: 409,
  invalid_state: 409,
  provider_unavailable: 503,
};

function tratarSimulationError(err: unknown, res: Response): boolean {
  if (err instanceof SimulationError) {
    res.status(STATUS_POR_ERRO[err.type]).json({ error: err.message, type: err.type });
    return true;
  }
  return false;
}

simuladorRouter.get(
  '/simulador/cenarios',
  requireAuth(),
  asyncHandler(async (_req, res) => {
    const cenarios = await listarCenariosAtivos();
    res.json({
      cenarios: cenarios.map((c) => ({
        id: c.id,
        code: c.code,
        title: c.title,
        description: c.description,
        category: c.category,
        objective: c.objective,
        availableDifficulties: Object.keys(c.personasPorDificuldade as Record<string, unknown>),
      })),
    });
  })
);

simuladorRouter.get(
  '/simulador/historico',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const historico = await getHistorico(req.auth!.vendedorId);
    res.json({ historico });
  })
);

const criarSessaoSchema = z.object({
  scenarioId: z.string().uuid(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
});

simuladorRouter.post(
  '/simulador/sessoes',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const parsed = criarSessaoSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'cenário ou dificuldade inválidos' });

    try {
      const sessao = await criarSessao(req.auth!.vendedorId, parsed.data.scenarioId, parsed.data.difficulty);
      res.status(201).json(sessao);
    } catch (err) {
      if (!tratarSimulationError(err, res)) throw err;
    }
  })
);

simuladorRouter.get(
  '/simulador/sessoes/:id',
  requireAuth(),
  asyncHandler(async (req, res) => {
    try {
      const detalhe = await getSessaoDetalhada(req.params.id, req.auth!.vendedorId);
      res.json(detalhe);
    } catch (err) {
      if (!tratarSimulationError(err, res)) throw err;
    }
  })
);

const enviarMensagemSchema = z.object({
  content: z.string().min(1),
  clientMessageId: z.string().uuid().optional(),
});

simuladorRouter.post(
  '/simulador/sessoes/:id/mensagens',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const parsed = enviarMensagemSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'mensagem inválida' });

    try {
      const resultado = await enviarMensagem({
        sessionId: req.params.id,
        vendedorId: req.auth!.vendedorId,
        content: parsed.data.content,
        clientMessageId: parsed.data.clientMessageId,
      });
      res.status(201).json(resultado);
    } catch (err) {
      if (!tratarSimulationError(err, res)) throw err;
    }
  })
);

simuladorRouter.post(
  '/simulador/sessoes/:id/encerrar',
  requireAuth(),
  asyncHandler(async (req, res) => {
    try {
      const sessao = await encerrarSessao(req.params.id, req.auth!.vendedorId);
      res.json(sessao);
    } catch (err) {
      if (!tratarSimulationError(err, res)) throw err;
    }
  })
);
