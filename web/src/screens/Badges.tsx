import { useApi } from '../utils/useApi';
import { buscarBadges } from '../api/gamificacao';
import { Card } from '../components/Card';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { formatarDataCurta } from '../utils/format';

const ICONE_BADGE: Record<string, string> = {
  PRIMEIRA_META: '🎯',
  STREAK_7: '🔥',
  PA_MASTER: '📈',
  TICKET_MASTER: '💎',
};

export function Badges() {
  const { dados, carregando, erro, recarregar } = useApi(() => buscarBadges(), []);

  if (carregando && !dados) return <LoadingState texto="Carregando conquistas..." />;
  if (erro) return <ErrorState mensagem={erro} onRetry={recarregar} />;
  if (!dados) return null;

  return (
    <div className="flex flex-col gap-4 p-4 pb-24">
      <h1 className="text-xl font-semibold text-white">Conquistas</h1>

      {dados.length === 0 ? (
        <EmptyState texto="Você ainda não conquistou nenhuma badge. Bata sua meta de hoje pra começar!" />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {dados.map((b) => (
            <Card key={b.id} className="border border-accentSoft/20 text-center">
              <p className="text-3xl">{ICONE_BADGE[b.codigo] ?? '🏅'}</p>
              <p className="mt-1 font-semibold text-white">{b.titulo}</p>
              <p className="text-xs text-slate-400">{b.descricao}</p>
              <p className="mt-1 text-xs text-slate-600">{formatarDataCurta(b.concedidoEm)}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
