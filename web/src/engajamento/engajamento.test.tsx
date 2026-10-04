import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { CheckinProvider } from './CheckinContext';
import { Home } from '../screens/Home';
import { RequireAuth } from '../auth/RequireAuth';
import { AdminEngajamento } from '../screens/admin/AdminEngajamento';
import { AdminGamificacao } from '../screens/admin/AdminGamificacao';
import * as authApi from '../api/auth';
import * as metasApi from '../api/metas';
import * as gamificacaoApi from '../api/gamificacao';
import * as missoesApi from '../api/missoes';
import * as competicoesApi from '../api/competicoes';
import * as engajamentoApi from '../api/engajamento';
import * as adminApi from '../api/admin';
import type { ResultadoAcesso } from '../api/engajamento';

vi.mock('../api/auth');
vi.mock('../api/metas');
vi.mock('../api/gamificacao');
vi.mock('../api/missoes');
vi.mock('../api/competicoes');
vi.mock('../api/engajamento');
vi.mock('../api/admin');
vi.mock('../api/managerPanel');

const VENDEDORA = { vendedor: { id: 'v1', nome: 'Ana Vendedora', papel: 'VENDEDOR' as const }, loja: { id: 'l1', nome: 'Caruaru Shopping' }, empresa: { nome: 'Sapatinho de Luxo' } };
const ADMIN = { vendedor: { id: 'a1', nome: 'Admin', papel: 'ADMIN' as const }, loja: { id: 'l1', nome: 'Caruaru Shopping' }, empresa: { nome: 'Sapatinho de Luxo' } };
const vazio = { periodo: 'DIA' as const, metaFaturamento: null, realizado: { faturamento: 0, ticketMedio: 0, pa: 0, numAtendimentos: 0 }, faltaParaMeta: null };

function acesso(over: Partial<ResultadoAcesso> = {}): ResultadoAcesso {
  return { dia: '2026-10-21', primeiroAcessoDoDia: false, recompensaAgora: null, checkinConcluido: true, recompensaHoje: { xp: 7, moedas: 3 }, quantidadeAcessosHoje: 2, streakAcesso: 4, config: { ativo: true, xp: 7, moedas: 3 }, ...over };
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('vendedor-ia:token', 't');
  vi.mocked(authApi.buscarSessaoAtual).mockResolvedValue(VENDEDORA);
  vi.mocked(metasApi.buscarMinhasMetas).mockResolvedValue({ vendedorId: 'v1', sincronizadoEm: null, progresso: [vazio, { ...vazio, periodo: 'SEMANA' }, { ...vazio, periodo: 'MES' }] });
  vi.mocked(gamificacaoApi.buscarCarteira).mockResolvedValue({ saldoMoedas: 128, xp: 840, nivel: { versao: 1, nivel: 3, nome: 'Ouro', xpAtual: 840, xpProximoNivel: 1800 } });
  vi.mocked(gamificacaoApi.buscarStreak).mockResolvedValue({ streakAtual: 2, maiorStreak: 5, ultimaDataContada: null });
  vi.mocked(gamificacaoApi.buscarRanking).mockResolvedValue({ tipo: 'SCORE_GERAL', escopo: 'LOJA', ranking: [] });
  vi.mocked(missoesApi.buscarMissoesAtivas).mockResolvedValue({ missoes: [] });
  vi.mocked(competicoesApi.buscarTemporadaAtual).mockResolvedValue({ season: null });
});

