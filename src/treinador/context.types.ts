// TrainerContext — seção 12 da Fatia 5. Reaproveita o QUE FAZ SENTIDO do
// CoachContext (seller/store/performance/baseline/development), mas não
// importa CoachContext inteiro nem envia dado que o Treinador não precisa
// (ex.: gamificação, XP, streak) — nunca "cegamente tudo".
import { ModoTreinador, OrigemConteudoPlaybook } from '@prisma/client';

export interface PlaybookSectionContexto {
  category: string;
  title: string;
  content: string;
  origin: OrigemConteudoPlaybook;
}

export interface TrainerContext {
  seller: {
    displayName: string;
  };
  store: {
    name: string;
  };
  performance: {
    ticket: number;
    pa: number;
    goalPercent: number | null;
  };
  baseline: {
    ticket: number | null;
    pa: number | null;
  };
  development: {
    /** Origem KPI (PA/ticket vs. baseline). */
    strengths: string[];
    /** Origem KPI. */
    developmentAreas: string[];
    /** Origem KPI. */
    currentFocus: string | null;
    recentTrainings: string[];
    /** Origem EVIDÊNCIA (Universidade) — nunca KPI. Ver memory.service.ts. */
    competencyGaps: { nome: string; score: number; target: number; gap: number; prioridade: string }[];
  };
  playbook: {
    version: number | null; // versão publicada usada (null se a empresa ainda não tem playbook)
    relevantSections: PlaybookSectionContexto[];
  };
  request: {
    mode: ModoTreinador;
    objection: string | null;
    situation: string | null;
  };
  freshness: {
    lastDataSyncAt: string | null;
  };
}
