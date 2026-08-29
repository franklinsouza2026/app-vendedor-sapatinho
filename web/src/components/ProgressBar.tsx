/** Barra de progresso acessível — informação nunca depende só de cor (percentual sempre em texto também). */
export function ProgressBar({ percentual }: { percentual: number }) {
  const clamped = Math.max(0, Math.min(100, percentual));
  const cor = clamped >= 100 ? 'bg-emerald-500' : 'bg-accent';

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-3 w-full overflow-hidden rounded-full bg-slate-700"
    >
      <div className={`h-full rounded-full ${cor} transition-all`} style={{ width: `${clamped}%` }} />
    </div>
  );
}
