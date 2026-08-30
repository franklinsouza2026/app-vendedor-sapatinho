// Admin AI Control Plane (Fatia 7.5B) — gestão de providers/credenciais/
// modelo/budget por empresa. Toda mutação passa por aqui (nunca a rota
// manipula Prisma diretamente) e gera AuditEvent — nunca com o valor da
// credencial no metadata.
import { EspecialistaIA, NomeProviderIA } from '@prisma/client';
import { prisma } from '../db';
import { env } from '../config';
import { registrarEventoAuditoria } from '../identidade/auditoria.service';
import { IdentidadeError } from '../identidade/erros';
import { cifrarSegredo } from './secrets';
import { instanciarProvider } from './gateway.service';
import { calcularCustoEstimadoUSD } from './custo';
import { modeloValido, MODELO_PADRAO, MODELOS_PERMITIDOS } from './modelos-permitidos';
import { getConfigBudget, calcularGastoMensalUSD } from './budget.service';
import { AIProviderError } from './providers';

const TODOS_PROVIDERS: NomeProviderIA[] = ['MOCK', 'ANTHROPIC', 'OPENAI', 'GEMINI'];

async function getOuCriarConfig(empresaId: string) {
  const existente = await prisma.companyAIConfiguration.findUnique({ where: { empresaId } });
  if (existente) return existente;
  return { id: '', empresaId, mode: 'MANUAL' as const, activeProvider: 'MOCK' as NomeProviderIA, activeModel: null, enabled: true, createdAt: new Date(), updatedAt: new Date(), updatedBy: 'sistema' };
}

export async function getVisaoGeralIA(empresaId: string) {
  const [config, credenciais, healths, orcamento] = await Promise.all([
    getOuCriarConfig(empresaId),
    prisma.aIProviderCredential.findMany({ where: { empresaId }, select: { provider: true, updatedAt: true } }),
    prisma.aIProviderHealth.findMany({ where: { empresaId } }),
    getConfigBudget(empresaId),
  ]);

  const credenciaisPorProvider = new Map(credenciais.map((c) => [c.provider, c.updatedAt]));
  const healthPorProvider = new Map(healths.map((h) => [h.provider, h]));

  const providers = TODOS_PROVIDERS.map((provider) => {
    const health = healthPorProvider.get(provider);
    return {
      provider,
      configured: provider === 'MOCK' ? true : credenciaisPorProvider.has(provider),
      credentialUpdatedAt: credenciaisPorProvider.get(provider) ?? null,
      active: config.activeProvider === provider,
      model: config.activeProvider === provider ? (config.activeModel ?? defaultModeloDisplay(provider)) : null,
      modelosPermitidos: provider === 'MOCK' ? ['mock-v1'] : MODELOS_PERMITIDOS[provider],
      health: health
        ? { status: health.lastCallOk ? ('LAST_CALL_OK' as const) : ('LAST_CALL_FAILED' as const), lastCallAt: health.lastCallAt, lastErrorType: health.lastErrorType, lastLatencyMs: health.lastLatencyMs }
        : { status: 'NEVER_TESTED' as const, lastCallAt: null, lastErrorType: null, lastLatencyMs: null },
    };
  });

  return {
    mode: config.mode,
    enabled: config.enabled,
    activeProvider: config.activeProvider,
    providers,
    budget: {
      monthlyLimitUSD: orcamento.monthlyLimitUSD,
      gastoMensalUSD: await calcularGastoMensalUSD(empresaId),
    },
  };
}

function defaultModeloDisplay(provider: NomeProviderIA): string {
  if (provider === 'MOCK') return 'mock-v1';
  if (provider === 'ANTHROPIC') return env.AI_MODEL;
  return MODELO_PADRAO[provider];
}

export async function atualizarCredencial(params: { empresaId: string; provider: NomeProviderIA; apiKey: string; actorId: string }) {
  if (params.provider === 'MOCK') {
    throw new IdentidadeError(400, 'provider_sem_credencial', 'MOCK não usa credencial');
  }
  const cifrado = cifrarSegredo(params.apiKey);
  const jaExistia = await prisma.aIProviderCredential.findUnique({ where: { empresaId_provider: { empresaId: params.empresaId, provider: params.provider } } });

  await prisma.aIProviderCredential.upsert({
    where: { empresaId_provider: { empresaId: params.empresaId, provider: params.provider } },
    create: { empresaId: params.empresaId, provider: params.provider, ...cifrado, updatedBy: params.actorId },
    update: { ...cifrado, updatedBy: params.actorId },
  });

  await registrarEventoAuditoria({
    empresaId: params.empresaId,
    acao: jaExistia ? 'AI_PROVIDER_CREDENTIAL_UPDATED' : 'AI_PROVIDER_CREDENTIAL_SET',
    actorId: params.actorId,
    metadata: { provider: params.provider },
  });
}

