// Competições — Admin (Fatia 8, seção 45-50/93). Admin cria/agenda/ativa/
// finaliza — nunca aceita winner/finalRank/rewardGranted vindo do corpo da
// requisição (seção 76): tudo isso é derivado internamente.
//
// ATENÇÃO de roteamento Express: rotas literais (`/ligas`, `/:id/finalizar`)
// SEMPRE precisam ser registradas ANTES de rotas com parâmetro genérico no
// mesmo nível (`/:id`, `/:id/:transicao`) — senão o parâmetro genérico
// "engole" o path literal (`GET /admin/competicoes/ligas` bateria em
// `GET /admin/competicoes/:id` com id="ligas", nunca na rota de ligas).
// Achado real desta fatia, coberto por teste de integração.
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middlewares/auth';
import { asyncHandler } from '../middlewares/async-handler';
import { CompeticoesError } from '../competicoes/constantes';
import { criarSeason, listarSeasons, buscarSeason, transicionarSeason } from '../competicoes/seasons.service';
import { finalizarSeasonCompleta } from '../competicoes/season-finalization.service';
import {
  criarCompetition,
  listarCompetitions,
  buscarCompetition,
  atualizarRegrasCompetition,
  transicionarCompetition,
  desqualificarParticipante,
  finalizarCompetition,
  listarParticipantesCompetition,
  listarResultadosCompetition,
} from '../competicoes/competitions.service';
import { listarLigas, criarLiga, atualizarLiga, seedLigasV1 } from '../competicoes/leagues.service';

export const competicoesAdminRouter = Router();

function tratarErro(err: unknown, res: import('express').Response) {
  if (err instanceof CompeticoesError) {
    const status = err.type === 'not_found' ? 404 : err.type === 'invalid_transition' ? 409 : 400;
    return res.status(status).json({ error: err.message, type: err.type });
  }
  throw err;
}

// ===== Seasons =====

const criarSeasonSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  registrationStartsAt: z.string().datetime().optional(),
  registrationEndsAt: z.string().datetime().optional(),
});

competicoesAdminRouter.get(
  '/admin/competicoes/seasons',
  requireAuth('ADMIN'),
  asyncHandler(async (_req, res) => res.json({ seasons: await listarSeasons() }))
);

competicoesAdminRouter.post(
  '/admin/competicoes/seasons',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = criarSeasonSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos', detalhes: parsed.error.flatten() });
    try {
      const season = await criarSeason(
        {
          ...parsed.data,
          startsAt: new Date(parsed.data.startsAt),
          endsAt: new Date(parsed.data.endsAt),
          registrationStartsAt: parsed.data.registrationStartsAt ? new Date(parsed.data.registrationStartsAt) : undefined,
          registrationEndsAt: parsed.data.registrationEndsAt ? new Date(parsed.data.registrationEndsAt) : undefined,
        },
        req.auth!.vendedorId
      );
      res.status(201).json(season);
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

// Literal ANTES do genérico :id/:transicao (ver nota de roteamento no topo).
competicoesAdminRouter.post(
  '/admin/competicoes/seasons/:id/finalizar',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    try {
      res.json(await finalizarSeasonCompleta(req.params.id, req.auth!.vendedorId));
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

competicoesAdminRouter.get(
  '/admin/competicoes/seasons/:id',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    try {
      res.json(await buscarSeason(req.params.id));
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

const transicaoSeasonSchema = z.enum(['agendar', 'ativar', 'cancelar']);

competicoesAdminRouter.post(
  '/admin/competicoes/seasons/:id/:transicao',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = transicaoSeasonSchema.safeParse(req.params.transicao);
    if (!parsed.success) return res.status(400).json({ error: 'transição inválida' });
    try {
      res.json(await transicionarSeason(req.params.id, parsed.data, req.auth!.vendedorId));
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

// ===== Leagues (literais — precisam vir antes de /admin/competicoes/:id) =====

competicoesAdminRouter.get(
  '/admin/competicoes/ligas',
  requireAuth('ADMIN'),
  asyncHandler(async (_req, res) => {
    await seedLigasV1();
    res.json({ ligas: await listarLigas() });
  })
);

const criarLigaSchema = z.object({ code: z.string().min(1), name: z.string().min(1), sortOrder: z.number().int(), promotionThreshold: z.number().int().min(0).optional(), relegationThreshold: z.number().int().min(0).optional() });

competicoesAdminRouter.post(
  '/admin/competicoes/ligas',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = criarLigaSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });
    res.status(201).json(await criarLiga(parsed.data, req.auth!.vendedorId));
  })
);

const atualizarLigaSchema = z.object({ name: z.string().min(1).optional(), sortOrder: z.number().int().optional(), promotionThreshold: z.number().int().min(0).optional(), relegationThreshold: z.number().int().min(0).optional(), active: z.boolean().optional() });

competicoesAdminRouter.put(
  '/admin/competicoes/ligas/:id',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = atualizarLigaSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });
    res.json(await atualizarLiga(req.params.id, parsed.data, req.auth!.vendedorId));
  })
);

