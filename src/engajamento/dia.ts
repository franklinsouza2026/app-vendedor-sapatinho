/**
 * "Que dia é hoje" no FUSO DA EMPRESA (Empresa.timezone, IANA).
 *
 * Toda regra de engajamento que depende do DIA (check-in, frequência,
 * streak de acesso) passa por aqui. O servidor é a fonte da verdade: nunca
 * se usa data enviada pelo cliente, nem o fuso do processo (um container em
 * UTC transformaria 21h de Pernambuco em "amanhã").
 *
 * Dias são representados como string 'YYYY-MM-DD' (o dia LOCAL) e gravados
 * em colunas DATE. A aritmética de dias é feita em UTC sobre essa string,
 * o que é exato (sem horário de verão envolvido).
 */
const formatadores = new Map<string, Intl.DateTimeFormat>();

function formatador(timezone: string): Intl.DateTimeFormat {
  let f = formatadores.get(timezone);
  if (!f) {
    // en-CA formata como YYYY-MM-DD.
    f = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
    formatadores.set(timezone, f);
  }
  return f;
}

/** Dia local (YYYY-MM-DD) de um instante, no fuso informado. Lança se o fuso for inválido. */
export function diaLocal(instante: Date, timezone: string): string {
  return formatador(timezone).format(instante);
}

/** Converte 'YYYY-MM-DD' no Date usado em colunas @db.Date (meia-noite UTC daquele dia). */
export function paraDate(dia: string): Date {
  return new Date(`${dia}T00:00:00.000Z`);
}

/** Converte o Date de uma coluna @db.Date de volta para 'YYYY-MM-DD'. */
export function deDate(data: Date): string {
  return data.toISOString().slice(0, 10);
}

export function somarDias(dia: string, n: number): string {
  const d = paraDate(dia);
  d.setUTCDate(d.getUTCDate() + n);
  return deDate(d);
}

/** Dia da semana ISO: 1 = segunda … 7 = domingo. */
export function diaDaSemana(dia: string): number {
  const d = paraDate(dia).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Segunda-feira da semana do dia (semana comercial seg → dom). */
export function inicioDaSemana(dia: string): string {
  return somarDias(dia, -(diaDaSemana(dia) - 1));
}

/** Quantidade de dias entre dois dias, inclusive nas pontas (0 se fim < início). */
export function diasEntre(inicio: string, fim: string): number {
  if (fim < inicio) return 0;
  return Math.round((paraDate(fim).getTime() - paraDate(inicio).getTime()) / 86_400_000) + 1;
}

/** Lista de dias de `inicio` a `fim`, inclusive. */
export function listarDias(inicio: string, fim: string): string[] {
  const dias: string[] = [];
  for (let d = inicio; d <= fim; d = somarDias(d, 1)) dias.push(d);
  return dias;
}
