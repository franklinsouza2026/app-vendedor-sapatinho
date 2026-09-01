import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../utils/useApi';
import { Card } from '../components/Card';
import { LoadingState } from '../components/LoadingState';
import { listarRevisoesPendentes, responderRevisao as responderRevisaoApi } from '../api/universidade';

export function Revisao() {
  const navigate = useNavigate();
  const { dados, carregando, recarregar } = useApi(() => listarRevisoesPendentes(), []);
  const [respostaSelecionada, setRespostaSelecionada] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ acertou: boolean } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  if (carregando && !dados) return <LoadingState texto="Carregando revisões..." />;

  const revisaoAtual = dados?.revisoes[0];

  async function handleResponder() {
    if (!revisaoAtual || !respostaSelecionada) return;
    setErro(null);
    try {
      const resposta = await responderRevisaoApi(revisaoAtual.id, respostaSelecionada);
      setResultado(resposta);
    } catch {
      setErro('Não consegui registrar sua resposta agora. Tenta de novo?');
    }
  }

  function proxima() {
    setRespostaSelecionada(null);
    setResultado(null);
    recarregar();
  }

  return (
    <div className="flex flex-col p-4 pb-24">
      <button onClick={() => navigate(-1)} className="mb-3 self-start text-sm text-slate-400">
        ← Voltar
      </button>
      <h1 className="mb-1 text-xl font-semibold text-white">Revisão</h1>
      <p className="mb-4 text-xs text-slate-400">Questões que você errou recentemente — revisar ajuda a fixar de vez.</p>

      {!revisaoAtual && <p className="text-slate-400">Nenhuma revisão pendente agora. 🎉</p>}

      {revisaoAtual && (
        <Card>
          <p className="mb-1 text-xs text-slate-500">{revisaoAtual.lessonTitle}</p>
          <p className="mb-3 font-medium text-white">{revisaoAtual.questionStatement}</p>

          {resultado ? (
            <div>
              <p className={`mb-2 font-medium ${resultado.acertou ? 'text-emerald-400' : 'text-red-400'}`}>{resultado.acertou ? 'Acertou! 🎉' : 'Não foi dessa vez.'}</p>
              <button onClick={proxima} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white">
                Próxima
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {revisaoAtual.opcoes.map((o) => (
                <label key={o.id} className="flex items-center gap-2 text-sm text-slate-200">
                  <input type="radio" name="revisao" value={o.id} checked={respostaSelecionada === o.id} onChange={() => setRespostaSelecionada(o.id)} />
                  {o.text}
                </label>
              ))}
              {erro && (
                <p role="alert" className="text-xs text-red-400">
                  {erro}
                </p>
              )}
              <button onClick={handleResponder} disabled={!respostaSelecionada} className="mt-2 rounded-xl bg-accent px-4 py-3 font-medium text-white disabled:opacity-50">
                Responder
              </button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
