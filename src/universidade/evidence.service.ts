// CompetencyEvidence — imutável por convenção de serviço (seção 9): este
// arquivo NUNCA expõe uma função de update/delete sobre evidência, só
// criação. Cada wrapper por fonte (quiz/simulação/treinamento/missão) é
// BEST-EFFORT — nunca lança erro pro fluxo principal que a chama (responder
// quiz, encerrar simulação, concluir missão continuam funcionando mesmo se
// a geração de evidência falhar por algum motivo inesperado).
import { Prisma, TipoFonteEvidencia } from '@prisma/client';
import { prisma } from '../db';
import { registrarEventoAuditoria } from '../identidade/auditoria.service';
import { resolverEmpresaUnica } from './schools.service';
import { SCORE_CONCLUSAO_SEM_AVALIACAO, ratingParaScore } from './constantes';
import { createLogger } from '../utils/logger';

const log = createLogger('universidade:evidence');

function parseCompetencyIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string');
}

async function criarEvidencia(params: {
  subjectUserId: string;
  competencyId: string;
  sourceType: TipoFonteEvidencia;
  sourceId?: string;
  normalizedScore: number;
  metadata?: Record<string, unknown>;
}) {
  const evidencia = await prisma.competencyEvidence.create({
    data: {
      subjectUserId: params.subjectUserId,
      competencyId: params.competencyId,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      normalizedScore: Math.max(0, Math.min(100, Math.round(params.normalizedScore))),
      weightProfileVersion: 1,
      metadata: params.metadata as Prisma.InputJsonValue | undefined,
    },
  });
  await registrarEventoAuditoria({
    empresaId: await resolverEmpresaUnica(),
    acao: 'COMPETENCY_EVIDENCE_ADDED',
    actorId: params.subjectUserId,
    metadata: { evidenceId: evidencia.id, competencyId: params.competencyId, sourceType: params.sourceType },
  });
  return evidencia;
}

async function paraCadaCompetencia(competencyIdsRaw: unknown, fn: (competencyId: string) => Promise<void>) {
  const ids = parseCompetencyIds(competencyIdsRaw);
  if (ids.length === 0) return;
  const validas = await prisma.competency.findMany({ where: { id: { in: ids }, status: 'ACTIVE' }, select: { id: true } });
  for (const c of validas) {
    await fn(c.id);
  }
}

/** Quiz/Diagnostic — score real do backend (0-100, já calculado em
 * quiz.service.ts), pego das competências mapeadas na AULA (não por
 * questão — granularidade de questão é usada pelo Spaced Repetition, não
 * pela evidência de competência, seção 19/20/23). */
export async function gerarEvidenciaDeQuiz(vendedorId: string, lessonId: string, quizId: string, score: number, diagnostico: boolean) {
  try {
    const aula = await prisma.academyLesson.findUnique({ where: { id: lessonId }, select: { competencyIds: true } });
    if (!aula) return;
    await paraCadaCompetencia(aula.competencyIds, (competencyId) =>
      criarEvidencia({
        subjectUserId: vendedorId,
        competencyId,
        sourceType: diagnostico ? 'DIAGNOSTIC_ASSESSMENT' : 'QUIZ',
        sourceId: quizId,
        normalizedScore: score,
      }).then(() => undefined)
    );
  } catch (err) {
    log.error({ err, vendedorId, lessonId }, 'falha ao gerar evidência de quiz — não bloqueia a resposta do quiz');
  }
}

/** Simulação — scoreFinal já calculado pelo backend (nunca a nota "achada"
 * pelo LLM sem validação, seção 24), das competências mapeadas no cenário. */
export async function gerarEvidenciaDeSimulacao(vendedorId: string, scenarioId: string, sessionId: string, scoreFinal: number) {
  try {
    const cenario = await prisma.simulationScenario.findUnique({ where: { id: scenarioId }, select: { competencyIds: true } });
    if (!cenario) return;
    await paraCadaCompetencia(cenario.competencyIds, (competencyId) =>
      criarEvidencia({ subjectUserId: vendedorId, competencyId, sourceType: 'SIMULATION', sourceId: sessionId, normalizedScore: scoreFinal }).then(() => undefined)
    );
  } catch (err) {
    log.error({ err, vendedorId, scenarioId }, 'falha ao gerar evidência de simulação — não bloqueia a avaliação');
  }
}

/** Conclusão de aula sem quiz (seção 22) — score conservador fixo, peso
 * baixo (ver PESO_POR_FONTE_V1). Nunca implica domínio da competência. */
export async function gerarEvidenciaDeConclusao(vendedorId: string, lessonId: string) {
  try {
    const aula = await prisma.academyLesson.findUnique({ where: { id: lessonId }, select: { competencyIds: true } });
    if (!aula) return;
    await paraCadaCompetencia(aula.competencyIds, (competencyId) =>
      criarEvidencia({ subjectUserId: vendedorId, competencyId, sourceType: 'TRAINING_COMPLETION', sourceId: lessonId, normalizedScore: SCORE_CONCLUSAO_SEM_AVALIACAO }).then(
        () => undefined
      )
    );
  } catch (err) {
    log.error({ err, vendedorId, lessonId }, 'falha ao gerar evidência de conclusão — não bloqueia a conclusão da aula');
  }
}

/** Missão concluída (seção 25) — só gera evidência se a missão foi
 * explicitamente mapeada pelo Admin a alguma competência. */
export async function gerarEvidenciaDeMissao(vendedorId: string, missionDefinitionId: string, assignmentId: string) {
  try {
    const missao = await prisma.missionDefinition.findUnique({ where: { id: missionDefinitionId }, select: { competencyIds: true } });
    if (!missao) return;
    await paraCadaCompetencia(missao.competencyIds, (competencyId) =>
      criarEvidencia({ subjectUserId: vendedorId, competencyId, sourceType: 'MISSION', sourceId: assignmentId, normalizedScore: SCORE_CONCLUSAO_SEM_AVALIACAO }).then(() => undefined)
    );
  } catch (err) {
    log.error({ err, vendedorId, missionDefinitionId }, 'falha ao gerar evidência de missão — não bloqueia a conclusão da missão');
  }
}

/** Manager Assessment vira evidência (seção 27) — rating 1-5 → score 0-100. */
export async function gerarEvidenciaDeAvaliacaoGerente(subjectUserId: string, competencyId: string, assessmentId: string, rating: number) {
  try {
    await criarEvidencia({
      subjectUserId,
      competencyId,
      sourceType: 'MANAGER_ASSESSMENT',
      sourceId: assessmentId,
      normalizedScore: ratingParaScore(rating),
    });
  } catch (err) {
    log.error({ err, subjectUserId, competencyId }, 'falha ao gerar evidência de avaliação do gerente — não bloqueia o registro da avaliação');
  }
}

