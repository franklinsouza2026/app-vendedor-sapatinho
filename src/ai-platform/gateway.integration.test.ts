// AI Gateway (Fatia 7.5B) — provider é resolvido por empresa, nunca um
// singleton global. Sem CompanyAIConfiguration nenhuma, o comportamento é
// idêntico ao pré-Fatia-7.5B (MOCK, já que env.AI_PROVIDER=mock em teste).
import { describe, expect, it } from 'vitest';
import { prisma } from '../db';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { gerarViaGateway, getConfiguracaoIA } from './gateway.service';

describe('getConfiguracaoIA', () => {
  it('sem CompanyAIConfiguration, resolve MOCK (comportamento legado idêntico ao pré-Fatia-7.5B)', async () => {
    const { empresa } = await criarFixtureEmpresa();
    const config = await getConfiguracaoIA(empresa.id);
    expect(config).toEqual({ provider: 'MOCK', model: null, enabled: true });
  });

  it('com CompanyAIConfiguration, a configuração do banco é autoritativa', async () => {
    const { empresa } = await criarFixtureEmpresa();
    await prisma.companyAIConfiguration.create({ data: { empresaId: empresa.id, activeProvider: 'MOCK', enabled: false, updatedBy: 'teste' } });

    const config = await getConfiguracaoIA(empresa.id);
    expect(config.enabled).toBe(false);
  });
});

describe('gerarViaGateway', () => {
  it('usa o MockAIProvider de verdade quando resolvido pra MOCK, e registra saúde do provider', async () => {
    const { empresa } = await criarFixtureEmpresa();

    const { resultado, custoUSD } = await gerarViaGateway({
      empresaId: empresa.id,
      systemPrompt: 'system',
      messages: [{ role: 'user', content: 'oi' }],
    });

    expect(resultado.provider).toBe('mock');
    expect(custoUSD).toBe(0);

    const saude = await prisma.aIProviderHealth.findUnique({ where: { empresaId_provider: { empresaId: empresa.id, provider: 'MOCK' } } });
    expect(saude?.lastCallOk).toBe(true);
  });

  it('IA desabilitada (enabled=false) impede a chamada, sem derrubar o processo', async () => {
    const { empresa } = await criarFixtureEmpresa();
    await prisma.companyAIConfiguration.create({ data: { empresaId: empresa.id, activeProvider: 'MOCK', enabled: false, updatedBy: 'teste' } });

    await expect(gerarViaGateway({ empresaId: empresa.id, systemPrompt: 's', messages: [{ role: 'user', content: 'oi' }] })).rejects.toMatchObject({
      type: 'configuration_error',
    });
  });

  it('provider ativo real sem credencial configurada falha com configuration_error, nunca crasha', async () => {
    const { empresa } = await criarFixtureEmpresa();
    await prisma.companyAIConfiguration.create({ data: { empresaId: empresa.id, activeProvider: 'OPENAI', updatedBy: 'teste' } });

    await expect(gerarViaGateway({ empresaId: empresa.id, systemPrompt: 's', messages: [{ role: 'user', content: 'oi' }] })).rejects.toMatchObject({
      type: 'configuration_error',
    });

    const saude = await prisma.aIProviderHealth.findUnique({ where: { empresaId_provider: { empresaId: empresa.id, provider: 'OPENAI' } } });
    expect(saude?.lastCallOk).toBe(false);
  });

  it('troca de provider em CompanyAIConfiguration reflete na PRÓXIMA chamada, sem reiniciar nada (prova de "sem redeploy")', async () => {
    const { empresa } = await criarFixtureEmpresa();

    const primeira = await gerarViaGateway({ empresaId: empresa.id, systemPrompt: 's', messages: [{ role: 'user', content: 'oi' }] });
    expect(primeira.resultado.provider).toBe('mock');

    // "troca" simulada: aponta pra um provider real sem credencial — a
    // PRÓXIMA chamada já reflete isso, na mesma execução do processo.
    await prisma.companyAIConfiguration.create({ data: { empresaId: empresa.id, activeProvider: 'GEMINI', updatedBy: 'teste' } });

    await expect(gerarViaGateway({ empresaId: empresa.id, systemPrompt: 's', messages: [{ role: 'user', content: 'oi' }] })).rejects.toMatchObject({
      type: 'configuration_error',
    });
  });
});
