// Reunião do Dia / Ritual Diário (Fatia 9, seção 31-35) — base 100%
// determinística; funciona inteira com IA desligada. O "Pedir conselho à
// IA" é sempre um botão explícito e opcional, nunca a fonte primária dos dados.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../utils/useApi';
import { buscarReuniaoDoDia, pedirConselhoIA, parabenizarDestaque, ConselhoGerencialDTO, SinalPositivoDTO } from '../api/managerPanel';
import { Card } from '../components/Card';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { ApiError } from '../api/client';
import { formatarMoeda } from '../utils/format';

function LinhaDestaqueHuddle({ destaque }: { destaque: SinalPositivoDTO }) {
  const [parabenizado, setParabenizado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function handleParabenizar() {
    setErro(null);
    setEnviando(true);
    try {
      await parabenizarDestaque(destaque.sellerId, destaque.tipo);
      setParabenizado(true);
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'não foi possível parabenizar');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-emerald-400">{destaque.descricao}</p>
        {!parabenizado ? (
          <button onClick={handleParabenizar} disabled={enviando} className="shrink-0 rounded-lg border border-emerald-500/40 px-3 py-1 text-xs font-medium text-emerald-400 disabled:opacity-50">
            Parabenizar
          </button>
        ) : (
          <span className="shrink-0 text-xs text-emerald-500">Parabenizado ✓</span>
        )}
      </div>
      {erro && <p className="mt-1 text-xs text-red-400">{erro}</p>}
    </Card>
  );
}

export function ReuniaoDoDia() {
  const { dados, carregando, erro, recarregar } = useApi(() => buscarReuniaoDoDia(), []);
  const [conselho, setConselho] = useState<ConselhoGerencialDTO | null>(null);
  const [erroConselho, setErroConselho] = useState<string | null>(null);
  const [carregandoConselho, setCarregandoConselho] = useState(false);

  if (carregando && !dados) return <LoadingState texto="Montando a reunião do dia..." />;
  if (erro) return <ErrorState mensagem={erro} onRetry={recarregar} />;
  if (!dados) return null;

  async function handlePedirConselho() {
    setCarregandoConselho(true);
    setErroConselho(null);
    try {
      setConselho(await pedirConselhoIA());
    } catch (err) {
      setErroConselho(err instanceof ApiError ? err.message : 'assistente de IA indisponível no momento');
    } finally {
      setCarregandoConselho(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-24">
      <Link to="/" className="self-start text-sm text-slate-400">← Voltar</Link>
      <h1 className="text-xl font-semibold text-white">Reunião do Dia</h1>

      {/* 1. Resultado do dia anterior */}
      <Card>
        <p className="text-xs text-slate-400">Faturamento de ontem (loja)</p>
        <p className="text-2xl font-bold text-white">{formatarMoeda(dados.faturamentoOntem)}</p>
      </Card>

      {/* 2. Foco sugerido */}
      <Card className="border border-accent/20">
        <p className="text-xs uppercase tracking-wide text-slate-500">Foco sugerido</p>
        <p className="text-sm text-white">{dados.roteiro.foco}</p>
        <p className="mt-2 text-xs text-slate-400">{dados.roteiro.contexto}</p>
      </Card>

      {/* 3-4. O que falar / Como abordar (roteiro determinístico, seção 37) */}
      <Card>
        <p className="text-xs uppercase tracking-wide text-slate-500">O que falar</p>
        <p className="mb-3 text-sm text-white">{dados.roteiro.mensagemPrincipal}</p>
        <p className="text-xs uppercase tracking-wide text-slate-500">Pergunta pra equipe</p>
        <p className="mb-3 text-sm text-white">{dados.roteiro.perguntaParaEquipe}</p>
        <p className="text-xs uppercase tracking-wide text-slate-500">Ação do dia</p>
        <p className="text-sm text-white">{dados.roteiro.acaoDoDia}</p>
      </Card>

      {/* 5. Destaques */}
      {dados.highlights.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-slate-300">Destaques</p>
          <div className="flex flex-col gap-2">
            {dados.highlights.map((h, i) => (
              <LinhaDestaqueHuddle key={i} destaque={h} />
            ))}
          </div>
        </div>
      )}

      {/* 6. Missão/Season/Treinamento relevante */}
      {(dados.temporadaAtual || dados.competicoesAtivas.length > 0 || dados.treinamentosDaSemana > 0) && (
        <Card>
          {dados.temporadaAtual && (
            <p className="text-sm text-white">
              🏆 Temporada em andamento: <strong>{dados.temporadaAtual.name}</strong>
            </p>
          )}
          {dados.competicoesAtivas.map((c) => (
            <p key={c.id} className="text-sm text-white">🎯 Competição ativa: {c.name}</p>
          ))}
          {dados.treinamentosDaSemana > 0 && (
            <p className="text-sm text-white">📚 {dados.treinamentosDaSemana} treinamento(s) do plano de desenvolvimento previstos pra esta semana.</p>
          )}
        </Card>
      )}

      <p className="text-center text-sm text-emerald-400">{dados.roteiro.fechamentoPositivo}</p>

      <div>
        <button onClick={handlePedirConselho} disabled={carregandoConselho} className="w-full rounded-lg border border-accent/40 px-4 py-2 text-sm font-medium text-accentSoft disabled:opacity-50">
          {carregandoConselho ? 'Consultando assistente...' : 'Pedir resumo ao Assistente de Gestão (IA opcional)'}
        </button>
        {erroConselho && <p className="mt-2 text-xs text-red-400">{erroConselho}</p>}
      </div>

      {conselho && (
        <Card className="border border-accent/20">
          <p className="text-xs uppercase tracking-wide text-slate-500">Assistente de Gestão</p>
          <p className="text-sm text-white">{conselho.summary}</p>
          {conselho.priorities.length > 0 && (
            <ul className="mt-2 list-disc pl-4 text-xs text-slate-300">
              {conselho.priorities.map((p, i) => (
                <li key={i}>{p.description}</li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
