// Classificador de intenção (Etapa 2B.1) — híbrido.
//
// REGRA CRÍTICA, e é a razão de a arquitetura funcionar: **este módulo nunca
// recebe KPI**. Ele vê a mensagem do vendedor e, no máximo, o check-in do dia.
// Não vê meta, realizado, gap, PA, ticket, ranking nem score.
//
// Consequência: o classificador não consegue "decidir mencionar o PA" porque
// nunca soube que existe um PA. Quem libera performance é o gate determinístico
// (`gate.service.ts`), a partir da intenção. O silêncio vira garantia
// arquitetural, não um pedido educado no prompt.
import { MoodCheckIn } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db';
import { createLogger } from '../utils/logger';
import { gerarViaGateway } from '../ai-platform/gateway.service';
import { DecisaoPertinencia, INTENCOES, Intencao } from './tipos';
import { decidirPertinencia, pertinenciaDeFallback } from './gate.service';

const log = createLogger('pertinencia:classificador');

/**
 * Pedido comercial EXPLÍCITO.
 *
 * Deliberadamente estreito — exige uma forma de pergunta/pedido, não só a
 * presença da palavra. "Estou frustrado com minhas vendas" é desabafo e **não**
 * pode casar aqui; "como estão minhas vendas?" pode. Um padrão largo
 * transformaria todo desabafo sobre trabalho numa resposta com número, que é
 * exatamente o produto que a Constituição proíbe.
 */
const PEDIDO_COMERCIAL = [
  /\bquanto\s+(falta|vendi|fiz|tenho)\b/i,
  /\bcomo\s+(est[áa]|est[ãa]o|t[áa]|t[ãa]o)\s+(a\s+)?(minha|meu|meus|minhas)\s+(meta|venda|vendas|pa|ticket|resultado|n[úu]mero|faturamento)/i,
  /\b(quero|queria|gostaria\s+de|preciso)\s+(saber|ver)\b.*\b(meta|venda|vendas|pa|ticket|resultado|n[úu]mero|faturamento)\b/i,
  /\bpor\s+que\b.*\bvendendo\s+menos\b/i,
  /\bfalta\s+(quanto|muito|pouco)\b.*\bmeta\b/i,
  // O vendedor NOMEOU o indicador. "Quero melhorar meu PA" é desenvolvimento e
  // comercial ao mesmo tempo — e quem nomeou o número tem direito a vê-lo.
  /\bmelhorar\s+(meu|minha)\s+(pa|ticket|meta|resultado|faturamento|venda|vendas)\b/i,
  // Ancorado no INÍCIO da mensagem. "Fala sério, tô desanimado com as vendas"
  // não é um pedido — e `fala`/`diz` são palavras de conversa comum em PT-BR,
  // então soltas no meio da frase elas transformavam desabafo em relatório.
  /^\s*(me\s+)?(mostra|mostre|me\s+diga|diz\s+a[íi])\b.*\b(meta|venda|vendas|pa|ticket|resultado|faturamento)\b/i,
  // Num app de vendas, "como estou hoje?" pergunta pelo dia — é o atalho que a
  // própria tela oferece. Ancorado no início e com complemento obrigatório:
  // "não sei como estou aguentando essa semana" é desabafo, não pergunta.
  /^\s*(e\s+a[íi],?\s*)?como\s+(estou|eu\s+estou|t[ôo]u?|to)\s*(indo\s+)?(hoje|na\s+meta|nas\s+vendas|no\s+dia|de\s+venda[s]?)?\s*\??$/i,
];

/**
 * Relato de estado pessoal — sem pedido embutido.
 *
 * Só usado quando NENHUM padrão comercial casou: a agência do vendedor vem
 * primeiro (Constituição §8). "Estou mal, mas quero saber quanto falta pra
 * meta" é comercial, não desabafo.
 */
const RELATO_PESSOAL = [
  /\b(n[ãa]o\s+(estou|t[ôo]u?|to)\s+(bem|legal|bom|boa))\b/i,
  // O advérbio no meio é como a pessoa realmente escreve ("estou BEM
  // desanimado", "tô MEIO triste") — sem isso, o exemplo canônico da própria
  // fatia não era reconhecido e dependia da IA estar no ar pra ser acolhido.
  //
  // Sem `\b` depois de vogal acentuada: em JS, `\b` é definido sobre
  // [A-Za-z0-9_], então `t[ôo]\b` NUNCA casa com "tô " — e "tô" é exatamente
  // como o vendedor escreve.
  /\b(estou|t[ôo]u?|to)\s+(\w+\s+)?(mal|triste|desanimad|exaust|cansad|frustrad|insegur|perdid|ansios|p[ée]ssim|acabad)/i,
  /\b(estou|t[ôo]u?|to)\s+sem\s+(ânimo|animo|energia|for[çc]a|cabe[çc]a)/i,
  /\bme\s+sinto\s+\w+/i,
  /\bn[ãa]o\s+(aguento|t[ôo]\s+aguentando|estou\s+aguentando|t[ôo]\s+dando\s+conta|estou\s+dando\s+conta)\b/i,
  /\b(dia|semana|m[êe]s)\s+(\w+\s+)?(dif[íi]cil|ruim|pesad|complicad|terr[íi]vel)/i,
  /\bqueria\s+(conversar|desabafar|falar\s+um\s+pouco)\b/i,
  /\bt[áa]\s+(dif[íi]cil|osso|pesado|foda|complicado)\b/i,
];

