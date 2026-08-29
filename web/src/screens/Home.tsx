import { useAuth } from '../auth/AuthContext';
import { useApi } from '../utils/useApi';
import { buscarMinhasMetas } from '../api/metas';
import { buscarCarteira, buscarRanking, buscarStreak } from '../api/gamificacao';
import { Card } from '../components/Card';
import { ProgressBar } from '../components/ProgressBar';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { formatarHora, formatarMoeda, formatarNumero, saudacao } from '../utils/format';
import { vendasNecessarias } from '../utils/calculo';

async function carregarHome(vendedorId: string) {
  const [metas, carteira, streak, ranking] = await Promise.all([
    buscarMinhasMetas(),
    buscarCarteira(),
    buscarStreak(),
    buscarRanking('SCORE_GERAL', 'LOJA'),
  ]);
  const dia = metas.progresso.find((p) => p.periodo === 'DIA')!;
  const posicao = ranking.ranking.find((r) => r.vendedorId === vendedorId)?.posicao ?? null;
  return { dia, carteira, streak, posicao, totalNoRanking: ranking.ranking.length };
}

export function Home() {
  const { sessao } = useAuth();
  const vendedorId = sessao!.vendedor.id;
  const { dados, carregando, erro, atualizadoEm, recarregar } = useApi(() => carregarHome(vendedorId), [vendedorId]);

  if (carregando && !dados) return <LoadingState texto="Carregando sua meta de hoje..." />;
  if (erro) return <ErrorState mensagem={erro} onRetry={recarregar} />;
  if (!dados) return null;

  const { dia, carteira, streak, posicao, totalNoRanking } = dados;
  const percentual = dia.metaFaturamento ? (dia.realizado.faturamento / dia.metaFaturamento) * 100 : 0;
  const vendas = dia.faltaParaMeta !== null && dia.realizado.ticketMedio > 0 ? vendasNecessarias(dia.faltaParaMeta, dia.realizado.ticketMedio) : null;

  return (
    <div className="flex flex-col gap-4 p-4 pb-24">
      <div>
        <h1 className="text-xl font-semibold text-white">
          {saudacao()}, {sessao!.vendedor.nome.split(' ')[0]}
        </h1>
        <p className="text-xs text-slate-500">{sessao!.loja.nome}</p>
      </div>

      <Card>
        {dia.metaFaturamento === null ? (
          <p className="text-slate-400">Nenhuma meta de hoje cadastrada ainda.</p>
        ) : (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-slate-400">Meta hoje</span>
              <span className="text-sm text-slate-400">{formatarPercentualCompacto(percentual)}</span>
            </div>
            <p className="text-3xl font-bold text-white">{formatarMoeda(dia.realizado.faturamento)}</p>
            <p className="mb-2 text-sm text-slate-400">de {formatarMoeda(dia.metaFaturamento)}</p>
            <ProgressBar percentual={percentual} />
            {dia.faltaParaMeta !== null && dia.faltaParaMeta > 0 && (
              <p className="mt-3 text-sm text-slate-300">
                Faltam <strong className="text-white">{formatarMoeda(dia.faltaParaMeta)}</strong>
                {vendas !== null && (
                  <>
                    {' '}
                    — com seu ticket atual, isso é aproximadamente <strong className="text-white">{vendas}</strong>{' '}
                    {vendas === 1 ? 'venda' : 'vendas'}.
                  </>
                )}
              </p>
            )}
            {dia.faltaParaMeta === 0 && <p className="mt-3 font-medium text-emerald-400">Meta batida hoje! 🎉</p>}
          </>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <p className="text-xs text-slate-400">Ticket médio</p>
          <p className="text-xl font-semibold text-white">{formatarMoeda(dia.realizado.ticketMedio)}</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-400">PA</p>
          <p className="text-xl font-semibold text-white">{formatarNumero(dia.realizado.pa)}</p>
        </Card>
      </div>

      <Card>
        <p className="text-xs text-slate-400">Sua posição na loja hoje</p>
        <p className="text-xl font-semibold text-white">
          {posicao === null ? 'Ainda sem ranking hoje' : `${posicao}º de ${totalNoRanking}`}
        </p>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        <Card className="text-center">
          <p className="text-lg">🔥</p>
          <p className="font-semibold text-white">{streak.streakAtual}</p>
          <p className="text-xs text-slate-400">dias seguidos</p>
        </Card>
        <Card className="text-center">
          <p className="text-lg">⭐</p>
          <p className="font-semibold text-white">{carteira.nivel.nome}</p>
          <p className="text-xs text-slate-400">nível {carteira.nivel.nivel}</p>
        </Card>
        <Card className="text-center">
          <p className="text-lg">🪙</p>
          <p className="font-semibold text-white">{carteira.saldoMoedas}</p>
          <p className="text-xs text-slate-400">moedas</p>
        </Card>
      </div>

      {atualizadoEm && <p className="text-center text-xs text-slate-600">Dados atualizados às {formatarHora(atualizadoEm)}</p>}
    </div>
  );
}

function formatarPercentualCompacto(p: number): string {
  return `${Math.round(p)}% atingido`;
}
