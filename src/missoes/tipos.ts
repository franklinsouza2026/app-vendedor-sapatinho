// Tipos compartilhados do módulo de Missões/Desafios (Fatia 7).
import { CategoriaMissao, CriterioMissao, PeriodoMissao, TipoAcaoMissao } from '@prisma/client';

export interface AcaoRecomendada {
  actionType: TipoAcaoMissao;
  actionReference: Record<string, string> | null;
}

export interface MissaoSeed {
  code: string;
  title: string;
  description: string;
  category: CategoriaMissao;
  criterionType: CriterioMissao;
  criterionConfig?: Record<string, unknown>;
  periodType: PeriodoMissao;
  acao: AcaoRecomendada;
}

export interface DesafioSeed {
  code: string;
  title: string;
  description: string;
  criterionType: string;
  criterionConfig?: Record<string, unknown>;
  periodType: PeriodoMissao;
}

/** Resultado da avaliação de um critério contra os dados reais — nunca decidido pelo frontend/LLM. */
export interface ResultadoCriterio {
  atingido: boolean;
  progressoAtual: number;
  progressoAlvo: number;
}
