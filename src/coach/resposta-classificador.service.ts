// Classificador de resposta a uma sugestão (Etapa 2B.2).
//
// O vendedor conversa naturalmente — "agora não", "depois eu faço", "vou
// fazer", "já fiz". Não há botão de aceitar/recusar na tela, e isso é decisão
// de produto: a conversa tem que continuar parecendo conversa.
//
// REGRA CRÍTICA: **AMBIGUIDADE NÃO ALTERA ESTADO.** "Talvez", "vamos ver",
// "quem sabe" ficam em `INDETERMINADO`. Ausência de resposta não é recusa.
// Mudança de assunto não é recusa. O custo de errar é assimétrico: deixar uma
// sugestão aberta por mais um dia é inofensivo; marcar como recusado o que a
// pessoa não recusou apaga da memória algo que ela ainda queria.
//
// Mesmo desenho do classificador de intenção da 2B.1: curto-circuito
// determinístico primeiro, LLM só no ambíguo, contrato fechado validado por
// Zod, e fallback que NÃO muda nada.
import { z } from 'zod';
import { prisma } from '../db';
import { createLogger } from '../utils/logger';
import { gerarViaGateway } from '../ai-platform/gateway.service';

const log = createLogger('coach:resposta');

export const RESPOSTAS = ['ACEITOU', 'RECUSOU', 'ADIOU', 'DECLAROU_CONCLUSAO', 'INDETERMINADO'] as const;
export type RespostaASugestao = (typeof RESPOSTAS)[number];

/**
 * "Vou fazer." — compromisso, não conclusão.
 *
 * `bora`/`vamos` soltos saíram: "vamos falar de outra coisa" e "vamos combinar
 * assim" são conversa comum, e viravam aceite de uma sugestão que ninguém
 * aceitou. `posso ver` idem.
 */
const ACEITE = [
  /\b(vou|irei)\s+(fazer|tentar|come[çc]ar|praticar|estudar)\b/i,
  /^\s*(bora|partiu|fechado|combinado|beleza|blz|ok|t[áa]\s+bom|show|perfeito|aceito|topo)\s*[.!]?\s*$/i,
  /\b(pode\s+deixar|t[ôo]\s+dentro|vou\s+nessa)\b/i,
];

/**
 * "Depois eu faço." — adiamento SEM data. Nenhum prazo é inventado.
 *
 * Avaliado ANTES da recusa: as formas mais comuns de adiar em PT-BR começam
 * com negação ("não vou conseguir hoje", "agora não dá"). Lê-las como recusa
 * gravaria estado TERMINAL onde a pessoa só pediu tempo.
 */
const ADIAMENTO = [
  /\b(depois|mais\s+tarde|amanh[ãa]|semana\s+que\s+vem|outro\s+dia|qualquer\s+hora)\b.*\b(fa[çc]o|vejo|tento|olho)\b/i,
  /\b(fa[çc]o|vejo|tento|olho)\b.*\b(depois|mais\s+tarde|amanh[ãa]|outro\s+dia)\b/i,
  /\b(agora|hoje)\s+n[ãa]o\s+(d[áa]|vai\s+dar|consigo|rola)\b/i,
  /\bn[ãa]o\s+(vou|vai)\s+(conseguir|dar)\b/i,
  /\b(t[ôo]|estou)\s+sem\s+tempo\b/i,
  /\bfica\s+(pra|para)\s+(depois|amanh[ãa]|semana)/i,
];

/**
 * "Não quero fazer isso." — recusa DESTA sugestão, nunca preferência permanente.
 *
 * Deliberadamente estreito. Cada exclusão abaixo saiu porque produzia recusa
 * TERMINAL em conversa comum (casos medidos executando o classificador):
 * - `passo` capturava "me explica o passo a passo" — a expressão mais provável
 *   num app de treinamento de vendas;
 * - `hoje não`/`agora não` soltos capturavam "hoje não vendi nada", que é
 *   desabafo, e "agora não dá", que é adiamento;
 * - `não vou` solto capturava "não vou conseguir hoje";
 * - `esquece` solto capturava "esquece o que eu falei";
 * - `não gosto`/`não preciso` soltos capturavam "não gosto quando o cliente
 *   some" e "não preciso de mais pressão hoje".
 *
 * Recusa exige OBJETO: a pessoa tem que dizer que não quer *aquilo*.
 */
const RECUSA = [
  /\bn[ãa]o\s+(quero|pretendo|tenho\s+interesse)\b/i,
  /^\s*n[ãa]o[.!]?\s*$/i,
  /\b(dessa\s+vez\s+n[ãa]o|prefiro\s+n[ãa]o|passo\s+essa|deixa\s+pra\s+l[áa]\s+isso)\b/i,
  /\bn[ãa]o\s+(vai|v[ãa]o)\s+(me\s+)?ajudar\b/i,
  /\bn[ãa]o\s+[ée]\s+(isso|meu\s+problema|por\s+a[íi])\b/i,
];

/** "Já fiz." — DECLARAÇÃO. Só vira conclusão se houver fato de sistema. */
const DECLARACAO_CONCLUSAO = [
  /\b(j[áa]\s+(fiz|conclu[íi]|terminei|acabei|assisti|respondi|treinei))\b/i,
  /\b(fiz|conclu[íi]|terminei)\s+(isso|aquilo|a\s+aula|a\s+simula[çc][ãa]o|o\s+quiz)\b/i,
  /\bacabei\s+de\s+(fazer|concluir|terminar)\b/i,
];

