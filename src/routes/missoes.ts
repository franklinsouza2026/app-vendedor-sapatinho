// Rotas de Missões/Desafios (Fatia 7). Somente leitura — toda atribuição,
// avaliação e recompensa acontece no backend a cada GET (seção 40: nunca um
// POST /missoes/:id/complete controlado pelo frontend). vendedorId sempre de
// req.auth (JWT verificado), nunca de parâmetro de rota/corpo.
import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { asyncHandler } from '../middlewares/async-handler';
import { MissaoError, getDesafiosAtivos, getHistoricoDesafios, getHistoricoMissoes, getMissaoPorId, getMissoesAtivas } from '../missoes/service';

export const missoesRouter = Router();

missoesRouter.get(
  '/missoes/ativas',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const missoes = await getMissoesAtivas(req.auth!.vendedorId);
    res.json({ missoes });
  })
);

missoesRouter.get(
  '/missoes/historico',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const missoes = await getHistoricoMissoes(req.auth!.vendedorId);
    res.json({ missoes });
  })
);

missoesRouter.get(
  '/missoes/:id',
  requireAuth(),
  asyncHandler(async (req, res) => {
    try {
      const missao = await getMissaoPorId(req.params.id, req.auth!.vendedorId);
      res.json(missao);
    } catch (err) {
      if (err instanceof MissaoError) return res.status(404).json({ error: err.message, type: err.type });
      throw err;
    }
  })
);

missoesRouter.get(
  '/desafios/ativos',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const desafios = await getDesafiosAtivos(req.auth!.vendedorId);
    res.json({ desafios });
  })
);

missoesRouter.get(
  '/desafios/historico',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const desafios = await getHistoricoDesafios(req.auth!.vendedorId);
    res.json({ desafios });
  })
);
