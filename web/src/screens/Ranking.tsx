import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useApi } from '../utils/useApi';
import { buscarRanking } from '../api/gamificacao';
import { Card } from '../components/Card';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { formatarNumero, labelRanking } from '../utils/format';
import { EscopoRanking, TipoRanking } from '../types';

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
                  {formatarNumero(Number(linha.valor), tipo === 'FATURAMENTO' || tipo === 'TICKET' ? 2 : 0)}
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
