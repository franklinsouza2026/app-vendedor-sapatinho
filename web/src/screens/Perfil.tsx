import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useApi } from '../utils/useApi';
import { buscarCarteira, buscarStreak } from '../api/gamificacao';
import { Card } from '../components/Card';
import { ProgressBar } from '../components/ProgressBar';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';

async function carregarPerfil() {
  const [carteira, streak] = await Promise.all([buscarCarteira(), buscarStreak()]);
  return { carteira, streak };
}

export function Perfil() {
  const { sessao, logout } = useAuth();
  const { dados, carregando, erro, recarregar } = useApi(carregarPerfil, []);

  return (
    <div className="flex flex-col gap-4 p-4 pb-24">
      <div className="flex items-center gap-3">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/20 text-xl font-bold text-accentSoft" aria-hidden="true">
          {sessao!.vendedor.nome.charAt(0).toUpperCase()}
        </span>
        <div>
          <h1 className="text-xl font-semibold text-white">{sessao!.vendedor.nome}</h1>
          <p className="text-sm text-slate-400">{sessao!.loja.nome}</p>
          <p className="text-xs text-slate-600">{sessao!.empresa.nome}</p>
        </div>
      </div>

      {/* CPF sempre mascarado (Fatia 7.5A, seção 17) — nunca o valor completo. */}
      {sessao!.vendedor.cpfMascarado && (
        <p className="text-xs text-slate-500">CPF: {sessao!.vendedor.cpfMascarado}</p>
      )}

      {carregando && !dados && <LoadingState />}
      {erro && <ErrorState mensagem={erro} onRetry={recarregar} />}

      {dados && (
        <>
          <Card>
            <div className="flex items-baseline justify-between">
              <span className="font-semibold text-white">{dados.carteira.nivel.nome}</span>
              <span className="text-sm text-slate-400">Nível {dados.carteira.nivel.nivel}</span>
            </div>
            {dados.carteira.nivel.xpProximoNivel !== null ? (
              <>
                <div className="mt-2">
                  <ProgressBar percentual={(dados.carteira.nivel.xpAtual / dados.carteira.nivel.xpProximoNivel) * 100} />
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {dados.carteira.nivel.xpAtual} / {dados.carteira.nivel.xpProximoNivel} XP
                </p>
              </>
            ) : (
              <p className="mt-1 text-xs text-slate-400">{dados.carteira.nivel.xpAtual} XP — nível máximo</p>
            )}
          </Card>

          <div className="grid grid-cols-3 gap-3">
            <Link to="/moedas">
              <Card className="text-center">
                <p className="text-lg">🪙</p>
                <p className="font-semibold text-white">{dados.carteira.saldoMoedas}</p>
                <p className="text-xs text-slate-400">moedas</p>
              </Card>
            </Link>
            <Card className="text-center">
              <p className="text-lg">🔥</p>
              <p className="font-semibold text-white">{dados.streak.streakAtual}</p>
              <p className="text-xs text-slate-400">sequência</p>
            </Card>
            <Link to="/conquistas">
              <Card className="text-center">
                <p className="text-lg">🏅</p>
                <p className="font-semibold text-white">Ver</p>
                <p className="text-xs text-slate-400">conquistas</p>
              </Card>
            </Link>
          </div>
        </>
      )}

      <Link
        to="/perfil/senha"
        className="flex min-h-[44px] items-center justify-between rounded-lg bg-surface px-4 py-3 text-sm text-slate-300 active:opacity-80"
      >
        <span>Segurança — alterar senha</span>
        <span aria-hidden="true">→</span>
      </Link>

      {sessao!.vendedor.papel === 'ADMIN' && (
        <Link
          to="/admin/usuarios"
          className="flex min-h-[44px] items-center justify-between rounded-lg bg-surface px-4 py-3 text-sm text-slate-300 active:opacity-80"
        >
          <span>Administração</span>
          <span aria-hidden="true">→</span>
        </Link>
      )}

      <button
        onClick={() => logout()}
        className="mt-4 rounded-lg border border-slate-700 py-3 font-medium text-slate-300 active:opacity-80"
      >
        Sair
      </button>
    </div>
  );
}
