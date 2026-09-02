// Painel Gerencial Avançado (Fatia 9) — só GERENTE (ADMIN tem sua própria
// visão de configuração em manager-panel-admin.ts, nunca operação direta
// sobre 1:1/plano de ação/alertas de uma loja específica). Escopo sempre
// pela `lojaId` do próprio token — nunca aceita `lojaId`/`empresaId` do
// corpo/query do cliente pra decidir escopo (mass-assignment/IDOR, seção
// 85-92).
import { Response, Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middlewares/auth';
import { asyncHandler } from '../middlewares/async-handler';
import { AIProviderError } from '../ai-platform/providers';
import { TrainingIntelligenceError } from '../training-intelligence/types';
import { UniversidadeError } from '../universidade/constantes';
import { calcularMatrizCompetencias } from '../universidade/score-engine.service';
import { listarPDIsDoUsuario } from '../universidade/pdi.service';
import { garantirVendedorNoEscopoDoGerente } from '../universidade/manager-scope.service';
import { ManagerError } from '../manager/constantes';
import { calcularStoreSummary } from '../manager/store-summary.service';
import { listarVisaoEquipe } from '../manager/team-overview.service';
import { sincronizarAlertasDaLoja, sincronizarCompetencyGapDoVendedor, listarAlertas, reconhecerAlerta, resolverAlerta, dispensarAlerta } from '../manager/alerts.service';
import { listarSinaisPositivosDaLoja } from '../manager/positive-signals.service';
import { montarInbox } from '../manager/inbox.service';
import { montarDailyHuddle } from '../manager/daily-huddle.service';
import { pedirConselhoGerencial } from '../manager/ai-advisor.service';
import { criarPlanoDeAcao, listarPlanos, buscarPlanoNoEscopo, ativarPlano, cancelarPlano, concluirItem, concluirPlano } from '../manager/action-plan.service';
import { criarOneOnOne, listarOneOnOnesDoVendedor, buscarOneOnOneNoEscopo, iniciarOneOnOne, concluirOneOnOne, cancelarOneOnOne, ROTEIRO_SUGERIDO_1A1 } from '../manager/one-on-one.service';
import { criarFollowUp, listarFollowUps, concluirFollowUp, dispensarFollowUp } from '../manager/followup.service';
import { prisma } from '../db';

export const managerPanelRouter = Router();

function tratarErro(err: unknown, res: Response) {
  if (err instanceof ManagerError || err instanceof UniversidadeError) {
    const status = err.type === 'not_found' ? 404 : err.type === 'forbidden' ? 403 : err.type === 'invalid_transition' || err.type === 'invalid_reference' ? 400 : err.type === 'already_exists' ? 409 : 400;
    return res.status(status).json({ error: err.message, type: err.type });
  }
  if (err instanceof AIProviderError) return res.status(503).json({ error: 'assistente de IA indisponível no momento', type: 'provider_unavailable' });
  if (err instanceof TrainingIntelligenceError) {
    const status = err.type === 'budget_exceeded' || err.type === 'rate_limited' || err.type === 'provider_unavailable' ? 503 : 400;
    return res.status(status).json({ error: 'assistente de IA indisponível no momento', type: err.type });
  }
  throw err;
}

// ===== Home do Gerente =====
managerPanelRouter.get(
  '/gerente/home',
  requireAuth('GERENTE'),
  asyncHandler(async (req, res) => {
    const { empresaId, lojaId } = req.auth!;
    await sincronizarAlertasDaLoja(empresaId, lojaId);
    const [storeSummary, alertas, highlights, inbox] = await Promise.all([
      calcularStoreSummary(empresaId, lojaId),
      listarAlertas(empresaId, lojaId),
      listarSinaisPositivosDaLoja(empresaId, lojaId),
      montarInbox(empresaId, lojaId),
    ]);
    res.json({ storeSummary, alertasPrioritarios: alertas.slice(0, 5), highlights: highlights.slice(0, 5), pendenciasResumo: inbox.resumo });
  })
);

// ===== Equipe =====
managerPanelRouter.get(
  '/gerente/equipe',
  requireAuth('GERENTE'),
  asyncHandler(async (req, res) => {
    const { empresaId, lojaId } = req.auth!;
    await sincronizarAlertasDaLoja(empresaId, lojaId);
    const linhas = await listarVisaoEquipe(empresaId, lojaId);
    res.json({ vendedores: linhas });
  })
);

managerPanelRouter.get(
  '/gerente/equipe/:vendedorId/detalhe',
  requireAuth('GERENTE'),
  asyncHandler(async (req, res) => {
    try {
      const { empresaId, lojaId } = req.auth!;
      const vendedor = await garantirVendedorNoEscopoDoGerente(req.params.vendedorId, empresaId, lojaId);
      await sincronizarCompetencyGapDoVendedor(empresaId, lojaId, vendedor.id);

      const [matriz, pdis, alertas, oneOnOnes, planos, certificacoes, missoes] = await Promise.all([
        calcularMatrizCompetencias(vendedor.id, vendedor.papel),
        listarPDIsDoUsuario(vendedor.id),
        listarAlertas(empresaId, lojaId, { sellerId: vendedor.id }),
        listarOneOnOnesDoVendedor(empresaId, lojaId, vendedor.id),
        listarPlanos(empresaId, lojaId, { subjectId: vendedor.id }),
        prisma.userCertification.findMany({ where: { userId: vendedor.id }, include: { definicao: { select: { name: true, code: true } } } }),
        prisma.missionAssignment.findMany({ where: { vendedorId: vendedor.id, status: { in: ['ASSIGNED', 'IN_PROGRESS'] } }, include: { definicao: { select: { title: true } } } }),
      ]);

      res.json({ vendedor: { id: vendedor.id, nome: vendedor.nome }, matriz, pdis, alertas, oneOnOnes, planos, certificacoes, missoes });
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

// ===== Alertas =====
managerPanelRouter.get(
  '/gerente/alertas',
  requireAuth('GERENTE'),
  asyncHandler(async (req, res) => {
    const { empresaId, lojaId } = req.auth!;
    await sincronizarAlertasDaLoja(empresaId, lojaId);
    const statusParam = typeof req.query.status === 'string' ? req.query.status.split(',') : undefined;
    const alertas = await listarAlertas(empresaId, lojaId, { status: statusParam as never });
    res.json({ alertas });
  })
);

managerPanelRouter.post(
  '/gerente/alertas/:id/reconhecer',
  requireAuth('GERENTE'),
  asyncHandler(async (req, res) => {
    try {
      await reconhecerAlerta(req.auth!.empresaId, req.auth!.lojaId, req.params.id, req.auth!.vendedorId);
      res.status(204).end();
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

const resolverAlertaSchema = z.object({ tipoResolucao: z.enum(['RESOLVED_OPERATIONALLY', 'METRIC_RECOVERED']) });

managerPanelRouter.post(
  '/gerente/alertas/:id/resolver',
  requireAuth('GERENTE'),
  asyncHandler(async (req, res) => {
    const parsed = resolverAlertaSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });
    try {
      await resolverAlerta(req.auth!.empresaId, req.auth!.lojaId, req.params.id, parsed.data.tipoResolucao, req.auth!.vendedorId);
      res.status(204).end();
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

managerPanelRouter.post(
  '/gerente/alertas/:id/dispensar',
  requireAuth('GERENTE'),
  asyncHandler(async (req, res) => {
    try {
      await dispensarAlerta(req.auth!.empresaId, req.auth!.lojaId, req.params.id, req.auth!.vendedorId);
      res.status(204).end();
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

// ===== Planos de Ação =====
const criarPlanoSchema = z.object({
  subjectType: z.enum(['SELLER', 'TEAM', 'STORE']),
  subjectId: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  sourceAlertId: z.string().uuid().optional(),
  itens: z.array(z.object({ tipo: z.enum(['TALK', 'OBSERVE', 'TRAIN', 'ASSIGN_MISSION', 'ASSIGN_CONTENT', 'CREATE_PDI', 'REVIEW_PDI', 'RECOGNIZE', 'FOLLOW_UP', 'CUSTOM_TEXT']), descricao: z.string().min(1).max(500) })).default([]),
});

managerPanelRouter.get(
  '/gerente/planos-de-acao',
  requireAuth('GERENTE'),
  asyncHandler(async (req, res) => {
    const subjectId = typeof req.query.subjectId === 'string' ? req.query.subjectId : undefined;
    const planos = await listarPlanos(req.auth!.empresaId, req.auth!.lojaId, { subjectId });
    res.json({ planos });
  })
);

managerPanelRouter.post(
  '/gerente/planos-de-acao',
  requireAuth('GERENTE'),
  asyncHandler(async (req, res) => {
    const parsed = criarPlanoSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos', detalhes: parsed.error.flatten() });
    try {
      const plano = await criarPlanoDeAcao({ empresaId: req.auth!.empresaId, lojaId: req.auth!.lojaId, createdBy: req.auth!.vendedorId, ...parsed.data });
      res.status(201).json(plano);
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

managerPanelRouter.get(
  '/gerente/planos-de-acao/:id',
  requireAuth('GERENTE'),
  asyncHandler(async (req, res) => {
    try {
      const plano = await buscarPlanoNoEscopo(req.auth!.empresaId, req.auth!.lojaId, req.params.id);
      res.json(plano);
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

managerPanelRouter.post(
  '/gerente/planos-de-acao/:id/ativar',
  requireAuth('GERENTE'),
  asyncHandler(async (req, res) => {
    try {
      await ativarPlano(req.auth!.empresaId, req.auth!.lojaId, req.params.id, req.auth!.vendedorId);
      res.status(204).end();
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

managerPanelRouter.post(
  '/gerente/planos-de-acao/:id/cancelar',
  requireAuth('GERENTE'),
  asyncHandler(async (req, res) => {
    try {
      await cancelarPlano(req.auth!.empresaId, req.auth!.lojaId, req.params.id, req.auth!.vendedorId);
      res.status(204).end();
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

managerPanelRouter.post(
  '/gerente/planos-de-acao/:id/concluir',
  requireAuth('GERENTE'),
  asyncHandler(async (req, res) => {
    try {
      await concluirPlano(req.auth!.empresaId, req.auth!.lojaId, req.params.id, req.auth!.vendedorId);
      res.status(204).end();
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

managerPanelRouter.post(
  '/gerente/planos-de-acao/:id/itens/:itemId/concluir',
  requireAuth('GERENTE'),
  asyncHandler(async (req, res) => {
    try {
      await concluirItem(req.auth!.empresaId, req.auth!.lojaId, req.params.id, req.params.itemId, req.auth!.vendedorId);
      res.status(204).end();
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

// ===== 1:1 =====
managerPanelRouter.get(
  '/gerente/1a1/roteiro-sugerido',
  requireAuth('GERENTE'),
  asyncHandler(async (_req, res) => {
    res.json({ perguntas: ROTEIRO_SUGERIDO_1A1 });
  })
);

managerPanelRouter.get(
  '/gerente/1a1',
  requireAuth('GERENTE'),
  asyncHandler(async (req, res) => {
    const vendedorId = typeof req.query.vendedorId === 'string' ? req.query.vendedorId : undefined;
    if (!vendedorId) return res.status(400).json({ error: 'vendedorId é obrigatório' });
    try {
      const encontros = await listarOneOnOnesDoVendedor(req.auth!.empresaId, req.auth!.lojaId, vendedorId);
      res.json({ encontros });
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

const criarOneOnOneSchema = z.object({ sellerId: z.string().uuid(), scheduledAt: z.string().datetime().optional() });

managerPanelRouter.post(
  '/gerente/1a1',
  requireAuth('GERENTE'),
  asyncHandler(async (req, res) => {
    const parsed = criarOneOnOneSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });
    try {
      const encontro = await criarOneOnOne({
        empresaId: req.auth!.empresaId,
        lojaId: req.auth!.lojaId,
        managerId: req.auth!.vendedorId,
        sellerId: parsed.data.sellerId,
        scheduledAt: parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : undefined,
      });
      res.status(201).json(encontro);
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

managerPanelRouter.get(
  '/gerente/1a1/:id',
  requireAuth('GERENTE'),
  asyncHandler(async (req, res) => {
    try {
      const encontro = await buscarOneOnOneNoEscopo(req.auth!.empresaId, req.auth!.lojaId, req.params.id);
      res.json(encontro);
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

managerPanelRouter.post(
  '/gerente/1a1/:id/iniciar',
  requireAuth('GERENTE'),
  asyncHandler(async (req, res) => {
    try {
      await iniciarOneOnOne(req.auth!.empresaId, req.auth!.lojaId, req.params.id);
      res.status(204).end();
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

const concluirOneOnOneSchema = z.object({
  pontosPositivos: z.string().max(500).optional(),
  pontosAtencao: z.string().max(500).optional(),
  compromissos: z.string().max(500).optional(),
  proximaRevisaoEm: z.string().datetime().optional(),
});

managerPanelRouter.post(
  '/gerente/1a1/:id/concluir',
  requireAuth('GERENTE'),
  asyncHandler(async (req, res) => {
    const parsed = concluirOneOnOneSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });
    try {
      await concluirOneOnOne(req.auth!.empresaId, req.auth!.lojaId, req.params.id, { ...parsed.data, proximaRevisaoEm: parsed.data.proximaRevisaoEm ? new Date(parsed.data.proximaRevisaoEm) : undefined }, req.auth!.vendedorId);
      res.status(204).end();
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

managerPanelRouter.post(
  '/gerente/1a1/:id/cancelar',
  requireAuth('GERENTE'),
  asyncHandler(async (req, res) => {
    try {
      await cancelarOneOnOne(req.auth!.empresaId, req.auth!.lojaId, req.params.id, req.auth!.vendedorId);
      res.status(204).end();
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

// ===== Follow-ups =====
const criarFollowUpSchema = z.object({ sellerId: z.string().uuid().optional(), sourceType: z.string().optional(), sourceId: z.string().optional(), descricao: z.string().min(1).max(500), dueAt: z.string().datetime() });

managerPanelRouter.get(
  '/gerente/follow-ups',
  requireAuth('GERENTE'),
  asyncHandler(async (req, res) => {
    const followUps = await listarFollowUps(req.auth!.empresaId, req.auth!.lojaId);
    res.json({ followUps });
  })
);

managerPanelRouter.post(
  '/gerente/follow-ups',
  requireAuth('GERENTE'),
  asyncHandler(async (req, res) => {
    const parsed = criarFollowUpSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });
    try {
      const followUp = await criarFollowUp({ empresaId: req.auth!.empresaId, lojaId: req.auth!.lojaId, managerId: req.auth!.vendedorId, ...parsed.data, dueAt: new Date(parsed.data.dueAt) });
      res.status(201).json(followUp);
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

managerPanelRouter.post(
  '/gerente/follow-ups/:id/concluir',
  requireAuth('GERENTE'),
  asyncHandler(async (req, res) => {
    try {
      await concluirFollowUp(req.auth!.empresaId, req.auth!.lojaId, req.params.id, req.auth!.vendedorId);
      res.status(204).end();
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

managerPanelRouter.post(
  '/gerente/follow-ups/:id/dispensar',
  requireAuth('GERENTE'),
  asyncHandler(async (req, res) => {
    try {
      await dispensarFollowUp(req.auth!.empresaId, req.auth!.lojaId, req.params.id, req.auth!.vendedorId);
      res.status(204).end();
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

// ===== Pendências (Inbox) =====
managerPanelRouter.get(
  '/gerente/pendencias',
  requireAuth('GERENTE'),
  asyncHandler(async (req, res) => {
    const { empresaId, lojaId } = req.auth!;
    await sincronizarAlertasDaLoja(empresaId, lojaId);
    const inbox = await montarInbox(empresaId, lojaId);
    res.json(inbox);
  })
);

// ===== Reunião do Dia =====
managerPanelRouter.get(
  '/gerente/reuniao-do-dia',
  requireAuth('GERENTE'),
  asyncHandler(async (req, res) => {
    const { empresaId, lojaId, vendedorId } = req.auth!;
    await sincronizarAlertasDaLoja(empresaId, lojaId);
    const huddle = await montarDailyHuddle(empresaId, lojaId, new Date(), vendedorId);
    res.json(huddle);
  })
);

// ===== Assistente de Gestão (IA opcional) =====
managerPanelRouter.post(
  '/gerente/assistente/conselho',
  requireAuth('GERENTE'),
  asyncHandler(async (req, res) => {
    try {
      const conselho = await pedirConselhoGerencial({ empresaId: req.auth!.empresaId, lojaId: req.auth!.lojaId, managerId: req.auth!.vendedorId });
      res.json(conselho);
    } catch (err) {
      tratarErro(err, res);
    }
  })
);
