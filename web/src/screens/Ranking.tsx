import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useApi } from '../utils/useApi';
import { buscarRanking } from '../api/gamificacao';
import { Card } from '../components/Card';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { formatarNumero, labelRanking } from '../utils/format';
import { EscopoRanking, RankingLinha, TipoRanking } from '../types';

const TIPOS: TipoRanking[] = ['SCORE_GERAL', 'PERCENTUAL_META', 'FATURAMENTO', 'PA', 'TICKET', 'EVOLUCAO', 'MOEDAS'];

export function Ranking() {
  const { sessao } = useAuth();
  const [tipo, setTipo] = useState<TipoRanking>('SCORE_GERAL');
  const [escopo, setEscopo] = useState<EscopoRanking>('LOJA');
  const { dados, carregando, erro, recarregar } = useApi(() => buscarRanking(tipo, escopo), [tipo, escopo]);

  return (
    <div className="flex flex-col gap-4 p-4 pb-24">
      <h1 className="text-xl font-semibold text-white">Ranking</h1>

      <div className="flex gap-2">
        <button
          onClick={() => setEscopo('LOJA')}
          className={`flex-1 rounded-lg py-2 text-sm font-medium ${escopo === 'LOJA' ? 'bg-accent text-white' : 'bg-surface text-slate-400'}`}
        >
          Minha loja
        </button>
        <button
          onClick={() => setEscopo('REDE')}
          className={`flex-1 rounded-lg py-2 text-sm font-medium ${escopo === 'REDE' ? 'bg-accent text-white' : 'bg-surface text-slate-400'}`}
        >
          Rede toda
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {TIPOS.map((t) => (
          <button
            key={t}
            onClick={() => setTipo(t)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ${
              tipo === t ? 'bg-accent text-white' : 'bg-surface text-slate-400'
            }`}
          >
            {labelRanking(t)}
          </button>
        ))}
      </div>

      {carregando && !dados && <LoadingState texto="Carregando ranking..." />}
      {erro && <ErrorState mensagem={erro} onRetry={recarregar} />}
      {dados && dados.ranking.length === 0 && <EmptyState texto="Ainda não há ranking calculado para hoje." />}

      {dados && dados.ranking.length > 0 && <SuaPosicao ranking={dados.ranking} vendedorId={sessao?.vendedor.id} tipo={tipo} />}

      {dados && dados.ranking.length > 0 && (
        <Card className="divide-y divide-slate-700 p-0">
          {dados.ranking.map((linha) => {
            const souEu = linha.vendedorId === sessao?.vendedor.id;
            return (
              <div key={linha.vendedorId} className={`flex items-center justify-between px-4 py-3 ${souEu ? 'bg-accent/10' : ''}`}>
                <div className="flex items-center gap-3">
                  <span className="w-6 text-center font-semibold text-slate-400">{linha.posicao}º</span>
                  <span className={souEu ? 'font-semibold text-accentSoft' : 'text-white'}>{linha.nomeVendedor}</span>
                </div>
                <span className="text-slate-300">
                  {linha.valor === null ? (
                    <span aria-label="faturamento oculto">R$ •••••</span>
                  ) : (
                    formatarNumero(Number(linha.valor), tipo === 'FATURAMENTO' || tipo === 'TICKET' ? 2 : 0)
                  )}
                  {linha.provisorio && <span className="ml-1 text-xs text-slate-500">(provisório)</span>}
                </span>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}

/**
 * Resumo de "onde eu estou" — o vendedor não deveria precisar rolar a lista
 * inteira pra achar a própria linha (achado da auditoria de UX). Derivado só
 * do ranking já carregado, nunca um cálculo novo (o motor continua sendo a
 * única fonte da posição/valor).
 */
function SuaPosicao({ ranking, vendedorId, tipo }: { ranking: RankingLinha[]; vendedorId: string | undefined; tipo: TipoRanking }) {
  const indice = ranking.findIndex((r) => r.vendedorId === vendedorId);
  if (indice === -1) return null;

  const eu = ranking[indice];
  const acima = indice > 0 ? ranking[indice - 1] : null;
  const casasDecimais = tipo === 'FATURAMENTO' || tipo === 'TICKET' ? 2 : 0;

  return (
    <Card className="border border-accent/20">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-slate-400">Sua posição</span>
        {eu.provisorio && <span className="text-xs text-slate-500">provisório</span>}
      </div>
      <p className="text-2xl font-bold text-white">{eu.posicao}º</p>
      {/* gapParaAnterior é sempre a DIFERENÇA (calculada no backend), nunca o
          valor absoluto de quem está acima — em FATURAMENTO esse valor nunca
          chega até aqui mascarado (Fatia 7.5A, seção 30). */}
      {acima ? (
        <p className="mt-1 text-sm text-slate-400">
          Faltam <strong className="text-white">{formatarNumero(eu.gapParaAnterior ?? 0, casasDecimais)}</strong> pra alcançar{' '}
          <strong className="text-white">{acima.nomeVendedor}</strong> ({acima.posicao}º).
        </p>
      ) : (
        <p className="mt-1 text-sm text-emerald-400">Você está em 1º lugar! 🏆</p>
      )}
    </Card>
  );
}
