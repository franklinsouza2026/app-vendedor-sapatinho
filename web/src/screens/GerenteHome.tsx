// Home do Gerente (Fatia 9, seção 4-8) — substitui a Home genérica de
// vendedor quando `papel === 'GERENTE'` (ver Home.tsx). Compacta: situação
// da loja hoje, alertas prioritários, destaques, resumo de pendências — não
// um dashboard de 30 cards.
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useApi } from '../utils/useApi';
import { buscarGerenteHome } from '../api/managerPanel';
import { Card } from '../components/Card';
import { ProgressBar } from '../components/ProgressBar';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { formatarMoeda, formatarNumero, saudacao } from '../utils/format';

const NOME_ALERTA: Record<string, string> = {
  LOW_GOAL_ATTAINMENT: 'Ritmo de meta do mês abaixo do esperado',
  PA_BELOW_BASELINE: 'PA abaixo da própria média',
  TICKET_BELOW_BASELINE: 'Ticket médio abaixo da própria média',
  CONSISTENCY_DROP: 'Queda de consistência na meta diária',
  NO_SALES_RECENTLY: 'Sem venda registrada recentemente',
  MISSION_STALLED: 'Missão sem progresso',
  TRAINING_OVERDUE: 'Treinamento com prazo vencido',
  CERTIFICATION_EXPIRING: 'Certificação prestes a vencer',
  PDI_STALLED: 'Plano de desenvolvimento sem evolução',
  COMPETENCY_GAP: 'Gap de competência identificado',
  NO_RECENT_MANAGER_FOLLOWUP: 'Sem 1:1 recente',
};

const SEVERIDADE_COR: Record<string, string> = { HIGH: 'text-red-400', MEDIUM: 'text-amber-400', LOW: 'text-slate-400' };

export function GerenteHome() {
  const { sessao } = useAuth();
  const { dados, carregando, erro, recarregar } = useApi(() => buscarGerenteHome(), []);

  if (carregando && !dados) return <LoadingState texto="Carregando situação da loja..." />;
  if (erro) return <ErrorState mensagem={erro} onRetry={recarregar} />;
  if (!dados) return null;

  const { storeSummary, alertasPrioritarios, highlights, pendenciasResumo } = dados;

  return (
    <div className="flex flex-col gap-4 p-4 pb-24">
      <div>
        <h1 className="text-xl font-semibold text-white">
          {saudacao()}, {sessao!.vendedor.nome.split(' ')[0]}
        </h1>
        <p className="text-xs text-slate-500">{sessao!.loja.nome}</p>
      </div>

      <Card className="border border-accent/20 shadow-lg shadow-accent/5">
        {storeSummary.metaFaturamento === null ? (
          <p className="text-slate-400">Nenhuma meta do mês cadastrada ainda para a loja.</p>
        ) : (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-slate-400">Meta do mês (loja)</span>
              <span className="text-sm text-slate-400">{Math.round(storeSummary.percentualAtingido ?? 0)}% atingido</span>
            </div>
            <p className="text-3xl font-bold tracking-tight text-white">{formatarMoeda(storeSummary.realizado)}</p>
            <p className="mb-3 text-sm text-slate-400">de {formatarMoeda(storeSummary.metaFaturamento)}</p>
            <ProgressBar percentual={storeSummary.percentualAtingido ?? 0} />
          </>
        )}
      </Card>

      <div className="grid grid-cols-3 gap-3">
        <Card className="text-center">
          <p className="text-xs text-slate-400">PA</p>
          <p className="text-lg font-semibold text-white">{formatarNumero(storeSummary.pa)}</p>
        </Card>
        <Card className="text-center">
          <p className="text-xs text-slate-400">Ticket</p>
          <p className="text-lg font-semibold text-white">{formatarMoeda(storeSummary.ticketMedio)}</p>
        </Card>
        <Card className="text-center">
          <p className="text-xs text-slate-400">Ativos hoje</p>
          <p className="text-lg font-semibold text-white">
            {storeSummary.vendedoresAtivosHoje}/{storeSummary.totalVendedores}
          </p>
        </Card>
      </div>

      {alertasPrioritarios.length > 0 && (
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <p className="text-sm font-medium text-slate-300">Alertas prioritários</p>
            <Link to="/equipe" className="text-xs text-accentSoft">
              ver equipe
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            {alertasPrioritarios.map((a) => (
              <Card key={a.id}>
                <p className={`text-sm font-medium ${SEVERIDADE_COR[a.severidade]}`}>{NOME_ALERTA[a.tipo] ?? a.tipo}</p>
              </Card>
            ))}
          </div>
        </div>
      )}

      {highlights.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-slate-300">Destaques de hoje</p>
          <div className="flex flex-col gap-2">
            {highlights.map((h, i) => (
              <Card key={i}>
                <p className="text-sm text-emerald-400">{h.descricao}</p>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Link to="/gerente/pendencias">
        <Card className="flex items-center gap-3">
          <span className="text-2xl">📋</span>
          <div className="flex-1">
            <p className="font-medium text-white">Pendências</p>
            <p className="text-xs text-slate-400">
              {pendenciasResumo.vendedoresAbaixoDaMetaEsperada} abaixo do ritmo esperado · {pendenciasResumo.followUpsPendentes} follow-ups · {pendenciasResumo.reconhecimentosSugeridos} reconhecimentos sugeridos
            </p>
          </div>
          <span className="text-slate-500" aria-hidden="true">→</span>
        </Card>
      </Link>

      <Link to="/gerente/reuniao-do-dia">
        <Card className="flex items-center gap-3">
          <span className="text-2xl">☀️</span>
          <div className="flex-1">
            <p className="font-medium text-white">Reunião do Dia</p>
            <p className="text-xs text-slate-400">Resumo pra abrir com o time</p>
          </div>
          <span className="text-slate-500" aria-hidden="true">→</span>
        </Card>
      </Link>

      <Link to="/equipe">
        <Card className="flex items-center gap-3">
          <span className="text-2xl">👥</span>
          <div className="flex-1">
            <p className="font-medium text-white">Minha Equipe</p>
            <p className="text-xs text-slate-400">Performance, desenvolvimento, 1:1 e planos de ação</p>
          </div>
          <span className="text-slate-500" aria-hidden="true">→</span>
        </Card>
      </Link>
    </div>
  );
}
