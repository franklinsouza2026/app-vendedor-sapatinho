import { useEffect, useState } from 'react';
import { buscarAula, buscarQuiz, buscarTrilhas, concluirAula, iniciarAula, responderQuiz } from '../api/academia';
import { AulaDetalhada, QuizParaResponder, ResultadoQuiz, TrilhaResumo } from '../types';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { Card } from '../components/Card';

const LABEL_STATUS: Record<string, string> = { NOT_STARTED: 'não iniciada', IN_PROGRESS: 'em andamento', COMPLETED: 'concluída' };

type View = 'trilhas' | 'aula' | 'quiz';

export function Academia() {
  const [view, setView] = useState<View>('trilhas');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [trilhas, setTrilhas] = useState<TrilhaResumo[]>([]);

  const [aulaId, setAulaId] = useState<string | null>(null);
  const [aula, setAula] = useState<AulaDetalhada | null>(null);
  const [quiz, setQuiz] = useState<QuizParaResponder | null>(null);
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [resultado, setResultado] = useState<ResultadoQuiz | null>(null);
  const [enviandoQuiz, setEnviandoQuiz] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);

  async function carregarTrilhas() {
    setCarregando(true);
    setErro(null);
    try {
      const { trilhas: lista } = await buscarTrilhas();
      setTrilhas(lista);
    } catch {
      setErro('Não foi possível carregar a Academia agora.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarTrilhas();
  }, []);

  async function abrirAula(id: string) {
    setAulaId(id);
    setView('aula');
    setCarregando(true);
    setErro(null);
    setErroAcao(null);
    try {
      const detalhe = await buscarAula(id);
      setAula(detalhe);
      if (detalhe.status === 'NOT_STARTED') await iniciarAula(id);
    } catch {
      setErro('Não foi possível carregar a aula agora.');
    } finally {
      setCarregando(false);
    }
  }

  async function marcarConcluida() {
    if (!aulaId) return;
    setErroAcao(null);
    try {
      await concluirAula(aulaId);
      const detalhe = await buscarAula(aulaId);
      setAula(detalhe);
    } catch {
      setErroAcao('Não consegui marcar como concluída agora. Tenta de novo?');
    }
  }

  async function abrirQuiz() {
    if (!aulaId) return;
    setView('quiz');
    setCarregando(true);
    setErro(null);
    setResultado(null);
    setRespostas({});
    try {
      const quizCarregado = await buscarQuiz(aulaId);
      setQuiz(quizCarregado);
    } catch {
      setErro('Não foi possível carregar o quiz agora.');
    } finally {
      setCarregando(false);
    }
  }

  async function enviarQuiz() {
    if (!aulaId || !quiz) return;
    setEnviandoQuiz(true);
    setErroAcao(null);
    try {
      const payload = quiz.perguntas.map((p) => ({ questionId: p.id, optionId: respostas[p.id] }));
      const resultadoQuiz = await responderQuiz(aulaId, payload);
      setResultado(resultadoQuiz);
      if (resultadoQuiz.passed) {
        const detalhe = await buscarAula(aulaId);
        setAula(detalhe);
      }
    } catch {
      setErroAcao('Não consegui enviar suas respostas agora. Tenta de novo?');
    } finally {
      setEnviandoQuiz(false);
    }
  }

  function voltarParaTrilhas() {
    setView('trilhas');
    setAulaId(null);
    setAula(null);
    setQuiz(null);
    setResultado(null);
    carregarTrilhas();
  }

  if (carregando) return <LoadingState texto="Carregando a Academia..." />;
  if (erro) return <ErrorState mensagem={erro} onRetry={view === 'trilhas' ? carregarTrilhas : () => aulaId && abrirAula(aulaId)} />;

  if (view === 'quiz' && quiz) {
    const todasRespondidas = quiz.perguntas.every((p) => respostas[p.id]);

    return (
      <div className="flex flex-col p-4 pb-24">
        <button onClick={() => setView('aula')} className="mb-3 self-start text-sm text-slate-400">
          ← Voltar
        </button>
        <h1 className="mb-4 text-xl font-semibold text-white">Quiz</h1>

        {resultado ? (
          <Card>
            <p className="text-xs uppercase tracking-wide text-slate-500">Resultado</p>
            <p className="text-3xl font-bold text-white">{resultado.score}</p>
            <p className={`mb-2 font-medium ${resultado.passed ? 'text-emerald-400' : 'text-red-400'}`}>
              {resultado.passed ? 'Aprovado!' : `Não atingiu a nota mínima de ${resultado.passingScore}`}
            </p>
            {!resultado.passed && (
              <button onClick={() => setResultado(null)} className="mt-2 rounded-lg bg-accent px-3 py-1.5 text-sm text-white active:opacity-80">
                Tentar de novo
              </button>
            )}
            {resultado.passed && (
              <button onClick={voltarParaTrilhas} className="mt-2 rounded-lg bg-accent px-3 py-1.5 text-sm text-white active:opacity-80">
                Voltar pras trilhas
              </button>
            )}
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            {quiz.perguntas.map((p) => (
              <Card key={p.id}>
                <p className="mb-2 font-medium text-white">{p.question}</p>
                <div className="flex flex-col gap-2">
                  {p.opcoes.map((o) => (
                    <label key={o.id} className="flex items-center gap-2 text-sm text-slate-200">
                      <input
                        type="radio"
                        name={p.id}
                        value={o.id}
                        checked={respostas[p.id] === o.id}
                        onChange={() => setRespostas((atual) => ({ ...atual, [p.id]: o.id }))}
                      />
                      {o.text}
                    </label>
                  ))}
                </div>
              </Card>
            ))}
            {erroAcao && (
              <p role="alert" className="text-sm text-red-400">
                {erroAcao}
              </p>
            )}
            <button
              onClick={enviarQuiz}
              disabled={!todasRespondidas || enviandoQuiz}
              className="rounded-xl bg-accent px-4 py-3 font-medium text-white disabled:opacity-50"
            >
              {enviandoQuiz ? 'Enviando...' : 'Enviar respostas'}
            </button>
          </div>
        )}
      </div>
    );
  }

  if (view === 'aula' && aula) {
    return (
      <div className="flex flex-col p-4 pb-24">
        <button onClick={voltarParaTrilhas} className="mb-3 self-start text-sm text-slate-400">
          ← Voltar
        </button>
        <h1 className="text-xl font-semibold text-white">{aula.title}</h1>
        <p className="mb-4 text-xs text-slate-400">
          {aula.estimatedMinutes} min · {LABEL_STATUS[aula.status]}
        </p>

        <Card className="mb-4">
          <p className="whitespace-pre-wrap text-sm text-slate-200">{aula.content}</p>
          {aula.origem === 'DEMONSTRATIVO' && (
            <p className="mt-3 text-xs italic text-slate-500">Conteúdo de referência geral — não é política oficial da sua loja.</p>
          )}
        </Card>

        {aula.playbookRelacionado.length > 0 && (
          <Card className="mb-4">
            <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Playbook da sua loja</p>
            {aula.playbookRelacionado.map((s, i) => (
              <div key={i} className="mb-2">
                <p className="text-sm font-medium text-white">{s.title}</p>
                <p className="text-sm text-slate-400">{s.content}</p>
                {s.origin === 'DEMONSTRATIVO' && <p className="text-xs italic text-slate-500">não é política oficial</p>}
              </div>
            ))}
          </Card>
        )}

        {erroAcao && (
          <p role="alert" className="mb-3 text-sm text-red-400">
            {erroAcao}
          </p>
        )}

        {aula.status !== 'COMPLETED' &&
          (aula.hasQuiz ? (
            <button onClick={abrirQuiz} className="rounded-xl bg-accent px-4 py-3 font-medium text-white active:opacity-80">
              Ir para o quiz
            </button>
          ) : (
            <button onClick={marcarConcluida} className="rounded-xl bg-accent px-4 py-3 font-medium text-white active:opacity-80">
              Marcar como concluída
            </button>
          ))}
        {aula.status === 'COMPLETED' && <p className="font-medium text-emerald-400">Aula concluída ✓</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col p-4 pb-24">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-academia" aria-hidden="true" />
        <h1 className="text-xl font-semibold text-white">Academia de Vendas</h1>
      </div>
      <p className="mb-4 text-xs text-slate-400">Trilhas curtas de técnica de venda, com quiz pra fixar</p>

      <div className="flex flex-col gap-4">
        {trilhas.map((t) => (
          <div key={t.id}>
            <p className="mb-2 font-medium text-white">{t.title}</p>
            <div className="flex flex-col gap-2">
              {t.aulas.map((a) => (
                <button key={a.id} type="button" className="text-left" onClick={() => abrirAula(a.id)}>
                  <Card className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-white">{a.title}</p>
                      <p className="text-xs text-slate-400">
                        {a.estimatedMinutes} min {a.hasQuiz && '· com quiz'}
                      </p>
                    </div>
                    <span className="text-xs text-slate-500">{LABEL_STATUS[a.status]}</span>
                  </Card>
                </button>
              ))}
            </div>
          </div>
        ))}
        {trilhas.length === 0 && <p className="text-slate-400">Nenhuma trilha disponível no momento.</p>}
      </div>
    </div>
  );
}