export async function removerCredencial(empresaId: string, provider: NomeProviderIA, actorId: string) {
  const resultado = await prisma.aIProviderCredential.deleteMany({ where: { empresaId, provider } });
  if (resultado.count === 0) throw new IdentidadeError(404, 'credencial_nao_encontrada', 'nenhuma credencial configurada para este provider');

  // Se o provider removido era o ativo, a empresa cai pro MOCK — nunca fica
  // com um provider "ativo" sem credencial, o que quebraria a próxima chamada.
  const config = await prisma.companyAIConfiguration.findUnique({ where: { empresaId } });
  if (config?.activeProvider === provider) {
    await prisma.companyAIConfiguration.update({ where: { empresaId }, data: { activeProvider: 'MOCK', activeModel: null } });
  }

  await registrarEventoAuditoria({ empresaId, acao: 'AI_PROVIDER_CREDENTIAL_REMOVED', actorId, metadata: { provider } });
}

export async function ativarProvider(empresaId: string, provider: NomeProviderIA, actorId: string) {
  if (provider !== 'MOCK') {
    const credencial = await prisma.aIProviderCredential.findUnique({ where: { empresaId_provider: { empresaId, provider } } });
    if (!credencial) throw new IdentidadeError(400, 'credencial_ausente', `configure a credencial do provider ${provider} antes de ativá-lo`);
  }

  // 1 UPDATE numa única linha (empresaId é @unique) — "exatamente 1 ativo"
  // é garantido pelo próprio schema (um único campo `activeProvider`), nunca
  // por uma transação especial entre N linhas (seção 29/51 — ver Decisão no vault).
  await prisma.companyAIConfiguration.upsert({
    where: { empresaId },
    create: { empresaId, activeProvider: provider, activeModel: null, updatedBy: actorId },
    update: { activeProvider: provider, activeModel: null, updatedBy: actorId },
  });

  await registrarEventoAuditoria({ empresaId, acao: 'AI_PROVIDER_ACTIVATED', actorId, metadata: { provider } });
}

export async function atualizarModelo(empresaId: string, provider: NomeProviderIA, model: string, actorId: string) {
  if (!modeloValido(provider, model)) {
    throw new IdentidadeError(400, 'modelo_invalido', `modelo "${model}" não é permitido para o provider ${provider}`);
  }

  await prisma.companyAIConfiguration.upsert({
    where: { empresaId },
    create: { empresaId, activeProvider: provider, activeModel: model, updatedBy: actorId },
    update: { activeModel: model, updatedBy: actorId },
  });

  await registrarEventoAuditoria({ empresaId, acao: 'AI_MODEL_CHANGED', actorId, metadata: { provider, model } });
}

export async function habilitarDesabilitarIA(empresaId: string, enabled: boolean, actorId: string) {
  await prisma.companyAIConfiguration.upsert({
    where: { empresaId },
    create: { empresaId, enabled, updatedBy: actorId },
    update: { enabled, updatedBy: actorId },
  });
  await registrarEventoAuditoria({ empresaId, acao: enabled ? 'AI_PROVIDER_ACTIVATED' : 'AI_PROVIDER_DISABLED', actorId, metadata: { enabled } });
}

export async function atualizarBudgetIA(empresaId: string, monthlyLimitUSD: number, actorId: string) {
  await prisma.aIBudgetConfig.upsert({
    where: { empresaId },
    create: { empresaId, monthlyLimitUSD, updatedBy: actorId },
    update: { monthlyLimitUSD, updatedBy: actorId },
  });
  await registrarEventoAuditoria({ empresaId, acao: 'AI_BUDGET_CHANGED', actorId, metadata: { monthlyLimitUSD } });
}

