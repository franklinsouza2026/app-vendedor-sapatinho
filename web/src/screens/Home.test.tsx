import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Home } from './Home';
import { AuthProvider } from '../auth/AuthContext';
import { RequireAuth } from '../auth/RequireAuth';
import * as authApi from '../api/auth';
import * as metasApi from '../api/metas';
import * as gamificacaoApi from '../api/gamificacao';
import * as missoesApi from '../api/missoes';
import * as competicoesApi from '../api/competicoes';
import * as managerPanelApi from '../api/managerPanel';

vi.mock('../api/auth');
vi.mock('../api/metas');
vi.mock('../api/gamificacao');
vi.mock('../api/missoes');
vi.mock('../api/competicoes');
vi.mock('../api/managerPanel');

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
    ranking: [{ vendedorId: 'v1', nomeVendedor: 'Ana Vendedora', posicao: 1, valor: '800', gapParaAnterior: null, provisorio: false }],
  });
  vi.mocked(missoesApi.buscarMissoesAtivas).mockResolvedValue({ missoes: [] });
  vi.mocked(competicoesApi.buscarTemporadaAtual).mockResolvedValue({ season: null });
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
    // Conselheiro logo após a saudação (Fatia 9.6, seção 17).
    expect(screen.getByText('Conselheiro').closest('a')).toHaveAttribute('href', '/coach');
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

  it('mostra o bloco "Missões de hoje" com CTA pra rota certa quando há missões pendentes', async () => {
    vi.mocked(metasApi.buscarMinhasMetas).mockResolvedValue({
      vendedorId: 'v1',
      progresso: [
        { periodo: 'DIA', metaFaturamento: null, realizado: { faturamento: 0, ticketMedio: 0, pa: 0, numAtendimentos: 0 }, faltaParaMeta: null },
        { periodo: 'SEMANA', metaFaturamento: null, realizado: { faturamento: 0, ticketMedio: 0, pa: 0, numAtendimentos: 0 }, faltaParaMeta: null },
        { periodo: 'MES', metaFaturamento: null, realizado: { faturamento: 0, ticketMedio: 0, pa: 0, numAtendimentos: 0 }, faltaParaMeta: null },
      ],
    });
    vi.mocked(missoesApi.buscarMissoesAtivas).mockResolvedValue({
      missoes: [
        {
          id: 'm1',
          status: 'ASSIGNED',
          progressoAtual: 1,
          progressoAlvo: 3,
          startsAt: '2026-08-29T00:00:00Z',
          expiresAt: '2026-08-30T00:00:00Z',
          completedAt: null,
          missao: { code: 'COMPLETE_SIMULATION', title: 'Conclua uma simulação de atendimento', category: 'SIMULATION', actionType: 'SIMULATOR', actionReference: null },
        },
      ],
    });

    renderHome();

    expect(await screen.findByText('Missões de hoje')).toBeInTheDocument();
    expect(screen.getByText('Conclua uma simulação de atendimento')).toBeInTheDocument();
    const cta = screen.getByRole('link', { name: 'Treinar agora' });
    expect(cta).toHaveAttribute('href', '/simulador');
  });

  it('não mostra o bloco de missões quando não há nenhuma pendente', async () => {
    vi.mocked(metasApi.buscarMinhasMetas).mockResolvedValue({
      vendedorId: 'v1',
      progresso: [
        { periodo: 'DIA', metaFaturamento: null, realizado: { faturamento: 0, ticketMedio: 0, pa: 0, numAtendimentos: 0 }, faltaParaMeta: null },
        { periodo: 'SEMANA', metaFaturamento: null, realizado: { faturamento: 0, ticketMedio: 0, pa: 0, numAtendimentos: 0 }, faltaParaMeta: null },
        { periodo: 'MES', metaFaturamento: null, realizado: { faturamento: 0, ticketMedio: 0, pa: 0, numAtendimentos: 0 }, faltaParaMeta: null },
      ],
    });

    renderHome();

    await screen.findByText('Nenhuma meta de hoje cadastrada ainda.');
    expect(screen.queryByText('Missões de hoje')).not.toBeInTheDocument();
  });

  it('mostra o bloco de Temporada só quando há uma season ACTIVE (seção 41/86/94)', async () => {
    vi.mocked(competicoesApi.buscarTemporadaAtual).mockResolvedValue({
      season: { id: 's1', code: 's1', name: 'Temporada de Verão', description: 'd', status: 'ACTIVE', startsAt: new Date().toISOString(), endsAt: new Date().toISOString() },
    });

    renderHome();
    expect(await screen.findByText('Temporada de Verão')).toBeInTheDocument();
  });

  it('nunca mostra o bloco de Temporada quando não há season ativa', async () => {
    vi.mocked(competicoesApi.buscarTemporadaAtual).mockResolvedValue({ season: null });

    renderHome();
    await screen.findByText(/Bom dia|Boa tarde|Boa noite/);
    expect(screen.queryByText('Temporada em andamento')).not.toBeInTheDocument();
  });

  it('mostra tela de erro com opção de tentar de novo quando a API falha', async () => {
    vi.mocked(metasApi.buscarMinhasMetas).mockRejectedValue(new Error('falha de rede'));

    renderHome();

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar os dados agora.');
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });
});

describe('Home — GERENTE nunca vê a Home de vendedor (Fatia 9, seção 4)', () => {
  it('renderiza a Home do Gerente (situação da loja) em vez de meta/PA/ticket pessoal', async () => {
    vi.mocked(authApi.buscarSessaoAtual).mockResolvedValue({
      vendedor: { id: 'ger1', nome: 'Gerente Geral', papel: 'GERENTE' as const },
      loja: { id: 'loja-1', nome: 'Loja Piloto' },
      empresa: { nome: 'Sapatinho de Luxo' },
    });
    vi.mocked(managerPanelApi.buscarGerenteHome).mockResolvedValue({
      storeSummary: { lojaId: 'loja-1', referencia: new Date().toISOString(), metaFaturamento: 10000, realizado: 4000, percentualAtingido: 40, faltaParaMeta: 6000, pa: 2, ticketMedio: 100, vendedoresAtivosHoje: 2, totalVendedores: 5, freshness: null },
      alertasPrioritarios: [],
      highlights: [],
      pendenciasResumo: { vendedoresAbaixoDaMetaEsperada: 0, followUpsPendentes: 0, followUpsVencidos: 0, reconhecimentosSugeridos: 0, treinamentosPendentes: 0 },
    });

    renderHome();

    expect(await screen.findByText(/Gerente/)).toBeInTheDocument();
    expect(screen.getByText('Meta do mês (loja)')).toBeInTheDocument();
    expect(screen.getByText('Minha Equipe')).toBeInTheDocument();
    expect(screen.queryByText('Meta hoje')).not.toBeInTheDocument(); // nunca a meta pessoal do vendedor
    // Assistente de Gestão logo após a saudação (Fatia 9.6, seção 19).
    expect(screen.getByText('Assistente de Gestão')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pedir conselho' })).toBeInTheDocument();
  });
});
