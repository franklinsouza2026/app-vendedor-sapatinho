import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Home } from './Home';
import { AuthProvider } from '../auth/AuthContext';
import { RequireAuth } from '../auth/RequireAuth';
import * as authApi from '../api/auth';
import * as metasApi from '../api/metas';
import * as gamificacaoApi from '../api/gamificacao';

vi.mock('../api/auth');
vi.mock('../api/metas');
vi.mock('../api/gamificacao');

const SESSAO = {
  vendedor: { id: 'v1', nome: 'Ana Vendedora', papel: 'VENDEDOR' as const },
  loja: { id: 'loja-1', nome: 'Loja Piloto' },
  empresa: { nome: 'Sapatinho de Luxo' },
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('vendedor-ia:token', 'token-valido');
  vi.mocked(authApi.buscarSessaoAtual).mockResolvedValue(SESSAO);
  vi.mocked(gamificacaoApi.buscarStreak).mockResolvedValue({ streakAtual: 2, maiorStreak: 5, ultimaDataContada: null });
  vi.mocked(gamificacaoApi.buscarCarteira).mockResolvedValue({
    saldoMoedas: 120,
    xp: 250,
    nivel: { versao: 1, nivel: 1, nome: 'Bronze', xpAtual: 250, xpProximoNivel: 300 },
  });
  vi.mocked(gamificacaoApi.buscarRanking).mockResolvedValue({
    tipo: 'SCORE_GERAL',
    escopo: 'LOJA',
    ranking: [{ vendedorId: 'v1', nomeVendedor: 'Ana Vendedora', posicao: 1, valor: '800', provisorio: false }],
  });
});

// Home só é montada atrás de RequireAuth na aplicação real (App.tsx) — nunca
// com sessao === null. Reproduz essa mesma estrutura aqui, senão o teste
// exercita um estado que o componente nunca precisa tratar de verdade.
function renderHome() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <RequireAuth>
          <Home />
        </RequireAuth>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('Home', () => {
  it('mostra saudação com o primeiro nome e a meta do dia com a "meta inteligente"', async () => {
    vi.mocked(metasApi.buscarMinhasMetas).mockResolvedValue({
      vendedorId: 'v1',
      progresso: [
        {
          periodo: 'DIA',
          metaFaturamento: 1000,
          realizado: { faturamento: 700, ticketMedio: 100, pa: 2, numAtendimentos: 7 },
          faltaParaMeta: 300,
        },
        { periodo: 'SEMANA', metaFaturamento: null, realizado: { faturamento: 0, ticketMedio: 0, pa: 0, numAtendimentos: 0 }, faltaParaMeta: null },
        { periodo: 'MES', metaFaturamento: null, realizado: { faturamento: 0, ticketMedio: 0, pa: 0, numAtendimentos: 0 }, faltaParaMeta: null },
      ],
    });

    renderHome();

    expect(await screen.findByText(/Ana/)).toBeInTheDocument();
    expect(await screen.findByText('R$ 300,00')).toBeInTheDocument(); // falta
    expect(screen.getByText(/aproximadamente/)).toHaveTextContent('3 vendas'); // ceil(300/100)
    expect(screen.getByText('1º de 1')).toBeInTheDocument();
  });

  it('nunca mostra "undefined"/"null" cru na tela quando não há meta cadastrada', async () => {
    vi.mocked(metasApi.buscarMinhasMetas).mockResolvedValue({
      vendedorId: 'v1',
      progresso: [
        { periodo: 'DIA', metaFaturamento: null, realizado: { faturamento: 0, ticketMedio: 0, pa: 0, numAtendimentos: 0 }, faltaParaMeta: null },
        { periodo: 'SEMANA', metaFaturamento: null, realizado: { faturamento: 0, ticketMedio: 0, pa: 0, numAtendimentos: 0 }, faltaParaMeta: null },
        { periodo: 'MES', metaFaturamento: null, realizado: { faturamento: 0, ticketMedio: 0, pa: 0, numAtendimentos: 0 }, faltaParaMeta: null },
      ],
    });

    renderHome();

    expect(await screen.findByText('Nenhuma meta de hoje cadastrada ainda.')).toBeInTheDocument();
    expect(screen.queryByText('undefined')).not.toBeInTheDocument();
    expect(screen.queryByText('null')).not.toBeInTheDocument();
  });

  it('mostra tela de erro com opção de tentar de novo quando a API falha', async () => {
    vi.mocked(metasApi.buscarMinhasMetas).mockRejectedValue(new Error('falha de rede'));

    renderHome();

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar os dados agora.');
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });
});