// ===== Competitions =====

const criarCompetitionSchema = z.object({
  seasonId: z.string().uuid().optional(),
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  participantType: z.enum(['SELLER', 'STORE']),
  metricType: z.enum(['GOAL_ATTAINMENT', 'PERSONAL_IMPROVEMENT', 'SCORE_GERAL', 'PA', 'TICKET_MEDIO', 'TRAINING', 'COMPETENCY_EVOLUTION', 'MISSION_COMPLETION', 'CONSISTENCY', 'CUSTOM_RULE']),
  competencyId: z.string().uuid().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  minDiasAtivos: z.number().int().positive().optional(),
  rewardXp: z.number().int().min(0).optional(),
  rewardMoedas: z.number().int().min(0).optional(),
  rewardBadgeCodigo: z.string().optional(),
});

competicoesAdminRouter.get(
  '/admin/competicoes',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === 'string' ? (req.query.status as never) : undefined;
    res.json({ competicoes: await listarCompetitions(status) });
  })
);

competicoesAdminRouter.post(
  '/admin/competicoes',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = criarCompetitionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos', detalhes: parsed.error.flatten() });
    try {
      const competicao = await criarCompetition({ ...parsed.data, startsAt: new Date(parsed.data.startsAt), endsAt: new Date(parsed.data.endsAt) }, req.auth!.vendedorId);
      res.status(201).json(competicao);
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

// Literais (finalizar/desqualificar/resultados) ANTES dos genéricos
// (:id, :id/:transicao) — mesma nota de roteamento do topo do arquivo.
competicoesAdminRouter.post(
  '/admin/competicoes/:id/finalizar',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    try {
      res.json(await finalizarCompetition(req.params.id, req.auth!.vendedorId));
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

const desqualificarSchema = z.object({ participantId: z.string().uuid(), motivo: z.string().min(1) });

competicoesAdminRouter.post(
  '/admin/competicoes/:id/desqualificar',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = desqualificarSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });
    try {
      await desqualificarParticipante(req.params.id, parsed.data.participantId, parsed.data.motivo, req.auth!.vendedorId);
      res.status(204).send();
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

competicoesAdminRouter.get(
  '/admin/competicoes/:id/resultados',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    res.json({ resultados: await listarResultadosCompetition(req.params.id) });
  })
);

competicoesAdminRouter.get(
  '/admin/competicoes/:id',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    try {
      const [competicao, participantes] = await Promise.all([buscarCompetition(req.params.id), listarParticipantesCompetition(req.params.id)]);
      res.json({ competicao, participantes });
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

const atualizarRegrasSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  minDiasAtivos: z.number().int().positive().optional(),
  rewardXp: z.number().int().min(0).optional(),
  rewardMoedas: z.number().int().min(0).optional(),
  rewardBadgeCodigo: z.string().optional(),
});

competicoesAdminRouter.put(
  '/admin/competicoes/:id',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = atualizarRegrasSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });
    try {
      res.json(await atualizarRegrasCompetition(req.params.id, parsed.data, req.auth!.vendedorId));
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

const transicaoCompetitionSchema = z.enum(['agendar', 'ativar', 'cancelar']);

competicoesAdminRouter.post(
  '/admin/competicoes/:id/:transicao',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = transicaoCompetitionSchema.safeParse(req.params.transicao);
    if (!parsed.success) return res.status(400).json({ error: 'transição inválida' });
    try {
      res.json(await transicionarCompetition(req.params.id, parsed.data, req.auth!.vendedorId));
    } catch (err) {
      tratarErro(err, res);
    }
  })
);
