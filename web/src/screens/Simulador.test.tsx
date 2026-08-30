import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Simulador } from './Simulador';
import { ApiError } from '../api/client';
import * as simuladorApi from '../api/simulador';
import { AvaliacaoSimulador, DificuldadeSimulacao, SessaoDetalhadaSimulador, SessaoSimulador } from '../types';

vi.mock('../api/simulador');

function renderSimulador() {
  return render(
    <MemoryRouter>
      <Simulador />
    </MemoryRouter>
  );
}

const CENARIO = {
  id: 'cen-1',
  code: 'cliente-so-olhando',
  title: 'Cliente "só olhando"',
  description: 'Cliente que entra na loja e diz que só está olhando.',
  category: 'ABORDAGEM',
  objective: 'Engajar a cliente sem forçar a venda.',
  availableDifficulties: ['EASY', 'MEDIUM', 'HARD'] as DificuldadeSimulacao[],
};

const SESSAO_ATIVA: SessaoSimulador = {
  id: 'sess-1',
  vendedorId: 'v1',
  scenarioId: CENARIO.id,
  difficulty: 'EASY',
  maxTurns: 8,
  status: 'ACTIVE',
  turnCount: 0,
  startedAt: '2026-08-29T10:00:00Z',
};

const MENSAGEM_ABERTURA = { id: 'm1', sessionId: 'sess-1', role: 'CLIENTE' as const, content: 'Só estou olhando, obrigada.', createdAt: '2026-08-29T10:00:00Z' };

function detalheAtivo(overrides: Partial<SessaoDetalhadaSimulador> = {}): SessaoDetalhadaSimulador {
  return { sessao: SESSAO_ATIVA, mensagens: [MENSAGEM_ABERTURA], avaliacao: null, ...overrides };
}

beforeEach(() => {
  vi.mocked(simuladorApi.buscarCenarios).mockResolvedValue({ cenarios: [CENARIO] });
  vi.mocked(simuladorApi.buscarHistorico).mockResolvedValue({ historico: [] });
});

describe('Simulador — lista de cenários', () => {
  it('mostra categoria, título, descrição e objetivo do cenário', async () => {
    renderSimulador();

    expect(await screen.findByRole('button', { name: /Cliente "só olhando"/ })).toBeInTheDocument();
    expect(screen.getByText('ABORDAGEM')).toBeInTheDocument();
    expect(screen.getByText(/Engajar a cliente sem forçar a venda/)).toBeInTheDocument();
  });

  it('mostra tela de erro com opção de tentar de novo quando o carregamento falha', async () => {
    vi.mocked(simuladorApi.buscarCenarios).mockRejectedValue(new Error('falha de rede'));
    renderSimulador();

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar os cenários agora.');
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });
});

