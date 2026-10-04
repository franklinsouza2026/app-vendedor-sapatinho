import { Link } from 'react-router-dom';
import { useApi } from '../utils/useApi';
import { buscarMeusGanhos, ItemGanho } from '../api/engajamento';
import { buscarCarteira } from '../api/gamificacao';
import { Card } from '../components/Card';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { formatarInteiro, labelEvento } from '../utils/format';

async function carregar() {
  const [ganhos, carteira] = await Promise.all([buscarMeusGanhos(), buscarCarteira()]);
  return { itens: ganhos.itens, carteira };
}

/** "Hoje", "Ontem" ou "dd/mm" — no fuso do aparelho (exibição apenas). */
function rotuloDia(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(hoje.getDate() - 1);
  const mesmo = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (mesmo(d, hoje)) return 'Hoje';
  if (mesmo(d, ontem)) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

// Minha evolução: XP (progressão, não se gasta) e VendaCoins (moeda) lado a
// lado, só com transações REAIS dos ledgers — nada é inventado aqui.
export function MeusGanhos() {
  const { dados, carregando, erro, recarregar } = useApi(carregar, []);
  if (carregando && !dados) return <LoadingState texto="Carregando seus ganhos..." />;
  if (erro) return <ErrorState mensagem={erro} onRetry={recarregar} />;
  if (!dados) return null;

  const grupos = new Map<string, ItemGanho[]>();
  for (const i of dados.itens) {
    const g = rotuloDia(i.ocorridoEm);
    grupos.set(g, [...(grupos.get(g) ?? []), i]);
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-24">
      <Link to="/perfil" className="-ml-1 inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-accentSoft">
        <span aria-hidden="true">←</span> Voltar
      </Link>
      <h1 className="text-xl font-semibold text-white">Meus ganhos</h1>
      <div className="grid grid-cols-2 gap-3">
        <Card className="text-center">
          <p className="text-2xl font-bold text-white">⭐ {formatarInteiro(dados.carteira.xp)}</p>
          <p className="text-xs text-slate-400">XP — sua evolução (não se gasta)</p>
        </Card>
        <Card className="text-center">
          <p className="text-2xl font-bold text-amber-200">🪙 {formatarInteiro(dados.carteira.saldoMoedas)}</p>
          <p className="text-xs text-slate-400">VendaCoins — sua moeda</p>
        </Card>
      </div>
      {dados.itens.length === 0 ? (
        <EmptyState texto="Seus ganhos aparecem aqui assim que você fizer o primeiro check-in ou concluir uma missão." />
      ) : (
        [...grupos.entries()].map(([dia, itens]) => (
          <section key={dia} aria-label={dia}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{dia}</h2>
            <ul className="flex flex-col gap-2">
              {itens.map((i) => (
                <li key={i.chave} className="flex items-center justify-between gap-3 rounded-xl bg-surfaceRaised px-4 py-3">
                  <span className="min-w-0 text-white">{labelEvento(i.tipoEvento)}</span>
                  <span className="flex shrink-0 gap-2 text-sm font-semibold">
                    {i.xp !== 0 && <span className="text-sky-200">{i.xp > 0 ? '+' : ''}{i.xp} XP</span>}
                    {i.moedas !== 0 && <span className={i.moedas > 0 ? 'text-amber-200' : 'text-red-300'}>{i.moedas > 0 ? '+' : ''}{i.moedas} 🪙</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
