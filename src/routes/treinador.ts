// Rotas do Treinador (seção 32 da Fatia 5). vendedorId/empresaId nunca vêm
// de parâmetro do client — sempre de req.auth (JWT verificado).
//
// GET /treinador/contexto foi deliberadamente omitido: nada no fluxo
// obrigatório (frontend/E2E) precisa do TrainerContext bruto fora de uma
// geração de resposta real — expor um endpoint sem consumidor real seria
// superfície de API redundante (seção 32: "não criar APIs redundantes").
import { Response, Router } from 'express';
import { z } from 'zod';
import { ModoTreinador } from '@prisma/client';
import {
  TrainerError,
  criarNovaConversa,
  enviarMensagem,
  getOrCreateConversaAtual,
  listarMensagens,
} from '../treinador/conversation.service';
import { listarObjecoesComuns } from '../treinador/objection.service';
import { requireAuth } from '../middlewares/auth';
import { asyncHandler } from '../middlewares/async-handler';

export const treinadorRouter = Router();

const STATUS_POR_ERRO: Record<TrainerError['type'], number> = {
  not_found: 404,
  message_too_long: 400,
  rate_limited: 429,
  budget_exceeded: 429,
  generation_in_progress: 409,
  provider_unavailable: 503,
};

function tratarTrainerError(err: unknown, res: Response): boolean {
  if (err instanceof TrainerError) {
    res.status(STATUS_POR_ERRO[err.type]).json({ error: err.message, type: err.type });
    return true;
  }
  return false;
}

const MODOS: [ModoTreinador, ...ModoTreinador[]] = [
  'GERAL',
  'ABORDAGEM',
  'SONDAGEM',
  'DEMONSTRACAO',
  'OBJECAO',
  'FECHAMENTO',
  'VENDA_COMPLEMENTAR',
  'PA',
  'TICKET',
  'POS_VENDA',
  // Treinador Gerencial (Fatia 9.6, seção 29) — mesma rota/engine, modos próprios.
  'LIDERANCA',
  'FEEDBACK',
  'REUNIAO_1A1',
  'GESTAO_DE_CONFLITOS',
  'DESENVOLVIMENTO_DE_EQUIPE',
];

treinadorRouter.get(
  '/treinador/objections',
  requireAuth(),
  asyncHandler(async (_req, res) => {
    res.json({ objections: listarObjecoesComuns() });
  })
);

treinadorRouter.post(
  '/treinador/conversations',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const conversa = await criarNovaConversa(req.auth!.vendedorId);
    res.status(201).json(conversa);
  })
);

treinadorRouter.get(
  '/treinador/conversations/current',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const conversa = await getOrCreateConversaAtual(req.auth!.vendedorId);
    res.json(conversa);
  })
);

treinadorRouter.get(
  '/treinador/conversations/:id/messages',
  requireAuth(),
  asyncHandler(async (req, res) => {
    try {
      const mensagens = await listarMensagens(req.params.id, req.auth!.vendedorId);
      res.json({ mensagens });
    } catch (err) {
      if (!tratarTrainerError(err, res)) throw err;
    }
  })
);

const enviarMensagemSchema = z.object({
  content: z.string().min(1),
  mode: z.enum(MODOS),
  objection: z.string().max(200).optional(),
  situation: z.string().max(1000).optional(),
  clientMessageId: z.string().uuid().optional(),
});

treinadorRouter.post(
  '/treinador/conversations/:id/messages',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const parsed = enviarMensagemSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'mensagem inválida' });

    try {
      const resposta = await enviarMensagem({
        conversationId: req.params.id,
        vendedorId: req.auth!.vendedorId,
        content: parsed.data.content,
        mode: parsed.data.mode,
        objection: parsed.data.objection,
        situation: parsed.data.situation,
        clientMessageId: parsed.data.clientMessageId,
      });
      res.status(201).json(resposta);
    } catch (err) {
      if (!tratarTrainerError(err, res)) throw err;
    }
  })
);
