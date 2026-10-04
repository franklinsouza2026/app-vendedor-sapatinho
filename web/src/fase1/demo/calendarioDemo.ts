/**
 * Calendário e meta diária do MUNDO DE DEMONSTRAÇÃO (fixtures de teste de
 * interface). Não é regra de produção: no app real a meta do dia vem pronta
 * do servidor (D6 — meta mensal ÷ dias de trabalho previstos do vendedor).
 */
import type { EstadoDemo } from './estado';

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function ehDiaValido(data: Date, estado: EstadoDemo, lojaId: string): boolean {
  if (data.getDay() === 0 && !estado.calendario.abreDomingo) return false;
  const dia = iso(data);
  return !estado.calendario.feriados.some((f) => f.data === dia && (f.lojas === 'TODAS' || f.lojas.includes(lojaId)));
}

/** Dias válidos do mês de referência (YYYY-MM) para a loja. */
export function diasValidosDoMes(referencia: string, estado: EstadoDemo, lojaId: string): string[] {
  const [ano, mes] = referencia.split('-').map(Number);
  const ultimo = new Date(ano, mes, 0).getDate();
  const dias: string[] = [];
  for (let d = 1; d <= ultimo; d++) {
    const data = new Date(ano, mes - 1, d);
    if (ehDiaValido(data, estado, lojaId)) dias.push(iso(data));
  }
  return dias;
}

/** Dias válidos DEPOIS de hoje até o fim do mês. */
export function diasValidosRestantes(agoraIso: string, estado: EstadoDemo, lojaId: string): number {
  const hoje = agoraIso.slice(0, 10);
  return diasValidosDoMes(hoje.slice(0, 7), estado, lojaId).filter((d) => d > hoje).length;
}

export function feriadoHoje(agoraIso: string, estado: EstadoDemo, lojaId: string) {
  const hoje = agoraIso.slice(0, 10);
  return estado.calendario.feriados.find((f) => f.data === hoje && (f.lojas === 'TODAS' || f.lojas.includes(lojaId))) ?? null;
}

// ------------------------------------------------------------------ meta diária

export interface OpcoesMetaDiaria {
  manual: number | null;
  uniforme: number | null;
  diasValidos: number | null;
}

/**
 * Três formas de transformar meta mensal em meta do dia (DECISÃO ABERTA):
 *  - MANUAL: o Admin digita;
 *  - UNIFORME: mensal ÷ dias válidos do mês;
 *  - DIAS_VALIDOS: (mensal − realizado até ontem) ÷ dias válidos restantes, hoje incluso
 *    (meta "viva", que se ajusta ao ritmo).
 */
export function opcoesMetaDiaria(estado: EstadoDemo, vendedorId: string, lojaId: string, agoraIso: string, realizadoAteOntem: number): OpcoesMetaDiaria {
  const meta = estado.metas.individuais[vendedorId];
  if (!meta || meta.mensal === null) return { manual: null, uniforme: null, diasValidos: null };
  const validos = diasValidosDoMes(estado.metas.referencia, estado, lojaId);
  const restantesComHoje = diasValidosRestantes(agoraIso, estado, lojaId) + 1;
  return {
    manual: meta.diariaManual,
    uniforme: validos.length ? Math.round(meta.mensal / validos.length) : null,
    diasValidos: restantesComHoje > 0 ? Math.max(0, Math.round((meta.mensal - realizadoAteOntem) / restantesComHoje)) : null,
  };
}

export function metaDiariaVigente(opcoes: OpcoesMetaDiaria, distribuicao: EstadoDemo['metas']['distribuicao']): number | null {
  if (distribuicao === 'UNIFORME') return opcoes.uniforme;
  if (distribuicao === 'DIAS_VALIDOS') return opcoes.diasValidos;
  return opcoes.manual;
}

