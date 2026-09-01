import { FormEvent, useState } from 'react';
import { useApi } from '../utils/useApi';
import { Card } from '../components/Card';
import { LoadingState } from '../components/LoadingState';
import { buscarDesenvolvimentoVendedor, listarEquipe, registrarAvaliacao, sugerirSequenciaIA, VendedorResumoEquipe } from '../api/universidade';
import { ApiError } from '../api/client';

export function Equipe() {
  const { dados, carregando } = useApi(() => listarEquipe(), []);
  const [vendedorSelecionadoId, setVendedorSelecionadoId] = useState<string | null>(null);

  if (carregando && !dados) return <LoadingState texto="Carregando equipe..." />;
  if (vendedorSelecionadoId) return <Desenvolvimento vendedorId={vendedorSelecionadoId} onVoltar={() => setVendedorSelecionadoId(null)} />;

  return (
    <div className="flex flex-col gap-4 p-4 pb-24">
      <div>
        <h1 className="text-xl font-semibold text-white">Minha Equipe</h1>
        <p className="text-xs text-slate-400">Acompanhe o desenvolvimento de cada vendedor da sua loja.</p>
      </div>
      <div className="flex flex-col gap-2">
        {dados?.vendedores.map((v: VendedorResumoEquipe) => (
          <button key={v.id} onClick={() => setVendedorSelecionadoId(v.id)} className="text-left">
            <Card>
              <p className="font-medium text-white">{v.nome}</p>
              <p className="text-xs text-slate-400">{v.matriculaErp}</p>
            </Card>
          </button>
        ))}
        {dados?.vendedores.length === 0 && <p className="text-sm text-slate-400">Nenhum vendedor ativo na sua loja ainda.</p>}
      </div>
    </div>
  );
}

function Desenvolvimento({ vendedorId, onVoltar }: { vendedorId: string; onVoltar: () => void }) {
  const { dados, recarregar } = useApi(() => buscarDesenvolvimentoVendedor(vendedorId), [vendedorId]);
  const [competenciaAvaliacao, setCompetenciaAvaliacao] = useState('');
  const [rating, setRating] = useState(3);
  const [nota, setNota] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [sugestoes, setSugestoes] = useState<{ title: string; rationale: string }[] | null>(null);

  async function handleAvaliar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      await registrarAvaliacao(vendedorId, { competencyId: competenciaAvaliacao, rating, evidenceNote: nota || undefined });
      setNota('');
      recarregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'não foi possível registrar a avaliação');
    }
  }

  async function handleSugestaoIA(competencyId: string) {
    setErro(null);
    try {
      const { sugestoes: lista } = await sugerirSequenciaIA(vendedorId, competencyId);
      setSugestoes(lista);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'IA indisponível no momento');
    }
  }

  if (!dados) return <LoadingState texto="Carregando desenvolvimento..." />;

  return (
    <div className="flex flex-col gap-4 p-4 pb-24">
      <button onClick={onVoltar} className="self-start text-sm text-slate-400">
        ← Voltar
      </button>
      <h1 className="text-xl font-semibold text-white">{dados.vendedor.nome}</h1>

      <div className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-wide text-slate-500">Matriz de competências</p>
        {dados.matriz.map((c) => (
          <Card key={c.competencyId}>
            <div className="flex items-center justify-between">
              <p className="font-medium text-white">{c.name}</p>
              {c.score !== null && (
                <p className="text-lg font-bold text-white">
                  {c.score}
                  <span className="text-xs font-normal text-slate-400">/100</span>
                </p>
              )}
            </div>
            {c.status === 'NOT_ENOUGH_DATA' && <p className="text-xs text-slate-400">Ainda sem dados suficientes</p>}
            {c.priority === 'HIGH' && (
              <button onClick={() => handleSugestaoIA(c.competencyId)} className="mt-1 text-xs text-accentSoft underline">
                Sugerir conteúdo com IA
              </button>
            )}
          </Card>
        ))}
      </div>

      {sugestoes && (
        <div className="flex flex-col gap-2 rounded-lg bg-base p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Sugestões de IA (revise antes de atribuir)</p>
          {sugestoes.length === 0 && <p className="text-xs text-slate-400">Nenhum conteúdo relevante encontrado ainda.</p>}
          {sugestoes.map((s, i) => (
            <div key={i} className="text-sm text-slate-200">
              <p className="font-medium text-white">{s.title}</p>
              <p className="text-xs text-slate-400">{s.rationale}</p>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleAvaliar} className="flex flex-col gap-2 rounded-lg border border-slate-800 p-4">
        <p className="text-xs uppercase tracking-wide text-slate-500">Registrar avaliação</p>
        <select value={competenciaAvaliacao} onChange={(e) => setCompetenciaAvaliacao(e.target.value)} required className="rounded-lg bg-surface px-3 py-2 text-sm text-white">
          <option value="">Competência...</option>
          {dados.matriz.map((c) => (
            <option key={c.competencyId} value={c.competencyId}>
              {c.name}
            </option>
          ))}
        </select>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Nota (1-5)
          <input type="number" min={1} max={5} value={rating} onChange={(e) => setRating(Number(e.target.value))} className="w-20 rounded-lg bg-surface px-3 py-2 text-sm text-white" />
        </label>
        <input placeholder="Observação (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} className="rounded-lg bg-surface px-3 py-2 text-sm text-white" />
        <button type="submit" className="self-start rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
          Registrar
        </button>
        {erro && <p className="text-xs text-red-400">{erro}</p>}
      </form>

      <div className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-wide text-slate-500">Planos de desenvolvimento</p>
        {dados.pdis.map((p) => (
          <Card key={p.id}>
            <p className="font-medium text-white">{p.competencia?.name ?? 'Plano'}</p>
            <p className="text-xs text-slate-400">
              Meta {p.targetScore} · {p.status}
            </p>
          </Card>
        ))}
        {dados.pdis.length === 0 && <p className="text-sm text-slate-400">Nenhum plano ativo.</p>}
      </div>
    </div>
  );
}
