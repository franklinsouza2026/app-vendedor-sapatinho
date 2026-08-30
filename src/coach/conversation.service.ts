// Orquestração de conversas do Coach (seções 8, 18-22 da fonte de verdade).
// Ownership (tenant/seller isolation), idempotência, sequenciamento, rate
// limit e budget são todos aplicados aqui — nunca no frontend, nunca no LLM.
import { Prisma, RoleMensagemCoach } from '@prisma/client';
import { prisma } from '../db';
import { env } from '../config';
import { AIProviderError } from '../ai-platform/providers';
import { gerarViaGateway, providerEModeloParaTelemetria } from '../ai-platform/gateway.service';
import { verificarBudgetMensal } from '../ai-platform/budget.service';
import { buildCoachContext } from './context-builder.service';
import { getSystemPrompt } from './prompts/system-prompt';
import { formatarContextoParaPrompt } from './prompts/context-formatter';
import { verificarRateLimitDiario } from './limites.service';
import { createLogger } from '../utils/logger';

const log = createLogger('coach:conversation');

export type CoachErrorType =
  | 'not_found'
  | 'message_too_long'
  | 'rate_limited'
  | 'budget_exceeded'
  | 'generation_in_progress'
  | 'provider_unavailable';

export class CoachError extends Error {
  constructor(
    public type: CoachErrorType,
    message: string
  ) {
    super(message);
  }
}

async function getVendedor(vendedorId: string) {
  return prisma.vendedor.findUniqueOrThrow({ where: { id: vendedorId } });
}