/**
 * Pedido de número tão explícito que atravessa até um desabafo na mesma frase.
 * Subconjunto estrito de PEDIDO_COMERCIAL — a agência do vendedor vem primeiro.
 */
const PEDIDO_INEQUIVOCO = [
  /\bquanto\s+(falta|vendi|fiz|tenho)\b/i,
  /\b(quero|queria|gostaria\s+de|preciso)\s+(saber|ver)\b.*\b(meta|venda|vendas|pa|ticket|resultado|n[úu]mero|faturamento)\b/i,
  /\bfalta\s+(quanto|muito|pouco)\b.*\bmeta\b/i,
];

/** Intenção clara de evoluir — sem pedir número. */
const PEDIDO_DESENVOLVIMENTO = [
  /\b(o\s+que|em\s+que|no\s+que)\b.*\b(preciso|devo|posso)\b.*\b(melhorar|evoluir|estudar|treinar|aprender)\b/i,
  /\b(quero|queria|gostaria\s+de|preciso)\s+(melhorar|evoluir|aprender|estudar|treinar|praticar)\b/i,
  /\bcomo\s+(posso|fa[çc]o\s+pra|eu\s+fa[çc]o\s+pra)\b.*\b(melhorar|evoluir|vender\s+melhor|aprender)\b/i,
  /\bo\s+que\s+(eu\s+)?(devo|posso)\s+estudar\b/i,
  // Pedido explícito de direção, sem nomear indicador.
  /\borganizar\s+(meu|o)\s+foco\b/i,
];

/**
 * Curto-circuito determinístico: resolve os casos óbvios sem gastar uma chamada
 * de IA. Devolve `null` quando a mensagem é ambígua — aí, e só aí, o LLM entra.
 *
 * Ordem importa: pedido comercial explícito vence relato pessoal, porque a
 * pessoa pediu (Constituição §8, caso B).
 */
export function classificarDeterministicamente(mensagem: string): Intencao | null {
  // RELATO PESSOAL é avaliado PRIMEIRO, de propósito.
  //
  // Quando os dois casam, o desabafo vence — "me ajuda, não tô dando conta das
  // vendas" é alguém pedindo socorro, não um relatório. O custo de errar aqui é
  // assimétrico: calar um número que era pertinente incomoda; despejar número
  // em cima de quem desabafou quebra a confiança, e a pessoa não volta.
  //
  // A exceção é o pedido inequívoco: quem escreve "quanto falta pra minha
  // meta?" está perguntando, mesmo tendo dito antes que está mal — é a agência
  // do vendedor (Constituição §8), coberta por `PEDIDO_INEQUIVOCO`.
  const desabafa = RELATO_PESSOAL.some((re) => re.test(mensagem));
  const pedeNumero = PEDIDO_COMERCIAL.some((re) => re.test(mensagem));

  if (pedeNumero && (!desabafa || PEDIDO_INEQUIVOCO.some((re) => re.test(mensagem)))) return 'DUVIDA_COMERCIAL';
  if (desabafa) return 'DESABAFO';
  if (PEDIDO_DESENVOLVIMENTO.some((re) => re.test(mensagem))) return 'DESENVOLVIMENTO';
  return null;
}

const saidaSchema = z.object({ intencao: z.enum(INTENCOES) });

/**
 * Extrai o primeiro objeto JSON do texto.
 *
 * Provider real costuma embrulhar a resposta em cerca de markdown
 * (```json ... ```). Sem isto, `JSON.parse` lança, a classificação cai em
 * fallback e o produto roda quase sempre em silêncio comercial — sem erro
 * visível, porque o fallback é, por desenho, silencioso.
 */
function extrairJson(texto: string): unknown {
  const inicio = texto.indexOf('{');
  const fim = texto.lastIndexOf('}');
  if (inicio === -1 || fim <= inicio) throw new SyntaxError('nenhum objeto JSON na resposta do classificador');
  return JSON.parse(texto.slice(inicio, fim + 1));
}

