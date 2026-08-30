// Admin AI Control Plane (Fatia 7.5B) — só ADMIN (nunca GERENTE/VENDEDOR),
// escopado sempre por empresaId de req.auth. Nenhuma rota devolve credencial
// em claro; GET só informa `configured: boolean`.
import { Router } from 'express';
import { z } from 'zod';
import { NomeProviderIA } from '@prisma/client';
import { requireAuth } from '../middlewares/auth';
import { asyncHandler } from '../middlewares/async-handler';
import { loginRateLimit } from '../middlewares/ratelimit';
import { IdentidadeError } from '../identidade/erros';
import {
  atualizarBudgetIA,
  atualizarCredencial,
  atualizarModelo,
  ativarProvider,
  getUsoIA,
  getVisaoGeralIA,
  habilitarDesabilitarIA,
  removerCredencial,
  testarConexaoProvider,
} from '../ai-platform/admin-ai.service';
import { inicioDoMes } from '../services/metas.service';

export const adminAiRouter = Router();

function tratarErro(err: unknown, res: import('express').Response) {
  if (err instanceof IdentidadeError) return res.status(err.status).json({ error: err.message, type: err.type });
  throw err;
}

const providerParamSchema = z.object({ provider: z.nativeEnum(NomeProviderIA) });

adminAiRouter.get(
  '/admin/ai',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const visaoGeral = await getVisaoGeralIA(req.auth!.empresaId);
    res.json(visaoGeral);
  })
);

const credentialSchema = z.object({ apiKey: z.string().min(1) });

adminAiRouter.put(
  '/admin/ai/providers/:provider/credential',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const params = providerParamSchema.safeParse(req.params);
    const body = credentialSchema.safeParse(req.body);
    if (!params.success || !body.success) return res.status(400).json({ error: 'dados inválidos' });

    try {
      await atualizarCredencial({ empresaId: req.auth!.empresaId, provider: params.data.provider, apiKey: body.data.apiKey, actorId: req.auth!.vendedorId });
      res.status(204).end();
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

adminAiRouter.delete(
  '/admin/ai/providers/:provider/credential',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const params = providerParamSchema.safeParse(req.params);
    if (!params.success) return res.status(400).json({ error: 'dados inválidos' });

    try {
      await removerCredencial(req.auth!.empresaId, params.data.provider, req.auth!.vendedorId);
      res.status(204).end();
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

// Rate-limited com o mesmo limitador do login/ativação: dispara uma chamada
// real ao provider (custo real), não pode ser martelado (seção 30).
adminAiRouter.post(
  '/admin/ai/providers/:provider/test',
  requireAuth('ADMIN'),
  loginRateLimit,
  asyncHandler(async (req, res) => {
    const params = providerParamSchema.safeParse(req.params);
    if (!params.success) return res.status(400).json({ error: 'dados inválidos' });

    const resultado = await testarConexaoProvider(req.auth!.empresaId, params.data.provider, req.auth!.vendedorId);
    res.json(resultado);
  })
);

adminAiRouter.post(
  '/admin/ai/providers/:provider/activate',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const params = providerParamSchema.safeParse(req.params);
    if (!params.success) return res.status(400).json({ error: 'dados inválidos' });

    try {
      await ativarProvider(req.auth!.empresaId, params.data.provider, req.auth!.vendedorId);
      res.status(204).end();
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

const modelSchema = z.object({ model: z.string().min(1) });

adminAiRouter.put(
  '/admin/ai/providers/:provider/model',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const params = providerParamSchema.safeParse(req.params);
    const body = modelSchema.safeParse(req.body);
    if (!params.success || !body.success) return res.status(400).json({ error: 'dados inválidos' });

    try {
      await atualizarModelo(req.auth!.empresaId, params.data.provider, body.data.model, req.auth!.vendedorId);
      res.status(204).end();
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

const enabledSchema = z.object({ enabled: z.boolean() });

adminAiRouter.put(
  '/admin/ai/enabled',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const body = enabledSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'dados inválidos' });

    await habilitarDesabilitarIA(req.auth!.empresaId, body.data.enabled, req.auth!.vendedorId);
    res.status(204).end();
  })
);

const budgetSchema = z.object({ monthlyLimitUSD: z.number().positive() });

adminAiRouter.put(
  '/admin/ai/budget',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const body = budgetSchema.safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: 'dados inválidos' });

    await atualizarBudgetIA(req.auth!.empresaId, body.data.monthlyLimitUSD, req.auth!.vendedorId);
    res.status(204).end();
  })
);

adminAiRouter.get(
  '/admin/ai/usage',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const uso = await getUsoIA(req.auth!.empresaId, inicioDoMes(new Date()));
    res.json(uso);
  })
);
