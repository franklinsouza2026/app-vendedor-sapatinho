// SimulationContextBuilder (seção "SIMULATION CONTEXT" da Fatia 6). Resolve
// tudo a partir do vendedorId (sempre do JWT). Reaproveita getMemoria do
// Coach (mesma fonte de "pontos fortes/em desenvolvimento" já usada pelo
// Treinador) — nunca duplica o cálculo.
import { CategoriaPlaybook, DificuldadeSimulacao } from '@prisma/client';
import { prisma } from '../db';
import { getMemoria } from '../coach/memory.service';
import { getSecoesPorCategorias } from '../treinador/playbook.service';
import { CenarioResolvido } from './scenario.service';
import { SimulationContext, SimulationEvaluationContext } from './context.types';
import { CriterioAvaliacao } from './rubrica';

export async function buildSimulationContext(vendedorId: string, cenario: CenarioResolvido, dificuldade: DificuldadeSimulacao): Promise<SimulationContext> {
  const vendedor = await prisma.vendedor.findUniqueOrThrow({ where: { id: vendedorId } });
  const [memoria, playbookInfo] = await Promise.all([
    getMemoria(vendedorId),
    getSecoesPorCategorias(vendedor.empresaId, cenario.playbookCategorias as CategoriaPlaybook[]),
  ]);

  return {
    seller: { displayName: vendedor.nome },
    scenario: { code: cenario.code, title: cenario.title, objective: cenario.objective, difficulty: dificuldade },
    customerPersona: cenario.persona,
    playbook: { version: playbookInfo.version, relevantSections: playbookInfo.sections },
    sellerDevelopment: {
      strengths: memoria.strengths,
      developmentAreas: memoria.developmentAreas,
      currentFocus: memoria.currentFocus,
    },
  };
}

export async function buildEvaluationContext(
  empresaId: string,
  cenario: { title: string; objective: string; playbookCategorias: string[] },
  criterios: CriterioAvaliacao[],
  transcript: { role: 'VENDEDOR' | 'CLIENTE'; content: string }[]
): Promise<SimulationEvaluationContext> {
  const playbookInfo = await getSecoesPorCategorias(empresaId, cenario.playbookCategorias as CategoriaPlaybook[]);

  return {
    scenario: { title: cenario.title, objective: cenario.objective },
    criteria: criterios,
    transcript,
    playbook: { version: playbookInfo.version, relevantSections: playbookInfo.sections },
  };
}
