/** Sessão guardada, mas sem internet para confirmá-la: avisa e espera a rede (nunca desloga). */
import { useAuth } from './AuthContext';

export function SemConexao() {
  const { tentarDeNovo } = useAuth();
  return (
    <div role="status" className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-4 px-6 py-12 text-center">
      <span aria-hidden="true" className="text-4xl">📡</span>
      <h1 className="text-xl font-bold text-white">Sem conexão</h1>
      <p className="text-slate-300">Seus números aparecem assim que a internet voltar. Você continua conectada — não precisa entrar de novo.</p>
      <button onClick={tentarDeNovo} className="mx-auto min-h-[48px] rounded-full bg-amber-500 px-6 font-semibold text-slate-900">
        Tentar de novo
      </button>
    </div>
  );
}
