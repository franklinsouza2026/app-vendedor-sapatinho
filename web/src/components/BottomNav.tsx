import { NavLink } from 'react-router-dom';

const ITENS = [
  { to: '/', label: 'Início', icone: '🏠' },
  { to: '/metas', label: 'Metas', icone: '🎯' },
  { to: '/ranking', label: 'Ranking', icone: '🏆' },
  { to: '/perfil', label: 'Perfil', icone: '👤' },
];

export function BottomNav() {
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-10 flex border-t border-slate-800 bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      {ITENS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${isActive ? 'text-accentSoft' : 'text-slate-400'}`
          }
        >
          <span aria-hidden="true" className="text-xl">
            {item.icone}
          </span>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
