import { FormEvent, useState } from 'react';
import { useApi } from '../../utils/useApi';
import { AdminNav } from './AdminNav';
import { LoadingState } from '../../components/LoadingState';
import { ApiError } from '../../api/client';
import { listarTrilhasAdmin } from '../../api/adminTraining';
import {
  atualizarCompetenciaAdmin,
  atualizarEscolaAdmin,
  CertificationDefinitionAdmin,
  criarCertificacaoAdmin,
  criarCompetenciaAdmin,
  criarEscolaAdmin,
  definirRequisitosAdmin,
  definirTargetAdmin,
  Escola,
  listarCertificacoesAdmin,
  listarCompetenciasAdmin,
  listarEscolasAdmin,
  listarPDIsAdmin,
  mapearCompetenciasAdmin,
  transicionarCertificacaoAdmin,
  CompetenciaAdmin,
} from '../../api/universidade';

export function AdminUniversidade() {
  const [aba, setAba] = useState<'escolas' | 'competencias' | 'mapeamento' | 'certificacoes' | 'pdi'>('escolas');

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <AdminNav />
      <h1 className="text-2xl font-semibold text-white">Universidade</h1>

      <div className="flex gap-2 border-b border-slate-800 pb-2">
        {(['escolas', 'competencias', 'mapeamento', 'certificacoes', 'pdi'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setAba(t)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${aba === t ? 'bg-accent text-white' : 'bg-surface text-slate-400'}`}
          >
            {t === 'escolas' ? 'Escolas' : t === 'competencias' ? 'Competências' : t === 'mapeamento' ? 'Mapeamento' : t === 'certificacoes' ? 'Certificações' : 'PDI'}
          </button>
        ))}
      </div>

      {aba === 'escolas' && <AbaEscolas />}
      {aba === 'competencias' && <AbaCompetencias />}
      {aba === 'mapeamento' && <AbaMapeamento />}
      {aba === 'certificacoes' && <AbaCertificacoes />}
      {aba === 'pdi' && <AbaPDI />}
    </div>
  );
}

function AbaEscolas() {
  const { dados, carregando, recarregar } = useApi(() => listarEscolasAdmin(), []);
  const [form, setForm] = useState({ code: '', name: '', description: '' });
  const [erro, setErro] = useState<string | null>(null);

  async function handleCriar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      await criarEscolaAdmin(form);
      setForm({ code: '', name: '', description: '' });
      recarregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'não foi possível criar');
    }
  }

  async function handleToggleActive(escola: Escola) {
    await atualizarEscolaAdmin(escola.id, { active: !escola.active });
    recarregar();
  }

  if (carregando && !dados) return <LoadingState texto="Carregando escolas..." />;

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleCriar} className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-800 p-4">
        <input placeholder="Código" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required className="rounded-lg bg-surface px-3 py-2 text-sm text-white" />
        <input placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="rounded-lg bg-surface px-3 py-2 text-sm text-white" />
        <input placeholder="Descrição" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required className="flex-1 rounded-lg bg-surface px-3 py-2 text-sm text-white" />
        <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
          Nova escola
        </button>
        {erro && <p className="w-full text-xs text-red-400">{erro}</p>}
      </form>
      <div className="flex flex-col gap-2">
        {dados?.escolas.map((e) => (
          <div key={e.id} className="flex items-center justify-between rounded-lg border border-slate-800 p-3">
            <div>
              <p className="font-medium text-white">{e.name}</p>
              <p className="text-xs text-slate-500">
                {e.code} · {e.audience}
              </p>
            </div>
            <button onClick={() => handleToggleActive(e)} className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
              {e.active ? 'Arquivar' : 'Reativar'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AbaCompetencias() {
  const { dados, carregando, recarregar } = useApi(() => listarCompetenciasAdmin(), []);
  const [form, setForm] = useState({ code: '', name: '', description: '' });
  const [erro, setErro] = useState<string | null>(null);
  const [targetsAberto, setTargetsAberto] = useState<string | null>(null);

  async function handleCriar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      await criarCompetenciaAdmin(form);
      setForm({ code: '', name: '', description: '' });
      recarregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'não foi possível criar');
    }
  }

  async function handleArquivar(c: CompetenciaAdmin) {
    await atualizarCompetenciaAdmin(c.id, { status: c.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE' });
    recarregar();
  }

  if (carregando && !dados) return <LoadingState texto="Carregando competências..." />;

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleCriar} className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-800 p-4">
        <input placeholder="Código" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required className="rounded-lg bg-surface px-3 py-2 text-sm text-white" />
        <input placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="rounded-lg bg-surface px-3 py-2 text-sm text-white" />
        <input placeholder="Descrição" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required className="flex-1 rounded-lg bg-surface px-3 py-2 text-sm text-white" />
        <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
          Nova competência
        </button>
        {erro && <p className="w-full text-xs text-red-400">{erro}</p>}
      </form>
      <div className="flex flex-col gap-2">
        {dados?.competencias.map((c) => (
          <div key={c.id} className="rounded-lg border border-slate-800 p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-white">{c.name}</p>
                <p className="text-xs text-slate-500">
                  {c.code} · {c.audience} · {c.status}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setTargetsAberto(targetsAberto === c.id ? null : c.id)} className="text-xs text-accentSoft underline">
                  Metas
                </button>
                <button onClick={() => handleArquivar(c)} className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
                  {c.status === 'ACTIVE' ? 'Arquivar' : 'Reativar'}
                </button>
              </div>
            </div>
            {targetsAberto === c.id && <FormTargets competencyId={c.id} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function FormTargets({ competencyId }: { competencyId: string }) {
  const [papel, setPapel] = useState<'VENDEDOR' | 'GERENTE'>('VENDEDOR');
  const [targetScore, setTargetScore] = useState(70);
  const [salvo, setSalvo] = useState(false);

  async function handleSalvar() {
    await definirTargetAdmin(competencyId, papel, targetScore);
    setSalvo(true);
  }

  return (
    <div className="mt-2 flex items-end gap-2 border-t border-slate-800 pt-2">
      <select value={papel} onChange={(e) => setPapel(e.target.value as 'VENDEDOR' | 'GERENTE')} className="rounded-lg bg-surface px-3 py-2 text-sm text-white">
        <option value="VENDEDOR">Vendedor</option>
        <option value="GERENTE">Gerente</option>
      </select>
      <label className="flex flex-col gap-1 text-xs text-slate-400">
        Meta (0-100)
        <input type="number" min={1} max={100} value={targetScore} onChange={(e) => setTargetScore(Number(e.target.value))} className="w-20 rounded-lg bg-surface px-3 py-2 text-sm text-white" />
      </label>
      <button onClick={handleSalvar} className="rounded-lg bg-surface px-3 py-2 text-sm text-white">
        Salvar
      </button>
      {salvo && <span className="text-xs text-emerald-400">Salvo ✓</span>}
    </div>
  );
}

// Mapeamento competência↔conteúdo (seção 20-22): trilha/aula têm listagem
// real (reaproveita a mesma API do CMS, Fatia 7.5C — nunca duplicar
// listagem); quiz/questão/simulação/missão ainda não têm uma tela admin
// dedicada nesta fatia, então aceitam o id direto (o backend sempre valida
// existência/tenant/status antes de gravar o mapeamento).
function AbaMapeamento() {
  const { dados: trilhas } = useApi(() => listarTrilhasAdmin(), []);
  const { dados: competenciasDados } = useApi(() => listarCompetenciasAdmin(), []);
  const [tipo, setTipo] = useState<'track' | 'lesson' | 'question' | 'simulation' | 'mission'>('lesson');
  const [contentId, setContentId] = useState('');
  const [competenciasSelecionadas, setCompetenciasSelecionadas] = useState<string[]>([]);
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  const opcoesConteudo =
    tipo === 'track'
      ? trilhas?.trilhas.map((t) => ({ id: t.id, label: `${t.title} (${t.status})` })) ?? []
      : tipo === 'lesson'
        ? trilhas?.trilhas.flatMap((t) => t.aulas.map((a) => ({ id: a.id, label: `${a.title} — ${t.title} (${a.status})` }))) ?? []
        : [];

  function toggleCompetencia(id: string) {
    setCompetenciasSelecionadas((atual) => (atual.includes(id) ? atual.filter((c) => c !== id) : [...atual, id]));
  }

  async function handleMapear(e: FormEvent) {
    e.preventDefault();
    setMensagem(null);
    if (!contentId || competenciasSelecionadas.length === 0) {
      setMensagem({ tipo: 'erro', texto: 'escolha o conteúdo e ao menos 1 competência' });
      return;
    }
    try {
      await mapearCompetenciasAdmin(tipo, contentId, competenciasSelecionadas);
      setMensagem({ tipo: 'ok', texto: 'mapeamento salvo ✓' });
      setContentId('');
      setCompetenciasSelecionadas([]);
    } catch (err) {
      setMensagem({ tipo: 'erro', texto: err instanceof ApiError ? err.message : 'não foi possível mapear' });
    }
  }

  return (
    <form onSubmit={handleMapear} className="flex flex-col gap-4 rounded-lg border border-slate-800 p-4">
      <p className="text-sm text-slate-400">Associe uma competência a um conteúdo já existente — questões alimentam a revisão espaçada, aulas alimentam quiz/evidência de conclusão.</p>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Tipo de conteúdo
          <select
            value={tipo}
            onChange={(e) => {
              setTipo(e.target.value as typeof tipo);
              setContentId('');
            }}
            className="rounded-lg bg-surface px-3 py-2 text-sm text-white"
          >
            <option value="lesson">Aula</option>
            <option value="track">Trilha</option>
            <option value="question">Questão</option>
            <option value="simulation">Cenário de simulação</option>
            <option value="mission">Missão</option>
          </select>
        </label>

        {tipo === 'track' || tipo === 'lesson' ? (
          <label className="flex flex-1 flex-col gap-1 text-xs text-slate-400">
            Conteúdo
            <select value={contentId} onChange={(e) => setContentId(e.target.value)} className="rounded-lg bg-surface px-3 py-2 text-sm text-white">
              <option value="">Selecione...</option>
              {opcoesConteudo.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="flex flex-1 flex-col gap-1 text-xs text-slate-400">
            ID do conteúdo ({tipo})
            <input value={contentId} onChange={(e) => setContentId(e.target.value)} placeholder="uuid" className="rounded-lg bg-surface px-3 py-2 text-sm text-white" />
          </label>
        )}
      </div>

      <div>
        <p className="mb-2 text-xs text-slate-400">Competências</p>
        <div className="flex flex-wrap gap-2">
          {competenciasDados?.competencias.map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => toggleCompetencia(c.id)}
              className={`rounded-full px-3 py-1 text-xs ${competenciasSelecionadas.includes(c.id) ? 'bg-accent text-white' : 'bg-surface text-slate-400'}`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <button type="submit" className="self-start rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
        Mapear
      </button>
      {mensagem && <p className={`text-xs ${mensagem.tipo === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>{mensagem.texto}</p>}
    </form>
  );
}

const LABEL_STATUS_CERT: Record<string, string> = { DRAFT: 'rascunho', REVIEW_PENDING: 'em revisão', APPROVED: 'aprovado', PUBLISHED: 'publicado', ARCHIVED: 'arquivado' };
const PROXIMA_TRANSICAO_CERT: Partial<Record<string, { transicao: 'submeter' | 'aprovar' | 'publicar'; label: string }>> = {
  DRAFT: { transicao: 'submeter', label: 'Enviar pra revisão' },
  REVIEW_PENDING: { transicao: 'aprovar', label: 'Aprovar' },
  APPROVED: { transicao: 'publicar', label: 'Publicar' },
};

function AbaCertificacoes() {
  const { dados, carregando, recarregar } = useApi(() => listarCertificacoesAdmin(), []);
  const [form, setForm] = useState({ code: '', name: '', description: '' });
  const [erro, setErro] = useState<string | null>(null);

  async function handleCriar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      await criarCertificacaoAdmin(form);
      setForm({ code: '', name: '', description: '' });
      recarregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'não foi possível criar');
    }
  }

  async function handleAdicionarMandamentos(id: string) {
    await definirRequisitosAdmin(id, [{ tipo: 'MANDAMENTOS_COMPLETOS' }]);
    recarregar();
  }

  async function handleTransicao(id: string, transicao: 'submeter' | 'aprovar' | 'publicar') {
    setErro(null);
    try {
      await transicionarCertificacaoAdmin(id, transicao);
      recarregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'falha na transição');
    }
  }

  if (carregando && !dados) return <LoadingState texto="Carregando certificações..." />;

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleCriar} className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-800 p-4">
        <input placeholder="Código" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required className="rounded-lg bg-surface px-3 py-2 text-sm text-white" />
        <input placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required className="rounded-lg bg-surface px-3 py-2 text-sm text-white" />
        <input placeholder="Descrição" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required className="flex-1 rounded-lg bg-surface px-3 py-2 text-sm text-white" />
        <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
          Nova certificação
        </button>
        {erro && <p className="w-full text-xs text-red-400">{erro}</p>}
      </form>
      <div className="flex flex-col gap-2">
        {dados?.definicoes.map((d: CertificationDefinitionAdmin) => {
          const proxima = PROXIMA_TRANSICAO_CERT[d.status];
          return (
            <div key={d.id} className="rounded-lg border border-slate-800 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-white">{d.name}</p>
                  <p className="text-xs text-slate-500">
                    {d.code} · v{d.version} · {d.requisitos.length} requisito(s)
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">{LABEL_STATUS_CERT[d.status]}</span>
                  {d.status === 'DRAFT' && d.requisitos.length === 0 && (
                    <button onClick={() => handleAdicionarMandamentos(d.id)} className="text-xs text-accentSoft underline">
                      + requisito 13 Mandamentos
                    </button>
                  )}
                  {proxima && (
                    <button onClick={() => handleTransicao(d.id, proxima.transicao)} className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-white">
                      {proxima.label}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AbaPDI() {
  const { dados, carregando } = useApi(() => listarPDIsAdmin(), []);
  if (carregando && !dados) return <LoadingState texto="Carregando planos..." />;

  return (
    <div className="flex flex-col gap-2">
      {dados?.planos.map((p) => (
        <div key={p.id} className="flex items-center justify-between rounded-lg border border-slate-800 p-3">
          <div>
            <p className="font-medium text-white">{p.competencia?.name ?? 'Plano'}</p>
            <p className="text-xs text-slate-500">
              Vendedor: {p.subjectUserId} · Meta {p.targetScore}
            </p>
          </div>
          <span className="text-xs text-slate-500">{p.status}</span>
        </div>
      ))}
      {dados?.planos.length === 0 && <p className="text-sm text-slate-400">Nenhum plano de desenvolvimento ainda.</p>}
    </div>
  );
}
