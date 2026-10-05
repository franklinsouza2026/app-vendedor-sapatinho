/**
 * Telas HOMOLOGADAS da vendedora com o provedor de demonstração (cenários
 * fixos). O provedor real é testado em real/ProvedorVendedor.test.tsx e o
 * Admin, com API simulada, em admin/Admin.test.tsx.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { rotasDaVendedora } from './Fase1App';
import { Fase1Layout } from './Fase1Layout';
import { ProvedorDemoVendedor } from './demo/Fase1Contexto';

function abrir(rota: string, cenario = 'B') {
  return render(
    <MemoryRouter initialEntries={[rota]}>
      <Routes>
        <Route
          element={
            <ProvedorDemoVendedor cenarioInicial={cenario}>
              <Fase1Layout />
            </ProvedorDemoVendedor>
          }
        >
          {rotasDaVendedora()}
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe('Fase 1 — vendedora', () => {
  it('Home (B): meta × realizado rotulados, %, vendas que faltam, mês com dias/ticket, posição sem #', async () => {
    abrir('/inicio');
    const meta = await screen.findByRole('region', { name: 'Meta de hoje' });
    expect(meta).toHaveTextContent('Meta de hojeR$ 2.000,00');
    expect(meta).toHaveTextContent('RealizadoR$ 1.514,00');
    expect(within(meta).getByText('76%')).toBeInTheDocument();
    expect(meta).toHaveTextContent('Faltam 2 vendas para atingir a meta do dia');
    const mes = screen.getByRole('region', { name: 'Corrida do mês' });
    expect(mes).toHaveTextContent('Meta mensalR$ 30.000,00');
    expect(mes).toHaveTextContent('RealizadoR$ 23.200,00');
    expect(mes).toHaveTextContent('Faltam R$ 6.800,00 e 8 dias para encerrar o mês.');
    expect(mes).toHaveTextContent('28vendas');
    expect(mes).toHaveTextContent('50peças'); // D12: PA = peças por atendimento
    expect(mes).toHaveTextContent('4vendas por dia');
    expect(mes).toHaveTextContent('R$ 249,46ticket médio atual');
    const posicao = screen.getByRole('region', { name: 'Sua posição' });
    expect(posicao).toHaveTextContent('2na sua loja↑ 1 posição');
    expect(posicao).toHaveTextContent('7no ranking geral↑ 2 posições');
    expect(posicao).toHaveTextContent('Faltam R$ 320,00 para alcançar o 1º lugar da loja — 2 vendas no seu ticket médio atual.');
    // Nota do ticket: uma vez só, no rodapé.
    expect(screen.getAllByText(/calculada com o seu ticket médio atual/)).toHaveLength(1);
  });

  it('nenhuma tela da vendedora usa # para posição nem ≈ em quantidade', async () => {
    for (const rota of ['inicio', 'desempenho', 'desempenho?aba=indicadores', 'desempenho?aba=comparar', 'ranking', 'ranking?escopo=geral', 'ranking?escopo=lojas', 'desafios', 'desafios?aba=competicoes', 'desafios?aba=campanha', 'perfil', 'recordes', 'conquistas']) {
      const { unmount } = abrir(`/${rota}`);
      await screen.findByRole('navigation', { name: 'Navegação principal' });
      const texto = document.body.textContent ?? '';
      expect(texto, rota).not.toMatch(/#\d/);
      expect(texto, rota).not.toContain('≈');
      unmount();
    }
  });

  it('a navegação da Fase 1 não mostra Conselheiro, Universidade, Simulador nem Treinador', async () => {
    abrir('/inicio');
    const nav = await screen.findByRole('navigation', { name: 'Navegação principal' });
    expect(within(nav).getAllByRole('link').map((l) => l.textContent)).toEqual(['🏠Início', '📊Desempenho', '🏆Ranking', '🔥Desafios', '👤Perfil']);
    expect(screen.queryByText(/Conselheiro|Universidade|Simulador|Treinador/)).not.toBeInTheDocument();
  });

  it('meta batida (D) abre a celebração e a corrida continua rumo a 110%', async () => {
    abrir('/inicio', 'D');
    const dialogo = await screen.findByRole('dialog', { name: 'Meta do dia batida!' });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Continuar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Meta de hoje' })).toHaveTextContent('faltam R$ 20,00 (1 venda) para chegar a 110%');
  });

  it('sem ticket suficiente (Q): mostra quanto falta em R$, sem converter em vendas', async () => {
    abrir('/inicio', 'Q');
    const meta = await screen.findByRole('region', { name: 'Meta de hoje' });
    expect(meta).toHaveTextContent('Faltam R$ 486,00 para atingir a meta do dia');
    expect(meta).not.toHaveTextContent('vendas para atingir');
  });

  it('dia de folga (X1): sem cobrança de meta nem missão diária', async () => {
    abrir('/inicio', 'X1');
    expect(await screen.findByText('🌿 Hoje é sua folga')).toBeInTheDocument();
    expect(screen.queryByText('Oito no dia')).not.toBeInTheDocument();
    expect(screen.queryByText(/Próximo alvo/i)).not.toBeInTheDocument();
  });

  it('ranking por vendas oculta o faturamento das colegas e mostra só o próprio', async () => {
    abrir('/ranking');
    const lista = await screen.findByRole('region', { name: 'Classificação' });
    expect(within(lista).getAllByText('valor oculto')).toHaveLength(4);
    expect(within(lista).getByText('R$ 23.200,00')).toBeInTheDocument();
  });

  it('ranking de PA fala em PA, nunca em R$', async () => {
    abrir('/ranking');
    await userEvent.click(await screen.findByRole('button', { name: 'PA' }));
    const minha = screen.getByRole('region', { name: 'Sua posição' });
    expect(minha).toHaveTextContent(/de PA para alcançar/);
    expect(minha).not.toHaveTextContent('R$');
  });

  it('loja quase #1 (N): loja em 2º a 31 pontos da liderança, com a fórmula da disputa explicada', async () => {
    abrir('/ranking?escopo=lojas', 'N');
    const card = await screen.findByRole('region', { name: 'Sua loja' });
    expect(card).toHaveTextContent('Faltam 31 pontos para sua loja assumir a liderança');
    expect(screen.getByText(/Pontos = % da meta do mês da loja inteira/)).toBeInTheDocument();
  });

  it('abas são navegáveis por teclado (setas)', async () => {
    abrir('/desempenho');
    const ritmo = await screen.findByRole('tab', { name: 'Meu ritmo' });
    ritmo.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Indicadores' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/Conversão não aparece/)).toBeInTheDocument();
  });

  it('erro (X3) mostra mensagem neutra com "Tentar de novo"', async () => {
    abrir('/inicio', 'X3');
    expect(await screen.findByRole('alert', {}, { timeout: 2000 })).toHaveTextContent('Não conseguimos carregar agora');
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });

  it('missão quase concluída (I): simular a venda conclui, celebra e credita XP', async () => {
    abrir('/desafios', 'I');
    const card = (await screen.findByText('Oito no dia')).closest('article')!;
    expect(card).toHaveTextContent('7 / 8');
    await userEvent.click(within(card).getByRole('button', { name: /Simular uma venda/ }));
    expect(await screen.findByRole('dialog', { name: 'Missão concluída!' })).toBeInTheDocument();
  });

  it('campanha encerrada (T): mostra resultado e o que a vendedora ganhou', async () => {
    abrir('/desafios?aba=campanha', 'T');
    await userEvent.click(await screen.findByRole('button', { name: 'Continuar' }));
    expect(await screen.findByText('Você ganhou +200 XP e +80 VendaCoins.')).toBeInTheDocument();
    expect(screen.getAllByText(/Vencedor:/).length).toBeGreaterThan(0);
  });
});

describe('Fase 1 — navegação mobile com Voltar explícito', () => {
  async function voltar() {
    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));
  }

  it('Home → missão → detalhe → Voltar volta para a Home', async () => {
    abrir('/inicio');
    await userEvent.click((await screen.findAllByRole('link', { name: /Ver detalhes da missão/ }))[0]);
    expect(await screen.findByText('O que conta para o progresso')).toBeInTheDocument();
    await voltar();
    expect(await screen.findByRole('region', { name: 'Meta de hoje' })).toBeInTheDocument();
  });

  it('Desafios → competição → detalhe → Voltar volta para a lista de competições', async () => {
    abrir('/desafios?aba=competicoes');
    await userEvent.click((await screen.findAllByRole('link', { name: /Ver detalhes e classificação/ }))[0]);
    expect(await screen.findByRole('region', { name: 'Classificação' })).toBeInTheDocument();
    await voltar();
    expect(await screen.findByRole('tab', { name: 'Competições' })).toHaveAttribute('aria-selected', 'true');
  });

  it('Perfil → VendaCoins / Conquistas / Recordes → Voltar volta para o Perfil', async () => {
    abrir('/perfil');
    for (const destino of [/VendaCoins/, /Conquistas/, /Meus recordes/]) {
      await userEvent.click((await screen.findAllByRole('link', { name: destino }))[0]);
      await screen.findByRole('button', { name: 'Voltar' });
      await voltar();
      expect(await screen.findByRole('button', { name: 'Sair' })).toBeInTheDocument();
    }
  });

  it('Home → Ranking (navegação inferior) → aba Geral → Início', async () => {
    abrir('/inicio');
    const nav = await screen.findByRole('navigation', { name: 'Navegação principal' });
    await userEvent.click(within(nav).getByRole('link', { name: /Ranking/ }));
    await userEvent.click(await screen.findByRole('tab', { name: 'Geral' }));
    expect(screen.getByRole('region', { name: 'Sua posição' })).toHaveTextContent('7 de 15 no ranking geral');
    await userEvent.click(within(nav).getByRole('link', { name: /Início/ }));
    expect(await screen.findByRole('region', { name: 'Meta de hoje' })).toBeInTheDocument();
  });

  it('link direto para um detalhe (sem histórico) volta para a tela-mãe', async () => {
    abrir('/desafios/missao/m-produto');
    await screen.findByText('O que conta para o progresso');
    await voltar();
    expect(await screen.findByRole('tab', { name: 'Missões' })).toBeInTheDocument();
  });
});
