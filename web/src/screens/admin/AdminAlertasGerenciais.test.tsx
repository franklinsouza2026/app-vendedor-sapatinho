import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AdminAlertasGerenciais } from './AdminAlertasGerenciais';
import * as adminGerencialApi from '../../api/adminGerencial';

vi.mock('../../api/adminGerencial');

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(adminGerencialApi.listarConfigsAlertas).mockResolvedValue({
    configs: [{ tipo: 'NO_SALES_RECENTLY', ativo: true, parametros: { diasSemVenda: 2 }, versao: 0 }],
    tiposDisponiveis: ['NO_SALES_RECENTLY'],
  });
});

describe('AdminAlertasGerenciais', () => {
  it('lista o threshold atual e permite salvar uma alteração', async () => {
    const user = userEvent.setup();
    vi.mocked(adminGerencialApi.atualizarConfigAlerta).mockResolvedValue({ tipo: 'NO_SALES_RECENTLY', ativo: true, parametros: { diasSemVenda: 3 }, versao: 1 });

    render(
      <MemoryRouter>
        <AdminAlertasGerenciais />
      </MemoryRouter>
    );

    expect(await screen.findByText('NO_SALES_RECENTLY')).toBeInTheDocument();
    const input = screen.getByDisplayValue('2');
    await user.clear(input);
    await user.type(input, '3');
    await user.click(screen.getByRole('button', { name: /Salvar/ }));

    expect(adminGerencialApi.atualizarConfigAlerta).toHaveBeenCalledWith('NO_SALES_RECENTLY', true, { diasSemVenda: 3 });
  });
});
