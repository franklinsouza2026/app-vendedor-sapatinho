// CONTENT_UPDATE_AGENT (seção 48-50). Nunca altera uma versão publicada
// diretamente — só recomenda (UP_TO_DATE/REVIEW_RECOMMENDED/UPDATE_DRAFT).
// Scheduler automático de refresh fica fora do escopo desta fatia (seção
// 49) — o gatilho é sempre uma solicitação explícita do Admin.
import { prisma } from '../db';
import { chamarAgente } from './agent-runtime';
import { montarPrompt } from './prompts';
import { contentUpdateOutputSchema, ContentUpdateOutput, FonteParaPrompt, TrainingIntelligenceError } from './types';

export async function avaliarAtualizacaoConteudo(params: {
  jobId: string;
  empresaId: string;
  vendedorId: string;
  targetLessonId: string;
  newSources: FonteParaPrompt[];
}): Promise<ContentUpdateOutput> {
  const aula = await prisma.academyLesson.findUnique({ where: { id: params.targetLessonId } });
  if (!aula) throw new TrainingIntelligenceError('not_found', 'aula alvo da atualização não encontrada');

  const { systemPrompt, userMessage } = montarPrompt({
    officialContext: `Conteúdo atual publicado (versão ${aula.version}): ${aula.content}`,
    sources: params.newSources,
    task:
      'Compare o conteúdo atual com as fontes novas acima e recomende se o conteúdo está atualizado, se vale revisão humana, ou se já dá pra propor um ' +
      'rascunho de atualização. Responda em JSON: { "recommendation": "UP_TO_DATE"|"REVIEW_RECOMMENDED"|"UPDATE_DRAFT", "reasoning": string }.',
  });

  const resultado = await chamarAgente(
    {
      empresaId: params.empresaId,
      vendedorId: params.vendedorId,
      jobId: params.jobId,
      specialist: 'CONTENT_UPDATE_AGENT',
      specialistMockKey: 'content_update_agent',
      systemPrompt,
      userMessage,
      context: { existingContent: aula.content, newSources: params.newSources },
    },
    contentUpdateOutputSchema
  );

  await prisma.trainingIntelligenceJob.update({ where: { id: params.jobId }, data: { updateRecommendation: resultado.recommendation } });

  return resultado;
}
