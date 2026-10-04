/**
 * Painel de demonstração — troca de cenário e "experimentar celebrações".
 * Existe só na árvore /fase1 (que já é dev/homologação). Visualmente separado
 * do produto (tracejado azul + rótulo DEMO) para ninguém confundir com UI real.
 */
import { useEffect, useRef, useState } from 'react';
import { CELEBRACOES_DEMO, CENARIOS } from './cenarios';
import { useDemo } from './Fase1Contexto';

export function SeletorCenario() {
  const { cenario, trocarCenario, celebrar } = useDemo();
  const [aberto, setAberto] = useState(false);
  const fechar = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!aberto) return;
    fechar.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [aberto]);

  return (
    <>
      {/* Faixa de demonstração no topo da tela: separada do produto (tracejado
          azul), nunca sobre o conteúdo. Some ao rolar. */}
      <div className="border-b border-dashed border-sky-400/40 bg-slate-900/80">
        <button
          onClick={() => setAberto(true)}
          aria-label={`Demonstração: cenário ${cenario.rotulo} — ${cenario.titulo}. Trocar cenário`}
          className="mx-auto flex min-h-[40px] w-full max-w-md items-center gap-2 px-4 text-left text-xs text-sky-200 md:max-w-2xl"
        >
          <span aria-hidden="true">🧪</span>
          <span className="font-semibold">DEMO · {cenario.rotulo}</span>
          <span className="min-w-0 flex-1 truncate text-sky-200/80">{cenario.titulo}</span>
          <span className="font-semibold underline underline-offset-2">trocar</span>
        </button>
      </div>

      {aberto && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 sm:items-center" onClick={() => setAberto(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="seletor-titulo" onClick={(e) => e.stopPropagation()} className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-dashed border-sky-400/50 bg-slate-900 p-4 sm:rounded-3xl">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 id="seletor-titulo" className="font-semibold text-white">
                  Cenários de demonstração
                </h2>
                <p className="text-xs text-sky-200/80">Dados simulados para homologação. Não é dado real.</p>
              </div>
              <button ref={fechar} onClick={() => setAberto(false)} aria-label="Fechar" className="h-11 w-11 rounded-full text-xl text-slate-300">
                ×
              </button>
            </div>

            {(['jornada', 'estado'] as const).map((grupo) => (
              <div key={grupo} className="mb-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{grupo === 'jornada' ? 'Jornada do vendedor' : 'Estados especiais'}</p>
                <ul className="flex flex-col gap-1.5">
                  {CENARIOS.filter((c) => c.grupo === grupo).map((c) => {
                    const ativo = c.id === cenario.id;
                    return (
                      <li key={c.id}>
                        <button
                          onClick={() => {
                            trocarCenario(c.id);
                            setAberto(false);
                          }}
                          aria-current={ativo ? 'true' : undefined}
                          className={`flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left ${ativo ? 'bg-sky-500/15 ring-1 ring-sky-400/60' : 'bg-slate-800/70'}`}
                        >
                          <span className="mt-0.5 w-7 shrink-0 rounded-md bg-slate-700 text-center text-xs font-bold leading-6 text-white">{c.rotulo}</span>
                          <span>
                            <span className="block text-sm font-medium text-white">{c.titulo}</span>
                            <span className="block text-xs text-slate-400">{c.descricao}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}

            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Experimentar celebrações</p>
            <div className="flex flex-wrap gap-2">
              {CELEBRACOES_DEMO.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setAberto(false);
                    celebrar(c);
                  }}
                  className="min-h-[40px] rounded-full bg-slate-800 px-3 text-xs font-medium text-slate-200 ring-1 ring-slate-700"
                >
                  {c.titulo}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
