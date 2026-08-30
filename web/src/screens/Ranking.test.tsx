import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Ranking } from './Ranking';
import { AuthProvider } from '../auth/AuthContext';
import { RequireAuth } from '../auth/RequireAuth';
import * as authApi from '../api/auth';
import * as gamificacaoApi from '../api/gamificacao';

vi.mock('../api/auth');
vi.mock('../api/gamificacao');

const SESSAO = {
  vendedor: { id: 'v1', nome: 'Ana Vendedora', papel: 'VENDEDOR' as const },
  loja: { id: 'loja-1', nome: 'Loja Piloto' },
  empresa: { nome: 'Sapatinho de Luxo' },
};

function renderRanking() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <RequireAuth>
          <Ranking />
        </RequireAuth>
      </AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('vendedor-ia:token', 'token-valido');
  vi.mocked(authApi.buscarSessaoAtual).mockResolvedValue(SESSAO);
});

describe('Ranking — privacidade de faturamento (Fatia 7.5A)', () => {
  it('mostra "R$ •••••" pra faturamento alheio (valor null) e o número real só pra própria linha', async () => {
    const user = userEvent.setup();
    vi.mocked(gamificacaoApi.buscarRanking).mockResolvedValue({
      tipo: 'FATURAMENTO',
      escopo: 'LOJA',
      ranking: [
        { vendedorId: 'outro', nomeVendedor: 'Outro Vendedor', posicao: 1, valor: null, gapParaAnterior: null, provisorio: false },
        { vendedorId: 'v1', nomeVendedor: 'Ana Vendedora', posicao: 2, valor: '2000.00', gapParaAnterior: 500, provisorio: false },
      ],
    });

    renderRanking();
    await user.click(await screen.findByRole('button', { name: 'Faturamento' }));

    expect(await screen.findByText('R$ •••••')).toBeInTheDocument();
    expect(screen.getByText(/2\.000,00/)).toBeInTheDocument();
  });

  it('"Sua posição" usa gapParaAnterior (nunca subtrai o valor bruto de quem está acima)', async () => {
    const user = userEvent.setup();
    vi.mocked(gamificacaoApi.buscarRanking).mockResolvedValue({
      tipo: 'FATURAMENTO',
      escopo: 'LOJA',
      ranking: [
        { vendedorId: 'outro', nomeVendedor: 'Outro Vendedor', posicao: 1, valor: null, gapParaAnterior: null, provisorio: false },
        { vendedorId: 'v1', nomeVendedor: 'Ana Vendedora', posicao: 2, valor: '2000.00', gapParaAnterior: 500, provisorio: false },
      ],
    });

    renderRanking();
    await user.click(await screen.findByRole('button', { name: 'Faturamento' }));

    expect(await screen.findByText('Sua posição')).toBeInTheDocument();
    expect(screen.getByText(/Faltam/)).toHaveTextContent('Faltam 500,00 pra alcançar Outro Vendedor (1º).');
  });

  it('ranking não-financeiro (PA) nunca mostra "R$ •••••", mesmo pra outros vendedores', async () => {
    vi.mocked(gamificacaoApi.buscarRanking).mockResolvedValue({
      tipo: 'PA',
      escopo: 'LOJA',
      ranking: [{ vendedorId: 'outro', nomeVendedor: 'Outro Vendedor', posicao: 1, valor: '5.0', gapParaAnterior: null, provisorio: false }],
    });

    renderRanking();

    expect(await screen.findByText('Outro Vendedor')).toBeInTheDocument();
    expect(screen.queryByText('R$ •••••')).not.toBeInTheDocument();
  });
});
