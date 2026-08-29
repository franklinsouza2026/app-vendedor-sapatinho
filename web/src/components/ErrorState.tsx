export function ErrorState({ mensagem, onRetry }: { mensagem: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 py-16 text-center">
      <p className="text-slate-300">{mensagem}</p>
      <button
        onClick={onRetry}
        className="rounded-lg bg-accent px-4 py-2 font-medium text-white active:opacity-80"
      >
        Tentar de novo
      </button>
    </div>
  );
}
