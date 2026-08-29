// Orquestração de conversas do Treinador (seções 3-27 da Fatia 5). Espelha a
// arquitetura do Coach (Fatia 4) de propósito — mesma ownership IDOR-safe,
// idempotência, rate limit, budget e lock de concorrência — sem generalizar
// numa tabela única `AIConversation` (ver Decisão 18): o benefício de
// generalizar agora não supera o risco de tocar as tabelas do Coach já em
// produção. Ownership/idempotência/lock/budget são todos aplicados aqui —
// nunca no frontend, nunca no LLM.
import { ModoTreinador, Prisma, RoleMensagemTreinador } from '@prisma/client';
import { prisma } from '../db';
import { env } from '../config';
import { aiProvider, AIProviderError } from '../ai-platform/providers';
import { calcularCustoEstimadoUSD } from '../ai-platform/custo';
import { verificarBudgetMensal } from '../ai-platform/budget.service';
import { buildTrainerContext } from './context-builder.service';
import { getSystemPrompt } from './prompts/system-prompt';
import { formatarContextoParaPrompt } from './prompts/context-formatter';
import { verificarRateLimitDiario } from './limites.service';
import { createLogger } from '../utils/logger';

const log = createLogger('treinador:conversation');

export type TrainerErrorType =
  | 'not_found'
  | 'message_too_long'
  | 'rate_limited'
  | 'budget_exceeded'
  | 'generation_in_progress'
  | 'provider_unavailable';

export class TrainerError extends Error {
  constructor(
    public type: TrainerErrorType,
    message: string
  ) {
    super(message);
  }
}

async function getVendedor(vendedorId: string) {
  return prisma.vendedor.findUniqueOrThrow({ where: { id: vendedorId } });
}

