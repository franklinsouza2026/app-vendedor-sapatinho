// Orquestração de sessões do Simulador (Fatia 6). Espelha deliberadamente a
// arquitetura do Coach/Treinador (Fatias 4/5): ownership IDOR-safe,
// idempotência via clientMessageId, rate limit, budget, lock de concorrência
// via índice único parcial + fallback gracioso — mas com um fluxo adicional
// que eles não têm: transição de estado automática ao fim dos turnos e
// avaliação estruturada pós-sessão, com recompensa determinística.
import { DificuldadeSimulacao, Prisma, RoleMensagemSimulacao, StatusSimulacao } from '@prisma/client';
import { prisma } from '../db';
import { env } from '../config';
import { AIProviderError } from '../ai-platform/providers';
import { gerarViaGateway, providerEModeloParaTelemetria } from '../ai-platform/gateway.service';
import { verificarBudgetMensal } from '../ai-platform/budget.service';
import { resolverCenario } from './scenario.service';
import { buildSimulationContext, buildEvaluationContext } from './context-builder.service';
import { getSystemPromptCliente } from './prompts/system-prompt-cliente';
import { getSystemPromptAvaliador } from './prompts/system-prompt-avaliador';
import { formatarContextoCliente, formatarContextoAvaliacao } from './prompts/context-formatter';
import { normalizarAvaliacao } from './evaluation.service';
import { verificarRateLimitDiario } from './limites.service';
import { concederRecompensaTreinamento } from '../gamificacao/treinamento.service';
import { createLogger } from '../utils/logger';

const log = createLogger('simulador:sessao');

export type SimulationErrorType =
  | 'not_found'
  | 'message_too_long'
  | 'rate_limited'
  | 'budget_exceeded'
  | 'generation_in_progress'
  | 'invalid_state'
  | 'provider_unavailable';

export class SimulationError extends Error {
  constructor(
    public type: SimulationErrorType,
    message: string
  ) {
    super(message);
  }
}

async function getVendedor(vendedorId: string) {
  return prisma.vendedor.findUniqueOrThrow({ where: { id: vendedorId } });
}