const SYSTEM_PROMPT_CLASSIFICADOR = `Você classifica a INTENÇÃO de uma mensagem de um vendedor de varejo para o conselheiro dele.

Responda APENAS com JSON: { "intencao": "<uma das opções>" }

Opções:
- DESABAFO: relata cansaço, frustração, desânimo, insegurança ou quer só ser ouvido.
- CONVERSA: conversa aberta, cumprimento, assunto solto, sem pedido claro.
- DUVIDA_COMERCIAL: PEDE explicitamente os próprios números — meta, vendas, faturamento, PA, ticket, resultado.
- DESENVOLVIMENTO: quer evoluir, melhorar, aprender, treinar, saber o que estudar.
- CELEBRACAO: conta algo bom que conseguiu.
- OUTRO: não se encaixa em nenhuma acima.

Regras:
- Mencionar vendas ao desabafar NÃO é DUVIDA_COMERCIAL. "Estou frustrado com minhas vendas" é DESABAFO.
- Só use DUVIDA_COMERCIAL quando houver pedido ou pergunta de fato.
- Classifique apenas. Não responda ao vendedor, não dê conselho, não cite dados.`;

/**
 * Registra o custo da classificação no ledger da empresa.
 *
 * `verificarBudgetMensal` soma `AIUsage`; sem isto, cada mensagem gastaria duas
 * chamadas de provider e o orçamento contaria uma — subcontagem sistemática.
 * Atribuído a `COACH` de propósito: não é outro produto, é o custo da mesma
 * interação (mesmo raciocínio que o "testar conexão" do Admin usava antes de
 * ganhar categoria própria). Categoria dedicada exigiria migration de enum.
 *
 * Nunca lança: contabilidade não pode derrubar a conversa.
 */
async function registrarCusto(
  params: { empresaId: string; vendedorId: string },
  resultado: { provider: string; model: string; inputTokens: number; outputTokens: number; latencyMs: number },
  custoUSD: number
): Promise<void> {
  try {
    await prisma.aIUsage.create({
      data: {
        empresaId: params.empresaId,
        vendedorId: params.vendedorId,
        specialist: 'COACH',
        provider: resultado.provider,
        model: resultado.model,
        inputTokens: resultado.inputTokens,
        outputTokens: resultado.outputTokens,
        estimatedCostUSD: custoUSD,
        latencyMs: resultado.latencyMs,
        status: 'SUCESSO',
      },
    });
  } catch (err) {
    log.warn({ err, vendedorId: params.vendedorId }, 'falha ao registrar custo da classificação');
  }
}

/**
 * Classifica a intenção e devolve a decisão de pertinência já resolvida.
 *
 * Nunca lança: qualquer falha (provider fora, timeout, budget, JSON inválido,
 * enum inválido) vira `pertinenciaDeFallback`, que mantém a conversa viva e
 * **não libera performance**.
 */
export async function classificarIntencao(params: {
  empresaId: string;
  vendedorId: string;
  mensagem: string;
  checkin: MoodCheckIn | null;
}): Promise<DecisaoPertinencia> {
  const determinística = classificarDeterministicamente(params.mensagem);
  if (determinística) return decidirPertinencia(determinística, params.checkin, 'DETERMINISTICO');

  try {
    const { resultado, custoUSD } = await gerarViaGateway({
      empresaId: params.empresaId,
      systemPrompt: SYSTEM_PROMPT_CLASSIFICADOR,
      // Só a mensagem. Sem KPI, sem histórico, sem contexto do vendedor.
      messages: [{ role: 'user', content: params.mensagem }],
      metadata: { specialist: 'intent_classifier' },
    });

    // O custo entra no MESMO ledger do Conselheiro. Fora do caminho de decisão
    // de propósito: uma falha de ESCRITA não pode descartar uma classificação
    // que deu certo e mandar a conversa pro silêncio comercial.
    await registrarCusto(params, resultado, custoUSD);

    const parsed = saidaSchema.safeParse(extrairJson(resultado.content));
    if (!parsed.success) {
      log.warn({ vendedorId: params.vendedorId }, 'classificador devolveu saída inválida — caindo no silêncio comercial');
      return pertinenciaDeFallback(params.checkin);
    }

    return decidirPertinencia(parsed.data.intencao, params.checkin, 'LLM');
  } catch (err) {
    // Inclui provider indisponível, timeout, budget estourado e JSON malformado.
    log.warn({ err, vendedorId: params.vendedorId }, 'classificação de intenção falhou — caindo no silêncio comercial');
    return pertinenciaDeFallback(params.checkin);
  }
}
