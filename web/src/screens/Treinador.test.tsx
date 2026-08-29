import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Treinador } from './Treinador';
import { ApiError } from '../api/client';
import * as treinadorApi from '../api/treinador';
import { MensagemTreinador } from '../types';

vi.mock('../api/treinador');

const CONVERSA = { id: 'conv-1', vendedorId: 'v1', status: 'ABERTA' as const, startedAt: '2026-08-29T10:00:00Z' };
const OBJECOES = { objections: [{ code: 'ESTA_CARO', label: 'Está caro' }, { code: 'VOU_PENSAR', label: 'Vou pensar' }] };

beforeEach(() => {
  vi.mocked(treinadorApi.buscarConversaAtual).mockResolvedValue(CONVERSA);
  vi.mocked(treinadorApi.buscarObjecoesComuns).mockResolvedValue(OBJECOES);
  vi.mocked(treinadorApi.buscarMensagens).mockResolvedValue({ mensagens: [] });
});

describe('Treinador', () => {
  it('mostra objeções comuns e quick actions quando não há mensagens', async () => {
    render(<Treinador />);

    expect(await screen.findByRole('button', { name: 'Está caro' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vou pensar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Me ajude a abordar melhor' })).toBeInTheDocument();
  });

  it('título e subtítulo deixam claro que é técnica de venda, não o Coach', async () => {
    render(<Treinador />);
    expect(await screen.findByRole('heading', { name: 'Treinador de Vendas' })).toBeInTheDocument();
    expect(screen.getByText(/playbook da sua loja/)).toBeInTheDocument();
  });

  it('envia uma objeção com mode=OBJECAO e objection preenchido', async () => {
    const user = userEvent.setup();
    vi.mocked(treinadorApi.enviarMensagem).mockResolvedValue({
      id: 'msg-2',
      conversationId: CONVERSA.id,
      role: 'ASSISTANT',
      content: 'LEITURA: ...',
      createdAt: '2026-08-29T10:01:00Z',
    });

    render(<Treinador />);
    await user.click(await screen.findByRole('button', { name: 'Está caro' }));

    expect(treinadorApi.enviarMensagem).toHaveBeenCalledWith(CONVERSA.id, { content: 'Está caro', mode: 'OBJECAO', objection: 'Está caro' });
    expect(await screen.findByText('LEITURA: ...')).toBeInTheDocument();
  });

  it('envia uma quick action com o modo correto', async () => {
    const user = userEvent.setup();
    vi.mocked(treinadorApi.enviarMensagem).mockResolvedValue({
      id: 'msg-2',
      conversationId: CONVERSA.id,
      role: 'ASSISTANT',
      content: 'Vamos melhorar seu PA.',
      createdAt: '2026-08-29T10:01:00Z',
    });

    render(<Treinador />);
    await user.click(await screen.findByRole('button', { name: 'Quero melhorar meu PA' }));

    expect(treinadorApi.enviarMensagem).toHaveBeenCalledWith(CONVERSA.id, { content: 'Quero melhorar meu PA', mode: 'PA', objection: undefined });
  });

  it('envia mensagem livre digitada no input com mode=GERAL', async () => {
    const user = userEvent.setup();
    vi.mocked(treinadorApi.enviarMensagem).mockResolvedValue({
      id: 'msg-2',
      conversationId: CONVERSA.id,
      role: 'ASSISTANT',
      content: 'Entendi.',
      createdAt: '2026-08-29T10:01:00Z',
    });

    render(<Treinador />);
    const input = await screen.findByPlaceholderText('Descreva a situação...');
    await user.type(input, 'Como fecho essa venda?');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(treinadorApi.enviarMensagem).toHaveBeenCalledWith(CONVERSA.id, { content: 'Como fecho essa venda?', mode: 'GERAL', objection: undefined });
    await waitFor(() => expect(input).toHaveValue(''));
  });

  it('mostra "digitando..." enquanto aguarda resposta', async () => {
    const user = userEvent.setup();
    let resolverEnvio: (value: MensagemTreinador) => void = () => {};
    vi.mocked(treinadorApi.enviarMensagem).mockReturnValue(
      new Promise((resolve) => {
        resolverEnvio = resolve;
      })
    );

    render(<Treinador />);
    await user.click(await screen.findByRole('button', { name: 'Está caro' }));

    expect(screen.getByRole('status')).toHaveTextContent('digitando...');
    resolverEnvio({ id: 'msg-2', conversationId: CONVERSA.id, role: 'ASSISTANT', content: 'Resposta', createdAt: '2026-08-29T10:01:00Z' });

    expect(await screen.findByText('Resposta')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });

  it('renderiza o conteúdo da mensagem como texto puro, nunca como HTML', async () => {
    vi.mocked(treinadorApi.buscarMensagens).mockResolvedValue({
      mensagens: [{ id: 'm1', conversationId: CONVERSA.id, role: 'USER', content: '<b>injeção</b>', createdAt: '2026-08-29T10:00:00Z' }],
    });

    render(<Treinador />);

    expect(await screen.findByText('<b>injeção</b>')).toBeInTheDocument();
    expect(document.querySelector('b')).not.toBeInTheDocument();
  });

  it('mostra o histórico de mensagens já existente da conversa atual', async () => {
    vi.mocked(treinadorApi.buscarMensagens).mockResolvedValue({
      mensagens: [
        { id: 'm1', conversationId: CONVERSA.id, role: 'USER', content: 'Está caro', createdAt: '2026-08-29T10:00:00Z' },
        { id: 'm2', conversationId: CONVERSA.id, role: 'ASSISTANT', content: 'Vamos investigar o motivo.', createdAt: '2026-08-29T10:00:05Z' },
      ],
    });

    render(<Treinador />);

    expect(await screen.findByText('Está caro')).toBeInTheDocument();
    expect(screen.getByText('Vamos investigar o motivo.')).toBeInTheDocument();
  });

  it('mostra mensagem amigável por tipo de erro e remove a mensagem otimista que falhou', async () => {
    const user = userEvent.setup();
    vi.mocked(treinadorApi.enviarMensagem).mockRejectedValue(new ApiError(429, 'limite atingido', 'rate_limited'));

    render(<Treinador />);
    const input = await screen.findByPlaceholderText('Descreva a situação...');
    await user.type(input, 'Minha pergunta');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Você atingiu o limite de mensagens de hoje com o Treinador. Volta amanhã!');
    await waitFor(() => expect(screen.queryByText('Minha pergunta')).not.toBeInTheDocument());
  });

  it('mostra tela de erro com opção de tentar de novo quando o carregamento inicial falha', async () => {
    vi.mocked(treinadorApi.buscarConversaAtual).mockRejectedValue(new Error('falha de rede'));

    render(<Treinador />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar o Treinador agora.');
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });
});
