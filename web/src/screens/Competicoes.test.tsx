import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Competicoes } from './Competicoes';
import { AuthProvider } from '../auth/AuthContext';
import { RequireAuth } from '../auth/RequireAuth';
import * as authApi from '../api/auth';
import * as api from '../api/competicoes';

vi.mock('../api/auth');
vi.mock('../api/competicoes');

const SESSAO = {
  vendedor: { id: 'v1', nome: 'Ana Vendedora', papel: 'VENDEDOR' as const },
  loja: { id: 'loja-1', nome: 'Loja Piloto' },
  empresa: { nome: 'Sapatinho de Luxo' },
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('vendedor-ia:token', 'token-valido');
  vi.mocked(authApi.buscarSessaoAtual).mockResolvedValue(SESSAO);
  vi.mocked(api.listarMinhasCompeticoes).mockResolvedValue({
    competicoes: [{ id: 'c1', seasonId: null, code: 'c1', name: 'Desafio de Consistência', description: 'd', participantType: 'SELLER', metricType: 'CONSISTENCY', status: 'ACTIVE', startsAt: '', endsAt: '', rewardXp: 0, rewardMoedas: 0, rewardBadgeCodigo: null }],
  });
  vi.mocked(api.listarMinhasLigas).mockResolvedValue({ ligas: [{ id: 'l1', code: 'bronze', name: 'Bronze', sortOrder: 0, active: true }], minhaLiga: { id: 'l1', code: 'bronze', name: 'Bronze', sortOrder: 0, active: true } });
  vi.mocked(api.listarFeed).mockResolvedValue({ eventos: [], proximoCursor: null });
  vi.mocked(api.listarMeusReconhecimentos).mockResolvedValue({ reconhecimentos: [] });
  vi.mocked(api.buscarTemporadaAtual).mockResolvedValue({ season: null });
});

function renderTela() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <RequireAuth>
          <Competicoes />
        </RequireAuth>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('Competicoes', () => {
  it('mostra competições ativas por padrão', async () => {
    renderTela();
    expect(await screen.findByText('Desafio de Consistência')).toBeInTheDocument();
  });

  it('troca pra aba de Liga e mostra a liga atual', async () => {
    const user = userEvent.setup();
    renderTela();
    await screen.findByText('Desafio de Consistência');

    await user.click(screen.getByRole('button', { name: 'Minha Liga' }));
    expect(await screen.findByText('Sua liga atual')).toBeInTheDocument();
    expect(screen.getAllByText('Bronze').length).toBeGreaterThan(0);
  });

  it('expande uma competição e mostra a posição real (busca sob demanda, nunca antes de clicar)', async () => {
    const user = userEvent.setup();
    vi.mocked(api.buscarCompeticao).mockResolvedValue({
      competicao: { id: 'c1', seasonId: null, code: 'c1', name: 'Desafio de Consistência', description: 'd', participantType: 'SELLER', metricType: 'CONSISTENCY', status: 'ACTIVE', startsAt: '', endsAt: '', rewardXp: 0, rewardMoedas: 0, rewardBadgeCodigo: null },
      ranking: [{ participantId: 'v1', score: 80, posicao: 1, status: 'ACTIVE' }],
    });

    renderTela();
    await user.click(await screen.findByText('Desafio de Consistência'));

    expect(await screen.findByText(/Sua posição/)).toBeInTheDocument();
    expect(api.buscarCompeticao).toHaveBeenCalledWith('c1');
  });

  it('aba Temporada só aparece quando há season ativa, mostra ranking de Season Points (nunca faturamento)', async () => {
    const user = userEvent.setup();
    vi.mocked(api.buscarTemporadaAtual).mockResolvedValue({ season: { id: 's1', code: 's1', name: 'Temporada de Verão', description: 'd', status: 'ACTIVE', startsAt: '', endsAt: '' } });
    vi.mocked(api.buscarRankingTemporada).mockResolvedValue({ ranking: [{ participantId: 'v1', points: 100, posicao: 1, nomeVendedor: 'Ana Vendedora' }] });

    renderTela();
    await screen.findByText('Desafio de Consistência');
    await user.click(screen.getByRole('button', { name: 'Temporada' }));

    expect(await screen.findByText('Temporada de Verão')).toBeInTheDocument();
    expect(screen.getByText('100 pts')).toBeInTheDocument();
    expect(api.buscarRankingTemporada).toHaveBeenCalledWith('s1');
  });

  it('sem season ativa, a aba Temporada nem aparece', async () => {
    renderTela();
    await screen.findByText('Desafio de Consistência');
    expect(screen.queryByRole('button', { name: 'Temporada' })).not.toBeInTheDocument();
  });
});
