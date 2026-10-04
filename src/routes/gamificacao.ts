// APIs de gamificação (seção 46, "APIs" da fonte de verdade). Toda rota
// resolve dados a partir de req.auth (JWT) — nunca de um id vindo do client
// pra dado privado, o que elimina IDOR estruturalmente (não por validação
// pontual). Ranking usa empresaId/lojaId sempre do token, nunca do client,
// pra impedir spoofing/vazamento entre tenants.
import { Router } from 'express';
import { z } from 'zod';
import { EscopoRanking, PeriodoMeta, TipoRanking } from '@prisma/client';
import { prisma } from '../db';
import { requireAuth } from '../middlewares/auth';
import { getSaldoMoedas, getTotalXp } from '../gamificacao/ledger.service';
import { calcularNivel } from '../gamificacao/niveis';
import { getRanking } from '../gamificacao/ranking.service';

export const gamificacaoRouter = Router();

gamificacaoRouter.get('/gamificacao/carteira', requireAuth(), async (req, res) => {
  const vendedorId = req.auth!.vendedorId;
  const [saldoMoedas, xpTotal] = await Promise.all([getSaldoMoedas(vendedorId), getTotalXp(vendedorId)]);
  res.json({ saldoMoedas, xp: xpTotal, nivel: calcularNivel(xpTotal) });
});

const paginacaoSchema = z.object({
  limite: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().uuid().optional(),
});

gamificacaoRouter.get('/gamificacao/extrato-moedas', requireAuth(), async (req, res) => {
  const parsed = paginacaoSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'parâmetros inválidos' });

  const { limite, cursor } = parsed.data;
  const transacoes = await prisma.moedaTransacao.findMany({
    where: { vendedorId: req.auth!.vendedorId },
    // tiebreaker por id: o motor grava vários tiers com o mesmo ocorridoEm
    // exato (mesma chamada de avaliarMetaDiaria) — sem 2º critério de
    // ordenação, a paginação por cursor pode pular ou repetir linhas empatadas.
    orderBy: [{ ocorridoEm: 'desc' }, { id: 'desc' }],
    take: limite,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  });

  res.json({ transacoes, proximoCursor: transacoes.length === limite ? transacoes[transacoes.length - 1].id : null });
});

// "Meus ganhos": XP e VendaCoins lado a lado, só transações REAIS dos dois
// ledgers (nada inventado). Lançamentos do mesmo evento (mesma
// idempotencyKey, ex.: check-in diário) aparecem numa linha só. As moedas
// continuam somando só no ledger de moedas e o XP só no de XP — a junção é de
// EXIBIÇÃO, nunca de saldo.
gamificacaoRouter.get('/gamificacao/meus-ganhos', requireAuth(), async (req, res) => {
  const vendedorId = req.auth!.vendedorId;
  const [xps, moedas] = await Promise.all([
    prisma.xpTransacao.findMany({ where: { vendedorId }, orderBy: [{ ocorridoEm: 'desc' }, { id: 'desc' }], take: 60 }),
    prisma.moedaTransacao.findMany({ where: { vendedorId }, orderBy: [{ ocorridoEm: 'desc' }, { id: 'desc' }], take: 60 }),
  ]);
  const itens = new Map<string, { chave: string; tipoEvento: string; referenciaTipo: string | null; ocorridoEm: Date; xp: number; moedas: number }>();
  for (const t of xps) itens.set(t.idempotencyKey, { chave: t.idempotencyKey, tipoEvento: t.tipoEvento, referenciaTipo: t.referenciaTipo, ocorridoEm: t.ocorridoEm, xp: t.quantidade, moedas: 0 });
  for (const t of moedas) {
    const existente = itens.get(t.idempotencyKey);
    if (existente) existente.moedas += t.valor;
    else itens.set(t.idempotencyKey, { chave: t.idempotencyKey, tipoEvento: t.tipoEvento, referenciaTipo: t.referenciaTipo, ocorridoEm: t.ocorridoEm, xp: 0, moedas: t.valor });
  }
  const lista = [...itens.values()].sort((a, b) => b.ocorridoEm.getTime() - a.ocorridoEm.getTime()).slice(0, 60);
  res.json({ itens: lista.map((i) => ({ ...i, ocorridoEm: i.ocorridoEm.toISOString() })) });
});

gamificacaoRouter.get('/gamificacao/streak', requireAuth(), async (req, res) => {
  const streak = await prisma.streakVendedor.findUnique({ where: { vendedorId: req.auth!.vendedorId } });
  res.json(streak ?? { streakAtual: 0, maiorStreak: 0, ultimaDataContada: null });
});

gamificacaoRouter.get('/gamificacao/badges', requireAuth(), async (req, res) => {
  const badges = await prisma.badgeConcessao.findMany({
    where: { vendedorId: req.auth!.vendedorId },
    include: { badge: true },
    orderBy: { concedidoEm: 'desc' },
  });
  res.json(badges.map((b) => ({ ...b.badge, concedidoEm: b.concedidoEm })));
});

const rankingQuerySchema = z.object({
  tipo: z.nativeEnum(TipoRanking).default('SCORE_GERAL'),
  escopo: z.nativeEnum(EscopoRanking).default('LOJA'),
  periodo: z.nativeEnum(PeriodoMeta).default('DIA'),
});

gamificacaoRouter.get('/gamificacao/ranking', requireAuth(), async (req, res) => {
  const parsed = rankingQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'parâmetros inválidos', detalhes: parsed.error.flatten() });

  const { tipo, escopo, periodo } = parsed.data;
  // lojaId/empresaId sempre do token — nunca aceitos do client (evita cross-tenant leak).
  const lojaId = escopo === 'LOJA' ? req.auth!.lojaId : null;

  const ranking = await getRanking(req.auth!.empresaId, escopo, lojaId, tipo, periodo, req.auth!.vendedorId);
  res.json({ tipo, escopo, periodo, ranking });
});
