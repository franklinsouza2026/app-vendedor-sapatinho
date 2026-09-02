import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useApi } from '../utils/useApi';
import { listarMinhasCompeticoes, listarMinhasLigas, listarFeed, listarMeusReconhecimentos, buscarCompeticao, buscarTemporadaAtual, buscarRankingTemporada, Competicao, LinhaRanking } from '../api/competicoes';
import { Card } from '../components/Card';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';

const LABEL_STATUS: Record<string, string> = { DRAFT: 'rascunho', SCHEDULED: 'agendada', ACTIVE: 'em andamento', FINISHED: 'encerrada', CANCELLED: 'cancelada' };

async function carregarCompeticoes() {
  const [{ competicoes }, { ligas, minhaLiga }, feed, reconhecimentos, { season }] = await Promise.all([
    listarMinhasCompeticoes(),
    listarMinhasLigas(),
    listarFeed(),
    listarMeusReconhecimentos(),
    buscarTemporadaAtual(),
  ]);
  const ranking = season ? (await buscarRankingTemporada(season.id)).ranking : [];
  return { competicoes, ligas, minhaLiga, feed: feed.eventos, reconhecimentos: reconhecimentos.reconhecimentos, season, ranking };
}

export function Competicoes() {
  const { sessao } = useAuth();
  const vendedorId = sessao!.vendedor.id;
  const [aba, setAba] = useState<'ativas' | 'proximas' | 'encerradas' | 'temporada' | 'liga' | 'feed'>('ativas');
  const { dados, carregando, erro, recarregar } = useApi(() => carregarCompeticoes(), []);

  if (carregando && !dados) return <LoadingState texto="Carregando competições..." />;
  if (erro) return <ErrorState mensagem={erro} onRetry={recarregar} />;
  if (!dados) return null;

  const ativas = dados.competicoes.filter((c) => c.status === 'ACTIVE');
  const proximas = dados.competicoes.filter((c) => c.status === 'SCHEDULED' || c.status === 'DRAFT');
  const encerradas = dados.competicoes.filter((c) => c.status === 'FINISHED');

  return (
    <div className="flex flex-col gap-4 p-4 pb-24">
      <h1 className="text-xl font-semibold text-white">Competições</h1>

      <div className="flex gap-2 overflow-x-auto border-b border-slate-800 pb-2">
        {(['ativas', 'proximas', 'encerradas', ...(dados.season ? (['temporada'] as const) : []), 'liga', 'feed'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setAba(t)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${aba === t ? 'bg-accent text-white' : 'bg-surface text-slate-400'}`}
          >
            {t === 'ativas' ? 'Ativas' : t === 'proximas' ? 'Próximas' : t === 'encerradas' ? 'Encerradas' : t === 'temporada' ? 'Temporada' : t === 'liga' ? 'Minha Liga' : 'Feed'}
          </button>
        ))}
      </div>

      {aba === 'ativas' && (
        <div className="flex flex-col gap-3">
          {ativas.length === 0 && <p className="text-sm text-slate-400">Nenhuma competição ativa no momento.</p>}
          {ativas.map((c) => (
            <CardCompeticao key={c.id} competicao={c} vendedorId={vendedorId} />
          ))}
        </div>
      )}

      {aba === 'proximas' && (
        <div className="flex flex-col gap-3">
          {proximas.length === 0 && <p className="text-sm text-slate-400">Nenhuma competição agendada.</p>}
          {proximas.map((c) => (
            <Card key={c.id}>
              <p className="font-medium text-white">{c.name}</p>
              <p className="text-xs text-slate-500">{LABEL_STATUS[c.status]}</p>
            </Card>
          ))}
        </div>
      )}

      {aba === 'encerradas' && (
        <div className="flex flex-col gap-3">
          {encerradas.length === 0 && <p className="text-sm text-slate-400">Nenhuma competição encerrada ainda.</p>}
          {encerradas.map((c) => (
            <Card key={c.id}>
              <p className="font-medium text-white">{c.name}</p>
              <p className="text-xs text-slate-500">encerrada</p>
            </Card>
          ))}
        </div>
      )}

      {aba === 'temporada' && dados.season && (
        <div className="flex flex-col gap-3">
          <Card>
            <p className="text-xs text-slate-400">Temporada atual</p>
            <p className="text-lg font-bold text-white">{dados.season.name}</p>
          </Card>
          <p className="text-xs uppercase tracking-wide text-slate-500">Ranking de Season Points</p>
          {dados.ranking.length === 0 && <p className="text-sm text-slate-400">Ainda sem pontos registrados nesta temporada.</p>}
          <div className="flex flex-col gap-2">
            {dados.ranking.map((r) => (
              <div key={r.participantId} className={`flex items-center justify-between rounded-lg border p-3 ${r.participantId === vendedorId ? 'border-accent' : 'border-slate-800'}`}>
                <span className={r.participantId === vendedorId ? 'font-semibold text-white' : 'text-slate-300'}>
                  {r.posicao}º · {r.nomeVendedor}
                </span>
                <span className="text-sm text-slate-400">{r.points} pts</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {aba === 'liga' && (
        <div className="flex flex-col gap-3">
          {dados.minhaLiga ? (
            <Card>
              <p className="text-xs text-slate-400">Sua liga atual</p>
              <p className="text-2xl font-bold text-white">{dados.minhaLiga.name}</p>
            </Card>
          ) : (
            <p className="text-sm text-slate-400">Você ainda não está em nenhuma liga.</p>
          )}
          <div className="flex flex-col gap-2">
            {dados.ligas.map((l) => (
              <div key={l.id} className={`rounded-lg border p-3 ${l.id === dados.minhaLiga?.id ? 'border-accent' : 'border-slate-800'}`}>
                <p className={l.id === dados.minhaLiga?.id ? 'font-semibold text-white' : 'text-slate-300'}>{l.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {aba === 'feed' && (
        <div className="flex flex-col gap-2">
          {dados.feed.length === 0 && <p className="text-sm text-slate-400">Nenhuma novidade por aqui ainda.</p>}
          {dados.feed.map((e) => (
            <Card key={e.id}>
              <p className="text-sm text-slate-200">
                {e.subjectNome && <strong className="text-white">{e.subjectNome} </strong>}
                {e.mensagem}
              </p>
            </Card>
          ))}
        </div>
      )}

      {dados.reconhecimentos.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-slate-300">Seus reconhecimentos</p>
          <div className="flex flex-col gap-2">
            {dados.reconhecimentos.map((r) => (
              <Card key={r.id}>
                <p className="text-sm text-white">{r.message ?? r.tipo}</p>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CardCompeticao({ competicao, vendedorId }: { competicao: Competicao; vendedorId: string }) {
  const [expandido, setExpandido] = useState(false);
  const { dados } = useApi(() => (expandido ? buscarCompeticao(competicao.id) : Promise.resolve(null)), [expandido, competicao.id]);
  const minhaLinha: LinhaRanking | undefined = dados?.ranking.find((r) => r.participantId === vendedorId);

  return (
    <Card>
      <button onClick={() => setExpandido((v) => !v)} className="flex w-full items-center justify-between text-left">
        <div>
          <p className="font-medium text-white">{competicao.name}</p>
          <p className="text-xs text-slate-500">{competicao.description}</p>
        </div>
        <span className="text-slate-500" aria-hidden="true">
          {expandido ? '▲' : '▼'}
        </span>
      </button>
      {expandido && dados && (
        <div className="mt-3 border-t border-slate-800 pt-3">
          {minhaLinha ? (
            <p className="text-sm text-slate-300">
              Sua posição: <strong className="text-white">{minhaLinha.posicao}º</strong> de {dados.ranking.length}
            </p>
          ) : (
            <p className="text-sm text-slate-400">Você não está participando desta competição.</p>
          )}
          {competicao.rewardBadgeCodigo && <p className="mt-1 text-xs text-slate-500">Prêmio: badge exclusivo pro 1º lugar</p>}
        </div>
      )}
    </Card>
  );
}
