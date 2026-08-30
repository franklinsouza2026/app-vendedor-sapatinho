// CURATOR_AGENT (seção 17/18). Nunca publica — produz uma leitura crítica
// das fontes (ideias, redundâncias, contradições, riscos, lacunas) e sinaliza
// quando uma fonte externa contradiz conteúdo oficial já cadastrado
// (`officialConflict`), exigindo revisão humana (nunca sobrescrita
// silenciosa da política oficial — seção 18).
import { chamarAgente } from './agent-runtime';
import { montarPrompt } from './prompts';
import { curationOutputSchema, CurationOutput, FonteParaPrompt } from './types';

export async function curarFontes(params: {
  jobId: string;
  empresaId: string;
  vendedorId: string;
  topic: string;
  objective: string | null;
  researchSummary: string;
  sources: FonteParaPrompt[];
}): Promise<CurationOutput> {
  const { systemPrompt, userMessage } = montarPrompt({
    sources: params.sources,
    upstreamOutput: `Resumo de pesquisa (etapa anterior do pipeline): ${params.researchSummary}`,
    adminRequest: params.objective ?? undefined,
    task:
      `Com base no resumo de pesquisa e nas fontes acima sobre "${params.topic}", produza uma curadoria: principais ideias, redundâncias, ` +
      `contradições, riscos, relevância pro varejo, aplicabilidade, pontos que merecem virar treinamento, lacunas, ids das fontes usadas, e se alguma fonte ` +
      `contradiz um conteúdo oficial da empresa (officialConflict). Responda em JSON: { "mainIdeas": string[], "redundancies": string[], "contradictions": string[], ` +
      `"risks": string[], "relevance": string, "applicability": string, "trainingWorthyPoints": string[], "gaps": string[], "sourcesUsedIds": string[], "officialConflict": boolean }.`,
  });

  return chamarAgente(
    {
      empresaId: params.empresaId,
      vendedorId: params.vendedorId,
      jobId: params.jobId,
      specialist: 'CURATOR_AGENT',
      specialistMockKey: 'curator_agent',
      systemPrompt,
      userMessage,
      context: { topic: params.topic, objective: params.objective, sources: params.sources, researchSummary: params.researchSummary },
    },
    curationOutputSchema
  );
}
