import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AdminGamificacao } from './AdminGamificacao';
import * as api from '../../api/competicoes';

vi.mock('../../api/competicoes');

function renderTela() {
  return render(
    <MemoryRouter>
      <AdminGamificacao />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listarSeasonsAdmin).mockResolvedValue({ seasons: [{ id: 's1', code: 's1', name: 'Temporada 1', description: 'd', status: 'DRAFT', startsAt: '', endsAt: '' }] });
  vi.mocked(api.listarCompeticoesAdmin).mockResolvedValue({ competicoes: [] });
  vi.mocked(api.listarLigasAdmin).mockResolvedValue({ ligas: [{ id: 'l1', code: 'bronze', name: 'Bronze', sortOrder: 0, active: true, promotionThreshold: null, relegationThreshold: null }] });
});

describe('AdminGamificacao', () => {
  it('mostra temporadas e permite agendar uma DRAFT', async () => {
    const user = userEvent.setup();
    vi.mocked(api.transicionarSeasonAdmin).mockResolvedValue({ id: 's1', code: 's1', name: 'Temporada 1', description: 'd', status: 'SCHEDULED', startsAt: '', endsAt: '' });

    renderTela();
    expect(await screen.findByText('Temporada 1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Agendar' }));
    expect(api.transicionarSeasonAdmin).toHaveBeenCalledWith('s1', 'agendar');
  });

  it('troca pra aba Ligas e mostra o catálogo', async () => {
    const user = userEvent.setup();
    renderTela();
    await user.click(screen.getByRole('button', { name: 'Ligas' }));
    expect(await screen.findByText('Bronze')).toBeInTheDocument();
  });

  it('edita e arquiva uma liga existente (Fatia 9.6, seção 49-50)', async () => {
    const user = userEvent.setup();
    vi.mocked(api.atualizarLigaAdmin).mockResolvedValue({ id: 'l1', code: 'bronze', name: 'Bronze Renomeada', sortOrder: 1, active: true, promotionThreshold: null, relegationThreshold: null });

    renderTela();
    await user.click(screen.getByRole('button', { name: 'Ligas' }));
    await screen.findByText('Bronze');

    await user.click(screen.getByRole('button', { name: 'Editar' }));
    const input = screen.getByDisplayValue('Bronze');
    await user.clear(input);
    await user.type(input, 'Bronze Renomeada');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(api.atualizarLigaAdmin).toHaveBeenCalledWith('l1', { name: 'Bronze Renomeada', sortOrder: 0 });

    await user.click(screen.getByRole('button', { name: 'Arquivar' }));
    expect(api.atualizarLigaAdmin).toHaveBeenCalledWith('l1', { active: false });
  });
});
