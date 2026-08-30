import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { buscarCenarios, buscarHistorico, buscarSessaoDetalhada, criarSessao, encerrarSessao, enviarMensagem } from '../api/simulador';
import { ApiError } from '../api/client';
import { AvaliacaoSimulador, CenarioSimulador, DificuldadeSimulacao, HistoricoSimuladorItem, MensagemSimulador, SessaoSimulador } from '../types';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { Card } from '../components/Card';

const LABEL_DIFICULDADE: Record<DificuldadeSimulacao, string> = { EASY: 'Fácil', MEDIUM: 'Médio', HARD: 'Difícil' };

const MENSAGEM_POR_TIPO_ERRO: Record<string, string> = {
  rate_limited: 'Você atingiu o limite de mensagens de hoje no Simulador. Volta amanhã!',
  budget_exceeded: 'O Simulador está temporariamente indisponível. Tente de novo mais tarde.',
  provider_unavailable: 'O Simulador está indisponível no momento. Tente de novo em instantes.',
  generation_in_progress: 'Ainda estou gerando a reação da cliente — espera um instante.',
  message_too_long: 'Essa mensagem é muito longa. Tenta resumir um pouco?',
  invalid_state: 'Esta simulação já foi encerrada.',
};

type View = 'lista' | 'dificuldade' | 'sessao' | 'historico';

