// SIMULATION_DESIGNER (seção 24/25). Produz um TrainingScenarioDraft — nunca
// escreve direto em SimulationScenario (catálogo ativo do Simulador). O
// contrato de publicação (copiar campos aprovados pra um cenário real) fica
// pronto em job.service.ts; reconstruir o Simulador pra ganhar lifecycle
// próprio fica documentado como evolução futura (seção 25).
import { chamarAgente } from './agent-runtime';
import { montarPrompt } from './prompts';
import { simulationDesignOutputSchema, SimulationDesignOutput } from './types';

export async function projetarSimulacao(params: {
  jobId: string;
  empresaId: string;
  vendedorId: string;
  topic: string;
  lessonContent: string;
}): Promise<SimulationDesignOutput> {
  const { systemPrompt, userMessage } = montarPrompt({
    task:
      `Com base no conteúdo da aula sobre "${params.topic}" (${params.lessonContent}), projete um rascunho de cenário de simulação de atendimento pra o ` +
      `vendedor praticar. Responda em JSON: { "title": string, "context": string, "customerProfile": string, "sellerObjective": string, "objections": string[], ` +
      `"difficulty": "EASY"|"MEDIUM"|"HARD", "competencies": string[], "evaluationCriteria": string[] }.`,
  });

  return chamarAgente(
    {
      empresaId: params.empresaId,
      vendedorId: params.vendedorId,
      jobId: params.jobId,
      specialist: 'SIMULATION_DESIGNER',
      specialistMockKey: 'simulation_designer',
      systemPrompt,
      userMessage,
      context: { topic: params.topic, lessonContent: params.lessonContent },
    },
    simulationDesignOutputSchema
  );
}
