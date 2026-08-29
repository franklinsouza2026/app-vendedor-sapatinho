// GET /playbook/active (seção 32 da Fatia 5) — empresaId sempre de req.auth,
// nunca de parâmetro do client (proteção contra IDOR/vazamento de playbook
// entre tenants, seção 31). Sem gestão administrativa via HTTP nesta fatia
// (seção 11) — publicar/editar playbook é só via PlaybookService/seed.
import { Router } from 'express';
import { getPlaybookAtivo } from '../treinador/playbook.service';
import { requireAuth } from '../middlewares/auth';
import { asyncHandler } from '../middlewares/async-handler';

export const playbookRouter = Router();

playbookRouter.get(
  '/playbook/active',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const playbook = await getPlaybookAtivo(req.auth!.empresaId);
    if (!playbook) return res.json(null);

    res.json({
      id: playbook.id,
      nome: playbook.nome,
      versao: playbook.versao,
      publicadoEm: playbook.publicadoEm,
      secoes: playbook.secoes.map((s) => ({
        categoria: s.categoria,
        titulo: s.titulo,
        conteudo: s.conteudo,
        origem: s.origem,
      })),
    });
  })
);
