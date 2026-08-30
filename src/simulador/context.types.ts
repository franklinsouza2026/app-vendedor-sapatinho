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
  sellerDevelopment: {
    strengths: string[];
    developmentAreas: string[];
    currentFocus: string | null;
  };
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
