import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AdminNovoVendedor } from './AdminNovoVendedor';
import { ApiError } from '../../api/client';
import * as authApi from '../../api/auth';
import * as adminApi from '../../api/admin';

vi.mock('../../api/auth');
vi.mock('../../api/admin');

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authApi.listarLojas).mockResolvedValue({ lojas: [{ id: 'loja-1', nome: 'Loja Piloto', codigoErp: 'LOJA001' }] });
});

function renderTela() {
  return render(
    <MemoryRouter>
      <AdminNovoVendedor />
    </MemoryRouter>
  );
}

describe('AdminNovoVendedor', () => {
  it('pré-autoriza e mostra o código de ativação uma única vez', async () => {
    const user = userEvent.setup();
    vi.mocked(adminApi.preAutorizarVendedor).mockResolvedValue({
      id: 'v2',
      nome: 'Novo Vendedor',
      status: 'PENDING_ACTIVATION',
      tokenAtivacao: 'codigo-secreto-123',
      expiraEm: '2026-09-06T00:00:00Z',
    });

    renderTela();

    await screen.findByRole('combobox');
    await user.type(screen.getByLabelText('Nome completo'), 'Novo Vendedor');
    await user.type(screen.getByLabelText('Matrícula (loja)'), 'NOVO001');
    await user.type(screen.getByLabelText('CPF'), '111.444.777-35');
    await user.click(screen.getByRole('button', { name: 'Pré-autorizar' }));

    expect(await screen.findByText('codigo-secreto-123')).toBeInTheDocument();
    expect(screen.getByText(/Vendedor pré-autorizado/)).toBeInTheDocument();
  });

  it('mostra erro específico quando o CPF já existe na empresa', async () => {
    const user = userEvent.setup();
    vi.mocked(adminApi.preAutorizarVendedor).mockRejectedValue(new ApiError(409, 'já existe', 'cpf_duplicado'));

    renderTela();

    await screen.findByRole('combobox');
    await user.type(screen.getByLabelText('Nome completo'), 'Duplicado');
    await user.type(screen.getByLabelText('Matrícula (loja)'), 'DUP001');
    await user.type(screen.getByLabelText('CPF'), '111.444.777-35');
    await user.click(screen.getByRole('button', { name: 'Pré-autorizar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Já existe um vendedor com este CPF nesta empresa.');
  });
});
