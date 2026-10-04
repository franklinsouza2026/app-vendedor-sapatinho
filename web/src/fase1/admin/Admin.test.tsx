/**
 * Central do Admin com a API SIMULADA: a tela mostra o estado do servidor,
 * aciona os endpoints certos e nunca edita saldo/segredo localmente.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../../auth/AuthContext';
import AdminRotas from './AdminRotas';
import * as api from './api';
import { estadoAdminFixture } from './__testes__/estadoFixture';
import type { EstadoAdmin } from './tiposAdmin';

vi.mock('./api', async (original) => {
  const real = await original<typeof import('./api')>();
  return {
    ...real,
    buscarEstado: vi.fn(),
    lancarAjuste: vi.fn(),
    salvarConfig: vi.fn(),
    reconhecer: vi.fn(),
    validarCampanha: vi.fn(),
    criarCampanha: vi.fn(),
    listarIntegracoes: vi.fn(),
    definirCredencial: vi.fn(),
    criarIntegracao: vi.fn(),
    vincularLoja: vi.fn(),
  };
});

function abrir(rota: string, estado: EstadoAdmin = estadoAdminFixture()) {
  vi.mocked(api.buscarEstado).mockResolvedValue(estado);
  return render(
    <MemoryRouter initialEntries={[rota]}>
      <AuthProvider>
        <Routes>
          <Route path="/admin/*" element={<AdminRotas />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('Admin — dados reais do servidor', () => {
  it('visão geral lista as pendências calculadas do estado do servidor', async () => {
    const e = estadoAdminFixture();
    e.metas.individuais.v2 = { mensal: null, diasPrevistos: null, diaria: null };
    abrir('/admin', e);
    expect(await screen.findByText(/1 vendedor sem meta do mês: Bia/)).toBeInTheDocument();
    expect(screen.getByText(/1 vendedor sem dias de trabalho previstos/)).toBeInTheDocument();
  });

  it('XP é somente consulta: correção vira ajuste compensatório com motivo e chave idempotente', async () => {
    vi.mocked(api.lancarAjuste).mockResolvedValue({ lancado: true, duplicado: false });
    const e = estadoAdminFixture();
    e.desempenho = [{ vendedorId: 'v1', mes: { faturamento: 0, vendas: 0, pares: 0, percentualMeta: null }, hoje: { faturamento: 0, vendas: 0 }, metaDiaria: null, ticket: null, pa: null, score: null, acessosNoMes: 0, posicaoLoja: null, posicaoGeral: null, xp: 320, moedas: 40, nivel: { nivel: 1, nome: 'Bronze', proximo: { nivel: 2, nome: 'Prata', xpMinimo: 500 }, faltaXp: 180 } }];
    abrir('/admin/xp', e);
    const tabela = await screen.findByRole('table', { name: 'XP por vendedor' });
    expect(within(tabela).getByText('320')).toBeInTheDocument();
    // nenhum campo de saldo editável
    expect(within(tabela).queryByRole('spinbutton')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^XP \(\+ ou −\)/), '-50');
    await user.type(screen.getByLabelText('Motivo (obrigatório)'), 'curto');
    await user.click(screen.getByRole('button', { name: 'Lançar ajuste' }));
    expect(api.lancarAjuste).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Motivo (obrigatório)'), ' — venda lançada em duplicidade');
    await user.click(screen.getByRole('button', { name: 'Lançar ajuste' }));
    await waitFor(() => expect(api.lancarAjuste).toHaveBeenCalledTimes(1));
    const chamada = vi.mocked(api.lancarAjuste).mock.calls[0][0];
    expect(chamada).toMatchObject({ vendedorId: 'v1', xp: -50, moedas: 0 });
    expect(chamada.motivo.length).toBeGreaterThanOrEqual(10);
    expect(chamada.chave).toBeTruthy();
  });

  it('feed: o Admin só governa os tipos (salva pela API), sem postagem livre', async () => {
    vi.mocked(api.salvarConfig).mockResolvedValue(undefined);
    abrir('/admin/feed');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('checkbox', { name: /Recorde pessoal/ }));
    await waitFor(() => expect(api.salvarConfig).toHaveBeenCalled());
    expect(vi.mocked(api.salvarConfig).mock.calls[0][0].feedTipos.RECORDE).toBe(false);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('campanha só publica com a checagem do SERVIDOR verde', async () => {
    vi.mocked(api.validarCampanha).mockResolvedValue({ itens: [{ ok: false, rotulo: 'Frentes', problema: 'Inclua ao menos uma frente.' }] });
    abrir('/admin/campanhas/nova');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Nova campanha' });
    await user.click(screen.getByRole('button', { name: '10. Publicação' }));
    expect(await screen.findByText('Inclua ao menos uma frente.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeDisabled();
    expect(api.validarCampanha).toHaveBeenCalled();
  });

  it('integrações: credencial é write-only e a tela só mostra a versão mascarada', async () => {
    vi.mocked(api.listarIntegracoes).mockResolvedValue({
      integracoes: [{ id: 'i1', provedor: 'CONTROLADO', status: 'CONFIGURANDO', configuracao: {}, credencial: '••••a1b2', credencialDefinida: true, credencialAtualizadaEm: '2026-10-04T10:00:00.000Z', ultimaSyncEm: null, ultimaSyncSucessoEm: null, ultimaVendaEm: null, lojas: [] }],
    });
    vi.mocked(api.definirCredencial).mockResolvedValue({} as api.IntegracaoAdmin);
    abrir('/admin/integracoes');
    const campo = await screen.findByLabelText(/^Credencial/);
    expect(campo).toHaveAttribute('type', 'password');
    expect(campo).toHaveValue('');
    expect(screen.getByText(/Atual: ••••a1b2/)).toBeInTheDocument();
    // LINX aparece como preparada, sem ação de conexão real
    expect(screen.getAllByText(/preparada/).length).toBeGreaterThan(0);

    const user = userEvent.setup();
    await user.type(campo, 'segredo-novo-123');
    await user.click(screen.getByRole('button', { name: 'Substituir credencial' }));
    await waitFor(() => expect(api.definirCredencial).toHaveBeenCalledWith('i1', 'segredo-novo-123'));
    expect(campo).toHaveValue('');
  });

  it('o Admin não tem nenhuma tela ou menu de conversas do Conselheiro (D11)', async () => {
    abrir('/admin');
    await screen.findByRole('heading', { name: 'Visão geral' });
    expect(screen.queryByText(/Conselheiro|conversas/i)).not.toBeInTheDocument();
  });
});
