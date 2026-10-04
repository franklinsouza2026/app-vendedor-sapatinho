import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { AlterarSenha } from './AlterarSenha';
import { ApiError } from '../api/client';
import * as authApi from '../api/auth';

vi.mock('../api/auth');

function TelaLogin() {
  const estado = useLocation().state as { aviso?: string } | null;
  return <p>Tela de login: {estado?.aviso}</p>;
}

function renderTela() {
  return render(
    <MemoryRouter initialEntries={['/perfil/senha']}>
      <AuthProvider>
        <Routes>
          <Route path="/perfil/senha" element={<AlterarSenha />} />
          <Route path="/login" element={<TelaLogin />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('AlterarSenha', () => {
  it('troca a senha, encerra a sessão (todas as sessões antigas caem) e volta ao login com aviso', async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.alterarSenha).mockResolvedValue(undefined);

    renderTela();

    await user.type(screen.getByLabelText('Senha atual'), 'antiga123');
    await user.type(screen.getByLabelText('Nova senha'), 'novaSenha123');
    await user.type(screen.getByLabelText('Confirme a nova senha'), 'novaSenha123');
    await user.click(screen.getByRole('button', { name: 'Salvar nova senha' }));

    expect(authApi.alterarSenha).toHaveBeenCalledWith('antiga123', 'novaSenha123');
    expect(await screen.findByText(/Tela de login: Senha alterada. Entre com a nova senha./)).toBeInTheDocument();
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