/**
 * Ambiguidade EXPLÍCITA — tem precedência sobre tudo.
 *
 * "Talvez eu faça" casaria com o padrão de aceite (`vou fazer`) e viraria
 * compromisso que a pessoa não assumiu. Estas expressões travam a classificação
 * em `INDETERMINADO` antes de qualquer outra regra.
 */
const AMBIGUIDADE = [/\b(talvez|quem\s+sabe|vamos\s+ver|veremos|pode\s+ser\s+que|n[ãa]o\s+sei)\b/i];

/**
 * Curto-circuito determinístico. `null` = ambíguo, decide o LLM.
 *
 * Ordem: ambiguidade trava tudo; depois recusa e adiamento (as duas formas de
 * "não agora", que não podem ser lidas como aceite); depois declaração de
 * conclusão; por último o aceite, que é o padrão mais largo.
 */
export function classificarRespostaDeterministicamente(mensagem: string): RespostaASugestao | null {
  if (AMBIGUIDADE.some((re) => re.test(mensagem))) return 'INDETERMINADO';
  // ADIAMENTO antes de RECUSA: na dúvida entre as duas, fica a REVERSÍVEL.
  if (ADIAMENTO.some((re) => re.test(mensagem))) return 'ADIOU';
  if (RECUSA.some((re) => re.test(mensagem))) return 'RECUSOU';
  if (DECLARACAO_CONCLUSAO.some((re) => re.test(mensagem))) return 'DECLAROU_CONCLUSAO';
  if (ACEITE.some((re) => re.test(mensagem))) return 'ACEITOU';
  return null;
}

const saidaSchema = z.object({ resposta: z.enum(RESPOSTAS) });

const SYSTEM_PROMPT = `Você classifica como um vendedor respondeu a uma sugestão que o conselheiro dele fez.

Responda APENAS com JSON: { "resposta": "<uma das opções>" }

Opções:
- ACEITOU: diz que vai fazer.
- RECUSOU: diz que não quer fazer.
- ADIOU: diz que faz depois, sem recusar.
- DECLAROU_CONCLUSAO: diz que já fez.
- INDETERMINADO: qualquer outra coisa.

Regras:
- Na dúvida, use INDETERMINADO. É sempre a resposta segura.
- "Talvez", "vamos ver", "quem sabe" são INDETERMINADO, nunca ACEITOU.
- Mudar de assunto é INDETERMINADO, nunca RECUSOU.
- Não responda ao vendedor. Só classifique.`;

/** Extrai o primeiro objeto JSON — provider real costuma embrulhar em cerca de markdown. */
function extrairJson(texto: string): unknown {
  const inicio = texto.indexOf('{');
  const fim = texto.lastIndexOf('}');
  if (inicio === -1 || fim <= inicio) throw new SyntaxError('nenhum objeto JSON na resposta do classificador');
  return JSON.parse(texto.slice(inicio, fim + 1));
}

/**
 * Registra o custo da classificação no ledger da empresa.
 *
 * Atribuído a `COACH`: não é outro produto, é o custo da mesma interação.
 * Nunca lança — contabilidade não pode derrubar a conversa nem descartar uma
 * classificação que deu certo.
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
    log.warn({ err, vendedorId: params.vendedorId }, 'falha ao registrar custo da classificação de resposta');
  }
}

/**
 * Classifica a resposta do vendedor.
 *
 * Nunca lança: qualquer falha vira `INDETERMINADO`, que por definição não muda
 * estado nenhum. O pior caso de uma indisponibilidade é a sugestão continuar
 * aberta — nunca um estado errado gravado.
 */
export async function classificarResposta(params: { empresaId: string; vendedorId: string; mensagem: string }): Promise<RespostaASugestao> {
  const determinística = classificarRespostaDeterministicamente(params.mensagem);
  if (determinística) return determinística;

  try {
    const { resultado, custoUSD } = await gerarViaGateway({
      empresaId: params.empresaId,
      systemPrompt: SYSTEM_PROMPT,
      // Só a mensagem — o classificador não vê KPI, memória nem histórico.
      messages: [{ role: 'user', content: params.mensagem }],
      metadata: { specialist: 'response_classifier' },
    });

    // Mesmo ledger do Conselheiro. Sem isto, uma mensagem gastaria até três
    // chamadas de provider (resposta + intenção + coach) e o orçamento contaria
    // duas — subcontagem sistemática, exatamente o achado corrigido na 2B.1
    // para o classificador de intenção.
    await registrarCusto(params, resultado, custoUSD);

    const parsed = saidaSchema.safeParse(extrairJson(resultado.content));
    if (!parsed.success) {
      log.warn({ vendedorId: params.vendedorId }, 'classificador de resposta devolveu saída inválida — estado preservado');
      return 'INDETERMINADO';
    }
    return parsed.data.resposta;
  } catch (err) {
    log.warn({ err, vendedorId: params.vendedorId }, 'classificação de resposta falhou — estado preservado');
    return 'INDETERMINADO';
  }
}
