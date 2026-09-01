import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AdminUniversidade } from './AdminUniversidade';
import * as api from '../../api/universidade';

vi.mock('../../api/universidade');

function renderTela() {
  return render(
    <MemoryRouter>
      <AdminUniversidade />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listarEscolasAdmin).mockResolvedValue({ escolas: [{ id: 'e1', code: 'vendas', name: 'Escola de Vendas', description: 'd', audience: 'SELLER', active: true }] });
  vi.mocked(api.listarCompetenciasAdmin).mockResolvedValue({ competencias: [{ id: 'c1', code: 'FECHAMENTO', name: 'Fechamento', description: 'd', audience: 'SELLER', category: null, status: 'ACTIVE' }] });
  vi.mocked(api.listarCertificacoesAdmin).mockResolvedValue({
    definicoes: [{ id: 'd1', code: 'cert-1', name: 'Certificação 13 Mandamentos', description: 'd', status: 'DRAFT', version: 1, validityMonths: null, requisitos: [] }],
  });
  vi.mocked(api.listarPDIsAdmin).mockResolvedValue({ planos: [] });
});

describe('AdminUniversidade', () => {
  it('mostra escolas e cria uma nova', async () => {
    const user = userEvent.setup();
    vi.mocked(api.criarEscolaAdmin).mockResolvedValue({ id: 'e2', code: 'nova', name: 'Nova', description: 'd', audience: 'BOTH', active: true });

    renderTela();
    expect(await screen.findByText('Escola de Vendas')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Código'), 'nova');
    await user.type(screen.getByPlaceholderText('Nome'), 'Nova');
    await user.type(screen.getByPlaceholderText('Descrição'), 'd');
    await user.click(screen.getByRole('button', { name: 'Nova escola' }));

    expect(api.criarEscolaAdmin).toHaveBeenCalledWith({ code: 'nova', name: 'Nova', description: 'd' });
  });

  it('troca pra aba de competências e define uma meta por papel', async () => {
    const user = userEvent.setup();
    vi.mocked(api.definirTargetAdmin).mockResolvedValue({});

    renderTela();
    await user.click(screen.getByRole('button', { name: 'Competências' }));
    await screen.findByText('Fechamento');

    await user.click(screen.getByRole('button', { name: 'Metas' }));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(api.definirTargetAdmin).toHaveBeenCalledWith('c1', 'VENDEDOR', 70);
  });

  it('certificação DRAFT sem requisitos mostra atalho pra requisito dos 13 Mandamentos, nunca o botão Publicar direto', async () => {
    const user = userEvent.setup();
    renderTela();
    await user.click(screen.getByRole('button', { name: 'Certificações' }));

    expect(await screen.findByText('Certificação 13 Mandamentos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ requisito 13 Mandamentos' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publicar' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar pra revisão' })).toBeInTheDocument();
  });
});
