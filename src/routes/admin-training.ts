// Admin — Central de Treinamento (Fatia 7.5C): CMS de trilhas/aulas/quizzes/
// banco de questões/13 Mandamentos. Só ADMIN — GERENTE/VENDEDOR não editam
// conteúdo oficial (seção 54). Catálogo é global (não por empresa — ver
// schema), então nenhuma rota aqui filtra por req.auth.empresaId; a
// autorização em si (só ADMIN chega aqui) já é o controle de acesso.
import { Router } from 'express';
import { z } from 'zod';
import { PublicoConteudo, TipoConteudoAula, DificuldadeQuestao } from '@prisma/client';
import { requireAuth } from '../middlewares/auth';
import { asyncHandler } from '../middlewares/async-handler';
import { IdentidadeError } from '../identidade/erros';
import {
  atualizarAula,
  atualizarTrilha,
  criarAula,
  criarTrilha,
  dashboardTreinamento,
  listarAulasAdmin,
  listarTrilhasAdmin,
  transicionarAula,
  transicionarTrilha,
} from '../academia/admin-content.service';
import {
  atualizarBlueprintQuiz,
  arquivarQuestao,
  atualizarQuestao,
  criarQuestao,
  definirQuizDaAula,
  listarQuestoesDoQuiz,
} from '../academia/question-bank.service';
import {
  atualizarMandamento,
  checarCompletudeMandamentos,
  listarMandamentosAdmin,
  publicarMandamento,
  seedEstruturaMandamentos,
} from '../academia/mandamentos.service';

export const adminTrainingRouter = Router();

function tratarErro(err: unknown, res: import('express').Response) {
  if (err instanceof IdentidadeError) return res.status(err.status).json({ error: err.message, type: err.type });
  throw err;
}

const TRANSICAO = z.enum(['submeter', 'aprovar', 'publicar', 'arquivar']);

adminTrainingRouter.get(
  '/admin/training/overview',
  requireAuth('ADMIN'),
  asyncHandler(async (_req, res) => {
    res.json(await dashboardTreinamento());
  })
);

// ===== Trilhas =====

const criarTrilhaSchema = z.object({
  code: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  audience: z.nativeEnum(PublicoConteudo).optional(),
  sortOrder: z.number().int().optional(),
});

adminTrainingRouter.get(
  '/admin/training/tracks',
  requireAuth('ADMIN'),
  asyncHandler(async (_req, res) => {
    res.json({ trilhas: await listarTrilhasAdmin() });
  })
);

adminTrainingRouter.post(
  '/admin/training/tracks',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = criarTrilhaSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos', detalhes: parsed.error.flatten() });
    try {
      res.status(201).json(await criarTrilha(parsed.data, req.auth!.vendedorId));
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

const atualizarTrilhaSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  audience: z.nativeEnum(PublicoConteudo).optional(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
});

adminTrainingRouter.put(
  '/admin/training/tracks/:id',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = atualizarTrilhaSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });
    try {
      res.json(await atualizarTrilha(req.params.id, parsed.data, req.auth!.vendedorId));
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

adminTrainingRouter.post(
  '/admin/training/tracks/:id/:transicao',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const transicao = TRANSICAO.safeParse(req.params.transicao);
    if (!transicao.success) return res.status(400).json({ error: 'transição desconhecida' });
    try {
      res.json(await transicionarTrilha(req.params.id, transicao.data, req.auth!.vendedorId));
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

// ===== Aulas =====

const criarAulaSchema = z.object({
  trackId: z.string().uuid(),
  code: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  content: z.string().min(1),
  estimatedMinutes: z.number().int().positive(),
  audience: z.nativeEnum(PublicoConteudo).optional(),
  tipoConteudo: z.nativeEnum(TipoConteudoAula).optional(),
  videoUrl: z.string().url().optional(),
  materialUrl: z.string().url().optional(),
  sortOrder: z.number().int().optional(),
});

adminTrainingRouter.get(
  '/admin/training/lessons',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const trackId = typeof req.query.trackId === 'string' ? req.query.trackId : undefined;
    res.json({ aulas: await listarAulasAdmin(trackId) });
  })
);

adminTrainingRouter.post(
  '/admin/training/lessons',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = criarAulaSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos', detalhes: parsed.error.flatten() });
    try {
      res.status(201).json(await criarAula(parsed.data, req.auth!.vendedorId));
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

const atualizarAulaSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  estimatedMinutes: z.number().int().positive().optional(),
  audience: z.nativeEnum(PublicoConteudo).optional(),
  tipoConteudo: z.nativeEnum(TipoConteudoAula).optional(),
  videoUrl: z.string().url().nullable().optional(),
  materialUrl: z.string().url().nullable().optional(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
});

adminTrainingRouter.put(
  '/admin/training/lessons/:id',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = atualizarAulaSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });
    try {
      res.json(await atualizarAula(req.params.id, parsed.data, req.auth!.vendedorId));
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

adminTrainingRouter.post(
  '/admin/training/lessons/:id/:transicao',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const transicao = TRANSICAO.safeParse(req.params.transicao);
    if (!transicao.success) return res.status(400).json({ error: 'transição desconhecida' });
    try {
      res.json(await transicionarAula(req.params.id, transicao.data, req.auth!.vendedorId));
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

// ===== Quiz + Banco de questões =====

const quizSchema = z.object({ passingScore: z.number().int().min(1).max(100).optional(), questionsPerAttempt: z.number().int().positive().nullable().optional() });

adminTrainingRouter.put(
  '/admin/training/lessons/:id/quiz',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = quizSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });
    res.json(await definirQuizDaAula(req.params.id, parsed.data, req.auth!.vendedorId));
  })
);

