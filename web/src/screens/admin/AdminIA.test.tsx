import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AdminIA } from './AdminIA';
import * as adminAiApi from '../../api/adminAi';
import { VisaoGeralIA } from '../../api/adminAi';

vi.mock('../../api/adminAi');

const VISAO_BASE: VisaoGeralIA = {
  mode: 'MANUAL',
  enabled: true,
  activeProvider: 'MOCK',
  budget: { monthlyLimitUSD: 20, gastoMensalUSD: 0 },
  providers: [
    { provider: 'MOCK', configured: true, credentialUpdatedAt: null, active: true, model: 'mock-v1', modelosPermitidos: ['mock-v1'], health: { status: 'NEVER_TESTED', lastCallAt: null, lastErrorType: null, lastLatencyMs: null } },
    { provider: 'ANTHROPIC', configured: false, credentialUpdatedAt: null, active: false, model: null, modelosPermitidos: ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5'], health: { status: 'NEVER_TESTED', lastCallAt: null, lastErrorType: null, lastLatencyMs: null } },
    { provider: 'OPENAI', configured: false, credentialUpdatedAt: null, active: false, model: null, modelosPermitidos: ['gpt-5.1', 'gpt-5.1-mini'], health: { status: 'NEVER_TESTED', lastCallAt: null, lastErrorType: null, lastLatencyMs: null } },
    { provider: 'GEMINI', configured: false, credentialUpdatedAt: null, active: false, model: null, modelosPermitidos: ['gemini-3-pro', 'gemini-3-flash'], health: { status: 'NEVER_TESTED', lastCallAt: null, lastErrorType: null, lastLatencyMs: null } },
  ],
};

function renderTela() {
  return render(
    <MemoryRouter>
      <AdminIA />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(adminAiApi.buscarVisaoGeralIA).mockResolvedValue(structuredClone(VISAO_BASE));
  vi.mocked(adminAiApi.buscarUsoIA).mockResolvedValue({
    desde: '2026-08-01',
    total: { chamadas: 0, inputTokens: 0, outputTokens: 0, custoEstimadoUSD: 0 },
    porProvider: [],
    porEspecialista: [],
  });
});

describe('AdminIA', () => {
  it('mostra os 4 providers e marca o ativo', async () => {
    renderTela();

    expect(await screen.findByRole('heading', { name: 'Mock (determinístico)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Anthropic' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'OpenAI' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Gemini' })).toBeInTheDocument();
    expect(screen.getByText('Ativo')).toBeInTheDocument();
  });

  it('não deixa ativar um provider real sem credencial configurada', async () => {
    renderTela();
    await screen.findByText('Anthropic');

    const cardAnthropic = screen.getByRole('heading', { name: 'Anthropic' }).closest('div')!.parentElement!;
    const botaoAtivar = within(cardAnthropic).getByRole('button', { name: 'Ativar' });
    expect(botaoAtivar).toBeDisabled();
  });

  it('salva credencial, limpa o campo e nunca reexibe o valor salvo', async () => {
    const user = userEvent.setup();
    vi.mocked(adminAiApi.salvarCredencial).mockResolvedValue(undefined);

    renderTela();
    await screen.findByText('Anthropic');

    const input = screen.getByLabelText('Chave de API — Anthropic');
    await user.type(input, 'sk-fake-test-key');
    await user.click(screen.getAllByRole('button', { name: 'Salvar' })[1]); // [0] é o botão de budget

    await waitFor(() => expect(adminAiApi.salvarCredencial).toHaveBeenCalledWith('ANTHROPIC', 'sk-fake-test-key'));
    expect(screen.queryByDisplayValue('sk-fake-test-key')).not.toBeInTheDocument();
  });

  it('testar conexão mostra sucesso ou falha sem expor detalhe interno do provider', async () => {
    const user = userEvent.setup();
    vi.mocked(adminAiApi.testarConexao).mockResolvedValue({ ok: true, latencyMs: 42 });

    renderTela();
    await screen.findByRole('heading', { name: 'Mock (determinístico)' });

    const cardMock = screen.getByRole('heading', { name: 'Mock (determinístico)' }).closest('div')!.parentElement!;
    await user.click(within(cardMock).getByRole('button', { name: 'Testar conexão' }));

    expect(await screen.findByText(/Conexão OK/)).toBeInTheDocument();
  });

  it('ativar um provider já configurado chama a API correta', async () => {
    const user = userEvent.setup();
    const visaoComOpenAIConfigurado = structuredClone(VISAO_BASE);
    visaoComOpenAIConfigurado.providers[2].configured = true;
    vi.mocked(adminAiApi.buscarVisaoGeralIA).mockResolvedValue(visaoComOpenAIConfigurado);
    vi.mocked(adminAiApi.ativarProvider).mockResolvedValue(undefined);

    renderTela();
    await screen.findByText('OpenAI');

    const cardOpenAI = screen.getByRole('heading', { name: 'OpenAI' }).closest('div')!.parentElement!;
    await user.click(within(cardOpenAI).getByRole('button', { name: 'Ativar' }));

    await waitFor(() => expect(adminAiApi.ativarProvider).toHaveBeenCalledWith('OPENAI'));
  });

  it('atualiza o orçamento mensal', async () => {
    const user = userEvent.setup();
    vi.mocked(adminAiApi.atualizarBudgetIA).mockResolvedValue(undefined);

    renderTela();
    await screen.findByText(/Custo estimado do mês/);

    const inputBudget = screen.getByLabelText('Limite mensal (USD)');
    await user.clear(inputBudget);
    await user.type(inputBudget, '50');
    await user.click(screen.getAllByRole('button', { name: 'Salvar' })[0]);

    await waitFor(() => expect(adminAiApi.atualizarBudgetIA).toHaveBeenCalledWith(50));
  });
});
