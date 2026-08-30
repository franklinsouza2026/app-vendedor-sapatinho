import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AlterarSenha } from './AlterarSenha';
import { ApiError } from '../api/client';
import * as authApi from '../api/auth';

vi.mock('../api/auth');

function renderTela() {
  return render(
    <MemoryRouter>
      <AlterarSenha />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AlterarSenha', () => {
  it('troca a senha com sucesso e limpa o formulário', async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.alterarSenha).mockResolvedValue(undefined);

    renderTela();

    await user.type(screen.getByLabelText('Senha atual'), 'antiga123');
    await user.type(screen.getByLabelText('Nova senha'), 'novaSenha123');
    await user.type(screen.getByLabelText('Confirme a nova senha'), 'novaSenha123');
    await user.click(screen.getByRole('button', { name: 'Salvar nova senha' }));

    expect(authApi.alterarSenha).toHaveBeenCalledWith('antiga123', 'novaSenha123');
    expect(await screen.findByText('Senha alterada com sucesso.')).toBeInTheDocument();
    expect(screen.getByLabelText('Senha atual')).toHaveValue('');
  });

  it('bloqueia quando a confirmação não bate, sem chamar a API', async () => {
    const user = userEvent.setup();
    renderTela();

    await user.type(screen.getByLabelText('Senha atual'), 'antiga123');
    await user.type(screen.getByLabelText('Nova senha'), 'novaSenha123');
    await user.type(screen.getByLabelText('Confirme a nova senha'), 'outraCoisa123');
    await user.click(screen.getByRole('button', { name: 'Salvar nova senha' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('As senhas não coincidem.');
    expect(authApi.alterarSenha).not.toHaveBeenCalled();
  });

  it('mostra erro específico quando a senha atual está incorreta', async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.alterarSenha).mockRejectedValue(new ApiError(401, 'senha atual incorreta', 'senha_atual_incorreta'));

    renderTela();

    await user.type(screen.getByLabelText('Senha atual'), 'errada');
    await user.type(screen.getByLabelText('Nova senha'), 'novaSenha123');
    await user.type(screen.getByLabelText('Confirme a nova senha'), 'novaSenha123');
    await user.click(screen.getByRole('button', { name: 'Salvar nova senha' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Senha atual incorreta.');
  });
});
