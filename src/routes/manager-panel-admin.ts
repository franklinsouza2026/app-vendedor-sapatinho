// Painel Gerencial — configuração do Admin (Fatia 9, seção 66-70). Admin só
// ajusta thresholds/ativação de alerta — nunca uma fórmula livre (Zod só
// aceita `Record<string, number>`, validação de chaves conhecidas é feita
// no service). Isto NÃO é um dashboard executivo/BI — é só configuração +
// visibilidade do que já existe (escopo explícito da fatia, seção 66).
import { Router } from 'express';
import { z } from 'zod';
import { TipoAlertaGerencial } from '@prisma/client';
import { requireAuth } from '../middlewares/auth';
import { asyncHandler } from '../middlewares/async-handler';
import { listarConfigsParaAdmin, atualizarConfigAlerta } from '../manager/alert-config.service';
import { THRESHOLDS_PADRAO } from '../manager/constantes';

export const managerPanelAdminRouter = Router();

managerPanelAdminRouter.get(
  '/admin/gerencial/alertas/config',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const configs = await listarConfigsParaAdmin(req.auth!.empresaId);
    res.json({ configs, tiposDisponiveis: Object.keys(THRESHOLDS_PADRAO) });
  })
);

const atualizarConfigSchema = z.object({
  ativo: z.boolean(),
  parametros: z.record(z.string(), z.number()),
});

managerPanelAdminRouter.put(
  '/admin/gerencial/alertas/config/:tipo',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const tipo = req.params.tipo as TipoAlertaGerencial;
    if (!(tipo in THRESHOLDS_PADRAO)) return res.status(400).json({ error: 'tipo de alerta desconhecido' });

    const parsed = atualizarConfigSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos', detalhes: parsed.error.flatten() });

    try {
      const salvo = await atualizarConfigAlerta(req.auth!.empresaId, tipo, parsed.data.parametros, parsed.data.ativo, req.auth!.vendedorId);
      res.json(salvo);
    } catch (err) {
      if (err instanceof Error) return res.status(400).json({ error: err.message });
      throw err;
    }
  })
);
