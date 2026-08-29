import { useApi } from '../utils/useApi';
import { buscarCarteira, buscarExtratoMoedas } from '../api/gamificacao';
import { Card } from '../components/Card';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { formatarDataCurta, labelEvento } from '../utils/format';

async function carregarCarteira() {
  const [carteira, extrato] = await Promise.all([buscarCarteira(), buscarExtratoMoedas()]);
  return { carteira, extrato };
}

export function Carteira() {
  const { dados, carregando, erro, recarregar } = useApi(carregarCarteira, []);

  if (carregando && !dados) return <LoadingState texto="Carregando suas moedas..." />;
  if (erro) return <ErrorState mensagem={erro} onRetry={recarregar} />;
  if (!dados) return null;

  return (
    <div className="flex flex-col gap-4 p-4 pb-24">
      <h1 className="text-xl font-semibold text-white">Minhas Moedas</h1>

      <Card className="text-center">
        <p className="text-sm text-slate-400">Saldo atual</p>
        <p className="text-4xl font-bold text-accentSoft">🪙 {dados.carteira.saldoMoedas}</p>
      </Card>

      <h2 className="text-sm font-medium text-slate-400">Extrato</h2>

      {dados.extrato.transacoes.length === 0 ? (
        <EmptyState texto="Nenhuma movimentação ainda." />
      ) : (
        <Card className="divide-y divide-slate-700 p-0">
          {dados.extrato.transacoes.map((t) => (
            <div key={t.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-white">{labelEvento(t.tipoEvento)}</p>
                <p className="text-xs text-slate-500">{formatarDataCurta(t.ocorridoEm)}</p>
              </div>
              <span className={`font-semibold ${t.valor >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {t.valor >= 0 ? '+' : ''}
                {t.valor}
              </span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
