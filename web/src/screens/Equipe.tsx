import { FormEvent, useState } from 'react';
import { useApi } from '../utils/useApi';
import { Card } from '../components/Card';
import { LoadingState } from '../components/LoadingState';
import { buscarDesenvolvimentoVendedor, registrarAvaliacao, sugerirSequenciaIA } from '../api/universidade';
import { reconhecerVendedor, TipoReconhecimento } from '../api/competicoes';
import { ApiError } from '../api/client';
import { labelAlerta } from '../utils/alertLabels';
import {
  buscarEquipeDetalhe,
  listarVisaoEquipe,
  reconhecerAlerta,
  resolverAlerta,
  dispensarAlerta,
  criarPlano,
  ativarPlano,
  cancelarPlano,
  concluirPlano,
  concluirItemPlano,
  listarOneOnOnes,
  criarOneOnOne,
  concluirOneOnOne,
  buscarRoteiroSugerido1a1,
  TipoItemPlanoAcao,
} from '../api/managerPanel';
import { formatarMoeda } from '../utils/format';

const TIPOS_RECONHECIMENTO: TipoReconhecimento[] = ['PERFORMANCE', 'EVOLUTION', 'LEARNING', 'TEAMWORK', 'CONSISTENCY', 'LEADERSHIP', 'CUSTOM'];
const TIPOS_ITEM_PLANO: TipoItemPlanoAcao[] = ['TALK', 'OBSERVE', 'TRAIN', 'ASSIGN_MISSION', 'ASSIGN_CONTENT', 'CREATE_PDI', 'REVIEW_PDI', 'RECOGNIZE', 'FOLLOW_UP', 'CUSTOM_TEXT'];

