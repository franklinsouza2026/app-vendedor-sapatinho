import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useApi } from '../utils/useApi';
import { buscarMinhasMetas } from '../api/metas';
import { buscarCarteira, buscarRanking, buscarStreak } from '../api/gamificacao';
import { buscarMissoesAtivas } from '../api/missoes';
import { buscarTemporadaAtual } from '../api/competicoes';
import { Card } from '../components/Card';
import { ProgressBar } from '../components/ProgressBar';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { formatarHora, formatarMoeda, formatarNumero, saudacao } from '../utils/format';
import { vendasNecessarias } from '../utils/calculo';
import { rotaDaAcaoMissao } from '../utils/missoes';

async function carregarHome(vendedorId: string) {
  const [metas, carteira, streak, ranking, missoes, temporada] = await Promise.all([
    buscarMinhasMetas(),
    buscarCarteira(),
    buscarStreak(),
    buscarRanking('SCORE_GERAL', 'LOJA'),
    buscarMissoesAtivas(),
    buscarTemporadaAtual(),
  ]);
  const dia = metas.progresso.find((p) => p.periodo === 'DIA')!;
  const posicao = ranking.ranking.find((r) => r.vendedorId === vendedorId)?.posicao ?? null;
  const missoesPendentes = missoes.missoes.filter((m) => m.status === 'ASSIGNED' || m.status === 'IN_PROGRESS');
  return { dia, carteira, streak, posicao, totalNoRanking: ranking.ranking.length, missoesPendentes, temporada: temporada.season };
}