/**
 * "Testar conexão" (seção 30) — chamada mínima e neutra, nunca contexto de
 * vendedor/CPF/Playbook. Testa o provider indicado independente de ele já
 * estar ativo (Admin pode testar antes de ativar). Registra AIUsage/saúde
 * como qualquer chamada real — o teste consome budget/custo de verdade se o
 * provider cobrar.
 */
export async function testarConexaoProvider(empresaId: string, provider: NomeProviderIA, actorId: string) {
  const inicio = Date.now();
  try {
    const instancia = await instanciarProvider(empresaId, provider);
    const config = await prisma.companyAIConfiguration.findUnique({ where: { empresaId } });
    const model = config?.activeProvider === provider ? (config.activeModel ?? undefined) : undefined;

    const resultado = await instancia.generateResponse({
      systemPrompt: 'Você é um verificador técnico de conectividade. Responda apenas "ok".',
      messages: [{ role: 'user', content: 'ping' }],
      model,
    });

    const custoUSD = provider === 'MOCK' ? 0 : calcularCustoEstimadoUSD(resultado.provider, resultado.model, resultado.inputTokens, resultado.outputTokens);
    await prisma.aIUsage.create({
      data: {
        empresaId,
        vendedorId: actorId,
        specialist: 'COACH' as EspecialistaIA, // teste de conexão não pertence a um especialista real — sem categoria própria nesta fatia
        provider: resultado.provider,
        model: resultado.model,
        inputTokens: resultado.inputTokens,
        outputTokens: resultado.outputTokens,
        estimatedCostUSD: custoUSD,
        latencyMs: resultado.latencyMs,
        status: 'SUCESSO',
      },
    });
    await prisma.aIProviderHealth.upsert({
      where: { empresaId_provider: { empresaId, provider } },
      create: { empresaId, provider, lastCallAt: new Date(), lastCallOk: true, lastLatencyMs: Date.now() - inicio },
      update: { lastCallAt: new Date(), lastCallOk: true, lastErrorType: null, lastLatencyMs: Date.now() - inicio },
    });

    return { ok: true as const, latencyMs: Date.now() - inicio };
  } catch (err) {
    const tipoErro = err instanceof AIProviderError ? err.type : 'unknown';
    await prisma.aIProviderHealth.upsert({
      where: { empresaId_provider: { empresaId, provider } },
      create: { empresaId, provider, lastCallAt: new Date(), lastCallOk: false, lastErrorType: tipoErro, lastLatencyMs: Date.now() - inicio },
      update: { lastCallAt: new Date(), lastCallOk: false, lastErrorType: tipoErro, lastLatencyMs: Date.now() - inicio },
    });
    return { ok: false as const, errorType: tipoErro };
  }
}

export async function getUsoIA(empresaId: string, desde: Date) {
  const [porProvider, porEspecialista, total] = await Promise.all([
    prisma.aIUsage.groupBy({
      by: ['provider'],
      where: { empresaId, createdAt: { gte: desde } },
      _sum: { inputTokens: true, outputTokens: true, estimatedCostUSD: true },
      _count: true,
    }),
    prisma.aIUsage.groupBy({
      by: ['specialist'],
      where: { empresaId, createdAt: { gte: desde } },
      _sum: { inputTokens: true, outputTokens: true, estimatedCostUSD: true },
      _count: true,
    }),
    prisma.aIUsage.aggregate({
      where: { empresaId, createdAt: { gte: desde } },
      _sum: { inputTokens: true, outputTokens: true, estimatedCostUSD: true },
      _count: true,
    }),
  ]);

  return {
    desde,
    total: {
      chamadas: total._count,
      inputTokens: total._sum.inputTokens ?? 0,
      outputTokens: total._sum.outputTokens ?? 0,
      custoEstimadoUSD: Number(total._sum.estimatedCostUSD ?? 0),
    },
    porProvider: porProvider.map((p) => ({
      provider: p.provider,
      chamadas: p._count,
      inputTokens: p._sum.inputTokens ?? 0,
      outputTokens: p._sum.outputTokens ?? 0,
      custoEstimadoUSD: Number(p._sum.estimatedCostUSD ?? 0),
    })),
    porEspecialista: porEspecialista.map((e) => ({
      specialist: e.specialist,
      chamadas: e._count,
      inputTokens: e._sum.inputTokens ?? 0,
      outputTokens: e._sum.outputTokens ?? 0,
      custoEstimadoUSD: Number(e._sum.estimatedCostUSD ?? 0),
    })),
  };
}
