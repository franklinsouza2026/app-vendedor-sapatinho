// Admin Foundation (Fatia 7.5A, seções 35-42). Toda rota exige ADMIN, exceto
// listagem/detalhe de vendedores (também liberado pro GERENTE, escopado à
// própria loja — seção 37/43). empresaId/lojaId sempre de req.auth, nunca do
// client. Nenhuma rota de escrita sobre AuditEvent é exposta (append-only).
import { Router } from 'express';
import { z } from 'zod';
import { Papel, StatusConta } from '@prisma/client';
import { prisma } from '../db';
import { requireAuth } from '../middlewares/auth';
import { asyncHandler } from '../middlewares/async-handler';
import { preAutorizarVendedor } from '../identidade/ativacao.service';
import {
  bloquearVendedor,
  desbloquearVendedor,
  desligarVendedor,
  desvincularIdentidadeExterna,
  detalharVendedor,
  listarVendedores,
  reativarVendedor,
  realocarVendedor,
  vincularIdentidadeExterna,
} from '../identidade/admin.service';
import { listarEventosAuditoria } from '../identidade/auditoria.service';
import { IdentidadeError } from '../identidade/erros';

export const adminRouter = Router();

function lojaRestritaDe(req: { auth?: { papel: string; lojaId: string } }): string | undefined {
  return req.auth!.papel === 'GERENTE' ? req.auth!.lojaId : undefined;
}

function tratarErro(err: unknown, res: import('express').Response) {
  if (err instanceof IdentidadeError) return res.status(err.status).json({ error: err.message, type: err.type });
  throw err;
}

const listarQuerySchema = z.object({
  status: z.nativeEnum(StatusConta).optional(),
  papel: z.nativeEnum(Papel).optional(),
  busca: z.string().optional(),
});

adminRouter.get(
  '/admin/vendedores',
  requireAuth('ADMIN', 'GERENTE'),
  asyncHandler(async (req, res) => {
    const parsed = listarQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'parâmetros inválidos' });

    const vendedores = await listarVendedores({
      empresaId: req.auth!.empresaId,
      lojaIdRestrita: lojaRestritaDe(req),
      ...parsed.data,
    });
    res.json({ vendedores });
  })
);

const preAutorizarSchema = z.object({
  lojaId: z.string().uuid(),
  matriculaErp: z.string().min(1),
  nome: z.string().min(1),
  cpf: z.string().min(1),
  papel: z.enum(['VENDEDOR', 'GERENTE', 'ADMIN']).default('VENDEDOR'),
});

// Só ADMIN pré-autoriza (não GERENTE) — criar identidade/conceder papel é
// uma ação de maior privilégio que só listar/ver a própria equipe.
adminRouter.post(
  '/admin/vendedores',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = preAutorizarSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos', detalhes: parsed.error.flatten() });

    const loja = await prisma.loja.findUnique({ where: { id: parsed.data.lojaId } });
    if (!loja || loja.empresaId !== req.auth!.empresaId) {
      return res.status(403).json({ error: 'loja fora do escopo da empresa do usuário logado' });
    }

    try {
      const { vendedor, tokenAtivacao, expiraEm } = await preAutorizarVendedor({
        ...parsed.data,
        empresaId: req.auth!.empresaId,
        actorId: req.auth!.vendedorId,
      });
      // tokenAtivacao só existe nesta resposta — nunca é persistido em claro
      // nem logado (pino-http não loga corpo de resposta, só status/headers).
      res.status(201).json({
        id: vendedor.id,
        nome: vendedor.nome,
        status: vendedor.status,
        tokenAtivacao,
        expiraEm,
      });
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

adminRouter.get(
  '/admin/vendedores/:id',
  requireAuth('ADMIN', 'GERENTE'),
  asyncHandler(async (req, res) => {
    try {
      const vendedor = await detalharVendedor(req.params.id, req.auth!.empresaId, lojaRestritaDe(req));
      res.json(vendedor);
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

function rotaTransicao(caminho: string, executar: typeof bloquearVendedor) {
  adminRouter.post(
    `/admin/vendedores/:id/${caminho}`,
    requireAuth('ADMIN'),
    asyncHandler(async (req, res) => {
      try {
        const resultado = await executar(req.params.id, req.auth!.empresaId, req.auth!.vendedorId);
        res.json(resultado);
      } catch (err) {
        tratarErro(err, res);
      }
    })
  );
}

rotaTransicao('bloquear', bloquearVendedor);
rotaTransicao('desbloquear', desbloquearVendedor);
rotaTransicao('desligar', desligarVendedor);
rotaTransicao('reativar', reativarVendedor);

const realocarSchema = z.object({ novaLojaId: z.string().uuid() });

adminRouter.post(
  '/admin/vendedores/:id/realocar',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = realocarSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });
    try {
      const resultado = await realocarVendedor(req.params.id, parsed.data.novaLojaId, req.auth!.empresaId, req.auth!.vendedorId);
      res.json(resultado);
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

// Estrutura da Empresa (Fatia 9.6, seção 10) — Loja -> Gerente(s) ->
// Vendedor(es), montado em memória a partir de `listarVendedores` (já
// escopado por empresa) — nunca uma segunda fonte de verdade de vínculo.
adminRouter.get(
  '/admin/estrutura',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const [lojas, vendedores] = await Promise.all([
      prisma.loja.findMany({ where: { empresaId: req.auth!.empresaId }, select: { id: true, nome: true, codigoErp: true }, orderBy: { nome: 'asc' } }),
      listarVendedores({ empresaId: req.auth!.empresaId }),
    ]);

    const estrutura = lojas.map((loja) => {
      const daLoja = vendedores.filter((v) => v.loja.id === loja.id);
      return {
        loja: { id: loja.id, nome: loja.nome, codigoErp: loja.codigoErp },
        gerentes: daLoja.filter((v) => v.papel === 'GERENTE').map((v) => ({ id: v.id, nome: v.nome, status: v.status })),
        vendedores: daLoja.filter((v) => v.papel === 'VENDEDOR').map((v) => ({ id: v.id, nome: v.nome, status: v.status })),
      };
    });

    res.json({ estrutura });
  })
);

const identidadeExternaSchema = z.object({
  provider: z.literal('LINX'),
  externalSellerId: z.string().optional(),
  externalEmployeeId: z.string().optional(),
  externalStoreId: z.string().optional(),
  matchMethod: z.enum(['CPF', 'EXTERNAL_ID', 'SELLER_CODE', 'MANUAL']),
});

adminRouter.post(
  '/admin/vendedores/:id/identidade-externa',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = identidadeExternaSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });

    try {
      const identidade = await vincularIdentidadeExterna({
        ...parsed.data,
        vendedorId: req.params.id,
        empresaId: req.auth!.empresaId,
        actorId: req.auth!.vendedorId,
      });
      res.status(201).json(identidade);
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

adminRouter.delete(
  '/admin/vendedores/:id/identidade-externa/:provider',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    if (req.params.provider !== 'LINX') return res.status(400).json({ error: 'provider desconhecido' });
    try {
      await desvincularIdentidadeExterna(req.params.id, req.auth!.empresaId, 'LINX', req.auth!.vendedorId);
      res.status(204).end();
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

const auditoriaQuerySchema = z.object({
  limite: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().uuid().optional(),
});

adminRouter.get(
  '/admin/auditoria',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = auditoriaQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'parâmetros inválidos' });

    const resultado = await listarEventosAuditoria(req.auth!.empresaId, parsed.data);
    res.json(resultado);
  })
);
