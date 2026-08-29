// Rotas do Coach (seção 18 da fonte de verdade). vendedorId/empresaId nunca
// vêm de parâmetro do client — sempre de req.auth (JWT verificado).
import { Response, Router } from 'express';
import { z } from 'zod';
import { registrarCheckin, getCheckinHoje } from '../coach/checkin.service';
import {
  CoachError,
  criarNovaConversa,
  enviarMensagem,
  getOrCreateConversaAtual,
  listarMensagens,
} from '../coach/conversation.service';
import { requireAuth } from '../middlewares/auth';
import { asyncHandler } from '../middlewares/async-handler';

export const coachRouter = Router();

const STATUS_POR_ERRO: Record<CoachError['type'], number> = {
  not_found: 404,
  message_too_long: 400,
  rate_limited: 429,
  budget_exceeded: 429,
  generation_in_progress: 409,
  provider_unavailable: 503,
};

function tratarCoachError(err: unknown, res: Response): boolean {
  if (err instanceof CoachError) {
    res.status(STATUS_POR_ERRO[err.type]).json({ error: err.message, type: err.type });
    return true;
  }
  return false;
}

const checkinSchema = z.object({
  mood: z.enum(['VERY_GOOD', 'GOOD', 'NEUTRAL', 'NOT_GOOD']),
});

coachRouter.post(
  '/coach/check-in',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const parsed = checkinSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'mood inválido' });

    const checkin = await registrarCheckin(req.auth!.vendedorId, parsed.data.mood);
    res.status(201).json(checkin);
  })
);

coachRouter.get(
  '/coach/check-in/hoje',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const checkin = await getCheckinHoje(req.auth!.vendedorId);
    res.json(checkin);
  })
);

coachRouter.post(
  '/coach/conversations',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const conversa = await criarNovaConversa(req.auth!.vendedorId);
    res.status(201).json(conversa);
  })
);

coachRouter.get(
  '/coach/conversations/current',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const conversa = await getOrCreateConversaAtual(req.auth!.vendedorId);
    res.json(conversa);
  })
);

coachRouter.get(
  '/coach/conversations/:id/messages',
  requireAuth(),
  asyncHandler(async (req, res) => {
    try {
      const mensagens = await listarMensagens(req.params.id, req.auth!.vendedorId);
      res.json({ mensagens });
    } catch (err) {
      if (!tratarCoachError(err, res)) throw err;
    }
  })
);

const enviarMensagemSchema = z.object({
  content: z.string().min(1),
  clientMessageId: z.string().uuid().optional(),
});

coachRouter.post(
  '/coach/conversations/:id/messages',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const parsed = enviarMensagemSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'mensagem inválida' });

    try {
      const resposta = await enviarMensagem(req.params.id, req.auth!.vendedorId, parsed.data.content, parsed.data.clientMessageId);
      res.status(201).json(resposta);
    } catch (err) {
      if (!tratarCoachError(err, res)) throw err;
    }
  })
);
