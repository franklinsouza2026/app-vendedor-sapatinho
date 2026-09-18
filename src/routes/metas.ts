import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { getProgressoVendedor, ultimaSincronizacao } from '../services/metas.service';

export const metasRouter = Router();

metasRouter.get('/metas/minhas', requireAuth(), async (req, res) => {
  const [progresso, sincronizadoEm] = await Promise.all([
    getProgressoVendedor(req.auth!.vendedorId),
    ultimaSincronizacao(req.auth!.vendedorId),
  ]);
  // `sincronizadoEm` é a hora do último snapshot vindo do ERP — nunca a hora
  // em que o app respondeu (Fatia 9.7).
  res.json({ vendedorId: req.auth!.vendedorId, progresso, sincronizadoEm });
});
