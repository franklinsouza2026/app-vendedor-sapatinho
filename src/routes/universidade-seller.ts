// Universidade — vendedor/gerente autenticado (Fatia 7.5E, seção 29/62-66).
// vendedorId/papel sempre de req.auth, nunca do corpo/query.
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middlewares/auth';
import { asyncHandler } from '../middlewares/async-handler';
import { UniversidadeError } from '../universidade/constantes';
import { calcularMatrizCompetencias } from '../universidade/score-engine.service';
import { montarParaVoce } from '../universidade/learning-path.service';
import { sugerirSequenciaDeAprendizado } from '../universidade/ai-recommendation.service';
import { AIProviderError } from '../ai-platform/providers';
import { TrainingIntelligenceError } from '../training-intelligence/types';
import { listarPDIsDoUsuario, buscarPDI, evolucaoDoPlano } from '../universidade/pdi.service';
import { listarRevisoesPendentes, responderRevisao } from '../universidade/spaced-repetition.service';
import { avaliarElegibilidade, emitirCertificacaoSeElegivel, listarCertificacoesDoUsuario, atualizarStatusExpiracao, listarCertificationDefinitions } from '../universidade/certification.service';

export const universidadeSellerRouter = Router();

function tratarErro(err: unknown, res: import('express').Response) {
  if (err instanceof UniversidadeError) {
    const status = err.type === 'not_found' ? 404 : err.type === 'requisitos_nao_atendidos' ? 409 : err.type === 'invalid_reference' ? 400 : 400;
    return res.status(status).json({ error: err.message, type: err.type });
  }
  // Degradação graciosa da IA (Etapa 2A) — este router ganhou rota de IA, e sem
  // estes dois casos uma indisponibilidade de provider/budget viraria 500
  // genérico em vez do 503 que as outras superfícies de IA já devolvem. Mesmo
  // tratamento de `universidade-manager.ts`.
  if (err instanceof AIProviderError) return res.status(503).json({ error: 'IA indisponível no momento', type: 'provider_unavailable' });
  if (err instanceof TrainingIntelligenceError) {
    const status = err.type === 'budget_exceeded' || err.type === 'rate_limited' || err.type === 'provider_unavailable' ? 503 : 400;
    return res.status(status).json({ error: 'sugestão de IA indisponível no momento', type: err.type });
  }
  throw err;
}

universidadeSellerRouter.get(
  '/universidade/minha-matriz',
  requireAuth(),
  asyncHandler(async (req, res) => {
    res.json({ competencias: await calcularMatrizCompetencias(req.auth!.vendedorId, req.auth!.papel) });
  })
);

universidadeSellerRouter.get(
  '/universidade/para-voce',
  requireAuth(),
  asyncHandler(async (req, res) => {
    res.json({ itens: await montarParaVoce(req.auth!.vendedorId, req.auth!.papel) });
  })
);

const sugestaoSchema = z.object({ competencyId: z.string().uuid() });

/**
 * Recomendação de aprendizado para a PRÓPRIA competência (Etapa 2A).
 *
 * O motor (`sugerirSequenciaDeAprendizado`) já existia, testado e com todo id
 * revalidado contra o banco — mas só estava exposto em rota de GERENTE/ADMIN.
 * Na prática, o vendedor via o gap ("faltam 25 pontos") e não tinha nenhum
 * caminho para saber o que estudar: era o elo `gap → recomendação` aberto.
 *
 * `vendedorId` e `papel` vêm SEMPRE do JWT — o vendedor só pede recomendação
 * para si mesmo, nunca para outro. Nenhum motor novo, nenhum prompt novo.
 */
universidadeSellerRouter.post(
  '/universidade/minha-matriz/:competencyId/sugestao',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const parsed = sugestaoSchema.safeParse({ competencyId: req.params.competencyId });
    if (!parsed.success) return res.status(400).json({ error: 'competência inválida' });
    try {
      const sugestoes = await sugerirSequenciaDeAprendizado({
        empresaId: req.auth!.empresaId,
        vendedorId: req.auth!.vendedorId,
        papel: req.auth!.papel,
        competencyId: parsed.data.competencyId,
      });
      res.json({ sugestoes });
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

universidadeSellerRouter.get(
  '/universidade/pdi',
  requireAuth(),
  asyncHandler(async (req, res) => {
    res.json({ planos: await listarPDIsDoUsuario(req.auth!.vendedorId) });
  })
);

universidadeSellerRouter.get(
  '/universidade/pdi/:id',
  requireAuth(),
  asyncHandler(async (req, res) => {
    try {
      const plano = await buscarPDI(req.params.id);
      if (plano.subjectUserId !== req.auth!.vendedorId) throw new UniversidadeError('not_found', 'plano não encontrado'); // IDOR-safe: mesmo erro de "não existe"
      const evolucao = await evolucaoDoPlano(req.params.id);
      res.json({ plano, evolucao });
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

universidadeSellerRouter.get(
  '/universidade/revisoes',
  requireAuth(),
  asyncHandler(async (req, res) => {
    res.json({ revisoes: await listarRevisoesPendentes(req.auth!.vendedorId) });
  })
);

const responderRevisaoSchema = z.object({ optionId: z.string().uuid() });

universidadeSellerRouter.post(
  '/universidade/revisoes/:id/responder',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const parsed = responderRevisaoSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });
    const resultado = await responderRevisao(req.params.id, req.auth!.vendedorId, parsed.data.optionId);
    if (!resultado) return res.status(404).json({ error: 'revisão não encontrada' });
    res.json(resultado);
  })
);

universidadeSellerRouter.get(
  '/universidade/certificacoes',
  requireAuth(),
  asyncHandler(async (req, res) => {
    await atualizarStatusExpiracao(req.auth!.vendedorId);
    res.json({ certificacoes: await listarCertificacoesDoUsuario(req.auth!.vendedorId) });
  })
);

universidadeSellerRouter.get(
  '/universidade/certificacoes/disponiveis',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const audienciasPermitidas = req.auth!.papel === 'GERENTE' ? (['MANAGER', 'BOTH'] as const) : (['SELLER', 'BOTH'] as const);
    const definicoes = await listarCertificationDefinitions();
    const publicadas = definicoes.filter((d) => d.status === 'PUBLISHED' && (audienciasPermitidas as readonly string[]).includes(d.audience));
    const comElegibilidade = await Promise.all(
      publicadas.map(async (d) => ({ definicao: d, elegibilidade: await avaliarElegibilidade(req.auth!.vendedorId, d.id) }))
    );
    res.json({ disponiveis: comElegibilidade });
  })
);

universidadeSellerRouter.post(
  '/universidade/certificacoes/:definitionId/emitir',
  requireAuth(),
  asyncHandler(async (req, res) => {
    try {
      res.status(201).json(await emitirCertificacaoSeElegivel(req.auth!.vendedorId, req.params.definitionId));
    } catch (err) {
      tratarErro(err, res);
    }
  })
);
