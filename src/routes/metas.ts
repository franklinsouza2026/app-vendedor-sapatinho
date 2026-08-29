import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { getProgressoVendedor } from '../services/metas.service';

export const metasRouter = Router();

metasRouter.get('/metas/minhas', requireAuth(), async (req, res) => {
  const progresso = await getProgressoVendedor(req.auth!.vendedorId);
  res.json({ vendedorId: req.auth!.vendedorId, progresso });
});
