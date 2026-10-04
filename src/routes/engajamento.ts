// Engajamento — acesso diário (check-in), painel de adoção e configuração da
// recompensa. Escopo SEMPRE resolvido no servidor a partir do token + banco:
//   VENDEDOR → só os próprios dados (nenhum id aceito do cliente);
//   GERENTE  → só a loja dele (a loja vem do banco, não do token nem da query);
//   ADMIN    → só a empresa dele (lojaId/vendedorId do filtro precisam
//              pertencer à empresa, senão 404 — não revela existência).
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth } from '../middlewares/auth';
import { asyncHandler } from '../middlewares/async-handler';
import { AcessoNaoPermitidoError, registrarAcesso } from '../engajamento/acesso.service';
import { MAXIMO_POR_ACESSO, obterConfigRecompensa, salvarConfigRecompensa } from '../engajamento/config.service';
import { montarMeuEngajamento, montarPainel, PeriodoInvalidoError, type EscopoPainel } from '../engajamento/painel.service';

export const engajamentoRouter = Router();

// O cliente NÃO envia data, valor nem "primeiro acesso": só avisa que abriu o
// app. Dia, recompensa e idempotência são decididos aqui.
engajamentoRouter.post(
  '/engajamento/acesso',
  requireAuth('VENDEDOR'),
  asyncHandler(async (req, res) => {
    try {
      res.json(await registrarAcesso(req.auth!.vendedorId));
    } catch (err) {
      if (err instanceof AcessoNaoPermitidoError) return res.status(403).json({ error: err.message });
      throw err;
    }
  })
);

engajamentoRouter.get(
  '/engajamento/meu',
  requireAuth('VENDEDOR'),
  asyncHandler(async (req, res) => {
    res.json(await montarMeuEngajamento(req.auth!.vendedorId));
  })
);

const diaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const painelQuerySchema = z.object({
  periodo: z.enum(['HOJE', 'SEMANA_ATUAL', 'ULTIMOS_7', 'SEMANA_PASSADA', 'ULTIMOS_30', 'PERSONALIZADO']).default('SEMANA_ATUAL'),
  de: diaSchema.optional(),
  ate: diaSchema.optional(),
  lojaId: z.string().uuid().optional(),
  vendedorId: z.string().uuid().optional(),
});

engajamentoRouter.get(
  '/engajamento/painel',
  requireAuth('ADMIN', 'GERENTE'),
  asyncHandler(async (req, res) => {
    const parsed = painelQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: 'parâmetros inválidos' });
    const filtros = parsed.data;
    const { empresaId, vendedorId: atorId, papel } = req.auth!;

    let escopo: EscopoPainel;
    if (papel === 'GERENTE') {
      // Loja do gerente vem do BANCO (realocação recente vale na hora).
      const gerente = await prisma.vendedor.findUniqueOrThrow({ where: { id: atorId }, select: { lojaId: true } });
      if (filtros.lojaId && filtros.lojaId !== gerente.lojaId) return res.status(403).json({ error: 'loja fora do seu escopo' });
      escopo = { empresaId, lojaIds: [gerente.lojaId] };
    } else {
      escopo = { empresaId, lojaIds: null };
      if (filtros.lojaId) {
        const loja = await prisma.loja.findFirst({ where: { id: filtros.lojaId, empresaId }, select: { id: true } });
        if (!loja) return res.status(404).json({ error: 'loja não encontrada' });
      }
    }
    if (filtros.vendedorId) {
      const alvo = await prisma.vendedor.findFirst({ where: { id: filtros.vendedorId, empresaId, ...(escopo.lojaIds ? { lojaId: { in: escopo.lojaIds } } : {}) }, select: { id: true } });
      if (!alvo) return res.status(404).json({ error: 'vendedor não encontrado' });
    }

    try {
      res.json(await montarPainel(escopo, filtros));
    } catch (err) {
      if (err instanceof PeriodoInvalidoError) return res.status(400).json({ error: err.message });
      throw err;
    }
  })
);

// Configuração da recompensa diária — só ADMIN, só da própria empresa.
engajamentoRouter.get(
  '/admin/engajamento/config',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    res.json(await obterConfigRecompensa(req.auth!.empresaId));
  })
);

const configSchema = z.object({
  ativo: z.boolean(),
  xp: z.number().int().min(0).max(MAXIMO_POR_ACESSO),
  moedas: z.number().int().min(0).max(MAXIMO_POR_ACESSO),
});

engajamentoRouter.put(
  '/admin/engajamento/config',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = configSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: `valores inválidos: XP e VendaCoins devem ser inteiros entre 0 e ${MAXIMO_POR_ACESSO}` });
    res.json(await salvarConfigRecompensa(req.auth!.empresaId, req.auth!.vendedorId, parsed.data));
  })
);
