import { FormEvent, useEffect, useRef, useState } from 'react';
import { buscarCheckinHoje, buscarConversaAtual, buscarMensagens, enviarMensagem, registrarCheckin } from '../api/coach';
import { ApiError } from '../api/client';
import { CheckIn, Conversa, MensagemCoach, Mood } from '../types';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { Card } from '../components/Card';

const OPCOES_MOOD: { mood: Mood; emoji: string; label: string }[] = [
  { mood: 'VERY_GOOD', emoji: '😊', label: 'Muito bem' },
  { mood: 'GOOD', emoji: '🙂', label: 'Bem' },
  { mood: 'NEUTRAL', emoji: '😐', label: 'Mais ou menos' },
  { mood: 'NOT_GOOD', emoji: '😔', label: 'Não estou legal' },
];

const QUICK_ACTIONS = [
  'Organizar meu foco',
  'Como estou hoje?',
  'Me ajude com minha meta',
  'Quero melhorar meu PA',
  'Quero melhorar meu ticket',
];

const MENSAGEM_POR_TIPO_ERRO: Record<string, string> = {
  rate_limited: 'Você atingiu o limite de mensagens de hoje com o Coach. Volta amanhã!',
  budget_exceeded: 'O Coach está temporariamente indisponível. Tente de novo mais tarde.',
  provider_unavailable: 'O Coach está indisponível no momento. Tente de novo em instantes.',
  generation_in_progress: 'Ainda estou respondendo sua última mensagem — espera um instante.',
  message_too_long: 'Essa mensagem é muito longa. Tenta resumir um pouco?',
};

export function Coach() {
  const [carregando, setCarregando] = useState(true);
  const [erroCarregamento, setErroCarregamento] = useState<string | null>(null);
  const [checkinHoje, setCheckinHoje] = useState<CheckIn | null>(null);
  const [conversa, setConversa] = useState<Conversa | null>(null);
  const [mensagens, setMensagens] = useState<MensagemCoach[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const fimDaListaRef = useRef<HTMLDivElement>(null);

  async function carregarTudo() {
    setCarregando(true);
    setErroCarregamento(null);
    try {
      const [checkin, conversaAtual] = await Promise.all([buscarCheckinHoje(), buscarConversaAtual()]);
      setCheckinHoje(checkin);
      setConversa(conversaAtual);
      const { mensagens: historico } = await buscarMensagens(conversaAtual.id);
      setMensagens(historico);
    } catch {
      setErroCarregamento('Não foi possível carregar o Coach agora.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarTudo();
  }, []);

  useEffect(() => {
    fimDaListaRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens]);

  async function handleCheckin(mood: Mood) {
    const checkin = await registrarCheckin(mood);
    setCheckinHoje(checkin);
  }

  async function enviar(conteudo: string) {
    if (!conversa || enviando || !conteudo.trim()) return;
    setEnviando(true);
    setErroEnvio(null);

    const mensagemOtimista: MensagemCoach = {
      id: `temp-${Date.now()}`,
      conversationId: conversa.id,
      role: 'USER',
      content: conteudo,
      createdAt: new Date().toISOString(),
    };
    setMensagens((atual) => [...atual, mensagemOtimista]);
    setTexto('');

    try {
      const resposta = await enviarMensagem(conversa.id, conteudo);
      setMensagens((atual) => [...atual, resposta]);
    } catch (err) {
      const tipo = err instanceof ApiError ? err.type : undefined;
      setErroEnvio((tipo && MENSAGEM_POR_TIPO_ERRO[tipo]) ?? 'Não consegui responder agora. Tenta de novo?');
      setMensagens((atual) => atual.filter((m) => m.id !== mensagemOtimista.id));
    } finally {
      setEnviando(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    enviar(texto);
  }

  if (carregando) return <LoadingState texto="Carregando o Coach..." />;
  if (erroCarregamento) return <ErrorState mensagem={erroCarregamento} onRetry={carregarTudo} />;

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto p-4 pb-4">
        <h1 className="mb-4 text-xl font-semibold text-white">Coach</h1>

        {!checkinHoje && (
          <Card className="mb-4">
            <p className="mb-3 text-slate-200">Como você está chegando pra trabalhar hoje?</p>
            <div className="grid grid-cols-2 gap-2">
              {OPCOES_MOOD.map((op) => (
                <button
                  key={op.mood}
                  onClick={() => handleCheckin(op.mood)}
                  className="flex flex-col items-center gap-1 rounded-lg bg-base py-3 active:opacity-70"
                >
                  <span className="text-2xl">{op.emoji}</span>
                  <span className="text-xs text-slate-300">{op.label}</span>
                </button>
              ))}
            </div>
          </Card>
        )}

        {checkinHoje?.mood === 'NOT_GOOD' && mensagens.length === 0 && (
          <Card className="mb-4">
            <p className="mb-3 text-slate-200">
              Entendi. Quer me contar rapidamente o que está pesando hoje ou prefere que eu te ajude a organizar seu foco pra começar?
            </p>
            <div className="flex gap-2">
              <button onClick={() => setTexto('')} className="flex-1 rounded-lg bg-base py-2 text-sm text-slate-300 active:opacity-70">
                Quero conversar
              </button>
              <button
                onClick={() => enviar('Organizar meu foco')}
                className="flex-1 rounded-lg bg-accent py-2 text-sm text-white active:opacity-70"
              >
                Organizar meu foco
              </button>
            </div>
          </Card>
        )}

        <div className="flex flex-col gap-3">
          {mensagens.map((m) => (
            <div key={m.id} className={`flex ${m.role === 'USER' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                  m.role === 'USER' ? 'bg-accent text-white' : 'bg-surface text-slate-100'
                }`}
              >
                {/* texto simples, nunca HTML/Markdown renderizado (seção 31 da fonte de verdade) */}
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
              </div>
            </div>
          ))}
          {enviando && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-surface px-4 py-2 text-slate-400" role="status">
                digitando...
              </div>
            </div>
          )}
          <div ref={fimDaListaRef} />
        </div>

        {mensagens.length === 0 && checkinHoje?.mood !== 'NOT_GOOD' && (
          <div className="mt-4 flex flex-wrap gap-2">
            {QUICK_ACTIONS.map((acao) => (
              <button
                key={acao}
                onClick={() => enviar(acao)}
                className="rounded-full bg-surface px-3 py-1.5 text-xs text-slate-300 active:opacity-70"
              >
                {acao}
              </button>
            ))}
          </div>
        )}

        {erroEnvio && (
          <p role="alert" className="mt-3 text-sm text-red-400">
            {erroEnvio}
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-slate-800 bg-base p-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Fala com o Coach..."
          disabled={enviando}
          className="flex-1 rounded-full bg-surface px-4 py-2 text-white disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={enviando || !texto.trim()}
          className="rounded-full bg-accent px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}
