// Gestão de metas (Fatia 9.7, P0). Só ADMIN escreve: definir meta é decisão
// comercial da empresa, não do gerente da loja — se isso mudar, é uma decisão
// de produto explícita, não um ajuste de rota.
//
// empresaId e actorId vêm SEMPRE de req.auth; `vendedorId` do corpo é sempre
// revalidado contra a empresa antes de qualquer escrita (ver metas-admin.service).
import { Response, Router } from 'express';
import { z } from 'zod';
import { PeriodoMeta, TipoMeta } from '@prisma/client';
import { requireAuth } from '../middlewares/auth';
import { asyncHandler } from '../middlewares/async-handler';
import { IdentidadeError } from '../identidade/erros';
import { atualizarMeta, criarMeta, listarMetas, removerMeta } from '../services/metas-admin.service';

export const adminMetasRouter = Router();

function tratarErro(err: unknown, res: Response) {
  if (err instanceof IdentidadeError) return res.status(err.status).json({ error: err.message, type: err.type });
  throw err;
}

const listarQuerySchema = z.object({
  lojaId: z.string().uuid().optional(),
  vendedorId: z.string().uuid().optional(),
  periodo: z.nativeEnum(PeriodoMeta).optional(),
});

adminMetasRouter.get(
  '/admin/metas',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = listarQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'parâmetros inválidos' });

    const metas = await listarMetas({ empresaId: req.auth!.empresaId, ...parsed.data });
    res.json({ metas });
  })
);

/**
 * Data do período no formato `YYYY-MM-DD`, interpretada em horário LOCAL.
 *
 * `z.coerce.date()` NÃO serve aqui: ele parseia "2026-09-17" como meia-noite
 * UTC, que num fuso negativo (UTC-3) é o DIA ANTERIOR em horário local. Efeito
 * concreto, pego por teste de jornada: cadastrar a meta de HOJE era recusada
 * como "período já encerrado". O resto do produto trabalha em dia local
 * (`inicioDoDia` em metas.service.ts), então a borda tem que concordar.
 */
const dataLocalSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'data deve estar no formato AAAA-MM-DD')
  .transform((texto) => {
    const [ano, mes, dia] = texto.split('-').map(Number);
    return new Date(ano, mes - 1, dia);
  });

const criarSchema = z.object({
  vendedorId: z.string().uuid(),
  tipo: z.nativeEnum(TipoMeta),
  periodo: z.nativeEnum(PeriodoMeta),
  // Data do período (qualquer dia dentro dele) — o backend normaliza pro
  // início do período antes de persistir.
  referencia: dataLocalSchema,
  // Limite superior evita erro de digitação virar meta absurda (ex.: centavo a
  // mais num campo de milhão) que envenenaria ranking e gamificação.
  valorMeta: z.number().positive().max(99_999_999.99),
});

adminMetasRouter.post(
  '/admin/metas',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = criarSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos', detalhes: parsed.error.flatten() });

    try {
      const meta = await criarMeta(parsed.data, req.auth!.empresaId, req.auth!.vendedorId);
      res.status(201).json(meta);
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

const atualizarSchema = z.object({ valorMeta: z.number().positive().max(99_999_999.99) });

adminMetasRouter.put(
  '/admin/metas/:id',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = atualizarSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });

    try {
      const meta = await atualizarMeta(req.params.id, parsed.data.valorMeta, req.auth!.empresaId, req.auth!.vendedorId);
      res.json(meta);
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

adminMetasRouter.delete(
  '/admin/metas/:id',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    try {
      await removerMeta(req.params.id, req.auth!.empresaId, req.auth!.vendedorId);
      res.status(204).end();
    } catch (err) {
      tratarErro(err, res);
    }
  })
);
