import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AdminTreinamento } from './AdminTreinamento';
import * as api from '../../api/adminTraining';

vi.mock('../../api/adminTraining');

function renderTela() {
  return render(
    <MemoryRouter>
      <AdminTreinamento />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.buscarDashboardTreinamento).mockResolvedValue({
    trilhasPorStatus: { DRAFT: 1, PUBLISHED: 4 },
    aulasPorStatus: { PUBLISHED: 7 },
    trilhasAtivas: 4,
    quizzesAtivos: 3,
    aulasSemQuiz: 4,
  });
  vi.mocked(api.listarTrilhasAdmin).mockResolvedValue({
    trilhas: [{ id: 't1', code: 'fund', title: 'Fundamentos', description: 'd', status: 'DRAFT', audience: 'SELLER', active: true, aulas: [] }],
  });
  vi.mocked(api.listarAulasAdmin).mockResolvedValue({ aulas: [] });
  vi.mocked(api.buscarMandamentosAdmin).mockResolvedValue({
    mandamentos: Array.from({ length: 13 }, (_, i) => ({
      numero: i + 1,
      titulo: `Mandamento ${i + 1} — pendente de conteúdo oficial`,
      conteudoOficial: null,
      explicacaoOpcional: null,
      exemploOpcional: null,
      versao: 1,
      status: 'DRAFT' as const,
    })),
    completude: { completo: false, faltando: Array.from({ length: 13 }, (_, i) => i + 1) },
  });
});

describe('AdminTreinamento', () => {
  it('mostra o dashboard com as métricas', async () => {
    renderTela();
    expect(await screen.findByText('Conteúdo & Treinamento')).toBeInTheDocument();
    expect(await screen.findByText('Trilhas ativas')).toBeInTheDocument();
    expect(screen.getByText('Trilhas ativas').nextSibling).toHaveTextContent('4');
  });

  it('aba Trilhas lista as trilhas e permite criar uma nova', async () => {
    const user = userEvent.setup();
    vi.mocked(api.criarTrilhaAdmin).mockResolvedValue({ id: 't2', code: 'nova', title: 'Nova', description: 'd', status: 'DRAFT', audience: 'SELLER', active: true, aulas: [] });

    renderTela();
    expect(await screen.findByText('Fundamentos')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Código'), 'nova');
    await user.type(screen.getByLabelText('Título'), 'Nova');
    await user.type(screen.getByLabelText('Descrição'), 'd');
    await user.click(screen.getByRole('button', { name: 'Nova trilha' }));

    await waitFor(() => expect(api.criarTrilhaAdmin).toHaveBeenCalledWith({ code: 'nova', title: 'Nova', description: 'd' }));
  });

  it('transição de trilha (DRAFT → enviar pra revisão) chama a API certa', async () => {
    const user = userEvent.setup();
    vi.mocked(api.transicionarTrilhaAdmin).mockResolvedValue({ id: 't1', code: 'fund', title: 'Fundamentos', description: 'd', status: 'REVIEW_PENDING', audience: 'SELLER', active: true, aulas: [] });

    renderTela();
    await screen.findByText('Fundamentos');

    await user.click(screen.getByRole('button', { name: 'Enviar pra revisão' }));
    await waitFor(() => expect(api.transicionarTrilhaAdmin).toHaveBeenCalledWith('t1', 'submeter'));
  });

  it('aba 13 Mandamentos mostra as 13 posições e o status de completude', async () => {
    const user = userEvent.setup();
    renderTela();

    await user.click(screen.getByRole('button', { name: '13 Mandamentos' }));

    expect(await screen.findByText(/Faltam 13 mandamento/)).toBeInTheDocument();
    // 13 textareas de conteúdo oficial = 13 posições renderizadas.
    expect(screen.getAllByPlaceholderText(/Conteúdo oficial pendente/)).toHaveLength(13);
    expect(screen.getAllByRole('button', { name: 'Publicar' })).toHaveLength(13);
  });

  it('publicar mandamento fica desabilitado sem conteúdo oficial (nenhum dos 13 tem conteúdo no fixture)', async () => {
    const user = userEvent.setup();
    renderTela();
    await user.click(screen.getByRole('button', { name: '13 Mandamentos' }));
    await screen.findByText(/Faltam 13 mandamento/);

    const botoesPublicar = screen.getAllByRole('button', { name: 'Publicar' });
    for (const botao of botoesPublicar) {
      expect(botao).toBeDisabled();
    }
  });
});
