export function LoadingState({ texto = 'Carregando...' }: { texto?: string }) {
  return (
    <div role="status" className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-accent" />
      <span>{texto}</span>
    </div>
  );
}
