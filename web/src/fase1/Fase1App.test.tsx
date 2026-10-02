import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Fase1App from './Fase1App';

function abrir(rota: string, cenario = 'B', perfil: 'VENDEDOR' | 'ADMIN' | null = 'VENDEDOR') {
  sessionStorage.clear();
  if (perfil) sessionStorage.setItem('vendedor-ia:fase1:perfil', perfil);
  sessionStorage.setItem('vendedor-ia:fase1:cenario', cenario);
  return render(
    <MemoryRouter initialEntries={[rota]}>
      <Routes>
        <Route path="/fase1/*" element={<Fase1App />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => sessionStorage.clear());

describe('Fase 1 — demonstração', () => {
  it('sem perfil escolhido, a entrada pede para escolher vendedor ou admin', async () => {
    abrir('/fase1/inicio', 'B', null);
    expect(await screen.findByRole('button', { name: /Entrar como vendedora/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Entrar como vendedora/ }));
    expect(await screen.findByText(/Boa tarde, Ana/)).toBeInTheDocument();
  });

  it('Home (B): meta com % + falta + estimativa marcada como estimativa, posição e distância', async () => {
    abrir('/fase1/inicio');
    const meta = await screen.findByRole('region', { name: 'Meta de hoje' });
    expect(within(meta).getByText('76%')).toBeInTheDocument();
    expect(meta).toHaveTextContent('Faltam R$ 486 — ≈ 2 vendas');
    expect(meta).toHaveTextContent(/Estimativa baseada no seu ticket médio do mês/);
    expect(meta).toHaveTextContent('Seu próximo alvo');
    const posicao = screen.getByRole('region', { name: 'Sua posição' });
    expect(posicao).toHaveTextContent('#2');
    expect(posicao).toHaveTextContent('Faltam R$ 320 para alcançar o #1 da loja — ≈ 2 vendas');
  });

  it('a navegação da Fase 1 não mostra Conselheiro, Universidade, Simulador nem Treinador', async () => {
    abrir('/fase1/inicio');
    const nav = await screen.findByRole('navigation', { name: 'Navegação principal' });
    expect(within(nav).getAllByRole('link').map((l) => l.textContent)).toEqual(['🏠Início', '📊Desempenho', '🏆Ranking', '🔥Desafios', '👤Perfil']);
    expect(screen.queryByText(/Conselheiro|Universidade|Simulador|Treinador/)).not.toBeInTheDocument();
  });

  it('meta batida (D) abre a celebração e a corrida continua rumo a 110%', async () => {
    abrir('/fase1/inicio', 'D');
    const dialogo = await screen.findByRole('dialog', { name: 'Meta do dia batida!' });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Continuar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Meta de hoje' })).toHaveTextContent('faltam R$ 20 para 110%');
  });

  it('sem referência (N): mostra quanto falta em R$, sem converter em vendas', async () => {
    abrir('/fase1/inicio', 'N');
    const meta = await screen.findByRole('region', { name: 'Meta de hoje' });
    expect(meta).toHaveTextContent('Faltam R$ 486.');
    expect(meta).not.toHaveTextContent('≈');
  });

  it('dia de folga (O): sem cobrança de meta nem missão diária', async () => {
    abrir('/fase1/inicio', 'O');
    expect(await screen.findByText('🌿 Hoje é sua folga')).toBeInTheDocument();
    expect(screen.queryByText('Oito no dia')).not.toBeInTheDocument();
    expect(screen.queryByText(/Próximo alvo/i)).not.toBeInTheDocument();
  });

  it('ranking por vendas oculta o faturamento das colegas e mostra só o próprio', async () => {
    abrir('/fase1/ranking');
    const lista = await screen.findByRole('region', { name: 'Classificação' });
    expect(within(lista).getAllByText('valor oculto')).toHaveLength(4);
    expect(within(lista).getByText('R$ 23.200')).toBeInTheDocument();
  });

  it('ranking de PA fala em PA, nunca em R$', async () => {
    abrir('/fase1/ranking');
    await userEvent.click(await screen.findByRole('button', { name: 'PA' }));
    const minha = screen.getByRole('region', { name: 'Sua posição' });
    expect(minha).toHaveTextContent(/de PA para alcançar/);
    expect(minha).not.toHaveTextContent('R$');
  });

  it('loja × loja (K): loja em 2º a 24 pontos da liderança, com aviso de regra provisória', async () => {
    abrir('/fase1/ranking?escopo=lojas', 'K');
    const card = await screen.findByRole('region', { name: 'Sua loja' });
    expect(card).toHaveTextContent('Faltam 24 pontos para sua loja assumir a liderança');
    expect(screen.getByText(/fórmula do score entre lojas/)).toBeInTheDocument();
  });

  it('abas são navegáveis por teclado (setas)', async () => {
    abrir('/fase1/desempenho');
    const ritmo = await screen.findByRole('tab', { name: 'Meu ritmo' });
    ritmo.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Indicadores' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/Conversão não aparece/)).toBeInTheDocument();
  });

  it('erro (R) mostra mensagem neutra com "Tentar de novo"', async () => {
    abrir('/fase1/inicio', 'R');
    expect(await screen.findByRole('alert', {}, { timeout: 2000 })).toHaveTextContent('Não conseguimos carregar agora');
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });

  it('Admin: auditoria do que já existe e simulações marcadas como não salvas', async () => {
    abrir('/fase1/admin', 'B', 'ADMIN');
    expect(await screen.findByText('Operação de Performance & Game')).toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveTextContent('Reconhecimentos');
    await userEvent.click(screen.getByRole('tab', { name: 'Reconhecer' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enviar reconhecimento' }));
    expect(screen.getByRole('status')).toHaveTextContent('simulado — nada foi salvo');
  });
});
