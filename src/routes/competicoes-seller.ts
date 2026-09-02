// Competições — vendedor/gerente autenticado (Fatia 8, seção 52/85). Sempre
// req.auth, nunca id do corpo/query — mesmo padrão da Universidade (7.5E).
import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { asyncHandler } from '../middlewares/async-handler';
import { prisma } from '../db';
import { CompeticoesError } from '../competicoes/constantes';
import { listarSeasons, buscarSeason, rankingSeason } from '../competicoes/seasons.service';
import { listarMinhasCompetitionsElegiveis, buscarCompetition, calcularRankingCompetition, listarResultadosCompetition } from '../competicoes/competitions.service';
import { ligaAtualDoParticipante, listarLigas } from '../competicoes/leagues.service';
import { listarFeed } from '../competicoes/feed.service';
import { listarReconhecimentosRecebidos } from '../competicoes/recognition.service';

export const competicoesSellerRouter = Router();

function tratarErro(err: unknown, res: import('express').Response) {
  if (err instanceof CompeticoesError) {
    const status = err.type === 'not_found' ? 404 : err.type === 'forbidden' ? 403 : 400;
    return res.status(status).json({ error: err.message, type: err.type });
  }
  throw err;
}

competicoesSellerRouter.get(
  '/temporadas/atual',
  requireAuth(),
  asyncHandler(async (_req, res) => {
    const seasons = await listarSeasons();
    res.json({ season: seasons.find((s) => s.status === 'ACTIVE') ?? null });
  })
);

// Ranking de Season Points (seção 43/44) — nunca faturamento bruto, só
// pontos acumulados dentro da temporada; nome resolvido aqui (mesmo padrão
// de privacidade do Ranking existente, gamificacao/ranking.service.ts).
competicoesSellerRouter.get(
  '/temporadas/:id/ranking',
  requireAuth(),
  asyncHandler(async (req, res) => {
    try {
      await buscarSeason(req.params.id); // 404 se não existir, nunca revela detalhe além disso
      const ranking = await rankingSeason(req.params.id, 'SELLER');
      const vendedores = await prisma.vendedor.findMany({ where: { id: { in: ranking.map((r) => r.participantId) } }, select: { id: true, nome: true } });
      const nomePorId = new Map(vendedores.map((v) => [v.id, v.nome]));
      res.json({ ranking: ranking.map((r) => ({ ...r, nomeVendedor: nomePorId.get(r.participantId) ?? '—' })) });
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

competicoesSellerRouter.get(
  '/competicoes',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const participacoes = await listarMinhasCompetitionsElegiveis(req.auth!.vendedorId);
    res.json({ competicoes: participacoes.map((p) => ({ ...p.competicao, minhaParticipacao: { status: p.status, enrolledAt: p.enrolledAt } })) });
  })
);

competicoesSellerRouter.get(
  '/competicoes/:id',
  requireAuth(),
  asyncHandler(async (req, res) => {
    try {
      const competicao = await buscarCompetition(req.params.id);
      const ranking = competicao.status === 'FINISHED' ? await listarResultadosCompetition(competicao.id) : await calcularRankingCompetition(competicao.id);
      res.json({ competicao, ranking });
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

competicoesSellerRouter.get(
  '/ligas',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const [ligas, minhaLiga] = await Promise.all([listarLigas(), ligaAtualDoParticipante('SELLER', req.auth!.vendedorId)]);
    res.json({ ligas, minhaLiga });
  })
);

competicoesSellerRouter.get(
  '/feed',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const limite = Math.min(Number(req.query.limite) || 20, 50);
    res.json(await listarFeed(req.auth!.lojaId, { limite, cursor: typeof req.query.cursor === 'string' ? req.query.cursor : undefined }));
  })
);

competicoesSellerRouter.get(
  '/reconhecimentos',
  requireAuth(),
  asyncHandler(async (req, res) => {
    res.json({ reconhecimentos: await listarReconhecimentosRecebidos(req.auth!.vendedorId) });
  })
);
