/**
 * Escolha do "⚡ Próximo Alvo" e da lista "Você está perto".
 *
 * ⚠️ REGRA DE NEGÓCIO AINDA NÃO CONGELADA — prioridade provisória para
 * homologar a experiência:
 *   1. menor esforço estimado em vendas primeiro (o que está mais perto);
 *   2. alvos que não convertem em vendas (ex.: XP) entram depois dos que
 *      custam até 2 vendas, e antes dos mais distantes;
 *   3. empate → ordem fixa de tipo abaixo (meta do dia antes de tudo).
 * A regra final será decidida na auditoria de backend.
 */
import type { Alvo } from './tipos';

const ORDEM_TIPO: Alvo['tipo'][] = ['META_DIA', 'MISSAO', 'RANKING', 'DESAFIO', 'NIVEL', 'RECORDE', 'META_MES'];
const ESFORCO_EQUIVALENTE_SEM_CONVERSAO = 2.5;

function esforco(alvo: Alvo): number {
  return alvo.esforcoVendas ?? ESFORCO_EQUIVALENTE_SEM_CONVERSAO;
}

export function priorizarAlvos(alvos: Alvo[]): Alvo[] {
  return [...alvos].sort((a, b) => esforco(a) - esforco(b) || ORDEM_TIPO.indexOf(a.tipo) - ORDEM_TIPO.indexOf(b.tipo));
}

/**
 * "Você está perto": até `limite` itens depois do Próximo Alvo, no máximo um
 * por tipo — três missões seguidas diriam menos do que missão + ranking + nível.
 */
export function vocePerto(alvos: Alvo[], limite = 3): Alvo[] {
  const [principal, ...resto] = priorizarAlvos(alvos);
  if (!principal) return [];
  const vistos = new Set<Alvo['tipo']>([principal.tipo]);
  const escolhidos: Alvo[] = [];
  for (const a of resto) {
    if (escolhidos.length >= limite) break;
    if (vistos.has(a.tipo)) continue;
    vistos.add(a.tipo);
    escolhidos.push(a);
  }
  return escolhidos;
}
