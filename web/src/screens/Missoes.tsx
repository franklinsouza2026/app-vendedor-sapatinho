import { Link } from 'react-router-dom';
import { useApi } from '../utils/useApi';
import { buscarDesafiosAtivos, buscarHistoricoMissoes, buscarMissoesAtivas } from '../api/missoes';
import { Card } from '../components/Card';
import { ProgressBar } from '../components/ProgressBar';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { rotaDaAcaoMissao } from '../utils/missoes';
import { Missao, StatusMissao } from '../types';

const LABEL_STATUS: Record<StatusMissao, string> = {
  ASSIGNED: 'nova',
  IN_PROGRESS: 'em andamento',
  COMPLETED: 'concluída',
  EXPIRED: 'encerrada',
  CANCELLED: 'cancelada',
};

async function carregarMissoes() {
  const [ativas, desafios, historico] = await Promise.all([buscarMissoesAtivas(), buscarDesafiosAtivos(), buscarHistoricoMissoes()]);
  return { ativas: ativas.missoes, desafios: desafios.desafios, historico: historico.missoes };
}

export function Missoes() {
  const { dados, carregando, erro, recarregar } = useApi(carregarMissoes, []);

  if (carregando && !dados) return <LoadingState texto="Carregando suas missões..." />;
  if (erro) return <ErrorState mensagem={erro} onRetry={recarregar} />;
  if (!dados) return null;

  const pendentes = dados.ativas.filter((m) => m.status === 'ASSIGNED' || m.status === 'IN_PROGRESS');
  const concluidasHoje = dados.ativas.filter((m) => m.status === 'COMPLETED');

  return (
    <div className="flex flex-col gap-4 p-4 pb-24">
      <h1 className="text-xl font-semibold text-white">Missões</h1>

      <section>
        <p className="mb-2 text-sm font-medium text-slate-300">Hoje</p>
        {pendentes.length === 0 && concluidasHoje.length === 0 && <EmptyState texto="Nenhuma missão pra hoje ainda." />}
        <div className="flex flex-col gap-2">
          {[...pendentes, ...concluidasHoje].map((m) => (
            <MissaoCard key={m.id} missao={m} />
          ))}
        </div>
      </section>

      {dados.desafios.length > 0 && (
        <section>
          <p className="mb-2 text-sm font-medium text-slate-300">Desafios da semana</p>
          <div className="flex flex-col gap-2">
            {dados.desafios.map((d) => {
              const percentual = d.progressoAlvo > 0 ? Math.min(100, (d.progressoAtual / d.progressoAlvo) * 100) : 0;
              return (
                <Card key={d.id}>
                  <div className="flex items-baseline justify-between">
                    <p className="font-medium text-white">{d.desafio.title}</p>
                    <span className="text-xs text-slate-500">{LABEL_STATUS[d.status]}</span>
                  </div>
                  {d.desafio.description && <p className="text-xs text-slate-400">{d.desafio.description}</p>}
                  <div className="mt-2">
                    <ProgressBar percentual={percentual} />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {d.progressoAtual} / {d.progressoAlvo}
                  </p>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <p className="mb-2 text-sm font-medium text-slate-300">Concluídas / encerradas</p>
        {dados.historico.length === 0 ? (
          <EmptyState texto="Suas missões concluídas vão aparecer aqui." />
        ) : (
          <div className="flex flex-col gap-2">
            {dados.historico.map((m) => (
              <Card key={m.id} className="flex items-center justify-between">
                <p className="text-sm text-white">{m.missao.title}</p>
                <span className={`text-xs ${m.status === 'COMPLETED' ? 'text-emerald-400' : 'text-slate-500'}`}>{LABEL_STATUS[m.status]}</span>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function MissaoCard({ missao }: { missao: Missao }) {
  const percentual = missao.progressoAlvo > 0 ? Math.min(100, (missao.progressoAtual / missao.progressoAlvo) * 100) : 0;
  const concluida = missao.status === 'COMPLETED';

  return (
    <Card className={concluida ? 'border border-emerald-800/50' : undefined}>
      <div className="flex items-baseline justify-between">
        <p className="font-medium text-white">{missao.missao.title}</p>
        <span className={`text-xs ${concluida ? 'text-emerald-400' : 'text-slate-500'}`}>{LABEL_STATUS[missao.status]}</span>
      </div>
      {missao.missao.description && <p className="text-xs text-slate-400">{missao.missao.description}</p>}
      <div className="mt-2">
        <ProgressBar percentual={percentual} />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-slate-500">{Math.round(percentual)}%</span>
        {!concluida && (
          <Link
            to={rotaDaAcaoMissao(missao.missao.actionType)}
            className="flex min-h-[44px] items-center rounded-full bg-accent px-4 text-xs font-medium text-white active:opacity-80"
          >
            Treinar agora
          </Link>
        )}
        {concluida && <span className="text-xs font-medium text-emerald-400">Concluída ✓</span>}
      </div>
    </Card>
  );
}
