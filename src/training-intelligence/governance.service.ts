// GOVERNANCE_AGENT (seção 28/64). IA não é autoridade final de aprovação —
// o resultado (PASS/REVIEW_REQUIRED/BLOCKED) é só um insumo pra revisão
// humana, nunca decide sozinho o destino do conteúdo. Findings são sempre
// persistidos (TrainingGovernanceFinding), mesmo quando PASS (lista vazia).
import { prisma } from '../db';
import { chamarAgente } from './agent-runtime';
import { montarPrompt } from './prompts';
import { governanceOutputSchema, GovernanceOutput, FonteParaPrompt } from './types';

export async function avaliarGovernanca(params: {
  jobId: string;
  empresaId: string;
  vendedorId: string;
  draftContent: string;
  sources: FonteParaPrompt[];
}): Promise<GovernanceOutput> {
  const { systemPrompt, userMessage } = montarPrompt({
    sources: params.sources,
    // O rascunho avaliado aqui foi gerado por OUTRO agente de IA a partir das
    // fontes acima — mesmo já reescrito, continua sendo dado derivado de
    // fonte não confiável (achado de segurança da Fatia 7.5D). O Governance
    // Agent é justamente quem precisa desconfiar dele, então ele nunca pode
    // aparecer na zona de instrução fixa (TAREFA).
    upstreamOutput: `Rascunho de aula gerado por outro agente de IA (etapa anterior do pipeline): ${params.draftContent}`,
    task:
      'Avalie o rascunho de conteúdo acima contra: conflito com conteúdo oficial, alegações sem suporte nas fontes, risco de copyright (cópia extensa da ' +
      'fonte em vez de síntese original), tom de marca, aconselhamento inadequado, fonte ausente/pouco confiável. ' +
      'Responda em JSON: { "status": "PASS"|"REVIEW_REQUIRED"|"BLOCKED", "findings": [{ "type": "OFFICIAL_CONFLICT"|"UNSUPPORTED_CLAIM"|"COPYRIGHT_RISK"|' +
      '"BRAND_TONE"|"INAPPROPRIATE_ADVICE"|"MISSING_SOURCE"|"LOW_RELIABILITY_SOURCE"|"MANDAMENTO_VIOLATION"|"OTHER", "message": string }] }.',
  });

  const resultado = await chamarAgente(
    {
      empresaId: params.empresaId,
      vendedorId: params.vendedorId,
      jobId: params.jobId,
      specialist: 'GOVERNANCE_AGENT',
      specialistMockKey: 'governance_agent',
      systemPrompt,
      userMessage,
      context: { sources: params.sources, draftContent: params.draftContent },
    },
    governanceOutputSchema
  );

  if (resultado.findings.length > 0) {
    await prisma.trainingGovernanceFinding.createMany({
      data: resultado.findings.map((f) => ({
        jobId: params.jobId,
        type: f.type,
        severity: resultado.status === 'BLOCKED' ? 'BLOCKED' : 'REVIEW_REQUIRED',
        message: f.message,
      })),
    });
  }

  await prisma.trainingIntelligenceJob.update({ where: { id: params.jobId }, data: { governanceStatus: resultado.status } });

  return resultado;
}
