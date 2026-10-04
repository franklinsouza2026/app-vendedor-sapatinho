// Sessão × rede: só o servidor (401/403) invalida a sessão; sem internet o
// token fica guardado e o app avisa "Sem conexão" em vez de deslogar.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import { RequireAuth } from './RequireAuth';
import * as authApi from '../api/auth';
import { ApiError } from '../api/client';

vi.mock('../api/auth');

function abrir() {
  return render(
    <MemoryRouter initialEntries={['/inicio']}>
      <AuthProvider>
        <Routes>
          <Route path="/inicio" element={<RequireAuth><p>App da vendedora</p></RequireAuth>} />
          <Route path="/login" element={<p>Tela de login</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('vendedor-ia:token', 'token-guardado');
});

describe('restauração da sessão sem internet', () => {
  it('falha de rede: não desloga, mostra "Sem conexão" e retoma quando a rede volta', async () => {
    vi.mocked(authApi.buscarSessaoAtual).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    abrir();
    expect(await screen.findByRole('heading', { name: 'Sem conexão' })).toBeInTheDocument();
    expect(localStorage.getItem('vendedor-ia:token')).toBe('token-guardado');
    expect(screen.queryByText('Tela de login')).not.toBeInTheDocument();

    vi.mocked(authApi.buscarSessaoAtual).mockResolvedValue({ vendedor: { id: 'v1', nome: 'Ana', papel: 'VENDEDOR' }, loja: { id: 'l1', nome: 'Loja' }, empresa: { nome: 'Empresa' } } as never);
    window.dispatchEvent(new Event('online'));
    expect(await screen.findByText('App da vendedora')).toBeInTheDocument();
  });

  it('servidor responde 401: a sessão é descartada e vai para o login', async () => {
    vi.mocked(authApi.buscarSessaoAtual).mockRejectedValueOnce(new ApiError(401, 'sessão expirada'));
    abrir();
    expect(await screen.findByText('Tela de login')).toBeInTheDocument();
    await waitFor(() => expect(localStorage.getItem('vendedor-ia:token')).toBeNull());
  });
});
