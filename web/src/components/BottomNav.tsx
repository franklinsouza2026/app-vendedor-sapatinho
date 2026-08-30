import { NavLink, useLocation } from 'react-router-dom';

const ITEM_CLASSE = (ativo: boolean) => `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${ativo ? 'text-accentSoft' : 'text-slate-400'}`;

// "Evoluir" reúne Coach/Treinador/Simulador/Academia — as 3 primeiras vivem
// fora do Layout (tela cheia, sem bottom nav visível ali), só a Academia
// fica dentro do Layout junto com o hub /evoluir, então o item ativo precisa
// considerar as duas rotas, não só o prefixo simples que o NavLink usa.
export function BottomNav() {
  const location = useLocation();
  const evoluirAtivo = location.pathname === '/evoluir' || location.pathname === '/academia';

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-800 bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto flex w-full max-w-md">
        <NavLink to="/" end className={({ isActive }) => ITEM_CLASSE(isActive)}>
          <span aria-hidden="true" className="text-xl">
            🏠
          </span>
          Início
        </NavLink>
        <NavLink to="/metas" className={({ isActive }) => ITEM_CLASSE(isActive)}>
          <span aria-hidden="true" className="text-xl">
            📊
          </span>
          Performance
        </NavLink>
        <NavLink to="/evoluir" className={ITEM_CLASSE(evoluirAtivo)}>
          <span aria-hidden="true" className="text-xl">
            🚀
          </span>
          Evoluir
        </NavLink>
        <NavLink to="/ranking" className={({ isActive }) => ITEM_CLASSE(isActive)}>
          <span aria-hidden="true" className="text-xl">
            🏆
          </span>
          Ranking
        </NavLink>
        <NavLink to="/perfil" className={({ isActive }) => ITEM_CLASSE(isActive)}>
          <span aria-hidden="true" className="text-xl">
            👤
          </span>
          Perfil
        </NavLink>
      </div>
    </nav>
  );
}
