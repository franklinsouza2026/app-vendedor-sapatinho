// AI Recommendation (Fatia 7.5E, seção 35-36) — reaproveita a infraestrutura
// da Training Intelligence Platform (Fatia 7.5D: agent-runtime + prompts +
// AI Gateway), nunca cria um caminho paralelo de IA. Só sugere sequência
// DENTRO de conteúdo já válido — todo ID que o LLM propõe é validado contra
// o banco antes de qualquer uso; um ID inventado, de outro tenant, ou de
// conteúdo não publicado é sempre rejeitado, nunca "buscado mesmo assim".
import { z } from 'zod';
import { Papel, PublicoConteudo } from '@prisma/client';
import { prisma } from '../db';
import { chamarAgente } from '../training-intelligence/agent-runtime';
import { montarPrompt } from '../training-intelligence/prompts';

const recomendacaoItemSchema = z.object({ tipo: z.enum(['LESSON', 'TRACK', 'QUIZ', 'SIMULATION', 'MISSION']), sourceId: z.string(), rationale: z.string() });
const recomendacaoOutputSchema = z.object({ items: z.array(recomendacaoItemSchema) });

export interface RecomendacaoValidada {
  tipo: 'LESSON' | 'TRACK' | 'QUIZ' | 'SIMULATION' | 'MISSION';
  sourceId: string;
  rationale: string;
  title: string;
}

/** Valida CADA id proposto pelo LLM contra o conteúdo real — publicado,
 * ativo, existente. Descarta silenciosamente qualquer item inválido (nunca
 * lança erro pro Admin — só devolve a lista já filtrada, seção 36). */
async function validarEResolverItens(items: z.infer<typeof recomendacaoItemSchema>[]): Promise<RecomendacaoValidada[]> {
  const validados: RecomendacaoValidada[] = [];
  for (const item of items) {
    if (item.tipo === 'LESSON') {
      const aula = await prisma.academyLesson.findFirst({ where: { id: item.sourceId, status: 'PUBLISHED', active: true } });
      if (aula) validados.push({ ...item, title: aula.title });
    } else if (item.tipo === 'TRACK') {
      const trilha = await prisma.academyTrack.findFirst({ where: { id: item.sourceId, status: 'PUBLISHED', active: true } });
      if (trilha) validados.push({ ...item, title: trilha.title });
    } else if (item.tipo === 'QUIZ') {
      const quiz = await prisma.academyQuiz.findFirst({ where: { id: item.sourceId }, include: { aula: true } });
      if (quiz && quiz.aula.status === 'PUBLISHED' && quiz.aula.active) validados.push({ ...item, title: `Quiz — ${quiz.aula.title}` });
    } else if (item.tipo === 'SIMULATION') {
      const cenario = await prisma.simulationScenario.findFirst({ where: { id: item.sourceId, active: true } });
      if (cenario) validados.push({ ...item, title: cenario.title });
    } else if (item.tipo === 'MISSION') {
      const missao = await prisma.missionDefinition.findFirst({ where: { id: item.sourceId, active: true } });
      if (missao) validados.push({ ...item, title: missao.title });
    }
  }
  return validados;
}

/**
 * Sugere uma sequência de conteúdo pra fechar o gap de uma competência —
 * chamada síncrona (não precisa da fila da Fatia 7.5D: latência baixa, só
 * produz uma lista curta de ids + rationale, não um pacote de conteúdo
 * novo). Backend sempre valida os ids antes de devolver ao chamador.
 */
export async function sugerirSequenciaDeAprendizado(params: { empresaId: string; vendedorId: string; papel: Papel; competencyId: string }): Promise<RecomendacaoValidada[]> {
  const competencia = await prisma.competency.findUniqueOrThrow({ where: { id: params.competencyId } });

  const audienciasPermitidas: PublicoConteudo[] = params.papel === 'GERENTE' ? ['MANAGER', 'BOTH'] : ['SELLER', 'BOTH'];
  // Filtro de competencyIds feito NO BANCO via `array_contains` (JSONB
  // nativo do Postgres) — nunca buscar um `take` arbitrário sem filtro e
  // filtrar depois em JS: sob volume real (ou muitos outros registros
  // concorrentes num banco compartilhado, como em teste), o item relevante
  // podia ficar fora da janela do `take` antes mesmo de ser avaliado.
  const relevantes = await prisma.academyLesson.findMany({
    where: { status: 'PUBLISHED', active: true, audience: { in: audienciasPermitidas }, competencyIds: { array_contains: params.competencyId } },
    select: { id: true, title: true, competencyIds: true },
    take: 30,
  });

  if (relevantes.length === 0) return [];

  const { systemPrompt, userMessage } = montarPrompt({
    officialContext: `Competência: ${competencia.name} — ${competencia.description}`,
    upstreamOutput: `Aulas publicadas disponíveis (id | título): ${relevantes.map((l) => `${l.id} | ${l.title}`).join('; ')}`,
    task:
      'Escolha até 3 dessas aulas (usando o id EXATO listado acima, nunca invente um id novo) na ordem mais eficaz pra desenvolver esta competência, com uma justificativa curta ' +
      'pra cada uma. Responda em JSON: { "items": [{ "tipo": "LESSON", "sourceId": string, "rationale": string }] }.',
  });

  const specialistMockKey = params.papel === 'GERENTE' ? 'manager_training_agent' : 'seller_training_agent';
  const specialist = params.papel === 'GERENTE' ? 'MANAGER_TRAINING_AGENT' : 'SELLER_TRAINING_AGENT';

  const resultado = await chamarAgente(
    {
      empresaId: params.empresaId,
      vendedorId: params.vendedorId,
      jobId: `learning-path-${params.vendedorId}-${params.competencyId}`,
      specialist,
      specialistMockKey,
      systemPrompt,
      userMessage,
      context: { competency: competencia.name, candidatos: relevantes },
    },
    recomendacaoOutputSchema
  );

  return validarEResolverItens(resultado.items);
}