export function Home() {
  const { sessao } = useAuth();
  const vendedorId = sessao!.vendedor.id;
  const { dados, carregando, erro, atualizadoEm, recarregar } = useApi(() => carregarHome(vendedorId), [vendedorId]);

  if (carregando && !dados) return <LoadingState texto="Carregando sua meta de hoje..." />;
  if (erro) return <ErrorState mensagem={erro} onRetry={recarregar} />;
  if (!dados) return null;

  const { dia, carteira, streak, posicao, totalNoRanking, missoesPendentes, temporada } = dados;
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

      {/* Meta do dia — hero da Home: primeira coisa que o vendedor precisa
          entender em segundos (seções 7/8 da auditoria de UX). */}
      <Card className="border border-accent/20 shadow-lg shadow-accent/5">
        {dia.metaFaturamento === null ? (
          <p className="text-slate-400">Nenhuma meta de hoje cadastrada ainda.</p>
        ) : (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-slate-400">Meta hoje</span>
              <span className="text-sm text-slate-400">{formatarPercentualCompacto(percentual)}</span>
            </div>
            <p className="text-4xl font-bold tracking-tight text-white">{formatarMoeda(dia.realizado.faturamento)}</p>
            <p className="mb-3 text-sm text-slate-400">de {formatarMoeda(dia.metaFaturamento)}</p>
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

      {/* Desempenho de hoje — PA, ticket e posição juntos, como uma unidade
          de leitura só (antes eram 2 grids + 1 card separados). */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="text-center">
          <p className="text-xs text-slate-400">Ticket</p>
          <p className="text-lg font-semibold text-white">{formatarMoeda(dia.realizado.ticketMedio)}</p>
        </Card>
        <Card className="text-center">
          <p className="text-xs text-slate-400">PA</p>
          <p className="text-lg font-semibold text-white">{formatarNumero(dia.realizado.pa)}</p>
        </Card>
        <Card className="text-center">
          <p className="text-xs text-slate-400">Posição</p>
          <p className="text-lg font-semibold text-white">{posicao === null ? '—' : `${posicao}º`}</p>
        </Card>
      </div>
      {/* texto de apoio pro teste/leitor de tela — mantém a frase completa
          "1º de N"/"Ainda sem ranking hoje" sem duplicar o número grande acima */}
      <p className="-mt-2 text-center text-xs text-slate-500">
        <span>{posicao === null ? 'Ainda sem ranking hoje' : `${posicao}º de ${totalNoRanking}`}</span> na loja hoje ·{' '}
        <Link to="/ranking" className="text-accentSoft">
          ver ranking
        </Link>
      </p>

      {/* Missões de hoje — objetivo claro do dia, com CTA direto pra onde
          treinar (seção 29 da Fatia 7). Até MISSOES_MAX_ATIVAS_POR_DIA
          (hoje 3) — nunca um mural extenso de missões aqui. */}
      {missoesPendentes.length > 0 && (
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <p className="text-sm font-medium text-slate-300">Missões de hoje</p>
            <Link to="/missoes" className="text-xs text-accentSoft">
              ver todas
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            {missoesPendentes.map((m) => {
              const percentual = m.progressoAlvo > 0 ? Math.min(100, (m.progressoAtual / m.progressoAlvo) * 100) : 0;
              return (
                <Card key={m.id}>
                  <p className="font-medium text-white">{m.missao.title}</p>
                  <div className="mt-2">
                    <ProgressBar percentual={percentual} />
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-slate-400">{Math.round(percentual)}%</span>
                    <Link
                      to={rotaDaAcaoMissao(m.missao.actionType)}
                      className="flex min-h-[44px] items-center rounded-full bg-accent px-4 text-xs font-medium text-white active:opacity-80"
                    >
                      Treinar agora
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Gamificação resumida — nível com progresso, moedas e streak juntos */}
      <Card>
        <div className="flex items-center justify-between">
          <span className="font-semibold text-white">{carteira.nivel.nome}</span>
          <span className="text-sm text-slate-400">Nível {carteira.nivel.nivel}</span>
        </div>
        {carteira.nivel.xpProximoNivel !== null && (
          <div className="mt-2">
            <ProgressBar percentual={(carteira.nivel.xpAtual / carteira.nivel.xpProximoNivel) * 100} />
          </div>
        )}
        <div className="mt-3 flex justify-between text-center">
          <div className="flex-1">
            <p className="text-lg">🪙</p>
            <p className="font-semibold text-white">{carteira.saldoMoedas}</p>
            <p className="text-xs text-slate-400">moedas</p>
          </div>
          <div className="flex-1">
            <p className="text-lg">🔥</p>
            <p className="font-semibold text-white">{streak.streakAtual}</p>
            <p className="text-xs text-slate-400">dias seguidos</p>
          </div>
        </div>
      </Card>

      {/* Temporada atual (Fatia 8, seção 41/86) — só ocupa espaço quando
          existe uma season ACTIVE de verdade; nunca inflado com detalhe,
          só um atalho compacto pra tela de Competições. */}
      {temporada && temporada.status === 'ACTIVE' && (
        <Link to="/competicoes">
          <Card className="flex items-center gap-3">
            <span className="text-2xl">🏆</span>
            <div className="flex-1">
              <p className="font-medium text-white">{temporada.name}</p>
              <p className="text-xs text-slate-400">Temporada em andamento</p>
            </div>
            <span className="text-slate-500" aria-hidden="true">
              →
            </span>
          </Card>
        </Link>
      )}

      {/* Ponto único de entrada pro Coach/Treinador/Simulador/Academia —
          detalhe fica no hub /evoluir (também acessível pelo bottom nav),
          evitando repetir 4 cards de peso igual aqui na Home. */}
      <Link to="/evoluir">
        <Card className="flex items-center gap-3">
          <span className="text-2xl">🚀</span>
          <div className="flex-1">
            <p className="font-medium text-white">Evoluir</p>
            <p className="text-xs text-slate-400">Conselheiro · Treinador · Simulador · Academia</p>
          </div>
          <span className="text-slate-500" aria-hidden="true">
            →
          </span>
        </Card>
      </Link>

      {atualizadoEm && <p className="text-center text-xs text-slate-600">Dados atualizados às {formatarHora(atualizadoEm)}</p>}
    </div>
  );
}

function formatarPercentualCompacto(p: number): string {
  return `${Math.round(p)}% atingido`;
}
