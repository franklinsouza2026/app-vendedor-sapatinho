// Catálogo de cenários do Simulador — GLOBAL (não por empresa), mesmo
// raciocínio de Badge/PlaybookSection.origem: são situações genéricas de
// atendimento, não política de uma empresa. A política real da empresa
// entra via playbookCategorias (resolvidas contra o Playbook tenant-scoped
// do vendedor, nunca daqui).
import { DificuldadeSimulacao, Papel } from '@prisma/client';
import { prisma } from '../db';
import { PersonaSimulacao } from './context.types';
import { CriterioAvaliacao, isCriterioValido } from './rubrica';

export interface CenarioResolvido {
  id: string;
  code: string;
  title: string;
  description: string;
  category: string;
  objective: string;
  playbookCategorias: string[];
  criteriosAvaliacao: CriterioAvaliacao[];
  persona: PersonaSimulacao;
  maxTurns: number;
}

// Categoria gerencial (Fatia 9.6, seção 33) é isolada por catálogo — nunca
// mostra situação de venda pro gerente nem situação de gestão pro vendedor
// (mesmo raciocínio de `audience` da Universidade, aqui feito por categoria
// já que `SimulationScenario.category` é livre, sem campo de audience).
const CATEGORIA_GERENCIAL = 'GESTAO_DE_PESSOAS';

export async function listarCenariosAtivos(papel: Papel = 'VENDEDOR') {
  return prisma.simulationScenario.findMany({
    where: { active: true, category: papel === 'GERENTE' ? CATEGORIA_GERENCIAL : { not: CATEGORIA_GERENCIAL } },
    orderBy: [{ category: 'asc' }, { title: 'asc' }],
  });
}

/** Resolve o cenário + a persona/maxTurns da dificuldade pedida. Lança se o cenário não existir/estiver inativo, se a categoria não bater com o papel de quem pediu (mesmo filtro de listarCenariosAtivos, agora também na criação — não só na listagem), ou se a persona da dificuldade não estiver cadastrada. */
export async function resolverCenario(scenarioId: string, dificuldade: DificuldadeSimulacao, papel: Papel = 'VENDEDOR'): Promise<CenarioResolvido> {
  const cenario = await prisma.simulationScenario.findUniqueOrThrow({ where: { id: scenarioId } });
  if (!cenario.active) throw new Error('cenário inativo');
  // Mesmo erro genérico de "não encontrado" tanto pra cenário inexistente
  // quanto pra cenário de categoria errada pro papel — nunca revela a um
  // vendedor que um cenário gerencial (ou vice-versa) existe (IDOR-safe).
  const ehGerencial = cenario.category === CATEGORIA_GERENCIAL;
  if ((papel === 'GERENTE') !== ehGerencial) throw new Error('cenário não encontrado para este papel');

  const personas = cenario.personasPorDificuldade as unknown as Record<string, PersonaSimulacao>;
  const persona = personas[dificuldade];
  if (!persona) throw new Error(`persona não cadastrada para dificuldade ${dificuldade} do cenário ${cenario.code}`);

  const maxTurnsPorDificuldade = cenario.maxTurnsPorDificuldade as Record<string, number>;
  const maxTurns = maxTurnsPorDificuldade[dificuldade] ?? 10;

  const criteriosBrutos = Array.isArray(cenario.criteriosAvaliacao) ? cenario.criteriosAvaliacao : [];
  const criteriosAvaliacao = criteriosBrutos.filter(isCriterioValido);

  return {
    id: cenario.id,
    code: cenario.code,
    title: cenario.title,
    description: cenario.description,
    category: cenario.category,
    objective: cenario.objective,
    playbookCategorias: Array.isArray(cenario.playbookCategorias) ? (cenario.playbookCategorias as string[]) : [],
    criteriosAvaliacao,
    persona,
    maxTurns,
  };
}
