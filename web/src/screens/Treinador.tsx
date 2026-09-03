import { FormEvent, useEffect, useRef, useState } from 'react';
import { buscarConversaAtual, buscarMensagens, buscarObjecoesComuns, enviarMensagem } from '../api/treinador';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { ConversaTreinador, MensagemTreinador, ModoTreinador, ObjecaoComum } from '../types';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { Card } from '../components/Card';

// Quick actions fora de objeção — cada uma já carrega o modo certo, pra não
// espalhar strings de modo soltas pela UI (seção 5 da Fatia 5).
const QUICK_ACTIONS: { label: string; mode: ModoTreinador }[] = [
  { label: 'Me ajude a abordar melhor', mode: 'ABORDAGEM' },
  { label: 'Quero melhorar minha sondagem', mode: 'SONDAGEM' },
  { label: 'Quero vender mais complementos', mode: 'VENDA_COMPLEMENTAR' },
  { label: 'Quero melhorar meu fechamento', mode: 'FECHAMENTO' },
  { label: 'Quero melhorar meu PA', mode: 'PA' },
  { label: 'Quero melhorar meu ticket', mode: 'TICKET' },
];

// Treinador Gerencial (Fatia 9.6, seção 29) — mesma tela/engine, ações
// próprias pro papel GERENTE (nunca misturadas com as de venda).
const QUICK_ACTIONS_GERENCIAL: { label: string; mode: ModoTreinador }[] = [
  { label: 'Como dou um feedback difícil?', mode: 'FEEDBACK' },
  { label: 'Como conduzo um 1:1?', mode: 'REUNIAO_1A1' },
  { label: 'Como lido com um conflito na equipe?', mode: 'GESTAO_DE_CONFLITOS' },
  { label: 'Como desenvolvo minha equipe?', mode: 'DESENVOLVIMENTO_DE_EQUIPE' },
  { label: 'Quero evoluir minha liderança', mode: 'LIDERANCA' },
];

const MENSAGEM_POR_TIPO_ERRO: Record<string, string> = {
  rate_limited: 'Você atingiu o limite de mensagens de hoje com o Treinador. Volta amanhã!',
  budget_exceeded: 'O Treinador está temporariamente indisponível. Tente de novo mais tarde.',
  provider_unavailable: 'O Treinador está indisponível no momento. Tente de novo em instantes.',
  generation_in_progress: 'Ainda estou respondendo sua última mensagem — espera um instante.',
  message_too_long: 'Essa mensagem é muito longa. Tenta resumir um pouco?',
};

export function Treinador() {
  const { sessao } = useAuth();
  const [carregando, setCarregando] = useState(true);
  const [erroCarregamento, setErroCarregamento] = useState<string | null>(null);
  const [conversa, setConversa] = useState<ConversaTreinador | null>(null);
  const [mensagens, setMensagens] = useState<MensagemTreinador[]>([]);
  const [objecoes, setObjecoes] = useState<ObjecaoComum[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const fimDaListaRef = useRef<HTMLDivElement>(null);

  async function carregarTudo() {
    setCarregando(true);
    setErroCarregamento(null);
    try {
      const [conversaAtual, { objections }] = await Promise.all([buscarConversaAtual(), buscarObjecoesComuns()]);
      setConversa(conversaAtual);
      setObjecoes(objections);
      const { mensagens: historico } = await buscarMensagens(conversaAtual.id);
      setMensagens(historico);
    } catch {
      setErroCarregamento('Não foi possível carregar o Treinador agora.');
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

  async function enviar(content: string, mode: ModoTreinador, objection?: string) {
    if (!conversa || enviando || !content.trim()) return;
    setEnviando(true);
    setErroEnvio(null);

    const mensagemOtimista: MensagemTreinador = {
      id: `temp-${Date.now()}`,
      conversationId: conversa.id,
      role: 'USER',
      content,
      mode,
      objection,
      createdAt: new Date().toISOString(),
    };
    setMensagens((atual) => [...atual, mensagemOtimista]);
    setTexto('');

    try {
      const resposta = await enviarMensagem(conversa.id, { content, mode, objection });
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
    enviar(texto, 'GERAL');
  }

  if (carregando) return <LoadingState texto="Carregando o Treinador..." />;
  if (erroCarregamento) return <ErrorState mensagem={erroCarregamento} onRetry={carregarTudo} />;

  const ehGerencial = sessao!.vendedor.papel === 'GERENTE';
  const acoesRapidas = ehGerencial ? QUICK_ACTIONS_GERENCIAL : QUICK_ACTIONS;

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col">
      <div className="flex-1 overflow-y-auto p-4 pb-4">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-treinador" aria-hidden="true" />
          <h1 className="text-xl font-semibold text-white">{ehGerencial ? 'Treinador de Gestão' : 'Treinador de Vendas'}</h1>
        </div>
        <p className="mb-4 text-xs text-slate-400">{ehGerencial ? 'Feedback, 1:1, conflitos e desenvolvimento de equipe' : 'Técnica de abordagem, objeções e o playbook da sua loja'}</p>

        {mensagens.length === 0 && (
          <>
            {!ehGerencial && (
              <Card className="mb-4">
                <p className="mb-3 text-sm text-slate-200">A cliente disse...</p>
                <div className="flex flex-wrap gap-2">
                  {objecoes.map((o) => (
                    <button
                      key={o.code}
                      onClick={() => enviar(o.label, 'OBJECAO', o.label)}
                      className="rounded-full bg-base px-3 py-1.5 text-xs text-slate-300 active:opacity-70"
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </Card>
            )}

            <div className="flex flex-wrap gap-2">
              {acoesRapidas.map((acao) => (
                <button
                  key={acao.label}
                  onClick={() => enviar(acao.label, acao.mode)}
                  className="rounded-full bg-surface px-3 py-1.5 text-xs text-slate-300 active:opacity-70"
                >
                  {acao.label}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="mt-4 flex flex-col gap-3">
          {mensagens.map((m) => (
            <div key={m.id} className={`flex ${m.role === 'USER' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                  m.role === 'USER' ? 'bg-emerald-700 text-white' : 'bg-surface text-slate-100'
                }`}
              >
                {/* texto simples, nunca HTML/Markdown renderizado (seção 34 da Fatia 5) */}
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
          placeholder="Descreva a situação..."
          disabled={enviando}
          className="flex-1 rounded-full bg-surface px-4 py-2 text-white disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={enviando || !texto.trim()}
          className="rounded-full bg-emerald-700 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}
