// D12 — PA = PEÇAS POR ATENDIMENTO (decisão congelada em 2026-10-05).
//
// PA = peças válidas vendidas ÷ atendimentos válidos. Peça = cada unidade
// comercial registrada na quantidade do item (1 calçado = 1 peça, 1 bolsa =
// 1 peça, 2 unidades = 2 peças). Não há conversão calçado→par.
// Atendimento = venda/documento válido (contrato atual; a equivalência com o
// documento Linx será homologada com dado real).
// Peças e atendimentos chegam JÁ líquidos de cancelamento e devolução (o
// agregado é sempre recalculado dos fatos — ver vendas/agregado.service.ts).
//
// Kit: entra como a fonte registrar (1 item × quantidade). A regra definitiva
// de kit será homologada com dados Linx; se for preciso, o ajuste fica em
// `pecasDoItem`, sem tocar no motor.

/** Peças de um item: a quantidade comercial efetiva registrada pela fonte. */
export function pecasDoItem(item: { quantidade: number; quantidadeDevolvida?: number }): number {
  return Math.max(0, item.quantidade - (item.quantidadeDevolvida ?? 0));
}

/** PA com 2 casas; null quando não houve atendimento (nunca divide por zero). */
export function calcularPa(pecas: number, atendimentos: number): number | null {
  if (!(atendimentos > 0)) return null;
  return Math.round((pecas / atendimentos) * 100) / 100;
}
