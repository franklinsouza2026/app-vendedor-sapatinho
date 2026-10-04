// Competições — Manager (Fatia 8, seção 51/92). Reaproveita o MESMO escopo
// de loja da Universidade (garantirVendedorNoEscopoDoGerente, 7.5E) — nunca
// um 2º mecanismo de "manager só vê a própria loja".
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middlewares/auth';
import { lojaRestritaDe } from '../middlewares/escopo';
import { asyncHandler } from '../middlewares/async-handler';
import { UniversidadeError } from '../universidade/constantes';
import { garantirVendedorNoEscopoDoGerente } from '../universidade/manager-scope.service';
import { CompeticoesError } from '../competicoes/constantes';
import { registrarReconhecimento, listarReconhecimentosRecebidos } from '../competicoes/recognition.service';
import { listarCompetitions } from '../competicoes/competitions.service';

export const competicoesManagerRouter = Router();

function tratarErro(err: unknown, res: import('express').Response) {
  if (err instanceof UniversidadeError) {
    const status = err.type === 'not_found' ? 404 : err.type === 'forbidden' ? 403 : 400;
    return res.status(status).json({ error: err.message, type: err.type });
  }
  if (err instanceof CompeticoesError) {
    const status = err.type === 'not_found' ? 404 : err.type === 'forbidden' ? 403 : 400;
    return res.status(status).json({ error: err.message, type: err.type });
  }
  throw err;
}


competicoesManagerRouter.get(
  '/equipe/competicoes',
  requireAuth('ADMIN', 'GERENTE'),
  asyncHandler(async (req, res) => {
    res.json({ competicoes: await listarCompetitions(req.auth!.empresaId, 'ACTIVE') });
  })
);

const reconhecimentoSchema = z.object({ tipo: z.enum(['PERFORMANCE', 'EVOLUTION', 'LEARNING', 'TEAMWORK', 'CONSISTENCY', 'LEADERSHIP', 'CUSTOM']), message: z.string().max(500).optional() });

competicoesManagerRouter.post(
  '/equipe/:vendedorId/reconhecimentos',
  requireAuth('ADMIN', 'GERENTE'),
  asyncHandler(async (req, res) => {
    const parsed = reconhecimentoSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });
    try {
      const vendedor = await garantirVendedorNoEscopoDoGerente(req.params.vendedorId, req.auth!.empresaId, lojaRestritaDe(req));
      const reconhecimento = await registrarReconhecimento({ empresaId: req.auth!.empresaId, authorId: req.auth!.vendedorId, subjectId: vendedor.id, tipo: parsed.data.tipo, message: parsed.data.message, lojaId: vendedor.lojaId });
      res.status(201).json(reconhecimento);
    } catch (err) {
      tratarErro(err, res);
    }
  })
);

competicoesManagerRouter.get(
  '/equipe/:vendedorId/reconhecimentos',
  requireAuth('ADMIN', 'GERENTE'),
  asyncHandler(async (req, res) => {
    try {
      const vendedor = await garantirVendedorNoEscopoDoGerente(req.params.vendedorId, req.auth!.empresaId, lojaRestritaDe(req));
      res.json({ reconhecimentos: await listarReconhecimentosRecebidos(vendedor.id, req.auth!.empresaId) });
    } catch (err) {
      tratarErro(err, res);
    }
  })
);
