// Assistente de Gestão / "Conselheiro do Gerente" (Fatia 9, seção 78-84) —
// OPCIONAL: reaproveita o AI Gateway único (agent-runtime + montarPrompt já
// da Training Intelligence Platform), zero infra nova. Só resume/prioriza/
// sugere sobre dados JÁ CALCULADOS deterministicamente (Daily Huddle) —
// nunca calcula KPI, nunca decide sozinho, nunca sugere punição. Todo
// sellerId proposto pelo LLM é revalidado contra o banco antes de sair
// daqui (mesmo padrão de `ai-recommendation.service.ts`, Fatia 7.5E) —
// um id inventado, de outro tenant ou de outra loja é sempre descartado.
import { z } from 'zod';
import { prisma } from '../db';
import { chamarAgente } from '../training-intelligence/agent-runtime';
import { montarPrompt } from '../training-intelligence/prompts';
import { registrarEventoAuditoria } from '../identidade/auditoria.service';
import { montarDailyHuddle } from './daily-huddle.service';

const conselhoOutputSchema = z.object({
  summary: z.string(),
  priorities: z.array(z.object({ sellerId: z.string().nullable(), description: z.string() })),
  suggestedRecognitions: z.array(z.object({ sellerId: z.string(), reason: z.string() })),
});

export interface ConselhoGerencial {
  summary: string;
  priorities: { sellerId: string | null; description: string }[];
  suggestedRecognitions: { sellerId: string; reason: string }[];
}

export async function pedirConselhoGerencial(params: { empresaId: string; lojaId: string; managerId: string }): Promise<ConselhoGerencial> {
  const [huddle, vendedoresDaLoja] = await Promise.all([
    montarDailyHuddle(params.empresaId, params.lojaId),
    prisma.vendedor.findMany({ where: { empresaId: params.empresaId, lojaId: params.lojaId, papel: 'VENDEDOR' }, select: { id: true } }),
  ]);
  const idsValidosDaLoja = new Set(vendedoresDaLoja.map((v) => v.id));

  // Zona de DADO — nunca CPF, senha, apiKey, conversa do Conselheiro do
  // vendedor ou nota privada de 1:1 de outro gerente entram aqui.
  const contextoDados = {
    storeSummary: huddle.storeSummary,
    faturamentoOntem: huddle.faturamentoOntem,
    alertas: huddle.alertasPrioritarios.map((a) => ({ tipo: a.tipo, severidade: a.severidade, sellerId: a.sellerId, metadata: a.metadata })),
    highlights: huddle.highlights.map((h) => ({ tipo: h.tipo, sellerId: h.sellerId, descricao: h.descricao })),
    temporadaAtual: huddle.temporadaAtual?.name ?? null,
    treinamentosDaSemana: huddle.treinamentosDaSemana,
  };

  const { systemPrompt, userMessage } = montarPrompt({
    officialContext:
      'Você é um assistente de gestão para um GERENTE de uma loja de varejo de calçados. Você NUNCA calcula KPI/score, NUNCA decide um vencedor, NUNCA sugere punição/demissão, NUNCA classifica saúde mental. Você só resume, prioriza e sugere ações dentro do que os dados abaixo já mostram.',
    upstreamOutput: `Dados da loja hoje (já calculados, nunca recalcule): ${JSON.stringify(contextoDados)}`,
    task:
      'Resuma a situação da loja em até 3 frases factuais (nunca causais — não diga "porque" ou "está desmotivado"). ' +
      'Liste até 5 prioridades de ação, usando o "sellerId" EXATO de um vendedor citado nos dados quando for sobre uma pessoa específica, ou null quando for da loja toda — NUNCA invente um sellerId. ' +
      'Sugira até 3 reconhecimentos, usando o "sellerId" EXATO de um vendedor que aparece em "highlights". Responda em JSON: ' +
      '{ "summary": string, "priorities": [{ "sellerId": string|null, "description": string }], "suggestedRecognitions": [{ "sellerId": string, "reason": string }] }.',
  });

  const resultado = await chamarAgente(
    {
      empresaId: params.empresaId,
      vendedorId: params.managerId,
      jobId: `manager-advisor-${params.lojaId}-${Date.now()}`,
      specialist: 'MANAGER_ADVISOR',
      specialistMockKey: 'manager_advisor',
      systemPrompt,
      userMessage,
      context: contextoDados,
    },
    conselhoOutputSchema
  );

  await registrarEventoAuditoria({ empresaId: params.empresaId, acao: 'MANAGER_AI_ADVICE_REQUESTED', actorId: params.managerId, metadata: { lojaId: params.lojaId } });

  return {
    summary: resultado.summary,
    priorities: resultado.priorities.filter((p) => p.sellerId === null || idsValidosDaLoja.has(p.sellerId)),
    suggestedRecognitions: resultado.suggestedRecognitions.filter((r) => idsValidosDaLoja.has(r.sellerId)),
  };
}
