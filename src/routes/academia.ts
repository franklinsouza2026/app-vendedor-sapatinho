// Rotas da Academia (Fatia 6). vendedorId sempre de req.auth. Frontend nunca
// envia correct/score/completed — backend valida e calcula tudo.
import { Response, Router } from 'express';
import { z } from 'zod';
import { listarTrilhas, getTrilhaDetalhada } from '../academia/track.service';
import { AcademyError, getAulaDetalhada, iniciarAula, concluirAula } from '../academia/lesson.service';
import { getQuizParaResponder, responderQuiz } from '../academia/quiz.service';
import { getProgressoGeral } from '../academia/progress.service';
import { requireAuth } from '../middlewares/auth';
import { asyncHandler } from '../middlewares/async-handler';

export const academiaRouter = Router();

const STATUS_POR_ERRO: Record<AcademyError['type'], number> = {
  not_found: 404,
  quiz_obrigatorio: 400,
};

function tratarAcademyError(err: unknown, res: Response): boolean {
  if (err instanceof AcademyError) {
    res.status(STATUS_POR_ERRO[err.type]).json({ error: err.message, type: err.type });
    return true;
  }
  return false;
}

academiaRouter.get(
  '/academia/trilhas',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const trilhas = await listarTrilhas(req.auth!.vendedorId);
    res.json({ trilhas });
  })
);

academiaRouter.get(
  '/academia/trilhas/:id',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const trilha = await getTrilhaDetalhada(req.params.id, req.auth!.vendedorId);
    if (!trilha) return res.status(404).json({ error: 'trilha não encontrada' });
    res.json(trilha);
  })
);

academiaRouter.get(
  '/academia/progresso',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const progresso = await getProgressoGeral(req.auth!.vendedorId);
    res.json(progresso);
  })
);

academiaRouter.get(
  '/academia/aulas/:id',
  requireAuth(),
  asyncHandler(async (req, res) => {
    try {
      const aula = await getAulaDetalhada(req.params.id, req.auth!.vendedorId);
      res.json(aula);
    } catch (err) {
      if (!tratarAcademyError(err, res)) throw err;
    }
  })
);

academiaRouter.post(
  '/academia/aulas/:id/iniciar',
  requireAuth(),
  asyncHandler(async (req, res) => {
    try {
      const progresso = await iniciarAula(req.params.id, req.auth!.vendedorId);
      res.status(201).json(progresso);
    } catch (err) {
      if (!tratarAcademyError(err, res)) throw err;
    }
  })
);

academiaRouter.post(
  '/academia/aulas/:id/concluir',
  requireAuth(),
  asyncHandler(async (req, res) => {
    try {
      const progresso = await concluirAula(req.params.id, req.auth!.vendedorId);
      res.json(progresso);
    } catch (err) {
      if (!tratarAcademyError(err, res)) throw err;
    }
  })
);

academiaRouter.get(
  '/academia/aulas/:id/quiz',
  requireAuth(),
  asyncHandler(async (req, res) => {
    try {
      const quiz = await getQuizParaResponder(req.params.id);
      res.json(quiz);
    } catch (err) {
      if (!tratarAcademyError(err, res)) throw err;
    }
  })
);

const responderQuizSchema = z.object({
  respostas: z.array(z.object({ questionId: z.string().uuid(), optionId: z.string().uuid() })).min(1),
});

academiaRouter.post(
  '/academia/aulas/:id/quiz/responder',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const parsed = responderQuizSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'respostas inválidas' });

    try {
      const resultado = await responderQuiz(req.params.id, req.auth!.vendedorId, parsed.data.respostas);
      res.json(resultado);
    } catch (err) {
      if (!tratarAcademyError(err, res)) throw err;
    }
  })
);