function isViolacaoSessaoAtivaDuplicada(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

async function getSessaoComOwnership(sessionId: string, vendedorId: string) {
  const sessao = await prisma.simulationSession.findUnique({ where: { id: sessionId } });
  // Mesmo erro (not_found) tanto pra "não existe" quanto "não é sua sessão"
  // — nunca revela a um vendedor que a sessão de outro existe (IDOR-safe).
  if (!sessao || sessao.vendedorId !== vendedorId) {
    throw new SimulationError('not_found', 'sessão não encontrada');
  }
  return sessao;
}

/**
 * Cria uma sessão nova (ou devolve a já ativa, se existir — nunca deixa 2
 * simultâneas, mesma lição das Fatias 4/5) e já gera a primeira fala da
 * cliente simulada, deixando a sessão ACTIVE e pronta pro vendedor responder.
 */
export async function criarSessao(vendedorId: string, scenarioId: string, dificuldade: DificuldadeSimulacao) {
  const existente = await prisma.simulationSession.findFirst({
    where: { vendedorId, status: { in: ['CREATED', 'ACTIVE'] } },
    orderBy: { startedAt: 'desc' },
  });
  if (existente) return existente;

  const vendedor = await getVendedor(vendedorId);
  const cenario = await resolverCenario(scenarioId, dificuldade);

  // Abrir uma sessão já dispara 1 chamada real ao provider (a primeira fala
  // da cliente, logo abaixo) — sujeita aos MESMOS limites de enviarMensagem.
  // Sem isso, um loop de criar+encerrar sessão geraria custo sem nunca
  // registrar uma "mensagem do vendedor" e sem nunca ser barrado por cota.
  const rateLimit = await verificarRateLimitDiario(vendedorId, vendedor.empresaId);
  if (!rateLimit.permitido) {
    throw new SimulationError('rate_limited', `limite de ${rateLimit.limite} mensagens/dia atingido`);
  }
  const budget = await verificarBudgetMensal(vendedor.empresaId);
  if (!budget.permitido) {
    throw new SimulationError('budget_exceeded', 'o simulador está temporariamente indisponível por limite de uso da empresa — tente de novo amanhã');
  }

  let sessao;
  try {
    sessao = await prisma.simulationSession.create({
      data: {
        empresaId: vendedor.empresaId,
        lojaId: vendedor.lojaId,
        vendedorId,
        scenarioId: cenario.id,
        difficulty: dificuldade,
        personaSnapshot: cenario.persona as unknown as Prisma.InputJsonValue,
        maxTurns: cenario.maxTurns,
      },
    });
  } catch (err) {
    if (!isViolacaoSessaoAtivaDuplicada(err)) throw err;
    return prisma.simulationSession.findFirstOrThrow({ where: { vendedorId, status: { in: ['CREATED', 'ACTIVE'] } } });
  }

  // Primeira fala da cliente — sem turno do vendedor ainda (turnCount=0).
  const contexto = await buildSimulationContext(vendedorId, cenario, dificuldade);
  const systemPrompt = `${getSystemPromptCliente()}\n\n${formatarContextoCliente(contexto)}`;

  let resultado, custoUSD;
  try {
    ({ resultado, custoUSD } = await gerarViaGateway({
      empresaId: vendedor.empresaId,
      systemPrompt,
      messages: [{ role: 'user', content: '(início da simulação — gere sua primeira fala como cliente)' }],
      metadata: { specialist: 'simulator', mode: 'client', context: { scenario: contexto.scenario, persona: contexto.customerPersona, turnCount: 0 } },
    }));
  } catch (err) {
    log.error({ err, sessionId: sessao.id }, 'falha ao gerar a primeira fala da cliente simulada');
    await prisma.simulationSession.update({ where: { id: sessao.id }, data: { status: 'FAILED', reasonEnded: 'FALHA_PROVIDER_ABERTURA' } });
    throw new SimulationError('provider_unavailable', 'o simulador está indisponível no momento — tente de novo em instantes');
  }
  await prisma.simulationMessage.create({
    data: {
      sessionId: sessao.id,
      role: 'CLIENTE',
      content: resultado.content,
      provider: resultado.provider,
      model: resultado.model,
      inputTokens: resultado.inputTokens,
      outputTokens: resultado.outputTokens,
      estimatedCostUSD: custoUSD,
      latencyMs: resultado.latencyMs,
    },
  });
  await registrarUso(vendedor.empresaId, vendedorId, sessao.id, resultado, custoUSD, 'SUCESSO');

  return prisma.simulationSession.update({ where: { id: sessao.id }, data: { status: 'ACTIVE' } });
}

export async function listarMensagens(sessionId: string, vendedorId: string) {
  await getSessaoComOwnership(sessionId, vendedorId);
  return prisma.simulationMessage.findMany({ where: { sessionId }, orderBy: { createdAt: 'asc' } });
}

export interface EnviarMensagemInput {
  sessionId: string;
  vendedorId: string;
  content: string;
  clientMessageId?: string;
}

/**
 * Turno do vendedor: valida, gera a reação da cliente simulada e, se o
 * limite de turnos do cenário for atingido, encerra e avalia
 * automaticamente. Aplica, nesta ordem: ownership, estado, tamanho,
 * idempotência, rate limit, budget, lock de "1 geração por vez".
 */
export async function enviarMensagem(input: EnviarMensagemInput) {
  const { sessionId, vendedorId, content, clientMessageId } = input;
  const sessaoAtual = await getSessaoComOwnership(sessionId, vendedorId);

  if (sessaoAtual.status !== 'ACTIVE') {
    throw new SimulationError('invalid_state', 'esta simulação não está mais ativa');
  }

  if (content.length > env.AI_MAX_INPUT_CHARS) {
    throw new SimulationError('message_too_long', `mensagem excede o limite de ${env.AI_MAX_INPUT_CHARS} caracteres`);
  }

  if (clientMessageId) {
    const existente = await prisma.simulationMessage.findUnique({ where: { sessionId_clientMessageId: { sessionId, clientMessageId } } });
    if (existente) {
      const resposta = await prisma.simulationMessage.findFirst({
        where: { sessionId, role: 'CLIENTE', createdAt: { gt: existente.createdAt } },
        orderBy: { createdAt: 'asc' },
      });
      if (resposta) return { mensagem: resposta, sessao: await prisma.simulationSession.findUniqueOrThrow({ where: { id: sessionId } }) };
      // mensagem do vendedor já gravada mas a reação ainda não terminou/falhou — segue o fluxo normal abaixo
    }
  }

  const vendedor = await getVendedor(vendedorId);

  const rateLimit = await verificarRateLimitDiario(vendedorId, vendedor.empresaId);
  if (!rateLimit.permitido) {
    throw new SimulationError('rate_limited', `limite de ${rateLimit.limite} mensagens/dia atingido`);
  }

  const budget = await verificarBudgetMensal(vendedor.empresaId);
  if (!budget.permitido) {
    throw new SimulationError('budget_exceeded', 'o simulador está temporariamente indisponível por limite de uso da empresa — tente de novo amanhã');
  }

  const lock = await prisma.simulationSession.updateMany({
    where: { id: sessionId, geracaoEmAndamento: false },
    data: { geracaoEmAndamento: true },
  });
  if (lock.count === 0) {
    throw new SimulationError('generation_in_progress', 'já há uma reação sendo gerada nesta simulação — aguarde');
  }

  try {
    const mensagemVendedor = clientMessageId
      ? await prisma.simulationMessage.upsert({
          where: { sessionId_clientMessageId: { sessionId, clientMessageId } },
          create: { sessionId, role: 'VENDEDOR', content, clientMessageId },
          update: {},
        })
      : await prisma.simulationMessage.create({ data: { sessionId, role: 'VENDEDOR', content } });

    // Fecha uma janela de corrida estreita (achado LOW aceito na Fatia 4,
    // revisitado na Fatia 6): entre o check de idempotência acima (antes do
    // lock) e agora, outra chamada concorrente com a MESMA clientMessageId
    // pode ter terminado de gerar a reação da cliente — sem este re-check,
    // esta chamada chamaria o provider de novo (custo duplicado) mesmo já
    // existindo uma reação pronta pra essa mensagem.
    if (clientMessageId) {
      const reacaoJaGerada = await prisma.simulationMessage.findFirst({
        where: { sessionId, role: 'CLIENTE', createdAt: { gt: mensagemVendedor.createdAt } },
        orderBy: { createdAt: 'asc' },
      });
      if (reacaoJaGerada) return { mensagem: reacaoJaGerada, sessao: await prisma.simulationSession.findUniqueOrThrow({ where: { id: sessionId } }) };
    }

    const novoTurnCount = sessaoAtual.turnCount + 1;
    const cenario = await resolverCenario(sessaoAtual.scenarioId, sessaoAtual.difficulty);
    const contexto = await buildSimulationContext(vendedorId, cenario, sessaoAtual.difficulty);
    const systemPrompt = `${getSystemPromptCliente()}\n\n${formatarContextoCliente(contexto)}`;

    const historico = await prisma.simulationMessage.findMany({ where: { sessionId }, orderBy: { createdAt: 'asc' } });
    const mensagensParaProvider = historico.map((m) => ({ role: mapRole(m.role), content: m.content }));

    let resultado, custoUSD;
    try {
      ({ resultado, custoUSD } = await gerarViaGateway({
        empresaId: vendedor.empresaId,
        systemPrompt,
        messages: mensagensParaProvider,
        metadata: { specialist: 'simulator', mode: 'client', context: { scenario: contexto.scenario, persona: contexto.customerPersona, turnCount: novoTurnCount } },
      }));
    } catch (err) {
      await registrarUso(vendedor.empresaId, vendedorId, sessionId, undefined, 0, err instanceof AIProviderError && err.type === 'timeout' ? 'TIMEOUT' : 'ERRO');
      throw new SimulationError('provider_unavailable', 'o simulador está indisponível no momento — tente de novo em instantes');
    }
    const mensagemCliente = await prisma.simulationMessage.create({
      data: {
        sessionId,
        role: 'CLIENTE',
        content: resultado.content,
        provider: resultado.provider,
        model: resultado.model,
        inputTokens: resultado.inputTokens,
        outputTokens: resultado.outputTokens,
        estimatedCostUSD: custoUSD,
        latencyMs: resultado.latencyMs,
      },
    });
    await registrarUso(vendedor.empresaId, vendedorId, sessionId, resultado, custoUSD, 'SUCESSO');

    await prisma.simulationSession.update({ where: { id: sessionId }, data: { turnCount: novoTurnCount } });

    let sessaoFinal = await prisma.simulationSession.findUniqueOrThrow({ where: { id: sessionId } });
    if (novoTurnCount >= sessaoAtual.maxTurns) {
      sessaoFinal = await finalizarEAvaliar(sessionId, 'LIMITE_TURNOS');
    }

    return { mensagem: mensagemCliente, sessao: sessaoFinal };
  } finally {
    await prisma.simulationSession.update({ where: { id: sessionId }, data: { geracaoEmAndamento: false } });
  }
}

function mapRole(role: RoleMensagemSimulacao): 'user' | 'assistant' {
  // Do ponto de vista do provider, o VENDEDOR é "user" e a CLIENTE simulada
  // (o próprio papel que o LLM está desempenhando) é "assistant".
  return role === 'VENDEDOR' ? 'user' : 'assistant';
}

/**
 * Encerramento explícito ("Encerrar simulação") OU retry de avaliação
 * pendente. Idempotente: chamar de novo numa sessão já COMPLETED/EVALUATED
 * apenas devolve o estado atual, nunca reprocessa.
 */
export async function encerrarSessao(sessionId: string, vendedorId: string) {
  const sessao = await getSessaoComOwnership(sessionId, vendedorId);

  if (sessao.status === 'EVALUATION_PENDING') {
    return finalizarEAvaliar(sessionId, sessao.reasonEnded ?? 'ENCERRADO_PELO_VENDEDOR', true);
  }

  if (sessao.status !== 'ACTIVE' && sessao.status !== 'CREATED') {
    return sessao; // já concluída/avaliada/falha — idempotente, nunca reprocessa
  }

  return finalizarEAvaliar(sessionId, 'ENCERRADO_PELO_VENDEDOR');
}

/**
 * Transição pra COMPLETED (uma vez só — update condicional evita corrida com
 * outro encerramento simultâneo) e execução da avaliação. Se a avaliação já
 * está pendente (retry), pula a transição e só tenta avaliar de novo.
 */
async function finalizarEAvaliar(sessionId: string, motivo: string, apenasRetryAvaliacao = false): Promise<import('@prisma/client').SimulationSession> {
  if (!apenasRetryAvaliacao) {
    const transicao = await prisma.simulationSession.updateMany({
      where: { id: sessionId, status: { in: ['ACTIVE', 'CREATED'] } },
      data: { status: 'COMPLETED', reasonEnded: motivo, endedAt: new Date() },
    });
    if (transicao.count === 0) {
      // outra chamada concorrente já encerrou — devolve o estado atual, sem reavaliar
      return prisma.simulationSession.findUniqueOrThrow({ where: { id: sessionId } });
    }
  }

  const sessao = await prisma.simulationSession.findUniqueOrThrow({ where: { id: sessionId } });
  const vendedor = await getVendedor(sessao.vendedorId);
  const cenario = await resolverCenario(sessao.scenarioId, sessao.difficulty);

  if (cenario.criteriosAvaliacao.length === 0) {
    // cenário sem critérios cadastrados — não há o que avaliar (config incompleta no seed)
    log.warn({ sessionId, scenarioId: sessao.scenarioId }, 'cenário sem criteriosAvaliacao — sessão marcada FAILED');
    return prisma.simulationSession.update({ where: { id: sessionId }, data: { status: 'FAILED', reasonEnded: 'CENARIO_SEM_CRITERIOS' } });
  }

  // A avaliação também dispara 1 chamada real ao provider. `encerrarSessao`
  // pode ser chamado a qualquer momento (inclusive com 0 turnos) — sem este
  // check, um loop de criar+encerrar sessão contornaria completamente o
  // budget mensal da empresa (a mesma lacuna do início da sessão, acima).
  const budget = await verificarBudgetMensal(vendedor.empresaId);
  if (!budget.permitido) {
    log.warn({ sessionId }, 'avaliação adiada — budget mensal da empresa excedido');
    return prisma.simulationSession.update({ where: { id: sessionId }, data: { status: 'EVALUATION_PENDING' } });
  }

  const mensagens = await prisma.simulationMessage.findMany({ where: { sessionId }, orderBy: { createdAt: 'asc' } });
  const transcript = mensagens.map((m) => ({ role: m.role, content: m.content }));
  const evalContext = await buildEvaluationContext(vendedor.empresaId, cenario, cenario.criteriosAvaliacao, transcript);
  const systemPrompt = `${getSystemPromptAvaliador()}\n\n${formatarContextoAvaliacao(evalContext)}`;

  let resultado, custoUSD;
  try {
    ({ resultado, custoUSD } = await gerarViaGateway({
      empresaId: vendedor.empresaId,
      systemPrompt,
      messages: [{ role: 'user', content: 'Avalie esta simulação conforme o schema pedido.' }],
      metadata: { specialist: 'simulator', mode: 'evaluator', context: evalContext },
    }));
  } catch (err) {
    log.error({ err, sessionId }, 'falha ao gerar avaliação da simulação');
    return prisma.simulationSession.update({ where: { id: sessionId }, data: { status: 'EVALUATION_PENDING' } });
  }

  const normalizada = normalizarAvaliacao(resultado.content, cenario.criteriosAvaliacao);
  if (!normalizada) {
    log.error({ sessionId }, 'provider retornou avaliação em formato inválido — nunca persistindo nota falsa');
    return prisma.simulationSession.update({ where: { id: sessionId }, data: { status: 'EVALUATION_PENDING' } });
  }

  try {
    await prisma.simulationEvaluation.create({
      data: {
        sessionId,
        criteriosAvaliados: cenario.criteriosAvaliacao,
        scores: normalizada.scores,
        scoreFinal: normalizada.scoreFinal,
        strengths: normalizada.strengths,
        improvements: normalizada.improvements,
        missedOpportunities: normalizada.missedOpportunities,
        betterExample: normalizada.betterExample,
        summary: normalizada.summary,
        provider: resultado.provider,
        model: resultado.model,
        inputTokens: resultado.inputTokens,
        outputTokens: resultado.outputTokens,
        estimatedCostUSD: custoUSD,
        latencyMs: resultado.latencyMs,
      },
    });
  } catch (err) {
    // já existe avaliação (versao=1) pra essa sessão — outra chamada concorrente venceu; idempotente, segue.
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
  }

  const sessaoEvaluated = await prisma.simulationSession.update({
    where: { id: sessionId },
    data: { status: 'EVALUATED', evaluatedAt: new Date() },
  });

  // Elegibilidade de recompensa (seção "ANTI-GAMING"/"INTEGRAÇÃO COM
  // GAMIFICAÇÃO" da Fatia 6): sessão concluída, avaliação válida, mínimo de
  // turnos, idempotente por sessão — nunca por reabrir/reenviar.
  if (sessao.turnCount >= env.SIMULATION_MIN_TURNS_FOR_REWARD) {
    await concederRecompensaTreinamento({
      empresaId: sessao.empresaId,
      lojaId: sessao.lojaId,
      vendedorId: sessao.vendedorId,
      tipoEvento: 'TREINAMENTO_CONCLUIDO',
      referenciaTipo: 'SIMULACAO',
      referenciaId: sessionId,
      idempotencyKey: `treinamento-simulacao-${sessionId}`,
    });
  }

  return sessaoEvaluated;
}

export async function getAvaliacao(sessionId: string, vendedorId: string) {
  await getSessaoComOwnership(sessionId, vendedorId);
  return prisma.simulationEvaluation.findUnique({ where: { sessionId_versao: { sessionId, versao: 1 } } });
}

/** Sessão + mensagens + avaliação (se houver) num só payload — evita criar rotas GET redundantes (seção "endpoints" da Fatia 6). */
export async function getSessaoDetalhada(sessionId: string, vendedorId: string) {
  const sessao = await getSessaoComOwnership(sessionId, vendedorId);
  const [mensagens, avaliacao] = await Promise.all([
    prisma.simulationMessage.findMany({ where: { sessionId }, orderBy: { createdAt: 'asc' } }),
    prisma.simulationEvaluation.findUnique({ where: { sessionId_versao: { sessionId, versao: 1 } } }),
  ]);
  return { sessao, mensagens, avaliacao };
}

export async function getHistorico(vendedorId: string) {
  const sessoes = await prisma.simulationSession.findMany({
    where: { vendedorId, status: { in: ['EVALUATED', 'FAILED'] } },
    orderBy: { startedAt: 'desc' },
    take: 20,
    include: { cenario: { select: { title: true, category: true } }, avaliacoes: { where: { versao: 1 } } },
  });

  return sessoes.map((s) => ({
    id: s.id,
    scenarioTitle: s.cenario.title,
    category: s.cenario.category,
    difficulty: s.difficulty,
    status: s.status,
    startedAt: s.startedAt,
    scoreFinal: s.avaliacoes[0]?.scoreFinal ?? null,
  }));
}

async function registrarUso(
  empresaId: string,
  vendedorId: string,
  sessionId: string,
  resultado: { provider: string; model: string; inputTokens: number; outputTokens: number; latencyMs: number } | undefined,
  custoUSD: number,
  status: 'SUCESSO' | 'ERRO' | 'TIMEOUT'
) {
  try {
    // Sem resultado (falha antes de chamar o provider com sucesso) — reflete
    // o provider/modelo REALMENTE configurado pra esta empresa (Fatia 7.5B),
    // nunca mais sempre env.AI_PROVIDER/env.AI_MODEL.
    const fallback = resultado ? null : await providerEModeloParaTelemetria(empresaId);
    await prisma.aIUsage.create({
      data: {
        empresaId,
        vendedorId,
        specialist: 'SIMULATOR',
        conversationId: sessionId,
        provider: resultado?.provider ?? fallback!.provider,
        model: resultado?.model ?? fallback!.model,
        inputTokens: resultado?.inputTokens ?? 0,
        outputTokens: resultado?.outputTokens ?? 0,
        estimatedCostUSD: custoUSD,
        latencyMs: resultado?.latencyMs ?? 0,
        status,
      },
    });
  } catch (usageErr) {
    log.error({ usageErr }, 'falha ao registrar AIUsage do simulador — não bloqueia a resposta ao vendedor');
  }
}

export function getStatusSimulacaoValidos(): StatusSimulacao[] {
  return ['CREATED', 'ACTIVE', 'COMPLETED', 'EVALUATION_PENDING', 'EVALUATED', 'FAILED'];
}
