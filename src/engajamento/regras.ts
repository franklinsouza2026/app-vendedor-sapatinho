/**
 * Regras puras de engajamento — frequência "X de Y dias" e sequência (streak)
 * de acesso. Sem banco: recebem dias (YYYY-MM-DD) e devolvem números, para
 * serem testadas isoladamente e reaproveitadas por Admin, gerente e vendedor.
 *
 * DIAS VÁLIDOS: o produto ainda NÃO tem escala de trabalho confiável no
 * backend (folga, turno, loja fechada). Para não inventar escala, todo dia
 * corrido conta como válido, limitado à janela em que o vendedor estava
 * elegível (a partir da admissão — `Vendedor.createdAt`). O cálculo recebe
 * `ehDiaValido` justamente para, quando houver escala/calendário, trocar a
 * regra num ponto só.
 */
import { listarDias, somarDias } from './dia';

export type RegraDiaValido = (dia: string) => boolean;

/** Regra atual: todo dia corrido é válido (sem escala no sistema). */
export const todoDiaEhValido: RegraDiaValido = () => true;

export interface Frequencia {
  diasComAcesso: number;
  diasValidos: number;
  /** 0..100, ou null se ainda não há dia válido no período. */
  percentual: number | null;
}

/**
 * Frequência no período [inicio, fim] considerando só os dias válidos JÁ
 * DECORRIDOS (até `hoje`) e a partir de quando o vendedor ficou elegível.
 * Quarta-feira com acesso seg e qua → 2 de 3 dias (nunca 2 de 7).
 */
export function calcularFrequencia(params: { diasComAcesso: Set<string>; inicio: string; fim: string; hoje: string; elegivelDesde: string; ehDiaValido?: RegraDiaValido }): Frequencia {
  const ehDiaValido = params.ehDiaValido ?? todoDiaEhValido;
  const de = params.inicio > params.elegivelDesde ? params.inicio : params.elegivelDesde;
  const ate = params.fim < params.hoje ? params.fim : params.hoje;
  if (ate < de) return { diasComAcesso: 0, diasValidos: 0, percentual: null };
  const dias = listarDias(de, ate).filter(ehDiaValido);
  const comAcesso = dias.filter((d) => params.diasComAcesso.has(d)).length;
  return { diasComAcesso: comAcesso, diasValidos: dias.length, percentual: dias.length ? Math.round((comAcesso / dias.length) * 100) : null };
}

/**
 * Sequência atual de dias válidos consecutivos com acesso. Se hoje ainda não
 * houve acesso, a sequência de ontem continua "viva" (o dia não acabou).
 * Dias não válidos (quando houver escala) não quebram nem somam.
 */
export function calcularStreakAtual(diasComAcesso: Set<string>, hoje: string, ehDiaValido: RegraDiaValido = todoDiaEhValido, limite = 400): number {
  let dia = diasComAcesso.has(hoje) ? hoje : somarDias(hoje, -1);
  let streak = 0;
  for (let i = 0; i < limite; i++) {
    if (!ehDiaValido(dia)) {
      dia = somarDias(dia, -1);
      continue;
    }
    if (!diasComAcesso.has(dia)) break;
    streak++;
    dia = somarDias(dia, -1);
  }
  return streak;
}

/** Maior sequência dentro dos dias informados. */
export function calcularMaiorStreak(diasComAcesso: Set<string>, ehDiaValido: RegraDiaValido = todoDiaEhValido): number {
  const ordenados = [...diasComAcesso].sort();
  let maior = 0;
  let atual = 0;
  let anterior: string | null = null;
  for (const d of ordenados) {
    if (!ehDiaValido(d)) continue;
    let consecutivo = false;
    if (anterior) {
      // pula dias não válidos entre o anterior e o atual
      let esperado = somarDias(anterior, 1);
      while (esperado < d && !ehDiaValido(esperado)) esperado = somarDias(esperado, 1);
      consecutivo = esperado === d;
    }
    atual = consecutivo ? atual + 1 : 1;
    maior = Math.max(maior, atual);
    anterior = d;
  }
  return maior;
}

