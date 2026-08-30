import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminUsuarioDetalhe } from './AdminUsuarioDetalhe';
import * as adminApi from '../../api/admin';

vi.mock('../../api/admin');

const VENDEDOR_ATIVO = {
  id: 'v1',
  nome: 'Ana Vendedora',
  matriculaErp: 'VEND001',
  papel: 'VENDEDOR' as const,
  status: 'ACTIVE' as const,
  cpfMascarado: '***.***.***-35',
  createdAt: '2026-08-01T00:00:00Z',
  loja: { id: 'loja-1', nome: 'Loja Piloto' },
  identidadesExternas: [],
};

function renderDetalhe() {
  return render(
    <MemoryRouter initialEntries={['/admin/usuarios/v1']}>
      <Routes>
        <Route path="/admin/usuarios/:id" element={<AdminUsuarioDetalhe />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AdminUsuarioDetalhe', () => {
  it('mostra os dados do vendedor e as ações disponíveis pro status ACTIVE', async () => {
    vi.mocked(adminApi.detalharVendedorAdmin).mockResolvedValue(VENDEDOR_ATIVO);
    renderDetalhe();

    expect(await screen.findByText('Ana Vendedora')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bloquear' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desligar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desbloquear' })).not.toBeInTheDocument();
  });

  it('exige um segundo clique de confirmação antes de bloquear (evita clique acidental)', async () => {
    const user = userEvent.setup();
    vi.mocked(adminApi.detalharVendedorAdmin).mockResolvedValue(VENDEDOR_ATIVO);
    vi.mocked(adminApi.bloquearVendedor).mockResolvedValue({ id: 'v1', statusAnterior: 'ACTIVE', statusNovo: 'BLOCKED' });

    renderDetalhe();
    await screen.findByText('Ana Vendedora');

    await user.click(screen.getByRole('button', { name: 'Bloquear' }));
    expect(adminApi.bloquearVendedor).not.toHaveBeenCalled(); // só o primeiro clique não executa nada ainda

    await user.click(await screen.findByRole('button', { name: 'Confirmar' }));
    expect(adminApi.bloquearVendedor).toHaveBeenCalledWith('v1');
  });

  it('cancelar a confirmação não chama a API', async () => {
    const user = userEvent.setup();
    vi.mocked(adminApi.detalharVendedorAdmin).mockResolvedValue(VENDEDOR_ATIVO);

    renderDetalhe();
    await screen.findByText('Ana Vendedora');

    await user.click(screen.getByRole('button', { name: 'Desligar' }));
    await user.click(await screen.findByRole('button', { name: 'Cancelar' }));

    expect(adminApi.desligarVendedor).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Desligar' })).toBeInTheDocument();
  });

  it('vendedor OFFBOARDED só tem a ação de reativar', async () => {
    vi.mocked(adminApi.detalharVendedorAdmin).mockResolvedValue({ ...VENDEDOR_ATIVO, status: 'OFFBOARDED' });
    renderDetalhe();

    await screen.findByText('Ana Vendedora');
    expect(screen.getByRole('button', { name: 'Reativar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bloquear' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desligar' })).not.toBeInTheDocument();
  });
});
