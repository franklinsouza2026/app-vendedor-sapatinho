// Catálogo de cenários do Simulador — GLOBAL (não por empresa), mesmo
// raciocínio de Badge/PlaybookSection.origem: são situações genéricas de
// atendimento, não política de uma empresa. A política real da empresa
// entra via playbookCategorias (resolvidas contra o Playbook tenant-scoped
// do vendedor, nunca daqui).
import { DificuldadeSimulacao, Papel } from '@prisma/client';
import { prisma } from '../db';
import { PersonaSimulacao } from './context.types';
import { CriterioAvaliacao, isCriterioValido } from './rubrica';
import { SimulationError } from './erros';

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

/**
 * Resolve o cenário + a persona/maxTurns da dificuldade pedida.
 *
 * `papel` é OBRIGATÓRIO desde a Fatia 9.7: ele era opcional com default
 * 'VENDEDOR', e dois dos três call sites não o passavam — o que fazia toda
 * sessão gerencial quebrar do 2º turno em diante (regressão real da Fatia 9.6,
 * encontrada em auditoria). Tornar o parâmetro obrigatório faz o compilador
 * impedir que isso volte a acontecer, em vez de depender de revisão humana.
 *
 * Lança `SimulationError` (nunca `Error` cru, que virava 500): 'not_found' pra
 * cenário inexistente/inativo/de papel incompatível — sempre a mesma mensagem,
 * pra nunca revelar a um vendedor que um cenário gerencial existe, e vice-versa.
 */
export async function resolverCenario(scenarioId: string, dificuldade: DificuldadeSimulacao, papel: Papel): Promise<CenarioResolvido> {
  const cenario = await prisma.simulationScenario.findUnique({ where: { id: scenarioId } });
  if (!cenario) throw new SimulationError('not_found', 'cenário não encontrado');
  if (!cenario.active) throw new SimulationError('not_found', 'cenário não encontrado');

  const ehGerencial = cenario.category === CATEGORIA_GERENCIAL;
  if ((papel === 'GERENTE') !== ehGerencial) throw new SimulationError('not_found', 'cenário não encontrado');

  const personas = cenario.personasPorDificuldade as unknown as Record<string, PersonaSimulacao>;
  const persona = personas[dificuldade];
  // Erro de configuração do catálogo (não é culpa do cliente), mas ainda assim
  // é 4xx tratado, nunca 500: o vendedor pediu uma dificuldade que este cenário
  // não oferece.
  if (!persona) throw new SimulationError('invalid_state', `este cenário não tem a dificuldade ${dificuldade} configurada`);

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
