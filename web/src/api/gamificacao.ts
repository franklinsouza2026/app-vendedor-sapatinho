import { apiFetch } from './client';
import { Badge, Carteira, EscopoRanking, RankingLinha, Streak, TipoRanking, TransacaoMoeda } from '../types';

export function buscarCarteira() {
  return apiFetch<Carteira>('/gamificacao/carteira');
}

export function buscarExtratoMoedas() {
  return apiFetch<{ transacoes: TransacaoMoeda[]; proximoCursor: string | null }>('/gamificacao/extrato-moedas');
}

export function buscarStreak() {
  return apiFetch<Streak>('/gamificacao/streak');
}

export function buscarBadges() {
  return apiFetch<Badge[]>('/gamificacao/badges');
}

export function buscarRanking(tipo: TipoRanking, escopo: EscopoRanking) {
  return apiFetch<{ tipo: TipoRanking; escopo: EscopoRanking; ranking: RankingLinha[] }>(
    `/gamificacao/ranking?tipo=${tipo}&escopo=${escopo}`
  );
}