// findFirst+create (e updateMany+create abaixo) não são atômicos — 2 chamadas
// concorrentes podiam criar 2 conversas ABERTA pro mesmo vendedor, cada uma
// com seu próprio lock de geração, furando rate limit/budget via mensagens em
// paralelo em conversas diferentes (achado de security review). O índice
// único parcial (schema.prisma, migração 20260829210614) barra a 2ª criação;
// aqui só tratamos essa corrida como caminho normal, devolvendo a conversa
// que de fato venceu — nunca um erro pro vendedor.
function isViolacaoConversaAbertaDuplicada(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

export async function getOrCreateConversaAtual(vendedorId: string) {
  const aberta = await prisma.coachConversation.findFirst({
    where: { vendedorId, status: 'ABERTA' },
    orderBy: { startedAt: 'desc' },
  });
  if (aberta) return aberta;

  const vendedor = await getVendedor(vendedorId);
  try {
    return await prisma.coachConversation.create({
      data: { empresaId: vendedor.empresaId, lojaId: vendedor.lojaId, vendedorId },
    });
  } catch (err) {
    if (!isViolacaoConversaAbertaDuplicada(err)) throw err;
    return prisma.coachConversation.findFirstOrThrow({ where: { vendedorId, status: 'ABERTA' }, orderBy: { startedAt: 'desc' } });
  }
}

export async function criarNovaConversa(vendedorId: string) {
  const vendedor = await getVendedor(vendedorId);
  await prisma.coachConversation.updateMany({
    where: { vendedorId, status: 'ABERTA' },
    data: { status: 'ENCERRADA', closedAt: new Date() },
  });
  try {
    return await prisma.coachConversation.create({
      data: { empresaId: vendedor.empresaId, lojaId: vendedor.lojaId, vendedorId },
    });
  } catch (err) {
    if (!isViolacaoConversaAbertaDuplicada(err)) throw err;
    return prisma.coachConversation.findFirstOrThrow({ where: { vendedorId, status: 'ABERTA' }, orderBy: { startedAt: 'desc' } });
  }
}

async function getConversaComOwnership(conversationId: string, vendedorId: string) {
  const conversa = await prisma.coachConversation.findUnique({ where: { id: conversationId } });
  // Mesmo erro (not_found) tanto pra "não existe" quanto "não é sua conversa"
  // — nunca revela a um vendedor que a conversa de outro existe (IDOR-safe).
  if (!conversa || conversa.vendedorId !== vendedorId) {
    throw new CoachError('not_found', 'conversa não encontrada');
  }
  return conversa;
}

export async function listarMensagens(conversationId: string, vendedorId: string) {
  await getConversaComOwnership(conversationId, vendedorId);
  return prisma.coachMessage.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' } });
}

/**
 * Envia uma mensagem do vendedor e retorna a resposta do Coach. Aplica, nesta
 * ordem: ownership, tamanho, idempotência (clientMessageId), rate limit
 * diário, budget mensal, lock de "1 geração por vez" na conversa.
 */
export async function enviarMensagem(conversationId: string, vendedorId: string, content: string, clientMessageId?: string) {
  await getConversaComOwnership(conversationId, vendedorId);

  if (content.length > env.AI_MAX_INPUT_CHARS) {
    throw new CoachError('message_too_long', `mensagem excede o limite de ${env.AI_MAX_INPUT_CHARS} caracteres`);
  }

  // Idempotência: mesma clientMessageId já processada nesta conversa -> retorna
  // a resposta já gerada, nunca chama o provider (nem cobra) de novo.
  if (clientMessageId) {
    const existente = await prisma.coachMessage.findUnique({
      where: { conversationId_clientMessageId: { conversationId, clientMessageId } },
    });
    if (existente) {
      const resposta = await prisma.coachMessage.findFirst({
        where: { conversationId, role: 'ASSISTANT', createdAt: { gt: existente.createdAt } },
        orderBy: { createdAt: 'asc' },
      });
      if (resposta) return resposta;
      // mensagem do usuário já gravada mas a geração ainda não terminou/falhou —
      // segue o fluxo normal abaixo (idempotência de negócio, não de rede pura)
    }
  }

  const vendedor = await getVendedor(vendedorId);

  const rateLimit = await verificarRateLimitDiario(vendedorId, vendedor.empresaId);
  if (!rateLimit.permitido) {
    throw new CoachError('rate_limited', `limite de ${rateLimit.limite} mensagens/dia atingido`);
  }

  const budget = await verificarBudgetMensal(vendedor.empresaId);
  if (!budget.permitido) {
    throw new CoachError('budget_exceeded', 'o Coach está temporariamente indisponível por limite de uso da empresa — tente de novo amanhã');
  }

  // Lock de sequenciamento: só libera se conseguir marcar geracaoEmAndamento
  // false->true atomicamente (update condicional, não read-then-write).
  const lock = await prisma.coachConversation.updateMany({
    where: { id: conversationId, geracaoEmAndamento: false },
    data: { geracaoEmAndamento: true },
  });
  if (lock.count === 0) {
    throw new CoachError('generation_in_progress', 'já há uma resposta sendo gerada nesta conversa — aguarde');
  }

  try {
    // upsert só quando clientMessageId é fornecido: o índice composto único é
    // sobre (conversationId, clientMessageId), e usar undefined/null como
    // "chave de busca" no upsert do Prisma não é confiável para campos
    // nullable em unique compostos — sem clientMessageId, sempre cria nova.
    const mensagemUsuario = clientMessageId
      ? await prisma.coachMessage.upsert({
          where: { conversationId_clientMessageId: { conversationId, clientMessageId } },
          create: { conversationId, role: 'USER', content, clientMessageId },
          update: {},
        })
      : await prisma.coachMessage.create({ data: { conversationId, role: 'USER', content } });

    // Fecha uma janela de corrida estreita (achado LOW aceito na Fatia 4,
    // revisitado na Fatia 6): entre o check de idempotência acima (antes do
    // lock) e agora, outra chamada concorrente com a MESMA clientMessageId
    // pode ter terminado de gerar a resposta — sem este re-check, esta
    // chamada chamaria o provider de novo (custo duplicado) mesmo já
    // existindo uma resposta pronta pra essa mensagem.
    if (clientMessageId) {
      const respostaJaGerada = await prisma.coachMessage.findFirst({
        where: { conversationId, role: 'ASSISTANT', createdAt: { gt: mensagemUsuario.createdAt } },
        orderBy: { createdAt: 'asc' },
      });
      if (respostaJaGerada) return respostaJaGerada;
    }

    const contexto = await buildCoachContext(vendedorId);
    const systemPrompt = `${getSystemPrompt()}\n\n${formatarContextoParaPrompt(contexto)}`;

    const historico = await prisma.coachMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: env.AI_CONVERSATION_WINDOW,
    });
    const mensagensParaProvider = historico
      .reverse()
      .map((m) => ({ role: mapRole(m.role), content: m.content }));

    let resultado, custoUSD;
    try {
      ({ resultado, custoUSD } = await gerarViaGateway({
        empresaId: vendedor.empresaId,
        systemPrompt,
        messages: mensagensParaProvider,
        metadata: { specialist: 'coach', context: contexto },
      }));
    } catch (err) {
      await registrarFalhaUso(vendedor.empresaId, vendedorId, conversationId, err);
      throw new CoachError('provider_unavailable', 'o Coach está indisponível no momento — tente de novo em instantes');
    }

    const mensagemAssistente = await prisma.coachMessage.create({
      data: {
        conversationId,
        role: 'ASSISTANT',
        content: resultado.content,
        provider: resultado.provider,
        model: resultado.model,
        inputTokens: resultado.inputTokens,
        outputTokens: resultado.outputTokens,
        estimatedCostUSD: custoUSD,
        latencyMs: resultado.latencyMs,
      },
    });

    await prisma.aIUsage.create({
      data: {
        empresaId: vendedor.empresaId,
        vendedorId,
        conversationId,
        messageId: mensagemAssistente.id,
        provider: resultado.provider,
        model: resultado.model,
        inputTokens: resultado.inputTokens,
        outputTokens: resultado.outputTokens,
        estimatedCostUSD: custoUSD,
        latencyMs: resultado.latencyMs,
        status: 'SUCESSO',
      },
    });

    void mensagemUsuario; // já persistida acima; mantido só pra clareza do fluxo
    return mensagemAssistente;
  } finally {
    await prisma.coachConversation.update({ where: { id: conversationId }, data: { geracaoEmAndamento: false } });
  }

  function mapRole(role: RoleMensagemCoach): 'user' | 'assistant' {
    return role === 'USER' ? 'user' : 'assistant';
  }
}

async function registrarFalhaUso(empresaId: string, vendedorId: string, conversationId: string, err: unknown) {
  const status = err instanceof AIProviderError && err.type === 'timeout' ? 'TIMEOUT' : 'ERRO';
  log.error({ err, vendedorId, conversationId }, 'falha ao gerar resposta do Coach');
  try {
    // Reflete o provider/modelo REALMENTE configurado pra esta empresa (Fatia
    // 7.5B) — nunca mais sempre env.AI_PROVIDER/env.AI_MODEL, que ficaria
    // errado assim que uma empresa configurar um provider diferente.
    const { provider, model } = await providerEModeloParaTelemetria(empresaId);
    await prisma.aIUsage.create({
      data: {
        empresaId,
        vendedorId,
        conversationId,
        provider,
        model,
        estimatedCostUSD: 0,
        status,
      },
    });
  } catch (usageErr) {
    log.error({ usageErr }, 'falha ao registrar AIUsage de erro — não bloqueia a resposta de erro ao vendedor');
  }
}
