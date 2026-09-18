// SimulationContext (seção "SIMULATION CONTEXT" da Fatia 6). Estrutura
// mínima e explícita — nunca envia dado de outro vendedor, dado
// administrativo, histórico do Coach ou objeto ORM bruto.
import { PlaybookSectionContexto } from '../treinador/context.types';
import { CriterioAvaliacao } from './rubrica';

export interface PersonaSimulacao {
  profile: string;
  initialNeed: string;
  hiddenNeeds: string[];
  objections: string[];
  behavior: string;
  successCondition: string;
}

export interface SimulationContext {
  seller: {
    displayName: string;
  };
  scenario: {
    code: string;
    title: string;
    objective: string;
    difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  };
  customerPersona: PersonaSimulacao;
  playbook: {
    version: number | null;
    relevantSections: PlaybookSectionContexto[];
  };
  // `sellerDevelopment` REMOVIDO na Etapa 2A. Era montado (pagando uma chamada
  // a `getMemoria`) e nunca renderizado por `prompts/context-formatter.ts` —
  // custo sem uso. E wire-lo seria errado nos dois destinos possíveis: a
  // cliente simulada não deve conhecer as fraquezas de quem a atende (passaria
  // a mirá-las artificialmente), e o avaliador não deve ser enviesado por elas
  // (a nota tem que ser comparável entre vendedores, sempre contra a rubrica).
}

export interface SimulationEvaluationContext {
  scenario: {
    title: string;
    objective: string;
  };
  criteria: CriterioAvaliacao[];
  transcript: { role: 'VENDEDOR' | 'CLIENTE'; content: string }[];
  playbook: {
    version: number | null;
    relevantSections: PlaybookSectionContexto[];
  };
}
