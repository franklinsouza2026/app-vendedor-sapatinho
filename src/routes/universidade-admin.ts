// Admin — Universidade (Fatia 7.5E, seção 57-60). Só ADMIN. Escolas/
// Competências/Certificações administráveis; PDI tem visão de
// acompanhamento (GERENTE cria/acompanha o próprio time via
// universidade-manager.ts — aqui é a visão ampla do Admin).
import { Router } from 'express';
import { z } from 'zod';
import { Papel, PublicoConteudo, TipoRequisitoCertificacao } from '@prisma/client';
import { requireAuth } from '../middlewares/auth';
import { asyncHandler } from '../middlewares/async-handler';
import { UniversidadeError } from '../universidade/constantes';
import { listarEscolas, criarEscola, atualizarEscola, seedEscolasV1 } from '../universidade/schools.service';
import { listarCompetencias, criarCompetencia, atualizarCompetencia, definirTarget, listarTargets, seedCompetenciasV1 } from '../universidade/competency.service';
import { mapearCompetencias, atribuirEscolaATrilha } from '../universidade/content-mapping.service';
import { criarPDI, buscarPDI, pausarPDI, retomarPDI, cancelarPDI } from '../universidade/pdi.service';
import { prisma } from '../db';
import {
  criarCertificationDefinition,
  listarCertificationDefinitions,
  buscarCertificationDefinition,
  definirRequisitos,
  transicionarCertificationDefinition,
} from '../universidade/certification.service';

export const universidadeAdminRouter = Router();

function tratarErro(err: unknown, res: import('express').Response) {
  if (err instanceof UniversidadeError) {
    const status = err.type === 'not_found' ? 404 : err.type === 'invalid_transition' ? 409 : 400;
    return res.status(status).json({ error: err.message, type: err.type });
  }
  throw err;
}

// ===== Escolas =====

universidadeAdminRouter.get(
  '/admin/universidade/escolas',
  requireAuth('ADMIN'),
  asyncHandler(async (_req, res) => {
    await seedEscolasV1();
    res.json({ escolas: await listarEscolas() });
  })
);

const criarEscolaSchema = z.object({ code: z.string().min(1), name: z.string().min(1), description: z.string().min(1), audience: z.nativeEnum(PublicoConteudo).optional(), sortOrder: z.number().int().optional() });

universidadeAdminRouter.post(
  '/admin/universidade/escolas',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = criarEscolaSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });
    res.status(201).json(await criarEscola(parsed.data, req.auth!.vendedorId));
  })
);

const atualizarEscolaSchema = z.object({ name: z.string().min(1).optional(), description: z.string().min(1).optional(), audience: z.nativeEnum(PublicoConteudo).optional(), sortOrder: z.number().int().optional(), active: z.boolean().optional() });

universidadeAdminRouter.put(
  '/admin/universidade/escolas/:id',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = atualizarEscolaSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });
    try {
      res.json(await atualizarEscola(req.params.id, parsed.data, req.auth!.vendedorId));
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

const atribuirEscolaSchema = z.object({ escolaId: z.string().uuid().nullable() });

universidadeAdminRouter.put(
  '/admin/universidade/trilhas/:trackId/escola',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = atribuirEscolaSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });
    try {
      await atribuirEscolaATrilha(req.params.trackId, parsed.data.escolaId, req.auth!.vendedorId);
      res.status(204).end();
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

// ===== Competências =====

universidadeAdminRouter.get(
  '/admin/universidade/competencias',
  requireAuth('ADMIN'),
  asyncHandler(async (_req, res) => {
    await seedCompetenciasV1();
    res.json({ competencias: await listarCompetencias() });
  })
);

const criarCompetenciaSchema = z.object({ code: z.string().min(1), name: z.string().min(1), description: z.string().min(1), audience: z.nativeEnum(PublicoConteudo).optional(), category: z.string().optional() });

universidadeAdminRouter.post(
  '/admin/universidade/competencias',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = criarCompetenciaSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });
    res.status(201).json(await criarCompetencia(parsed.data, req.auth!.vendedorId));
  })
);

const atualizarCompetenciaSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  audience: z.nativeEnum(PublicoConteudo).optional(),
  category: z.string().optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
});

universidadeAdminRouter.put(
  '/admin/universidade/competencias/:id',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = atualizarCompetenciaSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });
    try {
      res.json(await atualizarCompetencia(req.params.id, parsed.data, req.auth!.vendedorId));
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

universidadeAdminRouter.get(
  '/admin/universidade/competencias/:id/targets',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    res.json({ targets: await listarTargets(req.params.id) });
  })
);

const targetSchema = z.object({ papel: z.nativeEnum(Papel), targetScore: z.number().int().min(1).max(100) });

