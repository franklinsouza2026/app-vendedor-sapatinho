import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminUsuarios } from './AdminUsuarios';
import * as adminApi from '../../api/admin';

vi.mock('../../api/admin');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AdminUsuarios', () => {
  it('lista vendedores com status e CPF mascarado, nunca o valor completo', async () => {
    vi.mocked(adminApi.listarVendedoresAdmin).mockResolvedValue({
      vendedores: [
        {
          id: 'v1',
          nome: 'Ana Vendedora',
          matriculaErp: 'VEND001',
          papel: 'VENDEDOR',
          status: 'ACTIVE',
          cpfMascarado: '***.***.***-35',
          createdAt: '2026-08-01T00:00:00Z',
          loja: { id: 'loja-1', nome: 'Loja Piloto' },
        },
      ],
    });

    render(
      <MemoryRouter>
        <AdminUsuarios />
      </MemoryRouter>
    );

    expect(await screen.findByText('Ana Vendedora')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'ativo' })).toBeInTheDocument();
    expect(screen.getByText('***.***.***-35')).toBeInTheDocument();
  });

  it('mostra empty state quando não há vendedores', async () => {
    vi.mocked(adminApi.listarVendedoresAdmin).mockResolvedValue({ vendedores: [] });

    render(
      <MemoryRouter>
        <AdminUsuarios />
      </MemoryRouter>
    );

    expect(await screen.findByText('Nenhum usuário encontrado.')).toBeInTheDocument();
  });

  it('tem link pra pré-autorizar novo vendedor', async () => {
    vi.mocked(adminApi.listarVendedoresAdmin).mockResolvedValue({ vendedores: [] });

    render(
      <MemoryRouter>
        <AdminUsuarios />
      </MemoryRouter>
    );

    expect(await screen.findByRole('link', { name: /Pré-autorizar vendedor/ })).toHaveAttribute('href', '/admin/usuarios/novo');
  });
});
