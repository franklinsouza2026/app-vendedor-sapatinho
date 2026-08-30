import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Academia } from './Academia';
import * as academiaApi from '../api/academia';
import { AulaDetalhada, QuizParaResponder, TrilhaResumo } from '../types';

vi.mock('../api/academia');

const TRILHA: TrilhaResumo = {
  id: 'trilha-1',
  code: 'fundamentos',
  title: 'Fundamentos do Atendimento',
  description: 'desc',
  aulas: [
    { id: 'aula-1', code: 'abrir-atendimento', title: 'Como abrir bem um atendimento', estimatedMinutes: 4, hasQuiz: true, status: 'NOT_STARTED' },
    { id: 'aula-2', code: 'sondar', title: 'Sondar antes de argumentar', estimatedMinutes: 5, hasQuiz: false, status: 'NOT_STARTED' },
  ],
};

const AULA_SEM_QUIZ: AulaDetalhada = {
  id: 'aula-2',
  code: 'sondar',
  title: 'Sondar antes de argumentar',
  description: 'desc',
  content: 'Conteúdo da aula sem quiz.',
  origem: 'DEMONSTRATIVO',
  estimatedMinutes: 5,
  hasQuiz: false,
  quizPassingScore: null,
  status: 'NOT_STARTED',
  playbookRelacionado: [],
};

const AULA_COM_QUIZ: AulaDetalhada = {
  id: 'aula-1',
  code: 'abrir-atendimento',
  title: 'Como abrir bem um atendimento',
  description: 'desc',
  content: 'Conteúdo da aula com quiz.',
  origem: 'DEMONSTRATIVO',
  estimatedMinutes: 4,
  hasQuiz: true,
  quizPassingScore: 70,
  status: 'NOT_STARTED',
  playbookRelacionado: [{ category: 'ABORDAGEM', title: 'Mandamento #1', content: 'Receba bem.', origin: 'OFICIAL' }],
};

const QUIZ: QuizParaResponder = {
  id: 'quiz-1',
  passingScore: 70,
  perguntas: [{ id: 'q1', question: 'Pergunta de teste?', opcoes: [{ id: 'o1', text: 'Certa' }, { id: 'o2', text: 'Errada' }] }],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(academiaApi.buscarTrilhas).mockResolvedValue({ trilhas: [TRILHA] });
  vi.mocked(academiaApi.iniciarAula).mockResolvedValue(undefined);
  vi.mocked(academiaApi.concluirAula).mockResolvedValue(undefined);
});

describe('Academia — trilhas', () => {
  it('lista trilhas com aulas, tempo estimado e status', async () => {
    render(<Academia />);

    expect(await screen.findByText('Fundamentos do Atendimento')).toBeInTheDocument();
    expect(screen.getByText('Como abrir bem um atendimento')).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.textContent?.trim() === '4 min · com quiz')).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.textContent?.trim() === '5 min')).toBeInTheDocument();
  });

  it('mostra tela de erro com opção de tentar de novo quando o carregamento falha', async () => {
    vi.mocked(academiaApi.buscarTrilhas).mockRejectedValue(new Error('falha de rede'));
    render(<Academia />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar a Academia agora.');
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });
});

