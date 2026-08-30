import { FormEvent, useState } from 'react';
import { useApi } from '../../utils/useApi';
import {
  arquivarQuestaoAdmin,
  atualizarMandamentoAdmin,
  AulaAdmin,
  buscarDashboardTreinamento,
  buscarMandamentosAdmin,
  criarAulaAdmin,
  criarQuestaoAdmin,
  criarTrilhaAdmin,
  definirQuizDaAula,
  listarAulasAdmin,
  listarQuestoesDoQuiz,
  listarTrilhasAdmin,
  publicarMandamentoAdmin,
  QuestaoAdmin,
  StatusConteudo,
  TrilhaAdmin,
  transicionarAulaAdmin,
  transicionarTrilhaAdmin,
} from '../../api/adminTraining';
import { ApiError } from '../../api/client';
import { LoadingState } from '../../components/LoadingState';
import { AdminNav } from './AdminNav';
import { AbaTreinamentoIA } from './AdminTreinamentoIA';

const LABEL_STATUS: Record<StatusConteudo, string> = {
  DRAFT: 'rascunho',
  REVIEW_PENDING: 'em revisão',
  APPROVED: 'aprovado',
  PUBLISHED: 'publicado',
  ARCHIVED: 'arquivado',
};

const PROXIMA_TRANSICAO: Partial<Record<StatusConteudo, { transicao: 'submeter' | 'aprovar' | 'publicar'; label: string }>> = {
  DRAFT: { transicao: 'submeter', label: 'Enviar pra revisão' },
  REVIEW_PENDING: { transicao: 'aprovar', label: 'Aprovar' },
  APPROVED: { transicao: 'publicar', label: 'Publicar' },
};

