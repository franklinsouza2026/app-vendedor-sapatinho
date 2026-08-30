// Aulas da Academia (Fatia 6). Progresso sempre por (vendedorId, lessonId) —
// nunca confiar em sellerId/tenantId vindo do corpo da requisição (seção
// "conclusão de aula": "Seller é derivado do JWT").
import { prisma } from '../db';
import { getSecoesPorCategorias } from '../treinador/playbook.service';
import { concederRecompensaTreinamento, recompensaTreinamentoJaConcedida } from '../gamificacao/treinamento.service';
import { createLogger } from '../utils/logger';

const log = createLogger('academia:aula');

export class AcademyError extends Error {
  constructor(
    public type: 'not_found' | 'quiz_obrigatorio',
    message: string
  ) {
    super(message);
  }
}

export async function getAulaDetalhada(lessonId: string, vendedorId: string) {
  const aula = await prisma.academyLesson.findUnique({
    where: { id: lessonId },
    include: { quiz: { select: { id: true, passingScore: true } }, progresso: { where: { vendedorId } } },
  });
  if (!aula || !aula.active) throw new AcademyError('not_found', 'aula não encontrada');

  const vendedor = await prisma.vendedor.findUniqueOrThrow({ where: { id: vendedorId } });
  const playbookInfo = aula.playbookCategoria
    ? await getSecoesPorCategorias(vendedor.empresaId, [aula.playbookCategoria])
    : { version: null, sections: [] };

  return {
    id: aula.id,
    code: aula.code,
    title: aula.title,
    description: aula.description,
    content: aula.content,
    origem: aula.origem,
    estimatedMinutes: aula.estimatedMinutes,
    hasQuiz: !!aula.quiz,
    quizPassingScore: aula.quiz?.passingScore ?? null,
    status: aula.progresso[0]?.status ?? 'NOT_STARTED',
    playbookRelacionado: playbookInfo.sections,
  };
}

/** Marca a aula como iniciada (idempotente — reabrir não duplica progresso). */
export async function iniciarAula(lessonId: string, vendedorId: string) {
  const aula = await prisma.academyLesson.findUnique({ where: { id: lessonId } });
  if (!aula || !aula.active) throw new AcademyError('not_found', 'aula não encontrada');

  const vendedor = await prisma.vendedor.findUniqueOrThrow({ where: { id: vendedorId } });

  return prisma.academyProgress.upsert({
    where: { vendedorId_lessonId: { vendedorId, lessonId } },
    update: {},
    create: {
      empresaId: vendedor.empresaId,
      lojaId: vendedor.lojaId,
      vendedorId,
      lessonId,
      status: 'IN_PROGRESS',
    },
  });
}

/**
 * Conclui uma aula SEM quiz (conteúdo visto = concluído). Aulas COM quiz só
 * concluem via quiz.service.ts (responderQuiz) — chamar aqui nesse caso é
 * rejeitado, pra nunca aceitar um "completed: true" vindo do cliente sem
 * validação (seção "conclusão de aula" da Fatia 6).
 */
export async function concluirAula(lessonId: string, vendedorId: string) {
  const aula = await prisma.academyLesson.findUnique({ where: { id: lessonId }, include: { quiz: true } });
  if (!aula || !aula.active) throw new AcademyError('not_found', 'aula não encontrada');
  if (aula.quiz) throw new AcademyError('quiz_obrigatorio', 'esta aula exige aprovação no quiz pra ser concluída');

  const vendedor = await prisma.vendedor.findUniqueOrThrow({ where: { id: vendedorId } });
  const idempotencyKey = `academia-aula-${vendedorId}-${lessonId}`;

  const jaConcedida = await recompensaTreinamentoJaConcedida(idempotencyKey);

  const progresso = await prisma.academyProgress.upsert({
    where: { vendedorId_lessonId: { vendedorId, lessonId } },
    update: { status: 'COMPLETED', completedAt: new Date() },
    create: {
      empresaId: vendedor.empresaId,
      lojaId: vendedor.lojaId,
      vendedorId,
      lessonId,
      status: 'COMPLETED',
      completedAt: new Date(),
    },
  });

  if (!jaConcedida) {
    await concederRecompensaTreinamento({
      empresaId: vendedor.empresaId,
      lojaId: vendedor.lojaId,
      vendedorId,
      tipoEvento: 'TREINAMENTO_CONCLUIDO',
      referenciaTipo: 'ACADEMIA_AULA',
      referenciaId: lessonId,
      idempotencyKey,
    });
    log.info({ vendedorId, lessonId }, 'aula da Academia concluída — recompensa concedida (1ª vez)');
  }

  return progresso;
}