adminTrainingRouter.put(
  '/admin/training/quizzes/:quizId/blueprint',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = z.object({ questionsPerAttempt: z.number().int().positive().nullable() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });
    res.json(await atualizarBlueprintQuiz(req.params.quizId, parsed.data.questionsPerAttempt, req.auth!.vendedorId));
  })
);

adminTrainingRouter.get(
  '/admin/training/quizzes/:quizId/questions',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    res.json({ questoes: await listarQuestoesDoQuiz(req.params.quizId) });
  })
);

const opcaoSchema = z.object({ text: z.string().min(1), correct: z.boolean() });
const criarQuestaoSchema = z.object({
  quizId: z.string().uuid(),
  question: z.string().min(1),
  difficulty: z.nativeEnum(DificuldadeQuestao).optional(),
  topic: z.string().optional(),
  sourceContentId: z.string().optional(),
  sortOrder: z.number().int().optional(),
  opcoes: z.array(opcaoSchema).min(2),
});

adminTrainingRouter.post(
  '/admin/training/questions',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = criarQuestaoSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos', detalhes: parsed.error.flatten() });
    try {
      res.status(201).json(await criarQuestao(parsed.data, req.auth!.vendedorId));
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

const atualizarQuestaoSchema = z.object({
  question: z.string().min(1).optional(),
  difficulty: z.nativeEnum(DificuldadeQuestao).optional(),
  topic: z.string().optional(),
  sortOrder: z.number().int().optional(),
  opcoes: z.array(opcaoSchema).min(2).optional(),
});

adminTrainingRouter.put(
  '/admin/training/questions/:id',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = atualizarQuestaoSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });
    try {
      res.json(await atualizarQuestao(req.params.id, parsed.data, req.auth!.vendedorId));
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

adminTrainingRouter.delete(
  '/admin/training/questions/:id',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    await arquivarQuestao(req.params.id, req.auth!.vendedorId);
    res.status(204).end();
  })
);

// ===== 13 Mandamentos =====

adminTrainingRouter.get(
  '/admin/training/mandamentos',
  requireAuth('ADMIN'),
  asyncHandler(async (_req, res) => {
    await seedEstruturaMandamentos();
    const [mandamentos, completude] = await Promise.all([listarMandamentosAdmin(), checarCompletudeMandamentos()]);
    res.json({ mandamentos, completude });
  })
);

const atualizarMandamentoSchema = z.object({
  titulo: z.string().min(1).optional(),
  conteudoOficial: z.string().min(1).optional(),
  explicacaoOpcional: z.string().optional(),
  exemploOpcional: z.string().optional(),
});

adminTrainingRouter.put(
  '/admin/training/mandamentos/:numero',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const numero = Number(req.params.numero);
    if (!Number.isInteger(numero) || numero < 1 || numero > 13) return res.status(400).json({ error: 'número de mandamento inválido (1-13)' });
    const parsed = atualizarMandamentoSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });
    try {
      res.json(await atualizarMandamento(numero, parsed.data, req.auth!.vendedorId));
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

adminTrainingRouter.post(
  '/admin/training/mandamentos/:numero/publish',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const numero = Number(req.params.numero);
    if (!Number.isInteger(numero) || numero < 1 || numero > 13) return res.status(400).json({ error: 'número de mandamento inválido (1-13)' });
    try {
      res.json(await publicarMandamento(numero, req.auth!.vendedorId));
    } catch (err) {
      tratarErro(err, res);
    }
  })
);
