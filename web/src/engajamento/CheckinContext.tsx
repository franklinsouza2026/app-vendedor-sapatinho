/**
 * Check-in diário do VENDEDOR — registra o acesso ao abrir o app (e ao voltar
 * para ele) e mostra a celebração SÓ quando o servidor diz que este foi o
 * primeiro acesso do dia com recompensa. Refresh, outra aba ou novo login no
 * mesmo dia nunca repetem a festa: quem decide é o backend.
 */
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { registrarAcesso, ResultadoAcesso } from '../api/engajamento';

interface CheckinValor {
  checkin: ResultadoAcesso | null;
}

const Contexto = createContext<CheckinValor>({ checkin: null });

export function CheckinProvider({ children }: { children: ReactNode }) {
  const { sessao } = useAuth();
  const [checkin, setCheckin] = useState<ResultadoAcesso | null>(null);
  const [celebracao, setCelebracao] = useState<ResultadoAcesso | null>(null);
  const emAndamento = useRef(false);
  const ehVendedor = sessao?.vendedor.papel === 'VENDEDOR';

  const registrar = useCallback(async () => {
    if (emAndamento.current) return;
    emAndamento.current = true;
    try {
      const r = await registrarAcesso();
      setCheckin(r);
      if (r.primeiroAcessoDoDia && r.recompensaAgora) setCelebracao(r);
    } catch {
      // Falha de rede não pode travar o app — o próximo acesso tenta de novo.
    } finally {
      emAndamento.current = false;
    }
  }, []);

  useEffect(() => {
    if (!ehVendedor) {
      setCheckin(null);
      return;
    }
    registrar();
    // Voltar ao app (aba/PWA em primeiro plano) é um novo acesso — e, se já
    // virou o dia, é o primeiro acesso do novo dia.
    const aoVoltar = () => document.visibilityState === 'visible' && registrar();
    document.addEventListener('visibilitychange', aoVoltar);
    return () => document.removeEventListener('visibilitychange', aoVoltar);
  }, [ehVendedor, sessao?.vendedor.id, registrar]);

  return (
    <Contexto.Provider value={{ checkin }}>
      {children}
      {celebracao && <CelebracaoCheckin r={celebracao} onFechar={() => setCelebracao(null)} />}
    </Contexto.Provider>
  );
}

export function useCheckin() {
  return useContext(Contexto);
}

function CelebracaoCheckin({ r, onFechar }: { r: ResultadoAcesso; onFechar: () => void }) {
  const botao = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    botao.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onFechar]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={onFechar}>
      <div role="dialog" aria-modal="true" aria-labelledby="checkin-titulo" onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-3xl border border-white/10 bg-surface p-6 text-center shadow-2xl">
        <p aria-hidden="true" className="text-5xl">
          🎉
        </p>
        <h2 id="checkin-titulo" className="mt-3 text-xl font-bold text-white">
          Check-in diário concluído
        </h2>
        <p className="mt-3 flex justify-center gap-2">
          {r.recompensaAgora!.xp > 0 && <span className="rounded-full bg-sky-500/15 px-3 py-1 font-semibold text-sky-200">+{r.recompensaAgora!.xp} XP</span>}
          {r.recompensaAgora!.moedas > 0 && <span className="rounded-full bg-amber-500/15 px-3 py-1 font-semibold text-amber-200">+{r.recompensaAgora!.moedas} VendaCoins</span>}
        </p>
        <p className="mt-3 text-sm text-slate-300">
          {r.streakAcesso > 1 ? `🔥 ${r.streakAcesso} dias seguidos acessando. ` : ''}Volte amanhã para continuar sua sequência.
        </p>
        <button ref={botao} onClick={onFechar} className="mt-5 min-h-[48px] w-full rounded-full bg-white font-semibold text-slate-900 active:opacity-80">
          Continuar
        </button>
      </div>
    </div>
  );
}
