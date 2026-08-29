import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Coach } from './Coach';
import { ApiError } from '../api/client';
import * as coachApi from '../api/coach';
import { MensagemCoach } from '../types';

vi.mock('../api/coach');

const CONVERSA = { id: 'conv-1', vendedorId: 'v1', status: 'ABERTA' as const, startedAt: '2026-08-29T10:00:00Z' };

beforeEach(() => {
  vi.mocked(coachApi.buscarCheckinHoje).mockResolvedValue(null);
  vi.mocked(coachApi.buscarConversaAtual).mockResolvedValue(CONVERSA);
  vi.mocked(coachApi.buscarMensagens).mockResolvedValue({ mensagens: [] });
});

describe('Coach', () => {
  it('mostra o check-in quando ainda não foi feito hoje', async () => {
    render(<Coach />);

    expect(await screen.findByText('Como você está chegando pra trabalhar hoje?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Muito bem/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Não estou legal/ })).toBeInTheDocument();
  });

  it('registra o check-in e some com o card ao clicar num mood', async () => {
    const user = userEvent.setup();
    vi.mocked(coachApi.registrarCheckin).mockResolvedValue({ id: 'chk-1', mood: 'GOOD', dia: '2026-08-29' });

    render(<Coach />);

    await user.click(await screen.findByText('Bem', { exact: true }));

    expect(coachApi.registrarCheckin).toHaveBeenCalledWith('GOOD');
    await waitFor(() => expect(screen.queryByText('Como você está chegando pra trabalhar hoje?')).not.toBeInTheDocument());
  });

  it('mostra fluxo especial quando o check-in é NOT_GOOD e ainda não há mensagens', async () => {
    vi.mocked(coachApi.buscarCheckinHoje).mockResolvedValue({ id: 'chk-1', mood: 'NOT_GOOD', dia: '2026-08-29' });

    render(<Coach />);

    expect(await screen.findByText(/Entendi\. Quer me contar/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quero conversar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Organizar meu foco' })).toBeInTheDocument();
  });

  it('mostra quick actions quando não há mensagens e o mood não é NOT_GOOD', async () => {
    vi.mocked(coachApi.buscarCheckinHoje).mockResolvedValue({ id: 'chk-1', mood: 'GOOD', dia: '2026-08-29' });

    render(<Coach />);

    expect(await screen.findByRole('button', { name: 'Como estou hoje?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quero melhorar meu PA' })).toBeInTheDocument();
  });

  it('envia mensagem via quick action, mostra "digitando..." e a resposta do Coach', async () => {
    const user = userEvent.setup();
    vi.mocked(coachApi.buscarCheckinHoje).mockResolvedValue({ id: 'chk-1', mood: 'GOOD', dia: '2026-08-29' });
    let resolverEnvio: (value: MensagemCoach) => void = () => {};
    vi.mocked(coachApi.enviarMensagem).mockReturnValue(
      new Promise((resolve) => {
        resolverEnvio = resolve;
      })
    );

    render(<Coach />);

    await user.click(await screen.findByRole('button', { name: 'Como estou hoje?' }));

    expect(screen.getByText('Como estou hoje?')).toBeInTheDocument(); // mensagem otimista do usuário
    expect(screen.getByRole('status')).toHaveTextContent('digitando...');

    resolverEnvio({
      id: 'msg-2',
      conversationId: CONVERSA.id,
      role: 'ASSISTANT',
      content: 'Faltam R$ 100.00 pra bater sua meta de hoje.',
      createdAt: '2026-08-29T10:01:00Z',
    });

    expect(await screen.findByText('Faltam R$ 100.00 pra bater sua meta de hoje.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  });

  it('envia mensagem digitada no input e limpa o campo', async () => {
    const user = userEvent.setup();
    vi.mocked(coachApi.buscarCheckinHoje).mockResolvedValue({ id: 'chk-1', mood: 'GOOD', dia: '2026-08-29' });
    vi.mocked(coachApi.enviarMensagem).mockResolvedValue({
      id: 'msg-2',
      conversationId: CONVERSA.id,
      role: 'ASSISTANT',
      content: 'Entendi.',
      createdAt: '2026-08-29T10:01:00Z',
    });

    render(<Coach />);

    const input = await screen.findByPlaceholderText('Fala com o Coach...');
    await user.type(input, 'Quero treinar quebra de objeção');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(coachApi.enviarMensagem).toHaveBeenCalledWith(CONVERSA.id, 'Quero treinar quebra de objeção');
    await waitFor(() => expect(input).toHaveValue(''));
    expect(await screen.findByText('Entendi.')).toBeInTheDocument();
  });

  it('renderiza o conteúdo da mensagem como texto puro, nunca como HTML', async () => {
    vi.mocked(coachApi.buscarCheckinHoje).mockResolvedValue({ id: 'chk-1', mood: 'GOOD', dia: '2026-08-29' });
    vi.mocked(coachApi.buscarMensagens).mockResolvedValue({
      mensagens: [
        {
          id: 'msg-1',
          conversationId: CONVERSA.id,
          role: 'USER',
          content: '<b>tentativa de injeção</b>',
          createdAt: '2026-08-29T10:00:00Z',
        },
      ],
    });

    render(<Coach />);

    expect(await screen.findByText('<b>tentativa de injeção</b>')).toBeInTheDocument();
    expect(document.querySelector('b')).not.toBeInTheDocument();
  });

  it('mostra o histórico de mensagens já existente da conversa atual', async () => {
    vi.mocked(coachApi.buscarCheckinHoje).mockResolvedValue({ id: 'chk-1', mood: 'GOOD', dia: '2026-08-29' });
    vi.mocked(coachApi.buscarMensagens).mockResolvedValue({
      mensagens: [
        { id: 'm1', conversationId: CONVERSA.id, role: 'USER', content: 'Oi', createdAt: '2026-08-29T10:00:00Z' },
        { id: 'm2', conversationId: CONVERSA.id, role: 'ASSISTANT', content: 'Olá! Como posso ajudar?', createdAt: '2026-08-29T10:00:05Z' },
      ],
    });

    render(<Coach />);

    expect(await screen.findByText('Oi')).toBeInTheDocument();
    expect(screen.getByText('Olá! Como posso ajudar?')).toBeInTheDocument();
  });

  it('mostra mensagem de erro amigável por tipo e mantém o texto pra tentar de novo quando o envio falha', async () => {
    const user = userEvent.setup();
    vi.mocked(coachApi.buscarCheckinHoje).mockResolvedValue({ id: 'chk-1', mood: 'GOOD', dia: '2026-08-29' });
    vi.mocked(coachApi.enviarMensagem).mockRejectedValue(new ApiError(429, 'limite atingido', 'rate_limited'));

    render(<Coach />);

    const input = await screen.findByPlaceholderText('Fala com o Coach...');
    await user.type(input, 'Minha pergunta');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Você atingiu o limite de mensagens de hoje com o Coach. Volta amanhã!');
    // rollback: a mensagem otimista que falhou não fica pendurada na tela
    await waitFor(() => expect(screen.queryByText('Minha pergunta')).not.toBeInTheDocument());
  });

  it('mostra erro genérico quando o tipo do erro não é mapeado', async () => {
    const user = userEvent.setup();
    vi.mocked(coachApi.buscarCheckinHoje).mockResolvedValue({ id: 'chk-1', mood: 'GOOD', dia: '2026-08-29' });
    vi.mocked(coachApi.enviarMensagem).mockRejectedValue(new Error('falha de rede'));

    render(<Coach />);

    const input = await screen.findByPlaceholderText('Fala com o Coach...');
    await user.type(input, 'Minha pergunta');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Não consegui responder agora. Tenta de novo?');
  });

  it('mostra tela de erro com opção de tentar de novo quando o carregamento inicial falha', async () => {
    vi.mocked(coachApi.buscarConversaAtual).mockRejectedValue(new Error('falha de rede'));

    render(<Coach />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar o Coach agora.');
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });

  it('desabilita o input e o botão de enviar enquanto uma resposta está em andamento', async () => {
    const user = userEvent.setup();
    vi.mocked(coachApi.buscarCheckinHoje).mockResolvedValue({ id: 'chk-1', mood: 'GOOD', dia: '2026-08-29' });
    vi.mocked(coachApi.enviarMensagem).mockReturnValue(new Promise(() => {})); // nunca resolve nesse teste

    render(<Coach />);

    const input = await screen.findByPlaceholderText('Fala com o Coach...');
    await user.type(input, 'Pergunta');
    await user.click(screen.getByRole('button', { name: 'Enviar' }));

    expect(input).toBeDisabled();
  });
});
