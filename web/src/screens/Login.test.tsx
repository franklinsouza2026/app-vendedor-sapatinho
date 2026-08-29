import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Login } from './Login';
import { AuthProvider } from '../auth/AuthContext';
import * as authApi from '../api/auth';

vi.mock('../api/auth');

beforeEach(() => {
  // localStorage do jsdom persiste entre testes do mesmo arquivo — sem isso,
  // o token gravado por um teste de login vaza pro próximo (AuthProvider
  // reidrata sozinho e navega pra "/", que não existe no MemoryRouter do teste).
  localStorage.clear();
  vi.mocked(authApi.listarLojas).mockResolvedValue({
    lojas: [{ id: 'loja-1', nome: 'Loja Piloto', codigoErp: 'LOJA001' }],
  });
});

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AuthProvider>
        <Login />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('Login', () => {
  it('carrega as lojas e mostra o nome amigável, não o código ERP', async () => {
    renderLogin();
    expect(await screen.findByText('Loja Piloto')).toBeInTheDocument();
    expect(screen.queryByText('LOJA001')).not.toBeInTheDocument();
  });

  it('envia o codigoErp da loja selecionada (não o id interno) ao fazer login', async () => {
    vi.mocked(authApi.login).mockResolvedValue({ token: 'token-fake' });
    vi.mocked(authApi.buscarSessaoAtual).mockResolvedValue({
      vendedor: { id: 'v1', nome: 'Vendedor Teste', papel: 'VENDEDOR' },
      loja: { id: 'loja-1', nome: 'Loja Piloto' },
      empresa: { nome: 'Sapatinho de Luxo' },
    });

    const user = userEvent.setup();
    renderLogin();

    await screen.findByText('Loja Piloto');
    await user.type(screen.getByLabelText('Matrícula'), 'VEND001');
    await user.type(screen.getByLabelText('Senha'), 'senha123');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => {
      expect(authApi.login).toHaveBeenCalledWith('LOJA001', 'VEND001', 'senha123');
    });
  });

  it('mostra erro amigável quando as credenciais estão incorretas', async () => {
    const { ApiError } = await import('../api/client');
    vi.mocked(authApi.login).mockRejectedValue(new ApiError(401, 'credenciais inválidas'));

    const user = userEvent.setup();
    renderLogin();

    await screen.findByText('Loja Piloto');
    await user.type(screen.getByLabelText('Matrícula'), 'VEND001');
    await user.type(screen.getByLabelText('Senha'), 'errada');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Matrícula, senha ou loja incorretos.');
  });

  it('mostra mensagem de rate limit (429) em vez de "credenciais incorretas" — não é o mesmo erro', async () => {
    const { ApiError } = await import('../api/client');
    vi.mocked(authApi.login).mockRejectedValue(new ApiError(429, 'Too many requests'));

    const user = userEvent.setup();
    renderLogin();

    await screen.findByText('Loja Piloto');
    await user.type(screen.getByLabelText('Matrícula'), 'VEND001');
    await user.type(screen.getByLabelText('Senha'), 'vendedor123');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Muitas tentativas de login. Aguarde um instante e tente de novo.');
  });
});