describe('Academia — aula sem quiz', () => {
  it('abre a aula, marca como iniciada e permite concluir', async () => {
    const user = userEvent.setup();
    vi.mocked(academiaApi.buscarAula).mockResolvedValue(AULA_SEM_QUIZ);

    render(<Academia />);
    await user.click(await screen.findByRole('button', { name: /Sondar antes de argumentar/ }));

    expect(await screen.findByRole('heading', { name: 'Sondar antes de argumentar' })).toBeInTheDocument();
    expect(screen.getByText('Conteúdo da aula sem quiz.')).toBeInTheDocument();
    await waitFor(() => expect(academiaApi.iniciarAula).toHaveBeenCalledWith('aula-2'));

    vi.mocked(academiaApi.buscarAula).mockResolvedValue({ ...AULA_SEM_QUIZ, status: 'COMPLETED' });
    await user.click(screen.getByRole('button', { name: 'Marcar como concluída' }));

    expect(academiaApi.concluirAula).toHaveBeenCalledWith('aula-2');
    expect(await screen.findByText('Aula concluída ✓')).toBeInTheDocument();
  });

  it('marca conteúdo DEMONSTRATIVO como referência geral, não política oficial', async () => {
    const user = userEvent.setup();
    vi.mocked(academiaApi.buscarAula).mockResolvedValue(AULA_SEM_QUIZ);

    render(<Academia />);
    await user.click(await screen.findByRole('button', { name: /Sondar antes de argumentar/ }));

    expect(await screen.findByText(/não é política oficial da sua loja/)).toBeInTheDocument();
  });

  it('não iniciar de novo uma aula já em andamento (idempotência via status)', async () => {
    const user = userEvent.setup();
    vi.mocked(academiaApi.buscarAula).mockResolvedValue({ ...AULA_SEM_QUIZ, status: 'IN_PROGRESS' });

    render(<Academia />);
    await user.click(await screen.findByRole('button', { name: /Sondar antes de argumentar/ }));

    await screen.findByRole('heading', { name: 'Sondar antes de argumentar' });
    expect(academiaApi.iniciarAula).not.toHaveBeenCalled();
  });
});

describe('Academia — aula com quiz e playbook relacionado', () => {
  it('mostra a seção do playbook da loja e o botão vai pro quiz, não pra concluir direto', async () => {
    const user = userEvent.setup();
    vi.mocked(academiaApi.buscarAula).mockResolvedValue(AULA_COM_QUIZ);

    render(<Academia />);
    await user.click(await screen.findByRole('button', { name: /Como abrir bem um atendimento/ }));

    expect(await screen.findByText('Mandamento #1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ir para o quiz' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Marcar como concluída' })).not.toBeInTheDocument();
  });

  it('responde o quiz corretamente, mostra aprovado e não expõe o gabarito antes de enviar', async () => {
    const user = userEvent.setup();
    vi.mocked(academiaApi.buscarAula).mockResolvedValue(AULA_COM_QUIZ);
    vi.mocked(academiaApi.buscarQuiz).mockResolvedValue(QUIZ);
    vi.mocked(academiaApi.responderQuiz).mockResolvedValue({ score: 100, passingScore: 70, passed: true });

    render(<Academia />);
    await user.click(await screen.findByRole('button', { name: /Como abrir bem um atendimento/ }));
    await user.click(await screen.findByRole('button', { name: 'Ir para o quiz' }));

    expect(await screen.findByText('Pergunta de teste?')).toBeInTheDocument();
    expect(screen.queryByText(/correct/i)).not.toBeInTheDocument();

    const enviarBtn = screen.getByRole('button', { name: 'Enviar respostas' });
    expect(enviarBtn).toBeDisabled();

    await user.click(screen.getByLabelText('Certa'));
    expect(enviarBtn).toBeEnabled();
    await user.click(enviarBtn);

    expect(academiaApi.responderQuiz).toHaveBeenCalledWith('aula-1', [{ questionId: 'q1', optionId: 'o1' }]);
    expect(await screen.findByText('100')).toBeInTheDocument();
    expect(screen.getByText('Aprovado!')).toBeInTheDocument();
  });

  it('mostra reprovação com a nota mínima e permite tentar de novo', async () => {
    const user = userEvent.setup();
    vi.mocked(academiaApi.buscarAula).mockResolvedValue(AULA_COM_QUIZ);
    vi.mocked(academiaApi.buscarQuiz).mockResolvedValue(QUIZ);
    vi.mocked(academiaApi.responderQuiz).mockResolvedValue({ score: 0, passingScore: 70, passed: false });

    render(<Academia />);
    await user.click(await screen.findByRole('button', { name: /Como abrir bem um atendimento/ }));
    await user.click(await screen.findByRole('button', { name: 'Ir para o quiz' }));
    await user.click(await screen.findByLabelText('Errada'));
    await user.click(screen.getByRole('button', { name: 'Enviar respostas' }));

    expect(await screen.findByText('Não atingiu a nota mínima de 70')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });
});
