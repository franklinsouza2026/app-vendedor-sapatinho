// RESEARCH_AGENT (seção 8/9/13). RETRIEVAL (buscar fontes) é sempre feito
// por um ResearchSourceProvider controlado, nunca pelo LLM navegando por
// conta própria — este service só faz a INTERPRETAÇÃO (síntese) das fontes
// já obtidas, e persiste a proveniência antes de qualquer coisa (seção 15).
import { prisma } from '../db';
import { chamarAgente } from './agent-runtime';
import { montarPrompt } from './prompts';
import { researchOutputSchema, ResearchOutput, fonteSchema } from './types';
import { FonteEncontrada, MockResearchSourceProvider, ResearchSourceProvider } from './research-source-provider';

export async function pesquisarFontes(jobId: string, topic: string, provider: ResearchSourceProvider = new MockResearchSourceProvider()) {
  const encontradas: FonteEncontrada[] = await provider.search(topic);

  const sources = await prisma.$transaction(
    encontradas.map((f) =>
      prisma.trainingSource.create({
        data: {
          jobId,
          type: 'WEB',
          url: f.url,
          title: f.title,
          publisher: f.publisher,
          author: f.author,
          publishedAt: f.publishedAt,
          retrievedAt: new Date(),
          summary: f.summary,
          reliability: f.reliability,
          rightsNotes: f.rightsNotes,
        },
      })
    )
  );

  return sources;
}

export async function sintetizarPesquisa(
  jobId: string,
  empresaId: string,
  vendedorId: string,
  topic: string,
  sources: { id: string; title: string; summary: string; publisher: string | null; reliability: string }[]
): Promise<ResearchOutput> {
  const fontesValidadas = sources.map((s) => fonteSchema.parse({ id: s.id, title: s.title, summary: s.summary, publisher: s.publisher, reliability: s.reliability }));

  const { systemPrompt, userMessage } = montarPrompt({
    sources: fontesValidadas,
    task: `Sintetize as fontes acima sobre o tema "${topic}" em um resumo de pesquisa objetivo e uma lista de insights-chave. Responda em JSON: { "researchSummary": string, "keyInsights": string[] }.`,
  });

  return chamarAgente(
    {
      empresaId,
      vendedorId,
      jobId,
      specialist: 'RESEARCH_AGENT',
      specialistMockKey: 'research_agent',
      systemPrompt,
      userMessage,
      context: { topic, sources: fontesValidadas },
    },
    researchOutputSchema
  );
}
