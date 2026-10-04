/**
 * Formatação da Fase 1 — números sempre em pt-BR.
 *
 * Decisões da homologação (out/2026):
 *  - dinheiro SEMPRE com centavos ("R$ 2.000,00"), igual ao cupom/ERP;
 *  - posição como número limpo ("2") ou ordinal em texto ("2º lugar"),
 *    nunca "#2";
 *  - quantidade operacional como número inteiro ("2 vendas"), nunca "≈ 2".
 *    A regra de arredondamento está em dominio/estimativas.ts.
 */
import type { Metrica } from './dominio/tipos';
import { UNIDADE_METRICA } from './dominio/estimativas';

const moedaInteira = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0, minimumFractionDigits: 0 });
const moedaCentavos = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** R$ com centavos ("R$ 486,00"). Espaço não-quebrável vira espaço comum para testes e leitores de tela. */
export function reais(valor: number): string {
  return moedaCentavos.format(valor).replace(/\u00a0/g, ' ');
}

/** R$ sem centavos — só para eixos/legendas compactas. */
export function reaisCompacto(valor: number): string {
  return moedaInteira.format(Math.round(valor)).replace(/\u00a0/g, ' ');
}

/** "2º" — posição em texto corrido ("2º lugar"). */
export function ordinal(n: number): string {
  return `${n}º`;
}

/** Mudança de posição em português: "↑ 1 posição", "↓ 2 posições", "Manteve a posição". */
export function textoVariacao(v: number | null): string | null {
  if (v === null) return null;
  if (v === 0) return 'Manteve a posição';
  const n = Math.abs(v);
  return `${v > 0 ? '↑' : '↓'} ${n} ${n === 1 ? 'posição' : 'posições'}`;
}

export function reaisCentavos(valor: number): string {
  return moedaCentavos.format(valor).replace(/ /g, ' ');
}

export function inteiro(valor: number): string {
  return Math.round(valor).toLocaleString('pt-BR');
}

export function decimal(valor: number, casas = 1): string {
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/**
 * Percentual inteiro arredondado — exceto perto de 100%: 99,6% NUNCA vira
 * "100%" (o vendedor comemoraria uma meta que não bateu).
 */
export function pct(valor: number): string {
  const arred = Math.round(valor);
  return `${valor < 100 && arred >= 100 ? 99 : arred}%`;
}

export function plural(n: number, singular: string, pluralForma = `${singular}s`): string {
  return `${inteiro(n)} ${n === 1 ? singular : pluralForma}`;
}

/** Valor de uma métrica de ranking, na unidade dela. */
export function valorMetrica(metrica: Metrica, valor: number): string {
  switch (UNIDADE_METRICA[metrica].formato) {
    case 'reais':
      return reais(valor);
    case 'pontos':
      return `${inteiro(valor)} pts`;
    case 'pp':
      return metrica === 'EVOLUCAO' ? `${valor >= 0 ? '+' : ''}${decimal(valor)} p.p.` : `${decimal(valor)}%`;
    case 'decimal':
      return decimal(valor, 2);
    case 'dias':
      return plural(valor, 'dia');
  }
}

/** Distância para a posição acima, na unidade da métrica. */
export function distanciaMetrica(metrica: Metrica, valor: number): string {
  switch (UNIDADE_METRICA[metrica].formato) {
    case 'reais':
      return reais(valor);
    case 'pontos':
      return plural(valor, 'ponto');
    case 'pp':
      return `${decimal(valor)} p.p.`;
    case 'decimal':
      return `${decimal(valor, 2)} de PA`;
    case 'dias':
      return plural(valor, 'dia');
  }
}

const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function dataPorExtenso(iso: string): string {
  const d = lerData(iso);
  return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
}

/** Datas sem hora ('2026-05-31') são lidas como data local — `new Date()` as trataria como UTC e voltaria um dia no Brasil. */
function lerData(iso: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [a, m, d] = iso.split('-').map(Number);
    return new Date(a, m - 1, d);
  }
  return new Date(iso);
}

export function dataCurta(iso: string): string {
  const d = lerData(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function mesCurto(anoMes: string): string {
  const [ano, mes] = anoMes.split('-').map(Number);
  return `${MESES_CURTOS[mes - 1]}/${String(ano).slice(2)}`;
}

export function hora(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function saudacao(iso: string): string {
  const h = new Date(iso).getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** "há 12 min", "há 3 h", "ontem", "12/10" — relativo ao "agora" do cenário, não ao relógio real. */
export function haQuanto(iso: string, agoraIso: string): string {
  const diff = (new Date(agoraIso).getTime() - new Date(iso).getTime()) / 60000;
  if (diff < 1) return 'agora';
  if (diff < 60) return `há ${Math.round(diff)} min`;
  if (diff < 60 * 24) return `há ${Math.round(diff / 60)} h`;
  if (diff < 60 * 48) return 'ontem';
  return dataCurta(iso);
}

/** "termina hoje", "faltam 3 dias", "começa em 2 dias". */
export function tempoRestante(fimIso: string, agoraIso: string): string {
  const dias = Math.ceil((new Date(fimIso).getTime() - new Date(agoraIso).getTime()) / 86_400_000);
  if (dias <= 0) return 'encerrada';
  if (dias === 1) return 'termina hoje';
  return `faltam ${dias} dias`;
}

export function periodo(inicioIso: string, fimIso: string): string {
  return `${dataCurta(inicioIso)} → ${dataCurta(fimIso)}`;
}
