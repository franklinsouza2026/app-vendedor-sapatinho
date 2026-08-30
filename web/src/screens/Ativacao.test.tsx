import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Ativacao } from './Ativacao';
import { AuthProvider } from '../auth/AuthContext';
import { ApiError } from '../api/client';
import * as authApi from '../api/auth';

vi.mock('../api/auth');

function renderAtivacao() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <Ativacao />
      </AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(authApi.listarLojas).mockResolvedValue({ lojas: [{ id: 'loja-1', nome: 'Loja Piloto', codigoErp: 'LOJA001' }] });
});

describe('Ativacao', () => {
  it('preenche o formulário e ativa a conta com sucesso, adotando o token retornado', async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.ativarConta).mockResolvedValue({ token: 'jwt-novo', vendedor: { id: 'v1', nome: 'Nova Vendedora', papel: 'VENDEDOR' } });
    vi.mocked(authApi.buscarSessaoAtual).mockResolvedValue({
      vendedor: { id: 'v1', nome: 'Nova Vendedora', papel: 'VENDEDOR' },
      loja: { id: 'loja-1', nome: 'Loja Piloto' },
      empresa: { nome: 'Sapatinho de Luxo' },
    });

    renderAtivacao();

    await screen.findByRole('combobox', { name: 'Loja' });
    await user.type(screen.getByLabelText('CPF'), '111.444.777-35');
    await user.type(screen.getByLabelText('Código de ativação'), 'token-abc');
    await user.type(screen.getByLabelText('Crie uma senha'), 'senhaNova123');
    await user.type(screen.getByLabelText('Confirme a senha'), 'senhaNova123');
    await user.click(screen.getByRole('button', { name: 'Ativar conta' }));

    await waitFor(() =>
      expect(authApi.ativarConta).toHaveBeenCalledWith({
        codigoErpLoja: 'LOJA001',
        cpf: '111.444.777-35',
        token: 'token-abc',
        senha: 'senhaNova123',
      })
    );
    await waitFor(() => expect(localStorage.getItem('vendedor-ia:token')).toBe('jwt-novo'));
  });

  it('mostra erro quando as senhas não coincidem, sem chamar a API', async () => {
    const user = userEvent.setup();
    renderAtivacao();

    await screen.findByRole('combobox', { name: 'Loja' });
    await user.type(screen.getByLabelText('CPF'), '111.444.777-35');
    await user.type(screen.getByLabelText('Código de ativação'), 'token-abc');
    await user.type(screen.getByLabelText('Crie uma senha'), 'senhaNova123');
    await user.type(screen.getByLabelText('Confirme a senha'), 'outraSenha123');
    await user.click(screen.getByRole('button', { name: 'Ativar conta' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('As senhas não coincidem.');
    expect(authApi.ativarConta).not.toHaveBeenCalled();
  });

  it('mostra mensagem genérica quando CPF/token são inválidos (nunca confirma qual dado errou)', async () => {
    const user = userEvent.setup();
    vi.mocked(authApi.ativarConta).mockRejectedValue(new ApiError(400, 'dados de ativação inválidos', 'ativacao_invalida'));

    renderAtivacao();

    await screen.findByRole('combobox', { name: 'Loja' });
    await user.type(screen.getByLabelText('CPF'), '111.444.777-35');
    await user.type(screen.getByLabelText('Código de ativação'), 'token-errado');
    await user.type(screen.getByLabelText('Crie uma senha'), 'senhaNova123');
    await user.type(screen.getByLabelText('Confirme a senha'), 'senhaNova123');
    await user.click(screen.getByRole('button', { name: 'Ativar conta' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('CPF, código de ativação ou senha inválidos');
  });
});