describe('Simulador — escolha de dificuldade e início', () => {
  it('ao escolher o cenário, mostra as dificuldades disponíveis', async () => {
    const user = userEvent.setup();
    renderSimulador();

    await user.click(await screen.findByRole('button', { name: /Cliente "só olhando"/ }));

    expect(await screen.findByText('Escolha a dificuldade')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fácil' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Médio' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Difícil' })).toBeInTheDocument();
  });

  it('ao escolher a dificuldade, cria a sessão e mostra o indicador de simulação com a primeira fala da cliente', async () => {
    const user = userEvent.setup();
    vi.mocked(simuladorApi.criarSessao).mockResolvedValue(SESSAO_ATIVA);
    vi.mocked(simuladorApi.buscarSessaoDetalhada).mockResolvedValue(detalheAtivo());

    renderSimulador();
    await user.click(await screen.findByRole('button', { name: /Cliente "só olhando"/ }));
    await user.click(await screen.findByRole('button', { name: 'Fácil' }));

    expect(simuladorApi.criarSessao).toHaveBeenCalledWith(CENARIO.id, 'EASY');
    expect(await screen.findByText('Simulação — cliente fictícia')).toBeInTheDocument();
    expect(screen.getByText('turno 0/8')).toBeInTheDocument();
    expect(screen.getByText('Só estou olhando, obrigada.')).toBeInTheDocument();
  });
});

describe('Simulador — chat', () => {
  async function abrirSessaoAtiva() {
    const user = userEvent.setup();
    vi.mocked(simuladorApi.criarSessao).mockResolvedValue(SESSAO_ATIVA);
    vi.mocked(simuladorApi.buscarSessaoDetalhada).mockResolvedValue(detalheAtivo());
    renderSimulador();
    await user.click(await screen.findByRole('button', { name: /Cliente "só olhando"/ }));
    await user.click(await screen.findByRole('button', { name: 'Fácil' }));
    await screen.findByText('Só estou olhando, obrigada.');
    return user;
  }

  it('envia mensagem do vendedor e mostra a reação da cliente', async () => {
    const user = await abrirSessaoAtiva();
    vi.mocked(simuladorApi.enviarMensagem).mockResolvedValue({
      mensagem: { id: 'm2', sessionId: 'sess-1', role: 'CLIENTE', content: 'Ah, tá bom então.', createdAt: '2026-08-29T10:01:00Z' },
      sessao: { ...SESSAO_ATIVA, turnCount: 1 },
    });

    const input = screen.getByPlaceholderText('Responda à cliente...');
    await user.type(input, 'Fico à disposição se precisar!');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(simuladorApi.enviarMensagem).toHaveBeenCalledWith('sess-1', 'Fico à disposição se precisar!');
    expect(await screen.findByText('Ah, tá bom então.')).toBeInTheDocument();
    expect(screen.getByText('turno 1/8')).toBeInTheDocument();
  });

  it('mostra indicador de carregamento enquanto aguarda a reação da cliente', async () => {
    const user = await abrirSessaoAtiva();
    let resolverEnvio: (value: Awaited<ReturnType<typeof simuladorApi.enviarMensagem>>) => void = () => {};
    vi.mocked(simuladorApi.enviarMensagem).mockReturnValue(
      new Promise((resolve) => {
        resolverEnvio = resolve;
      })
    );

    await user.type(screen.getByPlaceholderText('Responda à cliente...'), 'oi');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(screen.getByRole('status')).toHaveTextContent('a cliente está respondendo...');
    resolverEnvio({
      mensagem: { id: 'm2', sessionId: 'sess-1', role: 'CLIENTE', content: 'resposta', createdAt: '2026-08-29T10:01:00Z' },
      sessao: { ...SESSAO_ATIVA, turnCount: 1 },
    });

    expect(await screen.findByText('resposta')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });

  it('mostra mensagem amigável por tipo de erro e remove a mensagem otimista que falhou', async () => {
    const user = await abrirSessaoAtiva();
    vi.mocked(simuladorApi.enviarMensagem).mockRejectedValue(new ApiError(429, 'limite', 'rate_limited'));

    await user.type(screen.getByPlaceholderText('Responda à cliente...'), 'minha resposta');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Você atingiu o limite de mensagens de hoje no Simulador. Volta amanhã!');
    await waitFor(() => expect(screen.queryByText('minha resposta')).not.toBeInTheDocument());
  });

  it('ao atingir o limite de turnos automaticamente, mostra a avaliação sem precisar clicar em encerrar', async () => {
    const user = await abrirSessaoAtiva();
    const avaliacao: AvaliacaoSimulador = {
      scoreFinal: 78,
      scores: { ABORDAGEM: 65, SONDAGEM: 91 },
      strengths: ['Manteve a conversa fluindo'],
      improvements: ['Investigar mais a necessidade'],
      missedOpportunities: [],
      betterExample: 'Me conta mais sobre o que você procura.',
      summary: 'Simulação concluída.',
    };
    const sessaoFinalizada: SessaoSimulador = { ...SESSAO_ATIVA, status: 'EVALUATED', turnCount: 8, reasonEnded: 'LIMITE_TURNOS' };
    vi.mocked(simuladorApi.enviarMensagem).mockResolvedValue({
      mensagem: { id: 'm2', sessionId: 'sess-1', role: 'CLIENTE', content: 'até mais', createdAt: '2026-08-29T10:01:00Z' },
      sessao: sessaoFinalizada,
    });
    vi.mocked(simuladorApi.buscarSessaoDetalhada).mockResolvedValue({ sessao: sessaoFinalizada, mensagens: [MENSAGEM_ABERTURA], avaliacao });

    await user.type(screen.getByPlaceholderText('Responda à cliente...'), 'último turno');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByText('78')).toBeInTheDocument();
    expect(screen.getByText('Manteve a conversa fluindo')).toBeInTheDocument();
    expect(screen.getByText('Investigar mais a necessidade')).toBeInTheDocument();
    expect(screen.getByText(/Me conta mais sobre o que você procura/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Treinar novamente' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Responda à cliente...')).not.toBeInTheDocument();
  });

  it('encerrar manualmente busca a avaliação e mostra "Treinar novamente"', async () => {
    const user = await abrirSessaoAtiva();
    const avaliacao: AvaliacaoSimulador = {
      scoreFinal: 60,
      scores: { ABORDAGEM: 45 },
      strengths: [],
      improvements: [],
      missedOpportunities: [],
      betterExample: '',
      summary: 'Encerrado manualmente.',
    };
    const sessaoEncerrada: SessaoSimulador = { ...SESSAO_ATIVA, status: 'EVALUATED', reasonEnded: 'ENCERRADO_PELO_VENDEDOR' };
    vi.mocked(simuladorApi.encerrarSessao).mockResolvedValue(sessaoEncerrada);
    vi.mocked(simuladorApi.buscarSessaoDetalhada).mockResolvedValue({ sessao: sessaoEncerrada, mensagens: [MENSAGEM_ABERTURA], avaliacao });

    await user.click(screen.getByRole('button', { name: 'Encerrar simulação' }));

    expect(simuladorApi.encerrarSessao).toHaveBeenCalledWith('sess-1');
    expect(await screen.findByText('60')).toBeInTheDocument();
  });
});

describe('Simulador — histórico', () => {
  it('mostra o histórico com título, categoria/dificuldade e nota', async () => {
    const user = userEvent.setup();
    vi.mocked(simuladorApi.buscarHistorico).mockResolvedValue({
      historico: [{ id: 's1', scenarioTitle: 'Cliente "só olhando"', category: 'ABORDAGEM', difficulty: 'EASY', status: 'EVALUATED', startedAt: '2026-08-29T10:00:00Z', scoreFinal: 60 }],
    });

    renderSimulador();
    await user.click(await screen.findByRole('button', { name: 'Ver histórico de simulações' }));

    expect(await screen.findByRole('heading', { name: 'Histórico de simulações' })).toBeInTheDocument();
    expect(screen.getByText('Cliente "só olhando"')).toBeInTheDocument();
    expect(screen.getByText(/ABORDAGEM.*Fácil/)).toBeInTheDocument();
    expect(screen.getByText('60')).toBeInTheDocument();
  });

  it('mostra mensagem quando não há simulações concluídas', async () => {
    const user = userEvent.setup();
    renderSimulador();
    await user.click(await screen.findByRole('button', { name: 'Ver histórico de simulações' }));

    expect(await screen.findByText('Você ainda não concluiu nenhuma simulação.')).toBeInTheDocument();
  });
});
