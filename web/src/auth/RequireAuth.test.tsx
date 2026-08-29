import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './RequireAuth';
import { AuthProvider } from './AuthContext';
import * as authApi from '../api/auth';

vi.mock('../api/auth');

beforeEach(() => {
  localStorage.clear();
});

function renderProtegida() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<div>Tela de login</div>} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <div>Conteúdo protegido com dado sensível</div>
              </RequireAuth>
            }
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('RequireAuth', () => {
  it('redireciona pro login sem vazar o conteúdo protegido quando não há sessão', async () => {
    renderProtegida();

    expect(await screen.findByText('Tela de login')).toBeInTheDocument();
    expect(screen.queryByText('Conteúdo protegido com dado sensível')).not.toBeInTheDocument();
  });

  it('mostra o conteúdo quando a sessão é reidratada com sucesso a partir do token salvo', async () => {
    localStorage.setItem('vendedor-ia:token', 'token-valido');
    vi.mocked(authApi.buscarSessaoAtual).mockResolvedValue({
      vendedor: { id: 'v1', nome: 'Vendedor Teste', papel: 'VENDEDOR' },
      loja: { id: 'loja-1', nome: 'Loja Piloto' },
      empresa: { nome: 'Sapatinho de Luxo' },
    });

    renderProtegida();

    expect(await screen.findByText('Conteúdo protegido com dado sensível')).toBeInTheDocument();
  });

  it('redireciona pro login quando o token salvo está expirado/inválido', async () => {
    localStorage.setItem('vendedor-ia:token', 'token-expirado');
    const { ApiError } = await import('../api/client');
    vi.mocked(authApi.buscarSessaoAtual).mockRejectedValue(new ApiError(401, 'expirado'));

    renderProtegida();

    expect(await screen.findByText('Tela de login')).toBeInTheDocument();
    expect(localStorage.getItem('vendedor-ia:token')).toBeNull();
  });
});
