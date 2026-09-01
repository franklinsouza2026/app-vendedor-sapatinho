import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Revisao } from './Revisao';
import * as api from '../api/universidade';

vi.mock('../api/universidade');

const REVISAO = {
  id: 'rev1',
  questionId: 'q1',
  questionStatement: 'Qual a melhor abordagem?',
  opcoes: [{ id: 'o1', text: 'Certa' }, { id: 'o2', text: 'Errada' }],
  lessonId: 'l1',
  lessonTitle: 'Aula de abordagem',
  nextReviewAt: new Date().toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

function renderTela() {
  return render(
    <MemoryRouter>
      <Revisao />
    </MemoryRouter>
  );
}

describe('Revisao', () => {
  it('mostra "nenhuma revisão pendente" quando a lista está vazia', async () => {
    vi.mocked(api.listarRevisoesPendentes).mockResolvedValue({ revisoes: [] });
    renderTela();
    expect(await screen.findByText(/Nenhuma revisão pendente/)).toBeInTheDocument();
  });

  it('nunca expõe o gabarito antes de responder, e mostra o resultado real do backend depois', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listarRevisoesPendentes).mockResolvedValue({ revisoes: [REVISAO] });
    vi.mocked(api.responderRevisao).mockResolvedValue({ acertou: true });

    renderTela();
    expect(await screen.findByText('Qual a melhor abordagem?')).toBeInTheDocument();
    expect(screen.queryByText(/correct/i)).not.toBeInTheDocument();

    const botaoResponder = screen.getByRole('button', { name: 'Responder' });
    expect(botaoResponder).toBeDisabled();

    await user.click(screen.getByLabelText('Certa'));
    expect(botaoResponder).toBeEnabled();
    await user.click(botaoResponder);

    expect(api.responderRevisao).toHaveBeenCalledWith('rev1', 'o1');
    expect(await screen.findByText('Acertou! 🎉')).toBeInTheDocument();
  });
});
