/**
 * Celebração — sobreposição curta, premium e sem exagero. Um ícone, uma frase,
 * a recompensa e "Continuar". Sem confete, sem som, sem contagem regressiva.
 * Respeita `prefers-reduced-motion` (a animação some, o conteúdo fica).
 */
import { useEffect, useRef } from 'react';
import type { Celebracao as CelebracaoT, TipoCelebracao } from '../dominio/tipos';

const VISUAL: Record<TipoCelebracao, { icone: string; selo: string; brilho: string }> = {
  META_DIA: { icone: '🎯', selo: 'Meta do dia', brilho: 'from-emerald-400/40' },
  PRIMEIRO_LUGAR: { icone: '🏆', selo: 'Liderança', brilho: 'from-amber-300/40' },
  RECORDE: { icone: '🚀', selo: 'Recorde pessoal', brilho: 'from-fuchsia-400/30' },
  NIVEL: { icone: '⭐', selo: 'Novo nível', brilho: 'from-sky-300/40' },
  MOEDAS: { icone: '🪙', selo: 'VendaCoins', brilho: 'from-amber-300/40' },
  MISSAO: { icone: '🔥', selo: 'Missão', brilho: 'from-orange-400/40' },
  BADGE: { icone: '🏅', selo: 'Conquista', brilho: 'from-amber-300/40' },
};

export function Celebracao({ celebracao, onFechar }: { celebracao: CelebracaoT; onFechar: () => void }) {
  const botao = useRef<HTMLButtonElement>(null);
  const v = VISUAL[celebracao.tipo];

  useEffect(() => {
    botao.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onFechar();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onFechar, celebracao.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center" onClick={onFechar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="celebracao-titulo"
        aria-describedby="celebracao-detalhe"
        onClick={(e) => e.stopPropagation()}
        className="f1-celebrar relative w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-surface p-6 text-center shadow-2xl"
      >
        <div aria-hidden="true" className={`pointer-events-none absolute -top-24 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-gradient-to-b ${v.brilho} to-transparent blur-2xl`} />
        <p className="relative text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{v.selo}</p>
        <p aria-hidden="true" className="f1-icone relative mt-3 text-6xl">
          {v.icone}
        </p>
        <h2 id="celebracao-titulo" className="relative mt-3 text-2xl font-bold text-white">
          {celebracao.titulo}
        </h2>
        <p id="celebracao-detalhe" className="relative mt-2 text-sm text-slate-300">
          {celebracao.detalhe}
        </p>
        {celebracao.recompensa && (
          <p className="relative mt-4 flex justify-center gap-2">
            {celebracao.recompensa.xp > 0 && <span className="rounded-full bg-sky-500/15 px-3 py-1 text-sm font-semibold text-sky-200">+{celebracao.recompensa.xp} XP</span>}
            {celebracao.recompensa.moedas > 0 && <span className="rounded-full bg-amber-500/15 px-3 py-1 text-sm font-semibold text-amber-200">+{celebracao.recompensa.moedas} 🪙</span>}
          </p>
        )}
        <button ref={botao} onClick={onFechar} className="relative mt-6 min-h-[48px] w-full rounded-full bg-white font-semibold text-slate-900 active:opacity-80">
          Continuar
        </button>
      </div>
    </div>
  );
}
