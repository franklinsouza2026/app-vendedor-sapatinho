// INSTRUCTIONAL_DESIGNER (seção 19/20). Transforma a curadoria num rascunho
// pedagógico ORIGINAL — nunca reproduz a fonte, cria conteúdo próprio a
// partir dos insights. Output sempre DRAFT (o chamador persiste como
// AcademyLesson com status DRAFT/origemEditorial AI_GENERATED, nunca
// diretamente PUBLISHED).
import { chamarAgente } from './agent-runtime';
import { montarPrompt } from './prompts';
import { instructionalDesignOutputSchema, InstructionalDesignOutput, CurationOutput } from './types';

export async function projetarConteudo(params: {
  jobId: string;
  empresaId: string;
  vendedorId: string;
  topic: string;
  objective: string | null;
  curation: CurationOutput;
  mandamentosOficiais: { numero: number; conteudoOficial: string }[];
}): Promise<InstructionalDesignOutput> {
  const contextoOficial =
    params.mandamentosOficiais.length > 0
      ? `13 Mandamentos com conteúdo oficial cadastrado:\n${params.mandamentosOficiais.map((m) => `#${m.numero}: ${m.conteudoOficial}`).join('\n')}`
      : 'Nenhum dos 13 Mandamentos tem conteúdo oficial cadastrado ainda — não os mencione como se existissem.';

  const { systemPrompt, userMessage } = montarPrompt({
    officialContext: contextoOficial,
    upstreamOutput:
      `Curadoria (etapa anterior do pipeline) — ideias principais: ${params.curation.mainIdeas.join('; ') || 'nenhuma'}; ` +
      `pontos que merecem treinamento: ${params.curation.trainingWorthyPoints.join('; ') || 'nenhum'}`,
    adminRequest: params.objective ?? undefined,
    task:
      `Com base na curadoria acima sobre o tema "${params.topic}", crie um rascunho de aula ORIGINAL (nunca copie a fonte). Responda em JSON: ` +
      `{ "title": string, "description": string, "content": string, "estimatedMinutes": number, "quizRecommended": boolean, "simulationRecommended": boolean }.`,
  });

  return chamarAgente(
    {
      empresaId: params.empresaId,
      vendedorId: params.vendedorId,
      jobId: params.jobId,
      specialist: 'INSTRUCTIONAL_DESIGNER',
      specialistMockKey: 'instructional_designer',
      systemPrompt,
      userMessage,
      context: {
        topic: params.topic,
        objective: params.objective,
        mainIdeas: params.curation.mainIdeas,
        trainingWorthyPoints: params.curation.trainingWorthyPoints,
        mandamentosOficiais: params.mandamentosOficiais,
      },
    },
    instructionalDesignOutputSchema
  );
}
