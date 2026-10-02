/**
 * Porta de entrada da demonstração. Não é login: não existe senha nem token,
 * nada passa pelo AuthContext. A pessoa escolhe COMO quer ver a Fase 1.
 */
import { Navigate, useNavigate } from 'react-router-dom';
import { useFase1 } from '../demo/Fase1Contexto';

export function Entrar() {
  const { perfil, entrar } = useFase1();
  const navegar = useNavigate();

  if (perfil === 'VENDEDOR') return <Navigate to="/fase1/inicio" replace />;
  if (perfil === 'ADMIN') return <Navigate to="/fase1/admin" replace />;

  return (
    <div className="fase1 mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accentSoft">Fase 1 · Performance & Game</p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-white">Vendedor IA</h1>
        <p className="mt-2 text-slate-300">Veja seu desempenho. Entenda quanto falta. Compita. Conquiste. Seja reconhecido.</p>
      </div>

      <p className="rounded-xl border border-dashed border-sky-400/50 bg-sky-500/5 px-3 py-2 text-sm text-sky-100">
        🧪 Ambiente de homologação. Todos os números são <strong>simulados</strong> — nenhum dado real, nenhuma chamada ao servidor.
      </p>

      <div className="flex flex-col gap-3">
        <button
          onClick={() => {
            entrar('VENDEDOR');
            navegar('/fase1/inicio');
          }}
          className="flex min-h-[64px] items-center gap-4 rounded-2xl bg-white px-5 text-left text-slate-900 active:opacity-90"
        >
          <span aria-hidden="true" className="text-3xl">
            👠
          </span>
          <span>
            <span className="block text-lg font-bold">Entrar como vendedora</span>
            <span className="block text-sm text-slate-600">Ana Beatriz · Caruaru Shopping</span>
          </span>
        </button>
        <button
          onClick={() => {
            entrar('ADMIN');
            navegar('/fase1/admin');
          }}
          className="flex min-h-[64px] items-center gap-4 rounded-2xl border border-slate-600 bg-surface px-5 text-left text-white active:opacity-90"
        >
          <span aria-hidden="true" className="text-3xl">
            🛠️
          </span>
          <span>
            <span className="block text-lg font-bold">Entrar como Admin</span>
            <span className="block text-sm text-slate-400">Central de comando: configure, publique e veja como a vendedora recebe</span>
          </span>
        </button>
      </div>
      <p className="text-center text-xs text-slate-400">Dentro do app, o botão “DEMO” troca o cenário a qualquer momento.</p>
    </div>
  );
}
