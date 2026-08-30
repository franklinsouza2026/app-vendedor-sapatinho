// Validação/normalização da avaliação retornada pelo provider (seção "NOTA"
// e "AVALIAÇÃO ESTRUTURADA" da Fatia 6). O provider NUNCA decide a nota
// final sozinho — ele preenche scores por critério, e o scoreFinal é
// SEMPRE calculado aqui, deterministicamente. Se o formato vier inválido,
// retorna `null` — o chamador nunca persiste uma nota falsa nesse caso.
import { CriterioAvaliacao } from './rubrica';

export interface AvaliacaoNormalizada {
  scores: Record<string, number>;
  scoreFinal: number;
  strengths: string[];
  improvements: string[];
  missedOpportunities: string[];
  betterExample: string;
  summary: string;
}

function clamp(valor: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valor));
}

function extrairArrayDeStrings(obj: Record<string, unknown>, chave: string): string[] {
  const valor = obj[chave];
  if (!Array.isArray(valor)) return [];
  return valor.filter((v): v is string => typeof v === 'string');
}

export function normalizarAvaliacao(conteudoBruto: string, criteriosEsperados: CriterioAvaliacao[]): AvaliacaoNormalizada | null {
  if (criteriosEsperados.length === 0) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(conteudoBruto);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;

  if (typeof obj.scores !== 'object' || obj.scores === null) return null;
  const scoresBrutos = obj.scores as Record<string, unknown>;

  const scores: Record<string, number> = {};
  for (const criterio of criteriosEsperados) {
    const valor = scoresBrutos[criterio];
    if (typeof valor !== 'number' || !Number.isFinite(valor)) return null; // formato inválido — nunca persistir nota falsa
    scores[criterio] = clamp(Math.round(valor), 0, 100);
  }

  const valores = Object.values(scores);
  const scoreFinal = Math.round(valores.reduce((acc, v) => acc + v, 0) / valores.length);

  return {
    scores,
    scoreFinal,
    strengths: extrairArrayDeStrings(obj, 'strengths'),
    improvements: extrairArrayDeStrings(obj, 'improvements'),
    missedOpportunities: extrairArrayDeStrings(obj, 'missedOpportunities'),
    betterExample: typeof obj.betterExample === 'string' ? obj.betterExample : '',
    summary: typeof obj.summary === 'string' ? obj.summary : '',
  };
}
