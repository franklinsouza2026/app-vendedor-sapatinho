import { FormEvent, useState } from 'react';
import { useApi } from '../../utils/useApi';
import { AdminNav } from './AdminNav';
import { LoadingState } from '../../components/LoadingState';
import { ApiError } from '../../api/client';
import {
  criarCompeticaoAdmin,
  criarLigaAdmin,
  criarSeasonAdmin,
  finalizarSeasonAdmin,
  listarCompeticoesAdmin,
  listarLigasAdmin,
  listarSeasonsAdmin,
  transicionarCompeticaoAdmin,
  transicionarSeasonAdmin,
  Competicao,
  Season,
  TipoMetricaCompeticao,
} from '../../api/competicoes';

const LABEL_STATUS: Record<string, string> = { DRAFT: 'rascunho', SCHEDULED: 'agendada', ACTIVE: 'ativa', FINISHED: 'encerrada', CANCELLED: 'cancelada' };
const METRICAS: TipoMetricaCompeticao[] = ['GOAL_ATTAINMENT', 'PERSONAL_IMPROVEMENT', 'SCORE_GERAL', 'PA', 'TICKET_MEDIO', 'TRAINING', 'MISSION_COMPLETION', 'CONSISTENCY'];

export function AdminGamificacao() {
  const [aba, setAba] = useState<'seasons' | 'competicoes' | 'ligas'>('seasons');

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <AdminNav />
      <h1 className="text-2xl font-semibold text-white">Gamificação — Competições</h1>

      <div className="flex gap-2 border-b border-slate-800 pb-2">
        {(['seasons', 'competicoes', 'ligas'] as const).map((t) => (
          <button key={t} onClick={() => setAba(t)} className={`rounded-full px-3 py-1.5 text-sm font-medium ${aba === t ? 'bg-accent text-white' : 'bg-surface text-slate-400'}`}>
            {t === 'seasons' ? 'Temporadas' : t === 'competicoes' ? 'Competições' : 'Ligas'}
          </button>
        ))}
      </div>

      {aba === 'seasons' && <AbaSeasons />}
      {aba === 'competicoes' && <AbaCompeticoes />}
      {aba === 'ligas' && <AbaLigas />}
    </div>
  );
}