function renderVendedor() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <CheckinProvider>
          <RequireAuth>
            <Home />
          </RequireAuth>
        </CheckinProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('check-in diário — vendedora', () => {
  it('primeiro acesso do dia com recompensa: celebração com XP, VendaCoins e sequência', async () => {
    vi.mocked(engajamentoApi.registrarAcesso).mockResolvedValue(acesso({ primeiroAcessoDoDia: true, recompensaAgora: { xp: 7, moedas: 3 }, quantidadeAcessosHoje: 1 }));
    vi.mocked(engajamentoApi.buscarMeuEngajamento).mockResolvedValue({ hoje: '2026-10-21', acessouHoje: true, recompensaHoje: { xp: 7, moedas: 3 }, config: { ativo: true, xp: 7, moedas: 3 }, streakAtual: 4, maiorStreak: 9, semana: { diasComAcesso: 3, diasValidos: 3, percentual: 100 } });
    renderVendedor();
    const dialogo = await screen.findByRole('dialog', { name: 'Check-in diário concluído' });
    expect(dialogo).toHaveTextContent('+7 XP');
    expect(dialogo).toHaveTextContent('+3 VendaCoins');
    expect(dialogo).toHaveTextContent('4 dias seguidos');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Continuar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('acessos seguintes do dia: sem celebração, só "Check-in de hoje concluído"', async () => {
    vi.mocked(engajamentoApi.registrarAcesso).mockResolvedValue(acesso());
    vi.mocked(engajamentoApi.buscarMeuEngajamento).mockResolvedValue({ hoje: '2026-10-21', acessouHoje: true, recompensaHoje: { xp: 7, moedas: 3 }, config: { ativo: true, xp: 7, moedas: 3 }, streakAtual: 4, maiorStreak: 9, semana: { diasComAcesso: 3, diasValidos: 3, percentual: 100 } });
    renderVendedor();
    expect(await screen.findByText(/Check-in de hoje concluído/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('840')).toBeInTheDocument(); // XP
    expect(screen.getByText('128')).toBeInTheDocument(); // VendaCoins
    expect(screen.getByText('dias acessando')).toBeInTheDocument();
  });

  it('antes do check-in, mostra quanto pode ganhar — valores da configuração, não fixos', async () => {
    vi.mocked(engajamentoApi.registrarAcesso).mockRejectedValue(new Error('offline'));
    vi.mocked(engajamentoApi.buscarMeuEngajamento).mockResolvedValue({ hoje: '2026-10-21', acessouHoje: false, recompensaHoje: null, config: { ativo: true, xp: 11, moedas: 4 }, streakAtual: 0, maiorStreak: 0, semana: { diasComAcesso: 0, diasValidos: 3, percentual: 0 } });
    renderVendedor();
    expect(await screen.findByText('Abra o app todo dia e ganhe +11 XP e +4 VendaCoins.')).toBeInTheDocument();
  });

  it('recompensa desligada: nada de promessa de XP/VendaCoins', async () => {
    vi.mocked(engajamentoApi.registrarAcesso).mockResolvedValue(acesso({ recompensaHoje: null, config: { ativo: false, xp: 0, moedas: 0 } }));
    vi.mocked(engajamentoApi.buscarMeuEngajamento).mockResolvedValue({ hoje: '2026-10-21', acessouHoje: false, recompensaHoje: null, config: { ativo: false, xp: 0, moedas: 0 }, streakAtual: 0, maiorStreak: 0, semana: { diasComAcesso: 0, diasValidos: 3, percentual: 0 } });
    renderVendedor();
    await screen.findByText('VendaCoins');
    expect(screen.queryByText(/Abra o app todo dia/)).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

const PAINEL: engajamentoApi.PainelEngajamento = {
  hoje: '2026-10-21',
  timezone: 'America/Sao_Paulo',
  periodo: { tipo: 'SEMANA_ATUAL', inicio: '2026-10-19', fim: '2026-10-21' },
  kpis: {
    hoje: { acessaram: 2, elegiveis: 3, percentual: 67, naoAcessaram: 1, recompensasConcedidas: 2 },
    periodo: { acessaram: 3, elegiveis: 3, percentual: 100, semAcesso: 0, mediaDiasComAcesso: 2, mediaDiasValidos: 3, distribuicao: [{ dias: 0, vendedores: 0 }, { dias: 1, vendedores: 1 }, { dias: 2, vendedores: 1 }, { dias: 3, vendedores: 1 }] },
    maiorStreak: { dias: 3, vendedor: 'Ana' },
  },
  serie: [{ dia: '2026-10-19', acessaram: 2, elegiveis: 3 }, { dia: '2026-10-20', acessaram: 2, elegiveis: 3 }, { dia: '2026-10-21', acessaram: 2, elegiveis: 3 }],
  porLoja: [{ lojaId: 'l1', loja: 'Caruaru Shopping', elegiveis: 3, acessaramHoje: 2, diasComAcesso: 6, diasValidos: 9, percentualPeriodo: 67 }],
  vendedores: [
    { vendedorId: '1', nome: 'Ana', lojaId: 'l1', loja: 'Caruaru Shopping', acessouHoje: true, semana: { diasComAcesso: 3, diasValidos: 3, percentual: 100 }, periodo: { diasComAcesso: 3, diasValidos: 3, percentual: 100 }, streakAtual: 3, ultimoAcessoEm: '2026-10-21T11:12:00Z', engajamento: { MISSAO_CONCLUIDA: 2, DESAFIO_CONCLUIDO: 0, AULA_CONCLUIDA: 1, QUIZ_APROVADO: 0, SIMULACAO_CONCLUIDA: 0 } },
    { vendedorId: '2', nome: 'Júlia', lojaId: 'l1', loja: 'Caruaru Shopping', acessouHoje: true, semana: { diasComAcesso: 2, diasValidos: 3, percentual: 67 }, periodo: { diasComAcesso: 2, diasValidos: 3, percentual: 67 }, streakAtual: 1, ultimoAcessoEm: '2026-10-21T13:00:00Z', engajamento: { MISSAO_CONCLUIDA: 0, DESAFIO_CONCLUIDO: 0, AULA_CONCLUIDA: 0, QUIZ_APROVADO: 0, SIMULACAO_CONCLUIDA: 0 } },
    { vendedorId: '3', nome: 'Maria', lojaId: 'l1', loja: 'Caruaru Shopping', acessouHoje: false, semana: { diasComAcesso: 1, diasValidos: 3, percentual: 33 }, periodo: { diasComAcesso: 1, diasValidos: 3, percentual: 33 }, streakAtual: 0, ultimoAcessoEm: '2026-10-20T20:42:00Z', engajamento: { MISSAO_CONCLUIDA: 0, DESAFIO_CONCLUIDO: 0, AULA_CONCLUIDA: 0, QUIZ_APROVADO: 0, SIMULACAO_CONCLUIDA: 0 } },
  ],
};

function renderAdmin(ui: JSX.Element, rota = '/admin/engajamento') {
  vi.mocked(authApi.buscarSessaoAtual).mockResolvedValue(ADMIN);
  return render(
    <MemoryRouter initialEntries={[rota]}>
      <AuthProvider>
        <RequireAuth papeis={['ADMIN']}>{ui}</RequireAuth>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('Admin — Engajamento', () => {
  beforeEach(() => {
    vi.mocked(engajamentoApi.buscarPainelEngajamento).mockResolvedValue(PAINEL);
    vi.mocked(engajamentoApi.buscarConfigRecompensa).mockResolvedValue({ ativo: true, xp: 5, moedas: 2 });
    vi.mocked(adminApi.listarLojasAdmin).mockResolvedValue({ lojas: [] });
  });

  it('mostra quantos e QUEM acessou, frequência "X de Y dias", sequência e último acesso', async () => {
    renderAdmin(<AdminEngajamento />);
    expect((await screen.findAllByText('2/3')).length).toBeGreaterThan(0);
    expect(screen.getByText('Acessaram hoje').parentElement).toHaveTextContent('2/367% de adesão hoje');
    const tabela = screen.getByRole('table', { name: 'Acesso e engajamento por vendedor' });
    const linha = (nome: string) => within(tabela).getByRole('rowheader', { name: nome }).closest('tr')!;
    expect(linha('Ana')).toHaveTextContent('✓ Sim');
    expect(linha('Ana')).toHaveTextContent('3 de 3 dias');
    expect(linha('Ana')).toHaveTextContent('100%');
    expect(linha('Ana')).toHaveTextContent('🔥 3');
    expect(linha('Ana')).toHaveTextContent('Hoje 08:12');
    expect(linha('Júlia')).toHaveTextContent('2 de 3 dias');
    expect(linha('Maria')).toHaveTextContent('✕ Não');
    expect(linha('Maria')).toHaveTextContent('1 de 3 dias');
    expect(linha('Maria')).toHaveTextContent('Ontem 17:42');
  });

  it('filtra quem NÃO acessou hoje e ordena por menor frequência', async () => {
    renderAdmin(<AdminEngajamento />);
    await screen.findAllByText('2/3');
    await userEvent.click(screen.getByLabelText('Só quem não acessou hoje'));
    const tabela = screen.getByRole('table', { name: 'Acesso e engajamento por vendedor' });
    expect(within(tabela).getAllByRole('rowheader').map((c) => c.textContent)).toEqual(['Maria']);
    await userEvent.click(screen.getByLabelText('Só quem não acessou hoje'));
    await userEvent.selectOptions(screen.getByLabelText('Ordenar'), 'FREQ_ASC');
    expect(within(tabela).getAllByRole('rowheader').map((c) => c.textContent)).toEqual(['Maria', 'Júlia', 'Ana']);
  });

  it('configura a recompensa diária (valores persistidos, sem hardcode)', async () => {
    vi.mocked(engajamentoApi.salvarConfigRecompensa).mockResolvedValue({ ativo: true, xp: 8, moedas: 1 });
    renderAdmin(<AdminGamificacao />, '/admin/gamificacao?aba=recompensa');
    const xp = await screen.findByLabelText('XP por primeiro acesso do dia');
    await userEvent.clear(xp);
    await userEvent.type(xp, '8');
    const moedas = screen.getByLabelText('VendaCoins por primeiro acesso do dia');
    await userEvent.clear(moedas);
    await userEvent.type(moedas, '1');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar recompensa diária' }));
    expect(engajamentoApi.salvarConfigRecompensa).toHaveBeenCalledWith({ ativo: true, xp: 8, moedas: 1 });
    expect(await screen.findByRole('status')).toHaveTextContent('Configuração salva');
  });
});
