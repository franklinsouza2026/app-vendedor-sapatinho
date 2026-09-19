// Histórico autorizado (Etapa 2B.4).
//
// A 2B.1 tornou o silêncio comercial uma garantia de arquitetura: o que não é
// autorizado não é CARREGADO do banco, então não há o que vazar na renderização.
// Mas essa garantia parava nos dados NOVOS. As últimas mensagens da conversa
// continuavam indo cruas ao provider — e uma resposta de ontem carrega números
// de ontem.
//
// VAZAMENTO MEDIDO, antes de qualquer código:
//
//   turno 1  seller    "quanto falta pra minha meta?"        → COMERCIAL ok
//            assistant "Faltam R$ 1000,00 pra bater sua meta de hoje."
//   turno 2  seller    "hoje estou mal e só queria conversar" → ACOLHER
//
//   system prompt do turno 2: sem R$          ✅ (a garantia da 2B.1 funciona)
//   janela de mensagens:      "Faltam R$ 1000,00…"  ❌
//
// O KPI bloqueado hoje reaparecia por uma frase de ontem. **Bypass de contexto.**
//
// REGRA QUE ISTO ENCARNA: **autorização de contexto vale também para o passado.**
// Autorização é POR TURNO — ter falado de performance ontem não autoriza falar
// de performance hoje.
//
// E o que NÃO se faz: a transcrição original nunca é tocada. `CoachMessage`
// continua sendo o que de fato aconteceu. O que muda é o que se manda ao
// provider NESTE turno. **Persistência ≠ contexto de inferência.**
import { DominioContexto } from '../pertinencia/tipos';
import { classificarDeterministicamente } from '../pertinencia/classificador.service';
import { decidirPertinencia } from '../pertinencia/gate.service';

export interface MensagemDoHistorico {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Quais domínios a resposta do Conselheiro a ESTA pergunta pôde conter?
 *
 * `null` = não dá pra saber com certeza.
 *
 * SOUNDNESS: o que uma resposta do assistente pode conter é limitado pelo que
 * foi carregado naquele turno, e o que foi carregado é exatamente o que o gate
 * autorizou para a pergunta que a precedeu. Então os domínios da pergunta são
 * um teto seguro para o conteúdo da resposta.
 *
 * EXATIDÃO: `classificarDeterministicamente` é função PURA do texto. Se hoje
 * ela devolve X para aquela mensagem, ela devolveu X naquele dia — o
 * curto-circuito determinístico teria disparado antes de chegar no LLM. E
 * quando devolve `null`, foi o LLM que decidiu na época: isso não é
 * reconstruível sem uma nova chamada de IA, então o assunto entra como
 * desconhecido. Não há adivinhação em lugar nenhum.
 *
 * O check-in do dia NÃO entra: ele só sabe ESTREITAR (inclina `CONVERSA`/
 * `OUTRO` para acolhimento, cortando domínios), nunca alargar. Reconstruir sem
 * ele devolve o conjunto MAIS LARGO possível para aquela intenção — que é o
 * lado conservador, porque o filtro exige que os domínios CAIBAM nos de hoje.
 */
function dominiosDaPergunta(texto: string): readonly DominioContexto[] | null {
  const intencao = classificarDeterministicamente(texto);
  if (!intencao) return null;
  return decidirPertinencia(intencao, null, 'DETERMINISTICO').dominios;
}

/**
 * O histórico que este turno pode enviar ao provider.
 *
 * Determinístico, sem nenhuma chamada de IA e sem nenhuma consulta a mais: a
 * decisão sai de uma função pura sobre texto que já está em memória.
 *
 * **MENSAGEM DO VENDEDOR: sempre entra.** São as palavras da própria pessoa, e
 * apagá-las é a amnésia que a Constituição proíbe — "sobre aquilo que falei
 * ontem" precisa continuar funcionando. Se ela disse "acho que vendi uns 300",
 * isso é DECLARAÇÃO dela, não dado do sistema; o system prompt carrega essa
 * distinção explicitamente. O que a pessoa conta sobre a própria vida nunca foi
 * o risco aqui — o risco é o sistema devolver como fato o que ele mesmo apurou.
 *
 * **MENSAGEM DO CONSELHEIRO: entra só se couber na autorização de agora.** Ela
 * pode conter dado authoritative que o sistema apurou e entregou sob outra
 * autorização. Fora a regra é simples: os domínios que aquela resposta pôde
 * tocar têm que estar TODOS autorizados neste turno.
 *
 * Na dúvida, fica de fora — mesmo princípio de "em dúvida, silêncio comercial"
 * que governa toda falha de classificação desde a 2B.1. O custo de errar é
 * assimétrico: excluir uma fala do Conselheiro custa um pouco de fluidez;
 * incluir custa entregar um número que o turno de hoje proibiu.
 */
export function filtrarHistoricoAutorizado(
  mensagens: readonly MensagemDoHistorico[],
  dominiosAutorizados: readonly DominioContexto[]
): MensagemDoHistorico[] {
  const autorizados = new Set(dominiosAutorizados);
  const autorizadaAgora = (dominios: readonly DominioContexto[] | null) => dominios !== null && dominios.every((d) => autorizados.has(d));

  // Teto da última pergunta vista. Começa em `null`: uma resposta do
  // Conselheiro sem pergunta anterior na janela (a janela é bounded, então isso
  // acontece de verdade) é justamente o caso em que não se sabe nada.
  let tetoDaPerguntaAtual: readonly DominioContexto[] | null = null;

  return mensagens.filter((m) => {
    if (m.role === 'user') {
      tetoDaPerguntaAtual = dominiosDaPergunta(m.content);
      return true;
    }
    return autorizadaAgora(tetoDaPerguntaAtual);
  });
}
