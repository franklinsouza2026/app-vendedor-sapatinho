// Rotas do VENDEDOR na Fase 1. Identidade e escopo vêm SEMPRE do token
// (revalidado no banco a cada request) — nenhum id, data ou valor do cliente.
import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth';
import { asyncHandler } from '../../middlewares/async-handler';
import { montarPainel } from '../painel/painel.service';

export const fase1VendedorRouter = Router();

fase1VendedorRouter.get(
  '/app/painel',
  requireAuth('VENDEDOR'),
  asyncHandler(async (req, res) => {
    res.json(await montarPainel(req.auth!.vendedorId));
  })
);
