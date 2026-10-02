/**
 * "Simular venda" — interação do protótipo para demonstrar o ciclo
 * missão → progresso → conclusão → celebração → XP/VendaCoins no extrato.
 * Créditos entram como lançamentos (nunca editando saldo), espelhando o ledger.
 */
import type { Missao } from '../dominio/tipos';
import { useFase1 } from './Fase1Contexto';

export function useSimularMissao() {
  const { cenario, dados, alterar, celebrar } = useFase1();
  return (m: Missao) => {
    const chave = `${cenario.id}:${m.id}`;
    const conclui = m.progresso + 1 >= m.alvo;
    alterar((e) => {
      e.simulacao.progresso[chave] = (e.simulacao.progresso[chave] ?? 0) + 1;
      if (conclui) {
        e.simulacao.creditos.unshift({ id: `${chave}:${e.simulacao.creditos.length + 1}`, quando: dados.agora, origem: `Missão “${m.titulo}”`, xp: m.recompensa.xp, moedas: m.recompensa.moedas });
      }
    }, null);
    if (conclui) {
      celebrar({ id: `sim-${chave}`, tipo: 'MISSAO', titulo: 'Missão concluída!', detalhe: `${m.titulo} — objetivo atingido.`, recompensa: m.recompensa });
    }
  };
}