export function AdminTreinamento() {
  const [aba, setAba] = useState<'trilhas' | 'aulas' | 'mandamentos' | 'ia'>('trilhas');
  const { dados: dashboard, recarregar: recarregarDashboard } = useApi(() => buscarDashboardTreinamento(), []);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <AdminNav />
      <h1 className="text-2xl font-semibold text-white">Conteúdo & Treinamento</h1>

      {dashboard && (
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-800 p-4 text-sm md:grid-cols-5">
          <Metrica label="Trilhas ativas" valor={dashboard.trilhasAtivas} />
          <Metrica label="Quizzes" valor={dashboard.quizzesAtivos} />
          <Metrica label="Aulas sem quiz" valor={dashboard.aulasSemQuiz} />
          <Metrica label="Trilhas em rascunho" valor={dashboard.trilhasPorStatus.DRAFT ?? 0} />
          <Metrica label="Aulas em revisão" valor={dashboard.aulasPorStatus.REVIEW_PENDING ?? 0} />
        </div>
      )}

      <div className="flex gap-2 border-b border-slate-800 pb-2">
        {(['trilhas', 'aulas', 'mandamentos', 'ia'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setAba(t)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${aba === t ? 'bg-accent text-white' : 'bg-surface text-slate-400'}`}
          >
            {t === 'trilhas' ? 'Trilhas' : t === 'aulas' ? 'Aulas' : t === 'mandamentos' ? '13 Mandamentos' : 'IA de Treinamento'}
          </button>
        ))}
      </div>

      {aba === 'trilhas' && <AbaTrilhas onMudou={recarregarDashboard} />}
      {aba === 'aulas' && <AbaAulas onMudou={recarregarDashboard} />}
      {aba === 'mandamentos' && <AbaMandamentos />}
      {aba === 'ia' && <AbaTreinamentoIA />}
    </div>
  );
}

function Metrica({ label, valor }: { label: string; valor: number }) {
  return (
    <div>
      <p className="text-slate-500">{label}</p>
      <p className="text-lg font-semibold text-white">{valor}</p>
    </div>
  );
}

function BotaoTransicao<T extends { status: StatusConteudo }>({ item, onTransicionar }: { item: T; onTransicionar: (t: 'submeter' | 'aprovar' | 'publicar' | 'arquivar') => Promise<void> }) {
  const [erro, setErro] = useState<string | null>(null);
  const proxima = PROXIMA_TRANSICAO[item.status];

  async function executar(t: 'submeter' | 'aprovar' | 'publicar' | 'arquivar') {
    setErro(null);
    try {
      await onTransicionar(t);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'falha na transição');
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500">{LABEL_STATUS[item.status]}</span>
      {proxima && (
        <button onClick={() => executar(proxima.transicao)} className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-white">
          {proxima.label}
        </button>
      )}
      {item.status !== 'ARCHIVED' && (
        <button onClick={() => executar('arquivar')} className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
          Arquivar
        </button>
      )}
      {erro && <span className="text-xs text-red-400">{erro}</span>}
    </div>
  );
}

function AbaTrilhas({ onMudou }: { onMudou: () => void }) {
  const { dados, carregando, recarregar } = useApi(() => listarTrilhasAdmin(), []);
  const [novoCode, setNovoCode] = useState('');
  const [novoTitle, setNovoTitle] = useState('');
  const [novaDesc, setNovaDesc] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  async function handleCriar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      await criarTrilhaAdmin({ code: novoCode, title: novoTitle, description: novaDesc });
      setNovoCode('');
      setNovoTitle('');
      setNovaDesc('');
      recarregar();
      onMudou();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'não foi possível criar a trilha');
    }
  }

  if (carregando && !dados) return <LoadingState texto="Carregando trilhas..." />;

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleCriar} className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-800 p-4">
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Código
          <input value={novoCode} onChange={(e) => setNovoCode(e.target.value)} required className="rounded-lg bg-surface px-3 py-2 text-sm text-white" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Título
          <input value={novoTitle} onChange={(e) => setNovoTitle(e.target.value)} required className="rounded-lg bg-surface px-3 py-2 text-sm text-white" />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs text-slate-400">
          Descrição
          <input value={novaDesc} onChange={(e) => setNovaDesc(e.target.value)} required className="rounded-lg bg-surface px-3 py-2 text-sm text-white" />
        </label>
        <button type="submit" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
          Nova trilha
        </button>
        {erro && <p className="w-full text-xs text-red-400">{erro}</p>}
      </form>

      <div className="flex flex-col gap-2">
        {dados?.trilhas.map((t: TrilhaAdmin) => (
          <div key={t.id} className="flex items-center justify-between rounded-lg border border-slate-800 p-3">
            <div>
              <p className="font-medium text-white">{t.title}</p>
              <p className="text-xs text-slate-500">
                {t.code} · {t.aulas.length} aula(s)
              </p>
            </div>
            <BotaoTransicao
              item={t}
              onTransicionar={async (transicao) => {
                await transicionarTrilhaAdmin(t.id, transicao);
                recarregar();
                onMudou();
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function AbaAulas({ onMudou }: { onMudou: () => void }) {
  const { dados: trilhas } = useApi(() => listarTrilhasAdmin(), []);
  const { dados, recarregar } = useApi(() => listarAulasAdmin(), []);
  const [aulaExpandida, setAulaExpandida] = useState<string | null>(null);
  const [form, setForm] = useState({ trackId: '', code: '', title: '', description: '', content: '', estimatedMinutes: 5 });
  const [erro, setErro] = useState<string | null>(null);

  async function handleCriar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      await criarAulaAdmin(form);
      setForm({ trackId: '', code: '', title: '', description: '', content: '', estimatedMinutes: 5 });
      recarregar();
      onMudou();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'não foi possível criar a aula');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleCriar} className="flex flex-col gap-2 rounded-lg border border-slate-800 p-4">
        <div className="flex flex-wrap gap-2">
          <select value={form.trackId} onChange={(e) => setForm({ ...form, trackId: e.target.value })} required className="rounded-lg bg-surface px-3 py-2 text-sm text-white">
            <option value="">Trilha...</option>
            {trilhas?.trilhas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <input placeholder="Código" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required className="rounded-lg bg-surface px-3 py-2 text-sm text-white" />
          <input placeholder="Título" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required className="rounded-lg bg-surface px-3 py-2 text-sm text-white" />
          <input
            type="number"
            placeholder="Minutos"
            value={form.estimatedMinutes}
            onChange={(e) => setForm({ ...form, estimatedMinutes: Number(e.target.value) })}
            className="w-24 rounded-lg bg-surface px-3 py-2 text-sm text-white"
          />
        </div>
        <input placeholder="Descrição" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required className="rounded-lg bg-surface px-3 py-2 text-sm text-white" />
        <textarea placeholder="Conteúdo" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} required className="rounded-lg bg-surface px-3 py-2 text-sm text-white" rows={3} />
        <button type="submit" className="self-start rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
          Nova aula
        </button>
        {erro && <p className="text-xs text-red-400">{erro}</p>}
      </form>

      <div className="flex flex-col gap-2">
        {dados?.aulas.map((a: AulaAdmin) => (
          <div key={a.id} className="rounded-lg border border-slate-800 p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-white">{a.title}</p>
                <p className="text-xs text-slate-500">{a.code}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setAulaExpandida(aulaExpandida === a.id ? null : a.id)} className="text-xs text-accentSoft underline">
                  {aulaExpandida === a.id ? 'Fechar quiz' : 'Configurar quiz'}
                </button>
                <BotaoTransicao
                  item={a}
                  onTransicionar={async (transicao) => {
                    await transicionarAulaAdmin(a.id, transicao);
                    recarregar();
                    onMudou();
                  }}
                />
              </div>
            </div>
            {aulaExpandida === a.id && <EditorQuiz lessonId={a.id} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function EditorQuiz({ lessonId }: { lessonId: string }) {
  const [quizId, setQuizId] = useState<string | null>(null);
  const [passingScore, setPassingScore] = useState(70);
  const [questionsPerAttempt, setQuestionsPerAttempt] = useState('');
  const [questoes, setQuestoes] = useState<QuestaoAdmin[]>([]);
  const [novaPergunta, setNovaPergunta] = useState('');
  const [opcoes, setOpcoes] = useState([{ text: '', correct: true }, { text: '', correct: false }]);
  const [erro, setErro] = useState<string | null>(null);

  async function handleDefinirQuiz(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      const quiz = await definirQuizDaAula(lessonId, { passingScore, questionsPerAttempt: questionsPerAttempt ? Number(questionsPerAttempt) : null });
      setQuizId(quiz.id);
      const lista = await listarQuestoesDoQuiz(quiz.id);
      setQuestoes(lista.questoes);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'não foi possível configurar o quiz');
    }
  }

  async function handleCriarQuestao(e: FormEvent) {
    e.preventDefault();
    if (!quizId) return;
    setErro(null);
    try {
      await criarQuestaoAdmin({ quizId, question: novaPergunta, opcoes });
      setNovaPergunta('');
      setOpcoes([{ text: '', correct: true }, { text: '', correct: false }]);
      const lista = await listarQuestoesDoQuiz(quizId);
      setQuestoes(lista.questoes);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'não foi possível criar a questão');
    }
  }

  async function handleArquivar(id: string) {
    if (!quizId) return;
    await arquivarQuestaoAdmin(id);
    const lista = await listarQuestoesDoQuiz(quizId);
    setQuestoes(lista.questoes);
  }

  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-slate-800 pt-3">
      <form onSubmit={handleDefinirQuiz} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Nota mínima
          <input type="number" value={passingScore} onChange={(e) => setPassingScore(Number(e.target.value))} className="w-20 rounded-lg bg-surface px-3 py-2 text-sm text-white" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Perguntas por tentativa (banco maior = sorteio)
          <input
            type="number"
            placeholder="todas"
            value={questionsPerAttempt}
            onChange={(e) => setQuestionsPerAttempt(e.target.value)}
            className="w-40 rounded-lg bg-surface px-3 py-2 text-sm text-white"
          />
        </label>
        <button type="submit" className="rounded-lg bg-surface px-3 py-2 text-sm text-white">
          Salvar quiz
        </button>
      </form>

      {quizId && (
        <>
          <form onSubmit={handleCriarQuestao} className="flex flex-col gap-2 rounded-lg bg-base p-3">
            <input placeholder="Pergunta" value={novaPergunta} onChange={(e) => setNovaPergunta(e.target.value)} required className="rounded-lg bg-surface px-3 py-2 text-sm text-white" />
            {opcoes.map((o, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  placeholder={`Alternativa ${idx + 1}`}
                  value={o.text}
                  onChange={(e) => {
                    const novas = [...opcoes];
                    novas[idx] = { ...novas[idx], text: e.target.value };
                    setOpcoes(novas);
                  }}
                  required
                  className="flex-1 rounded-lg bg-surface px-3 py-2 text-sm text-white"
                />
                <label className="flex items-center gap-1 text-xs text-slate-400">
                  <input
                    type="radio"
                    name="correta"
                    checked={o.correct}
                    onChange={() => setOpcoes(opcoes.map((op, i) => ({ ...op, correct: i === idx })))}
                  />
                  correta
                </label>
              </div>
            ))}
            <button type="button" onClick={() => setOpcoes([...opcoes, { text: '', correct: false }])} className="self-start text-xs text-accentSoft underline">
              + alternativa
            </button>
            <button type="submit" className="self-start rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white">
              Adicionar questão
            </button>
          </form>

          <ul className="flex flex-col gap-1 text-sm text-slate-200">
            {questoes.map((q) => (
              <li key={q.id} className="flex items-center justify-between rounded bg-base px-3 py-2">
                <span>{q.question}</span>
                <button onClick={() => handleArquivar(q.id)} className="text-xs text-red-400 underline">
                  Arquivar
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {erro && <p className="text-xs text-red-400">{erro}</p>}
    </div>
  );
}

function AbaMandamentos() {
  const { dados, recarregar } = useApi(() => buscarMandamentosAdmin(), []);
  const [editando, setEditando] = useState<Record<number, string>>({});
  const [erro, setErro] = useState<string | null>(null);

  async function handleSalvar(numero: number) {
    setErro(null);
    try {
      await atualizarMandamentoAdmin(numero, { conteudoOficial: editando[numero] });
      recarregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'não foi possível salvar');
    }
  }

  async function handlePublicar(numero: number) {
    setErro(null);
    try {
      await publicarMandamentoAdmin(numero);
      recarregar();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'não foi possível publicar');
    }
  }

  if (!dados) return <LoadingState texto="Carregando os 13 Mandamentos..." />;

  return (
    <div className="flex flex-col gap-3">
      <p className={`text-sm ${dados.completude.completo ? 'text-emerald-400' : 'text-amber-400'}`}>
        {dados.completude.completo
          ? 'Estrutura completa — todos os 13 têm conteúdo oficial cadastrado.'
          : `Faltam ${dados.completude.faltando.length} mandamento(s) sem conteúdo oficial: ${dados.completude.faltando.join(', ')}.`}
      </p>
      {erro && <p className="text-xs text-red-400">{erro}</p>}
      {dados.mandamentos.map((m) => (
        <div key={m.numero} className="rounded-lg border border-slate-800 p-3">
          <div className="flex items-center justify-between">
            <p className="font-medium text-white">
              {m.numero} — {m.titulo}
            </p>
            <span className="text-xs text-slate-500">{LABEL_STATUS[m.status]}</span>
          </div>
          <textarea
            defaultValue={m.conteudoOficial ?? ''}
            placeholder="Conteúdo oficial pendente — cole aqui o texto real dos 13 Mandamentos"
            onChange={(e) => setEditando({ ...editando, [m.numero]: e.target.value })}
            className="mt-2 w-full rounded-lg bg-surface px-3 py-2 text-sm text-white"
            rows={2}
          />
          <div className="mt-2 flex gap-2">
            <button onClick={() => handleSalvar(m.numero)} className="rounded-lg bg-surface px-3 py-1.5 text-xs text-white">
              Salvar
            </button>
            <button
              onClick={() => handlePublicar(m.numero)}
              disabled={!m.conteudoOficial}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              Publicar
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