export function Equipe() {
  const { dados, carregando } = useApi(() => listarVisaoEquipe(), []);
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
        {dados?.vendedores.map((v) => (
          <button key={v.vendedorId} onClick={() => setVendedorSelecionadoId(v.vendedorId)} className="text-left">
            <Card>
              <div className="flex items-center justify-between">
                <p className="font-medium text-white">{v.nome}</p>
                {v.alertaMaisSeveroSeveridade && (
                  <span className={`text-xs ${v.alertaMaisSeveroSeveridade === 'HIGH' ? 'text-red-400' : 'text-amber-400'}`}>{v.alertasAbertos} alerta(s)</span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                {v.percentualMetaDia !== null ? `${Math.round(v.percentualMetaDia)}% da meta hoje` : 'sem meta hoje'} · PA {v.pa.toFixed(1)} · Ticket {formatarMoeda(v.ticketMedio)}
                {v.pdiAtivo && ' · PDI ativo'}
              </p>
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
  const [tipoReconhecimento, setTipoReconhecimento] = useState<TipoReconhecimento>('PERFORMANCE');
  const [mensagemReconhecimento, setMensagemReconhecimento] = useState('');
  const [reconhecimentoEnviado, setReconhecimentoEnviado] = useState(false);
  const [erroReconhecimento, setErroReconhecimento] = useState<string | null>(null);

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

  async function handleReconhecer(e: FormEvent) {
    e.preventDefault();
    setErroReconhecimento(null);
    setReconhecimentoEnviado(false);
    try {
      await reconhecerVendedor(vendedorId, { tipo: tipoReconhecimento, message: mensagemReconhecimento || undefined });
      setMensagemReconhecimento('');
      setReconhecimentoEnviado(true);
    } catch (err) {
      setErroReconhecimento(err instanceof ApiError ? err.message : 'não foi possível reconhecer');
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

      <form onSubmit={handleReconhecer} className="flex flex-col gap-2 rounded-lg border border-slate-800 p-4">
        <p className="text-xs uppercase tracking-wide text-slate-500">Reconhecer (social, não altera KPI/score)</p>
        <select value={tipoReconhecimento} onChange={(e) => setTipoReconhecimento(e.target.value as TipoReconhecimento)} className="rounded-lg bg-surface px-3 py-2 text-sm text-white">
          {TIPOS_RECONHECIMENTO.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input placeholder="Mensagem (opcional)" value={mensagemReconhecimento} onChange={(e) => setMensagemReconhecimento(e.target.value)} className="rounded-lg bg-surface px-3 py-2 text-sm text-white" />
        <button type="submit" className="self-start rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
          Reconhecer
        </button>
        {reconhecimentoEnviado && <p className="text-xs text-emerald-400">Reconhecimento enviado ✓</p>}
        {erroReconhecimento && <p className="text-xs text-red-400">{erroReconhecimento}</p>}
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

      <PainelGerencial vendedorId={vendedorId} />
    </div>
  );
}

/** Alertas + Plano de Ação + 1:1 (Fatia 9) — sempre reaproveitando o mesmo
 * vendedorId da tela de Desenvolvimento (Fatia 7.5E), nunca uma tela paralela. */
function PainelGerencial({ vendedorId }: { vendedorId: string }) {
  const { dados, recarregar } = useApi(() => buscarEquipeDetalhe(vendedorId), [vendedorId]);
  const { dados: oneOnOnes, recarregar: recarregarOneOnOnes } = useApi(() => listarOneOnOnes(vendedorId), [vendedorId]);
  const { dados: roteiro } = useApi(() => buscarRoteiroSugerido1a1(), []);

  const [tituloPlano, setTituloPlano] = useState('');
  const [tipoItemPlano, setTipoItemPlano] = useState<TipoItemPlanoAcao>('TALK');
  const [descricaoItemPlano, setDescricaoItemPlano] = useState('');
  const [erroPlano, setErroPlano] = useState<string | null>(null);

  const [oneOnOneAtivoId, setOneOnOneAtivoId] = useState<string | null>(null);
  const [pontosPositivos, setPontosPositivos] = useState('');
  const [pontosAtencao, setPontosAtencao] = useState('');
  const [compromissos, setCompromissos] = useState('');
  const [erro1a1, setErro1a1] = useState<string | null>(null);

  if (!dados) return null;

  async function handleReconhecerAlerta(id: string) {
    await reconhecerAlerta(id);
    recarregar();
  }

  async function handleResolverAlerta(id: string) {
    await resolverAlerta(id, 'RESOLVED_OPERATIONALLY');
    recarregar();
  }

  async function handleDispensarAlerta(id: string) {
    await dispensarAlerta(id);
    recarregar();
  }

  async function handleCriarPlano(e: FormEvent) {
    e.preventDefault();
    setErroPlano(null);
    try {
      const plano = await criarPlano({ subjectType: 'SELLER', subjectId: vendedorId, title: tituloPlano, itens: descricaoItemPlano ? [{ tipo: tipoItemPlano, descricao: descricaoItemPlano }] : [] });
      await ativarPlano(plano.id);
      setTituloPlano('');
      setDescricaoItemPlano('');
      recarregar();
    } catch (err) {
      setErroPlano(err instanceof ApiError ? err.message : 'não foi possível criar o plano');
    }
  }

  async function handleCriarOneOnOne() {
    setErro1a1(null);
    try {
      await criarOneOnOne(vendedorId);
      recarregarOneOnOnes();
    } catch (err) {
      setErro1a1(err instanceof ApiError ? err.message : 'não foi possível agendar o 1:1');
    }
  }

  async function handleConcluirOneOnOne(e: FormEvent, id: string) {
    e.preventDefault();
    setErro1a1(null);
    try {
      await concluirOneOnOne(id, { pontosPositivos: pontosPositivos || undefined, pontosAtencao: pontosAtencao || undefined, compromissos: compromissos || undefined });
      setOneOnOneAtivoId(null);
      setPontosPositivos('');
      setPontosAtencao('');
      setCompromissos('');
      recarregarOneOnOnes();
    } catch (err) {
      setErro1a1(err instanceof ApiError ? err.message : 'não foi possível concluir o 1:1');
    }
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-wide text-slate-500">Alertas</p>
        {dados.alertas.map((a) => (
          <Card key={a.id}>
            <p className={`text-sm font-medium ${a.severidade === 'HIGH' ? 'text-red-400' : a.severidade === 'MEDIUM' ? 'text-amber-400' : 'text-slate-300'}`}>{labelAlerta(a.tipo)}</p>
            {a.status === 'OPEN' && (
              <div className="mt-2 flex gap-2">
                <button onClick={() => handleReconhecerAlerta(a.id)} className="rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-300">
                  Reconhecer
                </button>
                <button onClick={() => handleResolverAlerta(a.id)} className="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-white">
                  Resolver
                </button>
                <button onClick={() => handleDispensarAlerta(a.id)} className="rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-300">
                  Dispensar
                </button>
              </div>
            )}
            {a.status === 'ACKNOWLEDGED' && (
              <button onClick={() => handleResolverAlerta(a.id)} className="mt-2 rounded-lg bg-accent px-3 py-1 text-xs font-medium text-white">
                Resolver
              </button>
            )}
          </Card>
        ))}
        {dados.alertas.length === 0 && <p className="text-sm text-slate-400">Nenhum alerta aberto.</p>}
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-wide text-slate-500">Planos de ação</p>
        {dados.planos.map((p) => (
          <Card key={p.id}>
            <div className="flex items-center justify-between">
              <p className="font-medium text-white">{p.title}</p>
              <span className="text-xs text-slate-400">{p.status}</span>
            </div>
            {p.itens.map((item) => (
              <div key={item.id} className="mt-1 flex items-center justify-between">
                <p className="text-xs text-slate-400">{item.descricao}</p>
                {item.status === 'PENDING' && p.status === 'ACTIVE' && (
                  <button onClick={() => concluirItemPlano(p.id, item.id).then(recarregar)} className="text-xs text-accentSoft underline">
                    concluir
                  </button>
                )}
              </div>
            ))}
            {p.status === 'ACTIVE' && (
              <div className="mt-2 flex gap-2">
                <button onClick={() => concluirPlano(p.id).then(recarregar)} className="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-white">
                  Concluir plano
                </button>
                <button onClick={() => cancelarPlano(p.id).then(recarregar)} className="rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-300">
                  Cancelar
                </button>
              </div>
            )}
          </Card>
        ))}

        <form onSubmit={handleCriarPlano} className="flex flex-col gap-2 rounded-lg border border-slate-800 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Novo plano de ação</p>
          <input placeholder="Título" value={tituloPlano} onChange={(e) => setTituloPlano(e.target.value)} required maxLength={200} className="rounded-lg bg-surface px-3 py-2 text-sm text-white" />
          <select value={tipoItemPlano} onChange={(e) => setTipoItemPlano(e.target.value as TipoItemPlanoAcao)} className="rounded-lg bg-surface px-3 py-2 text-sm text-white">
            {TIPOS_ITEM_PLANO.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <input placeholder="Descrição do 1º item (opcional)" value={descricaoItemPlano} onChange={(e) => setDescricaoItemPlano(e.target.value)} maxLength={500} className="rounded-lg bg-surface px-3 py-2 text-sm text-white" />
          <button type="submit" className="self-start rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
            Criar e ativar
          </button>
          {erroPlano && <p className="text-xs text-red-400">{erroPlano}</p>}
        </form>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-wide text-slate-500">1:1</p>
        {oneOnOnes?.encontros.map((o) => (
          <Card key={o.id}>
            <div className="flex items-center justify-between">
              <p className="text-sm text-white">{o.status}</p>
              {(o.status === 'SCHEDULED' || o.status === 'IN_PROGRESS') && (
                <button onClick={() => setOneOnOneAtivoId(oneOnOneAtivoId === o.id ? null : o.id)} className="text-xs text-accentSoft underline">
                  {oneOnOneAtivoId === o.id ? 'fechar' : 'concluir com notas'}
                </button>
              )}
            </div>
            {o.status === 'COMPLETED' && (
              <>
                {o.pontosPositivos && <p className="mt-1 text-xs text-slate-400">Positivo: {o.pontosPositivos}</p>}
                {o.pontosAtencao && <p className="text-xs text-slate-400">Atenção: {o.pontosAtencao}</p>}
                {o.compromissos && <p className="text-xs text-slate-400">Compromissos: {o.compromissos}</p>}
              </>
            )}
            {oneOnOneAtivoId === o.id && (
              <form onSubmit={(e) => handleConcluirOneOnOne(e, o.id)} className="mt-2 flex flex-col gap-2">
                {roteiro && (
                  <details className="text-xs text-slate-400">
                    <summary>Roteiro sugerido</summary>
                    <ul className="mt-1 list-disc pl-4">
                      {roteiro.perguntas.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  </details>
                )}
                <textarea placeholder="Pontos positivos" value={pontosPositivos} onChange={(e) => setPontosPositivos(e.target.value)} maxLength={500} className="rounded-lg bg-surface px-3 py-2 text-sm text-white" />
                <textarea placeholder="Pontos de atenção" value={pontosAtencao} onChange={(e) => setPontosAtencao(e.target.value)} maxLength={500} className="rounded-lg bg-surface px-3 py-2 text-sm text-white" />
                <textarea placeholder="Compromissos combinados" value={compromissos} onChange={(e) => setCompromissos(e.target.value)} maxLength={500} className="rounded-lg bg-surface px-3 py-2 text-sm text-white" />
                <button type="submit" className="self-start rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
                  Concluir 1:1
                </button>
              </form>
            )}
          </Card>
        ))}
        {oneOnOnes?.encontros.length === 0 && <p className="text-sm text-slate-400">Nenhum 1:1 registrado ainda.</p>}
        <button onClick={handleCriarOneOnOne} className="self-start rounded-lg border border-accent/40 px-4 py-2 text-xs font-medium text-accentSoft">
          Agendar novo 1:1
        </button>
        {erro1a1 && <p className="text-xs text-red-400">{erro1a1}</p>}
      </div>
    </>
  );
}