universidadeAdminRouter.put(
  '/admin/universidade/competencias/:id/targets',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = targetSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });
    try {
      res.json(await definirTarget(req.params.id, parsed.data.papel, parsed.data.targetScore, req.auth!.vendedorId));
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

// ===== Content → Competency mapping =====

const mapearSchema = z.object({ tipo: z.enum(['track', 'lesson', 'question', 'simulation', 'mission']), contentId: z.string().uuid(), competencyIds: z.array(z.string().uuid()) });

universidadeAdminRouter.post(
  '/admin/universidade/mapear',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = mapearSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });
    try {
      await mapearCompetencias(parsed.data.tipo, parsed.data.contentId, parsed.data.competencyIds, req.auth!.vendedorId);
      res.status(204).end();
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

// ===== PDI (visão ampla do Admin) =====

universidadeAdminRouter.get(
  '/admin/universidade/pdi',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const planos = await prisma.developmentPlan.findMany({
      where: status ? { status: status as 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED' } : undefined,
      include: { itens: true, competencia: true },
      orderBy: { startedAt: 'desc' },
      take: 100,
    });
    res.json({ planos });
  })
);

const criarPDIAdminSchema = z.object({
  subjectUserId: z.string().uuid(),
  competencyId: z.string().uuid(),
  targetScore: z.number().int().min(1).max(100),
  targetDate: z.string().datetime().optional(),
  itens: z.array(z.object({ tipo: z.enum(['LESSON', 'TRACK', 'QUIZ', 'SIMULATION', 'MISSION', 'PRACTICE', 'MANAGER_ACTION', 'REVIEW']), sourceId: z.string().optional(), required: z.boolean().optional() })),
});

universidadeAdminRouter.post(
  '/admin/universidade/pdi',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = criarPDIAdminSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos', detalhes: parsed.error.flatten() });
    try {
      const plano = await criarPDI({
        subjectUserId: parsed.data.subjectUserId,
        competencyId: parsed.data.competencyId,
        targetScore: parsed.data.targetScore,
        createdBy: req.auth!.vendedorId,
        targetDate: parsed.data.targetDate ? new Date(parsed.data.targetDate) : undefined,
        itens: parsed.data.itens,
      });
      res.status(201).json(plano);
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

universidadeAdminRouter.get(
  '/admin/universidade/pdi/:id',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    try {
      res.json(await buscarPDI(req.params.id));
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

const TRANSICAO_PDI = z.enum(['pausar', 'retomar', 'cancelar']);
const ACAO_PDI = { pausar: pausarPDI, retomar: retomarPDI, cancelar: cancelarPDI };

universidadeAdminRouter.post(
  '/admin/universidade/pdi/:id/:transicao',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const transicao = TRANSICAO_PDI.safeParse(req.params.transicao);
    if (!transicao.success) return res.status(400).json({ error: 'transição desconhecida' });
    try {
      res.json(await ACAO_PDI[transicao.data](req.params.id, req.auth!.vendedorId));
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

// ===== Certificações =====

universidadeAdminRouter.get(
  '/admin/universidade/certificacoes',
  requireAuth('ADMIN'),
  asyncHandler(async (_req, res) => {
    res.json({ definicoes: await listarCertificationDefinitions() });
  })
);

const criarCertificacaoSchema = z.object({ code: z.string().min(1), name: z.string().min(1), description: z.string().min(1), audience: z.nativeEnum(PublicoConteudo).optional(), validityMonths: z.number().int().positive().optional() });

universidadeAdminRouter.post(
  '/admin/universidade/certificacoes',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = criarCertificacaoSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });
    res.status(201).json(await criarCertificationDefinition(parsed.data, req.auth!.vendedorId));
  })
);

universidadeAdminRouter.get(
  '/admin/universidade/certificacoes/:id',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    try {
      res.json(await buscarCertificationDefinition(req.params.id));
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

const requisitosSchema = z.object({
  requisitos: z.array(z.object({ tipo: z.nativeEnum(TipoRequisitoCertificacao), refId: z.string().optional(), minScore: z.number().int().min(0).max(100).optional() })),
});

universidadeAdminRouter.put(
  '/admin/universidade/certificacoes/:id/requisitos',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const parsed = requisitosSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });
    try {
      res.json(await definirRequisitos(req.params.id, parsed.data.requisitos, req.auth!.vendedorId));
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

const TRANSICAO_CERT = z.enum(['submeter', 'aprovar', 'publicar', 'arquivar']);

universidadeAdminRouter.post(
  '/admin/universidade/certificacoes/:id/:transicao',
  requireAuth('ADMIN'),
  asyncHandler(async (req, res) => {
    const transicao = TRANSICAO_CERT.safeParse(req.params.transicao);
    if (!transicao.success) return res.status(400).json({ error: 'transição desconhecida' });
    try {
      res.json(await transicionarCertificationDefinition(req.params.id, transicao.data, req.auth!.vendedorId));
    } catch (err) {
      tratarErro(err, res);
    }
  })
);