function AbaSeasons() {
  const { dados, carregando, recarregar } = useApi(() => listarSeasonsAdmin(), []);
  const [form, setForm] = useState({ code: '', name: '', description: '', startsAt: '', endsAt: '' });
  const [erro, setErro] = useState<string | null>(null);

  async function handleCriar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      await criarSeasonAdmin({ ...form, startsAt: new Date(form.startsAt).toISOString(), endsAt: new Date(form.endsAt).toISOString() });
      setForm({ code: '', name: '', description: '', startsAt: '', endsAt: '' });
      recarregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'não foi possível criar');
    }
  }

  async function handleTransicao(id: string, transicao: 'agendar' | 'ativar') {
    await transicionarSeasonAdmin(id, transicao);
    recarregar();
  }

  async function handleFinalizar(id: string) {
    await finalizarSeasonAdmin(id);
    recarregar();
  }

  if (carregando && !dados) return <LoadingState texto="Carregando temporadas..." />;

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleCriar} className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-800 p-4">
        <input placeholder="Código" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required className="rounded-lg bg-surface px-3 py-2 text-sm text-white" />
        <input placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="rounded-lg bg-surface px-3 py-2 text-sm text-white" />
        <input placeholder="Descrição" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required className="flex-1 rounded-lg bg-surface px-3 py-2 text-sm text-white" />
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Início
          <input type="date" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} required className="rounded-lg bg-surface px-3 py-2 text-sm text-white" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Fim
          <input type="date" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} required className="rounded-lg bg-surface px-3 py-2 text-sm text-white" />
        </label>
        <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
          Nova temporada
        </button>
        {erro && <p className="w-full text-xs text-red-400">{erro}</p>}
      </form>
      <div className="flex flex-col gap-2">
        {dados?.seasons.map((s: Season) => (
          <div key={s.id} className="flex items-center justify-between rounded-lg border border-slate-800 p-3">
            <div>
              <p className="font-medium text-white">{s.name}</p>
              <p className="text-xs text-slate-500">
                {s.code} · {LABEL_STATUS[s.status]}
              </p>
            </div>
            <div className="flex gap-2">
              {s.status === 'DRAFT' && (
                <button onClick={() => handleTransicao(s.id, 'agendar')} className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
                  Agendar
                </button>
              )}
              {(s.status === 'DRAFT' || s.status === 'SCHEDULED') && (
                <button onClick={() => handleTransicao(s.id, 'ativar')} className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-white">
                  Ativar
                </button>
              )}
              {s.status === 'ACTIVE' && (
                <button onClick={() => handleFinalizar(s.id)} className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
                  Finalizar
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AbaCompeticoes() {
  const { dados, carregando, recarregar } = useApi(() => listarCompeticoesAdmin(), []);
  const [form, setForm] = useState({ code: '', name: '', description: '', participantType: 'SELLER' as const, metricType: 'CONSISTENCY' as TipoMetricaCompeticao, startsAt: '', endsAt: '', rewardXp: 0, rewardMoedas: 0 });
  const [erro, setErro] = useState<string | null>(null);

  async function handleCriar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      await criarCompeticaoAdmin({ ...form, startsAt: new Date(form.startsAt).toISOString(), endsAt: new Date(form.endsAt).toISOString() });
      setForm({ ...form, code: '', name: '', description: '' });
      recarregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'não foi possível criar');
    }
  }

  async function handleAtivar(id: string) {
    await transicionarCompeticaoAdmin(id, 'ativar');
    recarregar();
  }

  if (carregando && !dados) return <LoadingState texto="Carregando competições..." />;

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleCriar} className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-800 p-4">
        <input placeholder="Código" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required className="rounded-lg bg-surface px-3 py-2 text-sm text-white" />
        <input placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="rounded-lg bg-surface px-3 py-2 text-sm text-white" />
        <input placeholder="Descrição" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required className="flex-1 rounded-lg bg-surface px-3 py-2 text-sm text-white" />
        <select value={form.metricType} onChange={(e) => setForm({ ...form, metricType: e.target.value as TipoMetricaCompeticao })} className="rounded-lg bg-surface px-3 py-2 text-sm text-white">
          {METRICAS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Início
          <input type="date" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} required className="rounded-lg bg-surface px-3 py-2 text-sm text-white" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Fim
          <input type="date" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} required className="rounded-lg bg-surface px-3 py-2 text-sm text-white" />
        </label>
        <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
          Nova competição
        </button>
        {erro && <p className="w-full text-xs text-red-400">{erro}</p>}
      </form>
      <div className="flex flex-col gap-2">
        {dados?.competicoes.map((c: Competicao) => (
          <div key={c.id} className="flex items-center justify-between rounded-lg border border-slate-800 p-3">
            <div>
              <p className="font-medium text-white">{c.name}</p>
              <p className="text-xs text-slate-500">
                {c.metricType} · {LABEL_STATUS[c.status]}
              </p>
            </div>
            {(c.status === 'DRAFT' || c.status === 'SCHEDULED') && (
              <button onClick={() => handleAtivar(c.id)} className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-white">
                Ativar
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AbaLigas() {
  const { dados, carregando, recarregar } = useApi(() => listarLigasAdmin(), []);
  const [form, setForm] = useState({ code: '', name: '', sortOrder: 0 });
  const [erro, setErro] = useState<string | null>(null);

  async function handleCriar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      await criarLigaAdmin(form);
      setForm({ code: '', name: '', sortOrder: 0 });
      recarregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'não foi possível criar');
    }
  }

  if (carregando && !dados) return <LoadingState texto="Carregando ligas..." />;

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleCriar} className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-800 p-4">
        <input placeholder="Código" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required className="rounded-lg bg-surface px-3 py-2 text-sm text-white" />
        <input placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="rounded-lg bg-surface px-3 py-2 text-sm text-white" />
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Ordem
          <input type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} className="w-20 rounded-lg bg-surface px-3 py-2 text-sm text-white" />
        </label>
        <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
          Nova liga
        </button>
        {erro && <p className="w-full text-xs text-red-400">{erro}</p>}
      </form>
      <div className="flex flex-col gap-2">
        {dados?.ligas.map((l) => (
          <div key={l.id} className="rounded-lg border border-slate-800 p-3">
            <p className="font-medium text-white">{l.name}</p>
            <p className="text-xs text-slate-500">{l.code}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
