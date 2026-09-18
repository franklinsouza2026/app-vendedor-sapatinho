// Gate determinístico de contexto (Etapa 2B.1).
//
// Esta é a peça que torna o silêncio comercial uma GARANTIA e não uma instrução
// de prompt. O LLM classifica a intenção; este código decide, sozinho, quais
// blocos de contexto podem ser carregados.
//
// O classificador nunca devolve "domínios" — se devolvesse, haveria o que
// forjar. Ele devolve só uma intenção de uma lista fechada, e o mapeamento
// abaixo faz o resto.
import { MoodCheckIn } from '@prisma/client';
import { DecisaoPertinencia, DominioContexto, EstadoComportamental, Intencao } from './tipos';

/**
 * Check-in que indica necessidade de acolhimento.
 *
 * É INCLINAÇÃO, não regra (Constituição §17): quem decide o assunto continua
 * sendo o vendedor — ver `DUVIDA_COMERCIAL` abaixo, que atravessa isto.
 */
function pedeAcolhimento(checkin: MoodCheckIn | null): boolean {
  return checkin === 'NOT_GOOD';
}

/**
 * Mapa intenção → (estado, domínios). Exaustivo por construção: `Record` sobre
 * o union completo, então acrescentar uma intenção sem decidir seu estado e
 * seus domínios não compila.
 */
const POR_INTENCAO: Record<Intencao, { estado: EstadoComportamental; dominios: readonly DominioContexto[] }> = {
  // A pessoa perguntou pelos próprios números. A agência dela vale mais que a
  // inclinação do check-in (Constituição §8, caso B) — mesmo chegando mal, se
  // perguntou, recebe resposta com fato.
  DUVIDA_COMERCIAL: { estado: 'REFLETIR', dominios: ['HUMANO', 'DESENVOLVIMENTO', 'COMERCIAL'] },

  // "Em que preciso melhorar?" — evolução e aprendizado primeiro. Performance
  // NÃO entra automaticamente: transformar "quero evoluir" em cobrança de meta
  // é exatamente o que a Constituição proíbe.
  DESENVOLVIMENTO: { estado: 'DESENVOLVER', dominios: ['HUMANO', 'DESENVOLVIMENTO'] },

  // A pessoa precisa primeiro ser ouvida. Performance fica silenciosa.
  DESABAFO: { estado: 'ACOLHER', dominios: ['HUMANO'] },

  // Trouxe algo bom. Reconhecer pode existir sozinho, sem emendar cobrança
  // (Constituição §10) — por isso COMERCIAL fica de fora.
  CELEBRACAO: { estado: 'CELEBRAR', dominios: ['HUMANO', 'DESENVOLVIMENTO'] },

  // Conversa aberta e "outro" caem no mesmo lugar, e o check-in inclina o
  // estado — ver `decidirPertinencia`.
  CONVERSA: { estado: 'REFLETIR', dominios: ['HUMANO', 'DESENVOLVIMENTO'] },
  OUTRO: { estado: 'REFLETIR', dominios: ['HUMANO', 'DESENVOLVIMENTO'] },
};

/**
 * Decide estado e domínios a partir da intenção e do check-in do dia.
 *
 * `origem` só é repassada — quem classificou não muda a decisão, de propósito:
 * uma intenção vinda do LLM não tem mais poder que uma vinda de regra.
 */
export function decidirPertinencia(intencao: Intencao, checkin: MoodCheckIn | null, origem: DecisaoPertinencia['origem']): DecisaoPertinencia {
  const base = POR_INTENCAO[intencao];

  // Check-in ruim inclina conversa aberta para acolhimento — e só ela. Uma
  // pergunta comercial explícita nunca é reinterpretada como desabafo.
  const inclinaParaAcolher = pedeAcolhimento(checkin) && (intencao === 'CONVERSA' || intencao === 'OUTRO');

  return {
    intencao,
    estado: inclinaParaAcolher ? 'ACOLHER' : base.estado,
    // Cópia, nunca a referência do mapa global: um `.push()`/`.sort()` em
    // qualquer consumidor futuro contaminaria o processo inteiro — inclusive
    // liberando COMERCIAL pra todo mundo.
    dominios: inclinaParaAcolher ? ['HUMANO'] : [...base.dominios],
    origem,
  };
}

/**
 * Decisão de fallback: usada quando a classificação falha por qualquer motivo
 * (provider fora, timeout, budget, JSON inválido, enum inválido).
 *
 * "EM DÚVIDA, SILÊNCIO COMERCIAL": a conversa continua e o contexto humano
 * segue disponível, mas performance nunca é liberada por acidente.
 */
export function pertinenciaDeFallback(checkin: MoodCheckIn | null): DecisaoPertinencia {
  return decidirPertinencia(pedeAcolhimento(checkin) ? 'DESABAFO' : 'CONVERSA', checkin, 'FALLBACK');
}
