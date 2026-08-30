import { useState } from 'react';
import { useApi } from '../utils/useApi';
import { buscarMinhasMetas } from '../api/metas';
import { Card } from '../components/Card';
import { ProgressBar } from '../components/ProgressBar';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { formatarMoeda, formatarNumero } from '../utils/format';
import { ritmoNecessario } from '../utils/calculo';
import { ProgressoPeriodo } from '../types';

const ABAS: { periodo: ProgressoPeriodo['periodo']; label: string }[] = [
  { periodo: 'DIA', label: 'Hoje' },
  { periodo: 'SEMANA', label: 'Semana' },
  { periodo: 'MES', label: 'Mês' },
];

export function Metas() {
  const [abaAtiva, setAbaAtiva] = useState<ProgressoPeriodo['periodo']>('DIA');
  const { dados, carregando, erro, recarregar } = useApi(() => buscarMinhasMetas(), []);

  if (carregando && !dados) return <LoadingState texto="Carregando metas..." />;
  if (erro) return <ErrorState mensagem={erro} onRetry={recarregar} />;
  if (!dados) return null;

  const progresso = dados.progresso.find((p) => p.periodo === abaAtiva)!;
  const percentual = progresso.metaFaturamento ? (progresso.realizado.faturamento / progresso.metaFaturamento) * 100 : 0;
  const ritmo =
    progresso.faltaParaMeta !== null && (abaAtiva === 'SEMANA' || abaAtiva === 'MES')
      ? ritmoNecessario(progresso.faltaParaMeta, abaAtiva)
      : null;

  return (
    <div className="flex flex-col gap-4 p-4 pb-24">
      <h1 className="text-xl font-semibold text-white">Performance</h1>

      <div className="flex gap-2" role="tablist">
        {ABAS.map((aba) => (
          <button
            key={aba.periodo}
            role="tab"
            aria-selected={abaAtiva === aba.periodo}
            onClick={() => setAbaAtiva(aba.periodo)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium ${
              abaAtiva === aba.periodo ? 'bg-accent text-white' : 'bg-surface text-slate-400'
            }`}
          >
            {aba.label}
          </button>
        ))}
      </div>

      <Card>
        {progresso.metaFaturamento === null ? (
          <p className="text-slate-400">Nenhuma meta cadastrada para este período.</p>
        ) : (
          <>
            <p className="text-3xl font-bold text-white">{formatarMoeda(progresso.realizado.faturamento)}</p>
            <p className="mb-2 text-sm text-slate-400">de {formatarMoeda(progresso.metaFaturamento)}</p>
            <ProgressBar percentual={percentual} />
            <p className="mt-2 text-sm text-slate-300">{Math.round(percentual)}% atingido</p>
            {progresso.faltaParaMeta !== null && progresso.faltaParaMeta > 0 && (
              <p className="mt-1 text-sm text-slate-300">Faltam {formatarMoeda(progresso.faltaParaMeta)}</p>
            )}
            {ritmo !== null && (
              <p className="mt-1 text-sm text-slate-400">Ritmo necessário: ~{formatarMoeda(ritmo)}/dia</p>
            )}
          </>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <p className="text-xs text-slate-400">Ticket médio</p>
          <p className="text-xl font-semibold text-white">{formatarMoeda(progresso.realizado.ticketMedio)}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-400">PA</p>
          <p className="text-xl font-semibold text-white">{formatarNumero(progresso.realizado.pa)}</p>
        </Card>
      </div>
    </div>
  );
}
