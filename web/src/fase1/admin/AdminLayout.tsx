/**
 * Shell do Admin da Fase 1 — "central de comando". Menu em 7 grupos (o
 * proposto no comando), lateral no desktop e recolhível no celular.
 * Ação sempre visível: 👁 Ver como vendedora.
 */
import { useEffect, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useFase1 } from '../demo/Fase1Contexto';
import { calcularPendencias } from '../dominio/admin';
import { AGORA_DEMO } from '../demo/estado';

const MENU: { grupo: string; itens: { para: string; rotulo: string; fim?: boolean }[] }[] = [
  { grupo: '', itens: [{ para: '/fase1/admin', rotulo: 'Visão geral', fim: true }] },
  { grupo: 'Pessoas', itens: [{ para: '/fase1/admin/vendedores', rotulo: 'Vendedores' }, { para: '/fase1/admin/lojas', rotulo: 'Lojas' }] },
  { grupo: 'Performance', itens: [{ para: '/fase1/admin/metas', rotulo: 'Metas e calendário' }, { para: '/fase1/admin/rankings', rotulo: 'Rankings e elegibilidade' }, { para: '/fase1/admin/indicadores', rotulo: 'Indicadores' }] },
  { grupo: 'Incentivos', itens: [{ para: '/fase1/admin/campanhas', rotulo: 'Campanhas' }, { para: '/fase1/admin/missoes', rotulo: 'Missões' }, { para: '/fase1/admin/competicoes', rotulo: 'Competições' }, { para: '/fase1/admin/premiacoes', rotulo: 'Premiações' }] },
  { grupo: 'Gamificação', itens: [{ para: '/fase1/admin/xp', rotulo: 'XP' }, { para: '/fase1/admin/vendacoins', rotulo: 'VendaCoins' }, { para: '/fase1/admin/conquistas', rotulo: 'Níveis e conquistas' }] },
  { grupo: 'Comunicação', itens: [{ para: '/fase1/admin/reconhecimentos', rotulo: 'Reconhecimentos' }, { para: '/fase1/admin/feed', rotulo: 'Feed' }] },
  { grupo: 'Operação', itens: [{ para: '/fase1/admin/saude', rotulo: 'Saúde dos dados' }, { para: '/fase1/admin/auditoria', rotulo: 'Auditoria' }, { para: '/fase1/admin/prontidao', rotulo: 'Prontidão do piloto' }, { para: '/fase1/admin/analytics', rotulo: 'Uso do piloto' }] },
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
                  {i.para === '/fase1/admin' && pendencias > 0 && (
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
  const { perfil, sair, verComoVendedor, restaurarDemo, estado } = useFase1();
  const navegar = useNavigate();
  const location = useLocation();
  const [menuAberto, setMenuAberto] = useState(false);
  const [confirmarRestaurar, setConfirmarRestaurar] = useState(false);

  useEffect(() => {
    window.scrollTo?.(0, 0);
    setMenuAberto(false);
  }, [location.pathname]);

  if (perfil !== 'ADMIN') return <Navigate to="/fase1" replace />;

  const pendencias = calcularPendencias(estado, AGORA_DEMO).length;

  return (
    <div className="fase1 min-h-full bg-base">
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-base/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2">
          <button onClick={() => setMenuAberto((v) => !v)} aria-expanded={menuAberto} aria-controls="menu-admin-movel" className="flex h-11 w-11 items-center justify-center rounded-lg text-xl text-slate-200 lg:hidden" aria-label="Abrir menu">
            ☰
          </button>
          <Link to="/fase1/admin" className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-accentSoft">Admin · Fase 1</p>
            <p className="truncate text-sm font-bold text-white">Central de comando</p>
          </Link>
          <button
            onClick={() => {
              verComoVendedor();
              navegar('/fase1/inicio');
            }}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-violet-600 px-3 text-sm font-semibold text-white active:opacity-80"
          >
            <span aria-hidden="true">👁</span>
            <span className="hidden sm:inline">Ver como vendedora</span>
            <span className="sm:hidden">Ver app</span>
          </button>
          <button
            onClick={() => {
              sair();
              navegar('/fase1');
            }}
            className="hidden min-h-[40px] rounded-full border border-slate-700 px-3 text-sm text-slate-300 sm:inline-flex sm:items-center"
          >
            Sair
          </button>
        </div>
        <div className="border-t border-dashed border-sky-400/30 bg-slate-900/70">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5 text-xs text-sky-200">
            <span>🧪 Demonstração: tudo o que você muda aqui fica salvo neste navegador e chega ao app da vendedora (Ana).</span>
            {confirmarRestaurar ? (
              <span className="flex items-center gap-2">
                Apagar suas alterações?
                <button
                  onClick={() => {
                    restaurarDemo();
                    setConfirmarRestaurar(false);
                  }}
                  className="font-semibold text-rose-200 underline"
                >
                  Sim, restaurar
                </button>
                <button onClick={() => setConfirmarRestaurar(false)} className="underline">
                  Cancelar
                </button>
              </span>
            ) : (
              <button onClick={() => setConfirmarRestaurar(true)} className="font-semibold underline underline-offset-2">
                Restaurar dados de demonstração
              </button>
            )}
          </div>
        </div>
      </header>

      {menuAberto && (
        <div id="menu-admin-movel" className="border-b border-slate-800 bg-surface px-4 py-4 lg:hidden">
          <Menu aoNavegar={() => setMenuAberto(false)} pendencias={pendencias} />
          <button
            onClick={() => {
              sair();
              navegar('/fase1');
            }}
            className="mt-4 min-h-[44px] w-full rounded-full border border-slate-700 text-sm text-slate-300"
          >
            Sair da demonstração
          </button>
        </div>
      )}

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-5">
        <aside className="sticky top-[92px] hidden h-[calc(100vh-110px)] w-56 shrink-0 overflow-y-auto lg:block">
          <Menu pendencias={pendencias} />
        </aside>
        <main className="flex min-w-0 flex-1 flex-col gap-5 pb-16">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