export function Simulador() {
  const [view, setView] = useState<View>('lista');
  const [carregando, setCarregando] = useState(true);
  const [erroCarregamento, setErroCarregamento] = useState<string | null>(null);
  const [cenarios, setCenarios] = useState<CenarioSimulador[]>([]);
  const [historico, setHistorico] = useState<HistoricoSimuladorItem[]>([]);
  const [cenarioEscolhido, setCenarioEscolhido] = useState<CenarioSimulador | null>(null);

  const [sessao, setSessao] = useState<SessaoSimulador | null>(null);
  const [mensagens, setMensagens] = useState<MensagemSimulador[]>([]);
  const [avaliacao, setAvaliacao] = useState<AvaliacaoSimulador | null>(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erroSessao, setErroSessao] = useState<string | null>(null);
  const fimDaListaRef = useRef<HTMLDivElement>(null);

  async function carregarLista() {
    setCarregando(true);
    setErroCarregamento(null);
    try {
      const { cenarios: lista } = await buscarCenarios();
      setCenarios(lista);
    } catch {
      setErroCarregamento('Não foi possível carregar os cenários agora.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarLista();
  }, []);

  useEffect(() => {
    fimDaListaRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens]);

  async function abrirHistorico() {
    setView('historico');
    setCarregando(true);
    setErroCarregamento(null);
    try {
      const { historico: lista } = await buscarHistorico();
      setHistorico(lista);
    } catch {
      setErroCarregamento('Não foi possível carregar o histórico agora.');
    } finally {
      setCarregando(false);
    }
  }

  async function iniciar(cenario: CenarioSimulador, dificuldade: DificuldadeSimulacao) {
    setCarregando(true);
    setErroCarregamento(null);
    try {
      const novaSessao = await criarSessao(cenario.id, dificuldade);
      const detalhe = await buscarSessaoDetalhada(novaSessao.id);
      setSessao(detalhe.sessao);
      setMensagens(detalhe.mensagens);
      setAvaliacao(detalhe.avaliacao);
      setView('sessao');
    } catch {
      setErroCarregamento('Não foi possível iniciar a simulação agora.');
    } finally {
      setCarregando(false);
    }
  }

  async function enviar(content: string) {
    if (!sessao || enviando || !content.trim() || sessao.status !== 'ACTIVE') return;
    setEnviando(true);
    setErroSessao(null);

    const mensagemOtimista: MensagemSimulador = {
      id: `temp-${Date.now()}`,
      sessionId: sessao.id,
      role: 'VENDEDOR',
      content,
      createdAt: new Date().toISOString(),
    };
    setMensagens((atual) => [...atual, mensagemOtimista]);
    setTexto('');

    try {
      const resultado = await enviarMensagem(sessao.id, content);
      setMensagens((atual) => [...atual, resultado.mensagem]);
      setSessao(resultado.sessao);
      if (resultado.sessao.status === 'EVALUATED') {
        const detalhe = await buscarSessaoDetalhada(sessao.id);
        setAvaliacao(detalhe.avaliacao);
      }
    } catch (err) {
      const tipo = err instanceof ApiError ? err.type : undefined;
      setErroSessao((tipo && MENSAGEM_POR_TIPO_ERRO[tipo]) ?? 'Não consegui gerar a reação da cliente agora. Tenta de novo?');
      setMensagens((atual) => atual.filter((m) => m.id !== mensagemOtimista.id));
    } finally {
      setEnviando(false);
    }
  }

  async function encerrar() {
    if (!sessao) return;
    setEnviando(true);
    setErroSessao(null);
    try {
      const sessaoEncerrada = await encerrarSessao(sessao.id);
      setSessao(sessaoEncerrada);
      const detalhe = await buscarSessaoDetalhada(sessao.id);
      setAvaliacao(detalhe.avaliacao);
    } catch {
      setErroSessao('Não consegui encerrar a simulação agora. Tenta de novo?');
    } finally {
      setEnviando(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    enviar(texto);
  }

  function voltarParaLista() {
    setSessao(null);
    setMensagens([]);
    setAvaliacao(null);
    setCenarioEscolhido(null);
    setView('lista');
    carregarLista();
  }

  if (carregando && view !== 'sessao') return <LoadingState texto="Carregando o Simulador..." />;
  if (erroCarregamento) return <ErrorState mensagem={erroCarregamento} onRetry={view === 'historico' ? abrirHistorico : carregarLista} />;

  if (view === 'historico') {
    return (
      <div className="mx-auto flex h-full w-full max-w-md flex-col overflow-y-auto p-4 pb-24">
        <button onClick={voltarParaLista} className="mb-3 self-start text-sm text-slate-400">
          ← Voltar
        </button>
        <h1 className="mb-4 text-xl font-semibold text-white">Histórico de simulações</h1>
        {historico.length === 0 && <p className="text-slate-400">Você ainda não concluiu nenhuma simulação.</p>}
        <div className="flex flex-col gap-3">
          {historico.map((h) => (
            <Card key={h.id}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-white">{h.scenarioTitle}</p>
                  <p className="text-xs text-slate-400">
                    {h.category} · {LABEL_DIFICULDADE[h.difficulty]}
                  </p>
                </div>
                <p className="text-lg font-semibold text-accent">{h.scoreFinal ?? '—'}</p>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (view === 'dificuldade' && cenarioEscolhido) {
    return (
      <div className="mx-auto flex h-full w-full max-w-md flex-col p-4 pb-24">
        <button onClick={() => setView('lista')} className="mb-3 self-start text-sm text-slate-400">
          ← Voltar
        </button>
        <h1 className="text-xl font-semibold text-white">{cenarioEscolhido.title}</h1>
        <p className="mb-4 text-sm text-slate-400">{cenarioEscolhido.description}</p>
        <p className="mb-2 text-sm font-medium text-slate-200">Escolha a dificuldade</p>
        <div className="flex flex-col gap-2">
          {cenarioEscolhido.availableDifficulties.map((d) => (
            <button
              key={d}
              onClick={() => iniciar(cenarioEscolhido, d)}
              className="rounded-xl bg-surface px-4 py-3 text-left text-white active:opacity-70"
            >
              {LABEL_DIFICULDADE[d]}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (view === 'sessao' && sessao) {
    const encerrada = sessao.status !== 'ACTIVE' && sessao.status !== 'CREATED';

    return (
      <div className="mx-auto flex h-full w-full max-w-md flex-col">
        <div className="flex-1 overflow-y-auto p-4 pb-4">
          <div className="mb-1 flex items-center justify-between">
            <span className="rounded-full bg-amber-900/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
              Simulação — cliente fictícia
            </span>
            {!encerrada && (
              <span className="text-xs text-slate-500">
                turno {sessao.turnCount}/{sessao.maxTurns}
              </span>
            )}
          </div>
          <h1 className="text-lg font-semibold text-white">Cliente simulada</h1>

          <div className="mt-4 flex flex-col gap-3">
            {mensagens.map((m) => (
              <div key={m.id} className={`flex ${m.role === 'VENDEDOR' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                    m.role === 'VENDEDOR' ? 'bg-simulador text-white' : 'bg-surface text-slate-100'
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                </div>
              </div>
            ))}
            {enviando && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-surface px-4 py-2 text-slate-400" role="status">
                  a cliente está respondendo...
                </div>
              </div>
            )}
            <div ref={fimDaListaRef} />
          </div>

          {erroSessao && (
            <p role="alert" className="mt-3 text-sm text-red-400">
              {erroSessao}
            </p>
          )}

          {encerrada && (
            <div className="mt-4">
              {sessao.status === 'EVALUATION_PENDING' && (
                <Card>
                  <p className="text-sm text-slate-300">Ainda estamos calculando sua avaliação.</p>
                  <button onClick={encerrar} className="mt-2 rounded-lg bg-accent px-3 py-1.5 text-sm text-white active:opacity-80">
                    Tentar avaliar de novo
                  </button>
                </Card>
              )}
              {avaliacao && <ResultadoAvaliacao avaliacao={avaliacao} />}
              <button onClick={voltarParaLista} className="mt-4 w-full rounded-xl bg-accent px-4 py-3 font-medium text-white active:opacity-80">
                Treinar novamente
              </button>
            </div>
          )}
        </div>

        {!encerrada && (
          <>
            <form onSubmit={handleSubmit} className="flex gap-2 border-t border-slate-800 bg-base p-3">
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Responda à cliente..."
                disabled={enviando}
                className="flex-1 rounded-full bg-surface px-4 py-2 text-white disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={enviando || !texto.trim()}
                className="rounded-full bg-simulador px-4 py-2 font-medium text-white disabled:opacity-50"
              >
                Enviar
              </button>
            </form>
            <button
              onClick={encerrar}
              disabled={enviando}
              className="border-t border-slate-800 bg-base px-3 py-2 pb-[calc(env(safe-area-inset-bottom)+8px)] text-center text-sm text-slate-400 disabled:opacity-50"
            >
              Encerrar simulação
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col overflow-y-auto p-4 pb-24">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-simulador" aria-hidden="true" />
        <h1 className="text-xl font-semibold text-white">Simulador de Atendimento</h1>
      </div>
      <p className="mb-4 text-xs text-slate-400">Pratique com uma cliente simulada e receba uma avaliação ao final</p>

      <button onClick={abrirHistorico} className="mb-4 self-start text-sm text-accent">
        Ver histórico de simulações
      </button>

      <div className="flex flex-col gap-3">
        {cenarios.map((c) => (
          <button
            key={c.id}
            type="button"
            className="text-left"
            onClick={() => {
              setCenarioEscolhido(c);
              setView('dificuldade');
            }}
          >
            <Card>
              <p className="text-xs uppercase tracking-wide text-slate-500">{c.category}</p>
              <p className="font-medium text-white">{c.title}</p>
              <p className="text-sm text-slate-400">{c.description}</p>
              <p className="mt-1 text-xs text-slate-500">Objetivo: {c.objective}</p>
            </Card>
          </button>
        ))}
        {cenarios.length === 0 && <p className="text-slate-400">Nenhum cenário disponível no momento.</p>}
      </div>

      <Link to="/" className="mt-4 text-center text-sm text-slate-500">
        Voltar pra Home
      </Link>
    </div>
  );
}

function ResultadoAvaliacao({ avaliacao }: { avaliacao: AvaliacaoSimulador }) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-slate-500">Sua avaliação</p>
      <p className="text-3xl font-bold text-white">{avaliacao.scoreFinal}</p>
      <p className="mb-3 text-sm text-slate-400">{avaliacao.summary}</p>

      <div className="mb-3 grid grid-cols-2 gap-2">
        {Object.entries(avaliacao.scores).map(([criterio, nota]) => (
          <div key={criterio} className="rounded-lg bg-base px-2 py-1.5">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">{criterio.replace(/_/g, ' ')}</p>
            <p className="text-sm font-semibold text-white">{nota}</p>
          </div>
        ))}
      </div>

      {avaliacao.strengths.length > 0 && (
        <Secao titulo="Pontos fortes" itens={avaliacao.strengths} cor="text-emerald-400" />
      )}
      {avaliacao.improvements.length > 0 && (
        <Secao titulo="Pra melhorar" itens={avaliacao.improvements} cor="text-amber-400" />
      )}
      {avaliacao.missedOpportunities.length > 0 && (
        <Secao titulo="Oportunidades perdidas" itens={avaliacao.missedOpportunities} cor="text-red-400" />
      )}
      {avaliacao.betterExample && (
        <div className="mt-2">
          <p className="text-xs font-medium text-slate-300">Um exemplo melhor de resposta:</p>
          <p className="text-sm italic text-slate-400">"{avaliacao.betterExample}"</p>
        </div>
      )}
    </Card>
  );
}

function Secao({ titulo, itens, cor }: { titulo: string; itens: string[]; cor: string }) {
  return (
    <div className="mb-2">
      <p className={`text-xs font-medium ${cor}`}>{titulo}</p>
      <ul className="list-inside list-disc text-sm text-slate-300">
        {itens.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
