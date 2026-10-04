/**
 * "Que dia é hoje" no FUSO DA EMPRESA (Empresa.timezone, IANA).
 *
 * FONTE ÚNICA de tempo da Fase 1 (convergência): meta, venda, ranking,
 * missão, campanha, competição, sequência, recorde, acesso e fechamento
 * passam por aqui. O servidor é a fonte da verdade: nunca
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

/** Fuso padrão das empresas existentes (Brasília; mesmo offset de Pernambuco, sem horário de verão). */
export const TZ_PADRAO = 'America/Sao_Paulo';

const formatadoresHora = new Map<string, Intl.DateTimeFormat>();

function formatadorHora(timezone: string): Intl.DateTimeFormat {
  let f = formatadoresHora.get(timezone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    formatadoresHora.set(timezone, f);
  }
  return f;
}

/** Diferença (ms) entre o relógio de parede do fuso e UTC naquele instante. */
export function offsetMs(instante: Date, timezone: string): number {
  const partes = Object.fromEntries(formatadorHora(timezone).formatToParts(instante).map((p) => [p.type, p.value]));
  const comoUtc = Date.UTC(Number(partes.year), Number(partes.month) - 1, Number(partes.day), Number(partes.hour), Number(partes.minute), Number(partes.second));
  const semMs = Math.floor(instante.getTime() / 1000) * 1000;
  return comoUtc - semMs;
}

/** Instante (UTC) da meia-noite LOCAL do dia 'YYYY-MM-DD' no fuso informado. */
export function instanteDoDia(dia: string, timezone: string): Date {
  const meiaNoiteUtc = paraDate(dia).getTime();
  // Duas passadas resolvem bordas de horário de verão (offset muda no dia).
  let instante = meiaNoiteUtc - offsetMs(new Date(meiaNoiteUtc), timezone);
  instante = meiaNoiteUtc - offsetMs(new Date(instante), timezone);
  return new Date(instante);
}

/** Meia-noite local (instante UTC) do dia em que `instante` cai, no fuso. */
export function inicioDoDiaLocal(instante: Date, timezone: string): Date {
  return instanteDoDia(diaLocal(instante, timezone), timezone);
}

/** Último milissegundo do dia local. */
export function fimDoDiaLocal(dia: string, timezone: string): Date {
  return new Date(instanteDoDia(somarDias(dia, 1), timezone).getTime() - 1);
}

/** Mês local 'YYYY-MM' de um instante. */
export function mesLocal(instante: Date, timezone: string): string {
  return diaLocal(instante, timezone).slice(0, 7);
}

export function primeiroDiaDoMes(mes: string): string {
  return `${mes}-01`;
}

export function diasNoMes(mes: string): number {
  const [ano, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(ano, m, 0)).getUTCDate();
}

export function ultimoDiaDoMes(mes: string): string {
  return `${mes}-${String(diasNoMes(mes)).padStart(2, '0')}`;
}

export function mesAnterior(mes: string): string {
  const [ano, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(ano, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

export function validarMes(mes: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(mes);
}

/** Fuso válido (IANA)? */
export function fusoValido(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}
