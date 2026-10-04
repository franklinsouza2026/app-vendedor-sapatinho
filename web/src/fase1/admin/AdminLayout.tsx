/**
 * Shell do Admin da Fase 1 — "central de comando". Menu em grupos, lateral no
 * desktop e recolhível no celular. Dados REAIS (ProvedorAdmin) — nada aqui é
 * demonstração.
 */
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { calcularPendencias } from '../dominio/admin';
import { useAdmin } from './AdminDados';

const MENU: { grupo: string; itens: { para: string; rotulo: string; fim?: boolean }[] }[] = [
  { grupo: '', itens: [{ para: '/admin', rotulo: 'Visão geral', fim: true }] },
  { grupo: 'Pessoas', itens: [{ para: '/admin/vendedores', rotulo: 'Vendedores' }, { para: '/admin/lojas', rotulo: 'Lojas' }] },
  { grupo: 'Performance', itens: [{ para: '/admin/metas', rotulo: 'Metas e calendário' }, { para: '/admin/rankings', rotulo: 'Rankings e elegibilidade' }, { para: '/admin/indicadores', rotulo: 'Indicadores' }] },
  { grupo: 'Incentivos', itens: [{ para: '/admin/campanhas', rotulo: 'Campanhas' }, { para: '/admin/missoes', rotulo: 'Missões' }, { para: '/admin/competicoes', rotulo: 'Competições' }, { para: '/admin/premiacoes', rotulo: 'Premiações' }] },
  { grupo: 'Gamificação', itens: [{ para: '/admin/xp', rotulo: 'XP' }, { para: '/admin/vendacoins', rotulo: 'VendaCoins' }, { para: '/admin/conquistas', rotulo: 'Níveis e conquistas' }] },
  { grupo: 'Comunicação', itens: [{ para: '/admin/reconhecimentos', rotulo: 'Reconhecimentos' }, { para: '/admin/feed', rotulo: 'Feed' }] },
  { grupo: 'Operação', itens: [{ para: '/admin/saude', rotulo: 'Saúde dos dados' }, { para: '/admin/auditoria', rotulo: 'Auditoria' }, { para: '/admin/prontidao', rotulo: 'Prontidão do piloto' }, { para: '/admin/analytics', rotulo: 'Uso do piloto' }] },
  { grupo: 'Configurações', itens: [{ para: '/admin/integracoes', rotulo: 'Integrações' }, { para: '/admin/acesso-diario', rotulo: 'Recompensa de acesso diário' }] },
];

function Menu({ aoNavegar, pendencias }: { aoNavegar?: () => void; pendencias: number }) {
  return (
    <nav aria-label="Menu do Admin" className="flex flex-col gap-3">
      {MENU.map((g) => (
        <div key={g.grupo || 'inicio'}>
          {g.grupo && <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{g.grupo}</p>}
          <ul className="flex flex-col">
            {g.itens.map((i) => (
              <li key={i.para}>
                <NavLink
                  to={i.para}
                  end={i.fim}
                  onClick={aoNavegar}
                  className={({ isActive }) => `flex min-h-[40px] items-center justify-between rounded-lg px-3 text-sm lg:min-h-[34px] ${isActive ? 'bg-slate-700/70 font-semibold text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
                >
                  {i.rotulo}
                  {i.para === '/admin' && pendencias > 0 && (
                    <span className="rounded-full bg-amber-500/20 px-1.5 text-xs font-bold text-amber-200" aria-label={`${pendencias} pendências`}>
                      {pendencias}
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function AdminLayout() {
  const { estado } = useAdmin();
  const { logout, sessao } = useAuth();
  const navegar = useNavigate();
  const location = useLocation();
  const [menuAberto, setMenuAberto] = useState(false);
  const sair = () => void logout().then(() => navegar('/login', { replace: true }));

  useEffect(() => {
    window.scrollTo?.(0, 0);
    setMenuAberto(false);
  }, [location.pathname]);

  const pendencias = calcularPendencias(estado).length;

  return (
    <div className="fase1 min-h-full bg-base">
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-base/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2">
          <button onClick={() => setMenuAberto((v) => !v)} aria-expanded={menuAberto} aria-controls="menu-admin-movel" className="flex h-11 w-11 items-center justify-center rounded-lg text-xl text-slate-200 lg:hidden" aria-label="Abrir menu">
            ☰
          </button>
          <Link to="/admin" className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-accentSoft">Admin · Fase 1</p>
            <p className="truncate text-sm font-bold text-white">Central de comando</p>
          </Link>
          <span className="hidden text-xs text-slate-400 sm:inline">{sessao?.vendedor.nome} · {estado.empresa.nome}</span>
          <button onClick={sair} className="hidden min-h-[40px] rounded-full border border-slate-700 px-3 text-sm text-slate-300 sm:inline-flex sm:items-center">
            Sair
          </button>
        </div>
      </header>

      {menuAberto && (
        <div id="menu-admin-movel" className="border-b border-slate-800 bg-surface px-4 py-4 lg:hidden">
          <Menu aoNavegar={() => setMenuAberto(false)} pendencias={pendencias} />
          <button onClick={sair} className="mt-4 min-h-[44px] w-full rounded-full border border-slate-700 text-sm text-slate-300">
            Sair
          </button>
        </div>
      )}

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-5">
        <aside className="sticky top-[64px] hidden h-[calc(100vh-110px)] w-56 shrink-0 overflow-y-auto lg:block">
          <Menu pendencias={pendencias} />
        </aside>
        <main className="flex min-w-0 flex-1 flex-col gap-5 pb-16">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
