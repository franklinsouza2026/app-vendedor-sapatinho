// QUIZ_AGENT (seção 21-23). Questões geradas por IA NUNCA entram direto no
// banco publicado — nascem `active: false` em AcademyQuestion (mesmo
// registro do CMS manual, seção 66: sem atalho), só o Admin as ativa depois
// de revisar. Guard dos 13 Mandamentos é 100% código, nunca decidido pelo
// LLM (seção 22/55): se o tema pede quiz sobre os Mandamentos e nenhum tem
// conteúdo oficial, o agente NUNCA é sequer chamado.
import { listarMandamentosComConteudoAprovado } from '../academia/mandamentos.service';
import { chamarAgente } from './agent-runtime';
import { montarPrompt } from './prompts';
import { quizOutputSchema, QuizOutput, QuestionDraft } from './types';

/** Heurística de ROTEAMENTO (não de conteúdo/publicação) — só decide se o
 * guard estrutural dos Mandamentos se aplica a este pedido. Nunca usada pra
 * julgar completude ou correção de conteúdo (essa regra continua 100%
 * estrutural em mandamentos.service.ts). */
export function pareceSerSobreMandamentos(topic: string): boolean {
  return /mandamento/i.test(topic);
}

export function validarQuestaoEstruturalmente(q: QuestionDraft): string | null {
  if (q.options.length < 2) return 'menos de 2 alternativas';
  if (q.options.filter((o) => o.correct).length !== 1) return 'precisa de exatamente 1 alternativa correta';
  if (q.options.some((o) => o.text.trim().length === 0)) return 'alternativa vazia';
  const textos = q.options.map((o) => o.text.trim().toLowerCase());
  if (new Set(textos).size !== textos.length) return 'alternativas duplicadas';
  if (q.statement.trim().length === 0) return 'enunciado vazio';
  return null;
}

export interface ResultadoQuizAgent {
  bloqueadoPorMandamentosSemConteudo: boolean;
  questoesValidas: QuestionDraft[];
  questoesRejeitadas: { questao: QuestionDraft; motivo: string }[];
}

export async function gerarRascunhoDeQuestoes(params: {
  jobId: string;
  empresaId: string;
  vendedorId: string;
  topic: string;
  lessonContent: string;
}): Promise<ResultadoQuizAgent> {
  if (pareceSerSobreMandamentos(params.topic)) {
    const mandamentos = await listarMandamentosComConteudoAprovado();
    if (mandamentos.length === 0) {
      // Nunca chama o provider — não há o que "completar" (seção 55: "não
      // gerar substituto"). Nenhum custo de IA gasto numa chamada inútil.
      return { bloqueadoPorMandamentosSemConteudo: true, questoesValidas: [], questoesRejeitadas: [] };
    }
  }

  const { systemPrompt, userMessage } = montarPrompt({
    task:
      `Com base no conteúdo da aula sobre "${params.topic}" abaixo, gere de 1 a 3 questões de múltipla escolha, cada uma com exatamente 1 alternativa correta. ` +
      `Conteúdo da aula: ${params.lessonContent}\n\nResponda em JSON: { "questions": [{ "statement": string, "options": [{"text": string, "correct": boolean}], ` +
      `"explanation": string, "difficulty": "BASICA"|"INTERMEDIARIA"|"SITUACIONAL", "concept": string }] }.`,
  });

  const output: QuizOutput = await chamarAgente(
    {
      empresaId: params.empresaId,
      vendedorId: params.vendedorId,
      jobId: params.jobId,
      specialist: 'QUIZ_AGENT',
      specialistMockKey: 'quiz_agent',
      systemPrompt,
      userMessage,
      context: { topic: params.topic, lessonContent: params.lessonContent },
    },
    quizOutputSchema
  );

  const questoesValidas: QuestionDraft[] = [];
  const questoesRejeitadas: { questao: QuestionDraft; motivo: string }[] = [];
  for (const q of output.questions) {
    const motivo = validarQuestaoEstruturalmente(q);
    if (motivo) questoesRejeitadas.push({ questao: q, motivo });
    else questoesValidas.push(q);
  }

  return { bloqueadoPorMandamentosSemConteudo: false, questoesValidas, questoesRejeitadas };
}
