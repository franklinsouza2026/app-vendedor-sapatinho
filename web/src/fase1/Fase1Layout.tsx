/**
 * Shell do vendedor na Fase 1. Navegação de 5 itens, só com o que a Fase 1
 * entrega — Conselheiro, Universidade, Simulador, Treinador e Academia NÃO
 * aparecem aqui (continuam no código, nas rotas antigas, intocados).
 */
import { useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useFase1 } from './demo/Fase1Contexto';
import { SeletorCenario } from './demo/SeletorCenario';
import { Celebracao } from './componentes/Celebracao';
import { hora } from './formato';

const ITENS = [
  { para: '/fase1/inicio', icone: '🏠', rotulo: 'Início', tambem: [] as string[] },
  { para: '/fase1/desempenho', icone: '📊', rotulo: 'Desempenho', tambem: [] },
  { para: '/fase1/ranking', icone: '🏆', rotulo: 'Ranking', tambem: [] },
  { para: '/fase1/desafios', icone: '🔥', rotulo: 'Desafios', tambem: [] },
  { para: '/fase1/perfil', icone: '👤', rotulo: 'Perfil', tambem: ['/fase1/progresso', '/fase1/moedas', '/fase1/conquistas', '/fase1/recordes', '/fase1/reconhecimentos', '/fase1/feed'] },
];

function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function Fase1Layout() {
  const { perfil, dados, celebracaoAtual, fecharCelebracao } = useFase1();
  const location = useLocation();
  const online = useOnline();

  // Cada troca de tela começa do topo (no celular, herdar o scroll confunde).
  useEffect(() => {
    window.scrollTo?.(0, 0);
  }, [location.pathname]);

  if (perfil !== 'VENDEDOR') return <Navigate to="/fase1" replace />;

  const offline = !online || dados.status.offline;

  return (
    <div className="fase1 min-h-full bg-base">
      {(offline || dados.status.desatualizado) && (
        <div role="status" className={`sticky top-0 z-20 px-4 py-2 text-center text-xs font-medium ${offline ? 'bg-slate-700 text-slate-100' : 'bg-amber-500/20 text-amber-100'}`}>
          {offline
            ? `Sem conexão. Mostrando seus últimos dados${dados.status.sincronizadoEm ? ` (de ${hora(dados.status.sincronizadoEm)})` : ''}.`
            : `Dados do ERP de ${hora(dados.status.sincronizadoEm!)}. A sincronização está atrasada — os números podem mudar.`}
        </div>
      )}

      <SeletorCenario />

      <main className="mx-auto w-full max-w-md px-4 pb-28 pt-5 md:max-w-2xl">
        <Outlet />
      </main>

      <nav aria-label="Navegação principal" className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <ul className="mx-auto flex w-full max-w-md md:max-w-2xl">
          {ITENS.map((item) => {
            const tambemAtivo = item.tambem.some((p) => location.pathname.startsWith(p));
            return (
              <li key={item.para} className="flex-1">
                <NavLink
                  to={item.para}
                  className={({ isActive }) =>
                    `flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${isActive || tambemAtivo ? 'text-accentSoft' : 'text-slate-400'}`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span aria-hidden="true" className={`text-xl transition-transform motion-reduce:transition-none ${isActive || tambemAtivo ? 'scale-110' : ''}`}>
                        {item.icone}
                      </span>
                      {item.rotulo}
                    </>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      {celebracaoAtual && <Celebracao celebracao={celebracaoAtual} onFechar={fecharCelebracao} />}
    </div>
  );
}
