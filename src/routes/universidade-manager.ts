// Universidade — Manager (Fatia 7.5E, seção 61/67). GERENTE só acessa
// vendedores da PRÓPRIA loja (mesmo raciocínio de lojaRestritaDe, Fatia
// 7.5A); ADMIN vê qualquer loja. GERENTE nunca edita Content/Competency
// global/target/certificação nem emite certificado (isso é Admin/backend).
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth } from '../middlewares/auth';
import { asyncHandler } from '../middlewares/async-handler';
import { UniversidadeError } from '../universidade/constantes';
import { garantirVendedorNoEscopoDoGerente } from '../universidade/manager-scope.service';
import { calcularMatrizCompetencias } from '../universidade/score-engine.service';
import { listarPDIsDoUsuario, criarPDI } from '../universidade/pdi.service';
import { registrarAvaliacaoGerente, listarAvaliacoesDoUsuario } from '../universidade/manager-assessment.service';
import { sugerirSequenciaDeAprendizado } from '../universidade/ai-recommendation.service';
import { AIProviderError } from '../ai-platform/providers';

export const universidadeManagerRouter = Router();

function tratarErro(err: unknown, res: import('express').Response) {
  if (err instanceof UniversidadeError) {
    const status = err.type === 'not_found' ? 404 : err.type === 'forbidden' ? 403 : err.type === 'invalid_reference' ? 400 : 400;
    return res.status(status).json({ error: err.message, type: err.type });
  }
  if (err instanceof AIProviderError) return res.status(503).json({ error: 'IA indisponível no momento', type: 'provider_unavailable' });
  throw err;
}

function lojaRestritaDe(req: { auth?: { papel: string; lojaId: string } }): string | undefined {
  return req.auth!.papel === 'GERENTE' ? req.auth!.lojaId : undefined;
}

universidadeManagerRouter.get(
  '/universidade/equipe',
  requireAuth('ADMIN', 'GERENTE'),
  asyncHandler(async (req, res) => {
    const vendedores = await prisma.vendedor.findMany({
      where: { empresaId: req.auth!.empresaId, papel: 'VENDEDOR', status: 'ACTIVE', ...(lojaRestritaDe(req) ? { lojaId: lojaRestritaDe(req) } : {}) },
      select: { id: true, nome: true, matriculaErp: true },
      orderBy: { nome: 'asc' },
    });
    res.json({ vendedores });
  })
);

universidadeManagerRouter.get(
  '/universidade/equipe/:vendedorId/desenvolvimento',
  requireAuth('ADMIN', 'GERENTE'),
  asyncHandler(async (req, res) => {
    try {
      const vendedor = await garantirVendedorNoEscopoDoGerente(req.params.vendedorId, req.auth!.empresaId, lojaRestritaDe(req));
      const [matriz, pdis, avaliacoes] = await Promise.all([
        calcularMatrizCompetencias(vendedor.id, vendedor.papel),
        listarPDIsDoUsuario(vendedor.id),
        listarAvaliacoesDoUsuario(vendedor.id),
      ]);
      res.json({ vendedor: { id: vendedor.id, nome: vendedor.nome }, matriz, pdis, avaliacoes });
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

const avaliacaoSchema = z.object({ competencyId: z.string().uuid(), rating: z.number().int().min(1).max(5), evidenceNote: z.string().optional() });

universidadeManagerRouter.post(
  '/universidade/equipe/:vendedorId/avaliacoes',
  requireAuth('ADMIN', 'GERENTE'),
  asyncHandler(async (req, res) => {
    const parsed = avaliacaoSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });
    try {
      const vendedor = await garantirVendedorNoEscopoDoGerente(req.params.vendedorId, req.auth!.empresaId, lojaRestritaDe(req));
      const avaliacao = await registrarAvaliacaoGerente({
        subjectUserId: vendedor.id,
        competencyId: parsed.data.competencyId,
        authorId: req.auth!.vendedorId,
        rating: parsed.data.rating,
        evidenceNote: parsed.data.evidenceNote,
      });
      res.status(201).json(avaliacao);
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

const criarPDISchema = z.object({
  competencyId: z.string().uuid(),
  targetScore: z.number().int().min(1).max(100),
  targetDate: z.string().datetime().optional(),
  itens: z.array(z.object({ tipo: z.enum(['LESSON', 'TRACK', 'QUIZ', 'SIMULATION', 'MISSION', 'PRACTICE', 'MANAGER_ACTION', 'REVIEW']), sourceId: z.string().optional(), required: z.boolean().optional() })),
});

universidadeManagerRouter.post(
  '/universidade/equipe/:vendedorId/pdi',
  requireAuth('ADMIN', 'GERENTE'),
  asyncHandler(async (req, res) => {
    const parsed = criarPDISchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos', detalhes: parsed.error.flatten() });
    try {
      const vendedor = await garantirVendedorNoEscopoDoGerente(req.params.vendedorId, req.auth!.empresaId, lojaRestritaDe(req));
      const plano = await criarPDI({
        subjectUserId: vendedor.id,
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

const sugestaoSchema = z.object({ competencyId: z.string().uuid() });

universidadeManagerRouter.post(
  '/universidade/equipe/:vendedorId/pdi/sugestao-ia',
  requireAuth('ADMIN', 'GERENTE'),
  asyncHandler(async (req, res) => {
    const parsed = sugestaoSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });
    try {
      const vendedor = await garantirVendedorNoEscopoDoGerente(req.params.vendedorId, req.auth!.empresaId, lojaRestritaDe(req));
      const sugestoes = await sugerirSequenciaDeAprendizado({ empresaId: req.auth!.empresaId, vendedorId: vendedor.id, papel: vendedor.papel, competencyId: parsed.data.competencyId });
      res.json({ sugestoes });
    } catch (err) {
      tratarErro(err, res);
    }
  })
);