// Mesma lição da Fatia 4 (security review): findFirst+create/updateMany+create
// não são atômicos — o índice único parcial (schema.prisma, migração
// 20260829223048) barra a 2ª criação; aqui tratamos a corrida como caminho
// normal, devolvendo a conversa que venceu — nunca um erro pro vendedor.
function isViolacaoConversaAbertaDuplicada(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

export async function getOrCreateConversaAtual(vendedorId: string) {
  const aberta = await prisma.trainerConversation.findFirst({
    where: { vendedorId, status: 'ABERTA' },
    orderBy: { startedAt: 'desc' },
  });
  if (aberta) return aberta;

  const vendedor = await getVendedor(vendedorId);
  try {
    return await prisma.trainerConversation.create({
      data: { empresaId: vendedor.empresaId, lojaId: vendedor.lojaId, vendedorId },
    });
  } catch (err) {
    if (!isViolacaoConversaAbertaDuplicada(err)) throw err;
    return prisma.trainerConversation.findFirstOrThrow({ where: { vendedorId, status: 'ABERTA' }, orderBy: { startedAt: 'desc' } });
  }
}

export async function criarNovaConversa(vendedorId: string) {
  const vendedor = await getVendedor(vendedorId);
  await prisma.trainerConversation.updateMany({
    where: { vendedorId, status: 'ABERTA' },
    data: { status: 'ENCERRADA', closedAt: new Date() },
  });
  try {
    return await prisma.trainerConversation.create({
      data: { empresaId: vendedor.empresaId, lojaId: vendedor.lojaId, vendedorId },
    });
  } catch (err) {
    if (!isViolacaoConversaAbertaDuplicada(err)) throw err;
    return prisma.trainerConversation.findFirstOrThrow({ where: { vendedorId, status: 'ABERTA' }, orderBy: { startedAt: 'desc' } });
  }
}

async function getConversaComOwnership(conversationId: string, vendedorId: string) {
  const conversa = await prisma.trainerConversation.findUnique({ where: { id: conversationId } });
  // Mesmo erro (not_found) tanto pra "não existe" quanto "não é sua conversa"
  // — nunca revela a um vendedor que a conversa de outro existe (IDOR-safe).
  if (!conversa || conversa.vendedorId !== vendedorId) {
    throw new TrainerError('not_found', 'conversa não encontrada');
  }
  return conversa;
}

export async function listarMensagens(conversationId: string, vendedorId: string) {
  await getConversaComOwnership(conversationId, vendedorId);
  return prisma.trainerMessage.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' } });
}

export interface EnviarMensagemInput {
  conversationId: string;
  vendedorId: string;
  content: string;
  mode: ModoTreinador;
  objection?: string | null;
  situation?: string | null;
  clientMessageId?: string;
}

/**
 * Envia uma mensagem do vendedor e retorna a resposta do Treinador. Aplica,
 * nesta ordem: ownership, tamanho, idempotência (clientMessageId), rate
 * limit diário, budget mensal, lock de "1 geração por vez" na conversa.
 */
export async function enviarMensagem(input: EnviarMensagemInput) {
  const { conversationId, vendedorId, content, mode, objection, situation, clientMessageId } = input;
  await getConversaComOwnership(conversationId, vendedorId);

  if (content.length > env.AI_MAX_INPUT_CHARS) {
    throw new TrainerError('message_too_long', `mensagem excede o limite de ${env.AI_MAX_INPUT_CHARS} caracteres`);
  }

  // Idempotência: mesma clientMessageId já processada nesta conversa -> retorna
  // a resposta já gerada, nunca chama o provider (nem cobra) de novo.
  if (clientMessageId) {
    const existente = await prisma.trainerMessage.findUnique({
      where: { conversationId_clientMessageId: { conversationId, clientMessageId } },
    });
    if (existente) {
      const resposta = await prisma.trainerMessage.findFirst({
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
    throw new TrainerError('rate_limited', `limite de ${rateLimit.limite} mensagens/dia atingido`);
  }

  const budget = await verificarBudgetMensal(vendedor.empresaId);
  if (!budget.permitido) {
    throw new TrainerError('budget_exceeded', 'o Treinador está temporariamente indisponível por limite de uso da empresa — tente de novo amanhã');
  }

  // Lock de sequenciamento: só libera se conseguir marcar geracaoEmAndamento
  // false->true atomicamente (update condicional, não read-then-write).
  const lock = await prisma.trainerConversation.updateMany({
    where: { id: conversationId, geracaoEmAndamento: false },
    data: { geracaoEmAndamento: true },
  });
  if (lock.count === 0) {
    throw new TrainerError('generation_in_progress', 'já há uma resposta sendo gerada nesta conversa — aguarde');
  }

  try {
    const mensagemUsuario = clientMessageId
      ? await prisma.trainerMessage.upsert({
          where: { conversationId_clientMessageId: { conversationId, clientMessageId } },
          create: { conversationId, role: 'USER', content, clientMessageId, mode, objection: objection ?? null },
          update: {},
        })
      : await prisma.trainerMessage.create({ data: { conversationId, role: 'USER', content, mode, objection: objection ?? null } });

    const { context: contexto, playbookId } = await buildTrainerContext(vendedorId, { mode, objection, situation });
    const systemPrompt = `${getSystemPrompt()}\n\n${formatarContextoParaPrompt(contexto)}`;

    const historico = await prisma.trainerMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: env.AI_CONVERSATION_WINDOW,
    });
    const mensagensParaProvider = historico.reverse().map((m) => ({ role: mapRole(m.role), content: m.content }));

    let resultado;
    try {
      resultado = await aiProvider.generateResponse({
        systemPrompt,
        messages: mensagensParaProvider,
        metadata: { specialist: 'trainer', context: contexto },
      });
    } catch (err) {
      await registrarFalhaUso(vendedor.empresaId, vendedorId, conversationId, err);
      throw new TrainerError('provider_unavailable', 'o Treinador está indisponível no momento — tente de novo em instantes');
    }

    const custoUSD = resultado.provider === 'mock' ? 0 : calcularCustoEstimadoUSD(resultado.model, resultado.inputTokens, resultado.outputTokens);

    const mensagemAssistente = await prisma.trainerMessage.create({
      data: {
        conversationId,
        role: 'ASSISTANT',
        content: resultado.content,
        playbookVersionId: playbookId,
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
        specialist: 'TRAINER',
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
    await prisma.trainerConversation.update({ where: { id: conversationId }, data: { geracaoEmAndamento: false } });
  }

  function mapRole(role: RoleMensagemTreinador): 'user' | 'assistant' {
    return role === 'USER' ? 'user' : 'assistant';
  }
}

async function registrarFalhaUso(empresaId: string, vendedorId: string, conversationId: string, err: unknown) {
  const status = err instanceof AIProviderError && err.type === 'timeout' ? 'TIMEOUT' : 'ERRO';
  log.error({ err, vendedorId, conversationId }, 'falha ao gerar resposta do Treinador');
  try {
    await prisma.aIUsage.create({
      data: {
        empresaId,
        vendedorId,
        specialist: 'TRAINER',
        conversationId,
        provider: env.AI_PROVIDER,
        model: env.AI_MODEL,
        estimatedCostUSD: 0,
        status,
      },
    });
  } catch (usageErr) {
    log.error({ usageErr }, 'falha ao registrar AIUsage de erro — não bloqueia a resposta de erro ao vendedor');
  }
}
