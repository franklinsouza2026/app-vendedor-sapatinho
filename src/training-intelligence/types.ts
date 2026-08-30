// Contratos estruturados de cada agente lógico da Training Intelligence
// Platform (Fatia 7.5D, seção 60). Nenhum output de IA é confiado sem
// `JSON.parse` + validação por este schema — um provider real ou mock que
// devolva JSON inválido, campo faltando ou enum errado nunca vira conteúdo
// persistido como aprovado (seção 61).
import { z } from 'zod';

export class TrainingIntelligenceError extends Error {
  constructor(
    public type:
      | 'invalid_ai_output'
      | 'budget_exceeded'
      | 'rate_limited'
      | 'provider_unavailable'
      | 'not_found'
      | 'invalid_transition'
      | 'idempotent_replay',
    message: string
  ) {
    super(message);
  }
}

export const fonteSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  publisher: z.string().nullable(),
  reliability: z.enum(['UNKNOWN', 'LOW', 'MEDIUM', 'HIGH']),
});
export type FonteParaPrompt = z.infer<typeof fonteSchema>;

export const researchOutputSchema = z.object({
  researchSummary: z.string(),
  keyInsights: z.array(z.string()),
});
export type ResearchOutput = z.infer<typeof researchOutputSchema>;

export const curationOutputSchema = z.object({
  mainIdeas: z.array(z.string()),
  redundancies: z.array(z.string()),
  contradictions: z.array(z.string()),
  risks: z.array(z.string()),
  relevance: z.string(),
  applicability: z.string(),
  trainingWorthyPoints: z.array(z.string()),
  gaps: z.array(z.string()),
  sourcesUsedIds: z.array(z.string()),
  officialConflict: z.boolean(),
});
export type CurationOutput = z.infer<typeof curationOutputSchema>;

export const instructionalDesignOutputSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  content: z.string().min(1),
  estimatedMinutes: z.number().int().positive(),
  quizRecommended: z.boolean(),
  simulationRecommended: z.boolean(),
});
export type InstructionalDesignOutput = z.infer<typeof instructionalDesignOutputSchema>;

const dificuldadeQuestaoSchema = z.enum(['BASICA', 'INTERMEDIARIA', 'SITUACIONAL']);

export const questionDraftSchema = z.object({
  statement: z.string().min(1),
  options: z.array(z.object({ text: z.string().min(1), correct: z.boolean() })).min(2),
  explanation: z.string().optional(),
  difficulty: dificuldadeQuestaoSchema.optional(),
  concept: z.string().optional(),
});
export type QuestionDraft = z.infer<typeof questionDraftSchema>;

export const quizOutputSchema = z.object({
  questions: z.array(questionDraftSchema),
});
export type QuizOutput = z.infer<typeof quizOutputSchema>;

export const simulationDesignOutputSchema = z.object({
  title: z.string().min(1),
  context: z.string().min(1),
  customerProfile: z.string().min(1),
  sellerObjective: z.string().min(1),
  objections: z.array(z.string()),
  difficulty: z.string(),
  competencies: z.array(z.string()),
  evaluationCriteria: z.array(z.string()),
});
export type SimulationDesignOutput = z.infer<typeof simulationDesignOutputSchema>;

export const governanceFindingSchema = z.object({
  type: z.enum([
    'OFFICIAL_CONFLICT',
    'UNSUPPORTED_CLAIM',
    'COPYRIGHT_RISK',
    'BRAND_TONE',
    'INAPPROPRIATE_ADVICE',
    'MISSING_SOURCE',
    'LOW_RELIABILITY_SOURCE',
    'MANDAMENTO_VIOLATION',
    'OTHER',
  ]),
  message: z.string(),
});
export type GovernanceFindingOutput = z.infer<typeof governanceFindingSchema>;

export const governanceOutputSchema = z.object({
  status: z.enum(['PASS', 'REVIEW_REQUIRED', 'BLOCKED']),
  findings: z.array(governanceFindingSchema),
});
export type GovernanceOutput = z.infer<typeof governanceOutputSchema>;

export const contentUpdateOutputSchema = z.object({
  recommendation: z.enum(['UP_TO_DATE', 'REVIEW_RECOMMENDED', 'UPDATE_DRAFT']),
  reasoning: z.string(),
});
export type ContentUpdateOutput = z.infer<typeof contentUpdateOutputSchema>;

/** Valida e faz parse de um output de IA — nunca confia em JSON cru (seção 60/61). */
export function parsearOutputAgente<T>(schema: z.ZodType<T>, raw: string, agente: string): T {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new TrainingIntelligenceError('invalid_ai_output', `${agente} devolveu um JSON inválido`);
  }
  const resultado = schema.safeParse(parsedJson);
  if (!resultado.success) {
    throw new TrainingIntelligenceError('invalid_ai_output', `${agente} devolveu um formato inesperado: ${resultado.error.message}`);
  }
  return resultado.data;
}
