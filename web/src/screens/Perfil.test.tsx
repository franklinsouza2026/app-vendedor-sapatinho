import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Perfil } from './Perfil';
import { AuthProvider } from '../auth/AuthContext';
import { RequireAuth } from '../auth/RequireAuth';
import * as authApi from '../api/auth';
import * as gamificacaoApi from '../api/gamificacao';

vi.mock('../api/auth');
vi.mock('../api/gamificacao');

function sessaoDe(papel: 'VENDEDOR' | 'ADMIN', cpfMascarado: string | null = null) {
  return {
    vendedor: { id: 'v1', nome: 'Ana Vendedora', papel, cpfMascarado },
    loja: { id: 'loja-1', nome: 'Loja Piloto' },
    empresa: { nome: 'Sapatinho de Luxo' },
  };
}

function renderPerfil() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <RequireAuth>
          <Perfil />
        </RequireAuth>
      </AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('vendedor-ia:token', 'token-valido');
  vi.mocked(gamificacaoApi.buscarCarteira).mockResolvedValue({
    saldoMoedas: 100,
    xp: 50,
    nivel: { versao: 1, nivel: 1, nome: 'Bronze', xpAtual: 50, xpProximoNivel: 200 },
  });
  vi.mocked(gamificacaoApi.buscarStreak).mockResolvedValue({ streakAtual: 1, maiorStreak: 1, ultimaDataContada: null });
});

describe('Perfil', () => {
  it('mostra o CPF mascarado quando presente, nunca o valor completo', async () => {
    vi.mocked(authApi.buscarSessaoAtual).mockResolvedValue(sessaoDe('VENDEDOR', '***.***.***-35'));
    renderPerfil();

    expect(await screen.findByText(/\*\*\*\.\*\*\*\.\*\*\*-35/)).toBeInTheDocument();
  });

  it('não mostra linha de CPF quando o vendedor não tem CPF cadastrado', async () => {
    vi.mocked(authApi.buscarSessaoAtual).mockResolvedValue(sessaoDe('VENDEDOR', null));
    renderPerfil();

    await screen.findByText('Ana Vendedora');
    expect(screen.queryByText(/CPF:/)).not.toBeInTheDocument();
  });

  it('sempre mostra o link de Segurança/alterar senha', async () => {
    vi.mocked(authApi.buscarSessaoAtual).mockResolvedValue(sessaoDe('VENDEDOR'));
    renderPerfil();

    expect(await screen.findByRole('link', { name: /Segurança/ })).toHaveAttribute('href', '/perfil/senha');
  });

  it('mostra o link de Administração só pra papel ADMIN', async () => {
    vi.mocked(authApi.buscarSessaoAtual).mockResolvedValue(sessaoDe('ADMIN'));
    renderPerfil();

    expect(await screen.findByRole('link', { name: /Administração/ })).toHaveAttribute('href', '/admin/usuarios');
  });

  it('VENDEDOR comum não vê o link de Administração', async () => {
    vi.mocked(authApi.buscarSessaoAtual).mockResolvedValue(sessaoDe('VENDEDOR'));
    renderPerfil();

    await screen.findByText('Ana Vendedora');
    expect(screen.queryByRole('link', { name: /Administração/ })).not.toBeInTheDocument();
  });
});
