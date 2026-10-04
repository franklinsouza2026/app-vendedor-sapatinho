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

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe('Fase 1 — vendedora', () => {
  it('sem perfil escolhido, a entrada pede para escolher vendedor ou admin', async () => {
    abrir('/fase1/inicio', 'B', null);
    await userEvent.click(await screen.findByRole('button', { name: /Entrar como vendedora/ }));
    expect(await screen.findByText(/Boa tarde, Ana/)).toBeInTheDocument();
  });

  it('Home (B): meta × realizado rotulados, %, vendas que faltam, mês com dias/ticket, posição sem #', async () => {
    abrir('/fase1/inicio');
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
    expect(mes).toHaveTextContent('50pares');
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
      const { unmount } = abrir(`/fase1/${rota}`);
      await screen.findByRole('navigation', { name: 'Navegação principal' });
      const texto = document.body.textContent ?? '';
      expect(texto, rota).not.toMatch(/#\d/);
      expect(texto, rota).not.toContain('≈');
      unmount();
    }
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
    expect(screen.getByRole('region', { name: 'Meta de hoje' })).toHaveTextContent('faltam R$ 20,00 (1 venda) para chegar a 110%');
  });

  it('sem ticket suficiente (Q): mostra quanto falta em R$, sem converter em vendas', async () => {
    abrir('/fase1/inicio', 'Q');
    const meta = await screen.findByRole('region', { name: 'Meta de hoje' });
    expect(meta).toHaveTextContent('Faltam R$ 486,00 para atingir a meta do dia');
    expect(meta).not.toHaveTextContent('vendas para atingir');
  });

  it('dia de folga (X1): sem cobrança de meta nem missão diária', async () => {
    abrir('/fase1/inicio', 'X1');
    expect(await screen.findByText('🌿 Hoje é sua folga')).toBeInTheDocument();
    expect(screen.queryByText('Oito no dia')).not.toBeInTheDocument();
    expect(screen.queryByText(/Próximo alvo/i)).not.toBeInTheDocument();
  });

  it('ranking por vendas oculta o faturamento das colegas e mostra só o próprio', async () => {
    abrir('/fase1/ranking');
    const lista = await screen.findByRole('region', { name: 'Classificação' });
    expect(within(lista).getAllByText('valor oculto')).toHaveLength(4);
    expect(within(lista).getByText('R$ 23.200,00')).toBeInTheDocument();
  });

  it('ranking de PA fala em PA, nunca em R$', async () => {
    abrir('/fase1/ranking');
    await userEvent.click(await screen.findByRole('button', { name: 'PA' }));
    const minha = screen.getByRole('region', { name: 'Sua posição' });
    expect(minha).toHaveTextContent(/de PA para alcançar/);
    expect(minha).not.toHaveTextContent('R$');
  });

  it('loja quase #1 (N): loja em 2º a 31 pontos da liderança, com aviso de regra provisória', async () => {
    abrir('/fase1/ranking?escopo=lojas', 'N');
    const card = await screen.findByRole('region', { name: 'Sua loja' });
    expect(card).toHaveTextContent('Faltam 31 pontos para sua loja assumir a liderança');
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

  it('erro (X3) mostra mensagem neutra com "Tentar de novo"', async () => {
    abrir('/fase1/inicio', 'X3');
    expect(await screen.findByRole('alert', {}, { timeout: 2000 })).toHaveTextContent('Não conseguimos carregar agora');
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });

  it('missão quase concluída (I): simular a venda conclui, celebra e credita XP', async () => {
    abrir('/fase1/desafios', 'I');
    const card = (await screen.findByText('Oito no dia')).closest('article')!;
    expect(card).toHaveTextContent('7 / 8');
    await userEvent.click(within(card).getByRole('button', { name: /Simular uma venda/ }));
    expect(await screen.findByRole('dialog', { name: 'Missão concluída!' })).toBeInTheDocument();
  });

  it('campanha encerrada (T): mostra resultado e o que a vendedora ganhou', async () => {
    abrir('/fase1/desafios?aba=campanha', 'T');
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
    abrir('/fase1/inicio');
    await userEvent.click((await screen.findAllByRole('link', { name: /Ver detalhes da missão/ }))[0]);
    expect(await screen.findByText('O que conta para o progresso')).toBeInTheDocument();
    await voltar();
    expect(await screen.findByRole('region', { name: 'Meta de hoje' })).toBeInTheDocument();
  });

  it('Desafios → competição → detalhe → Voltar volta para a lista de competições', async () => {
    abrir('/fase1/desafios?aba=competicoes');
    await userEvent.click((await screen.findAllByRole('link', { name: /Ver detalhes e classificação/ }))[0]);
    expect(await screen.findByRole('region', { name: 'Classificação' })).toBeInTheDocument();
    await voltar();
    expect(await screen.findByRole('tab', { name: 'Competições' })).toHaveAttribute('aria-selected', 'true');
  });

  it('Perfil → VendaCoins / Conquistas / Recordes → Voltar volta para o Perfil', async () => {
    abrir('/fase1/perfil');
    for (const destino of [/VendaCoins/, /Conquistas/, /Meus recordes/]) {
      await userEvent.click((await screen.findAllByRole('link', { name: destino }))[0]);
      await screen.findByRole('button', { name: 'Voltar' });
      await voltar();
      expect(await screen.findByRole('button', { name: 'Sair da demonstração' })).toBeInTheDocument();
    }
  });

  it('Home → Ranking (navegação inferior) → aba Geral → Início', async () => {
    abrir('/fase1/inicio');
    const nav = await screen.findByRole('navigation', { name: 'Navegação principal' });
    await userEvent.click(within(nav).getByRole('link', { name: /Ranking/ }));
    await userEvent.click(await screen.findByRole('tab', { name: 'Geral' }));
    expect(screen.getByRole('region', { name: 'Sua posição' })).toHaveTextContent('7 de 15 no ranking geral');
    await userEvent.click(within(nav).getByRole('link', { name: /Início/ }));
    expect(await screen.findByRole('region', { name: 'Meta de hoje' })).toBeInTheDocument();
  });

  it('link direto para um detalhe (sem histórico) volta para a tela-mãe', async () => {
    abrir('/fase1/desafios/missao/m-produto');
    await screen.findByText('O que conta para o progresso');
    await voltar();
    expect(await screen.findByRole('tab', { name: 'Missões' })).toBeInTheDocument();
  });
});

describe('Fase 1 — Admin configura, vendedora recebe', () => {
  it('visão geral mostra prontidão e pendências calculadas', async () => {
    abrir('/fase1/admin', 'B', 'ADMIN');
    expect(await screen.findByText(/% pronto/)).toBeInTheDocument();
    const pend = screen.getByRole('region', { name: '⚠️ Pendências' });
    expect(pend).toHaveTextContent('1 vendedor sem meta: Sofia');
    expect(pend).toHaveTextContent('Difusora com dado desatualizado');
  });

  it('alterar a meta da Ana chega à Home dela pelo "Ver como vendedora"', async () => {
    abrir('/fase1/admin/metas', 'B', 'ADMIN');
    const campo = await screen.findByLabelText(/Ana Beatriz Lima/);
    await userEvent.clear(campo);
    await userEvent.type(campo, '32000');
    const bloco = screen.getByRole('region', { name: 'Caruaru Shopping' });
    expect(bloco).toHaveTextContent('Diferença de R$ 2.000');
    await userEvent.click(within(bloco).getByRole('button', { name: 'Salvar metas' }));
    await userEvent.click(screen.getAllByRole('button', { name: /Ver como vendedora/ })[0]);
    expect(await screen.findByText(/Pré-visualização do Admin/)).toBeInTheDocument();
    const mes = screen.getByRole('region', { name: 'Corrida do mês' });
    expect(mes).toHaveTextContent('Meta mensalR$ 32.000,00');
    expect(mes).toHaveTextContent('Faltam R$ 8.800,00');
    expect(mes).toHaveTextContent(`${Math.ceil(8800 / (23200 / 93))}vendas`);
  });

  it('reconhecimento enviado pelo Admin aparece para a vendedora', async () => {
    abrir('/fase1/admin/reconhecimentos', 'B', 'ADMIN');
    await userEvent.type(await screen.findByLabelText('Título'), 'Vitrine de verão');
    await userEvent.type(screen.getByLabelText(/Mensagem/), 'Montou a vitrine nova sozinha e vendeu o look completo.');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar reconhecimento' }));
    expect(screen.getByRole('status')).toHaveTextContent('Reconhecimento enviado para Ana');
    await userEvent.click(screen.getByRole('button', { name: /Ver como vendedora/ }));
    expect(await screen.findByText(/Você recebeu um reconhecimento: “Vitrine de verão”/)).toBeInTheDocument();
  });

  it('campanha incompleta não publica e diz exatamente o que falta', async () => {
    abrir('/fase1/admin/campanhas/novembro-black', 'B', 'ADMIN');
    await userEvent.click(await screen.findByRole('button', { name: '10. Publicação' }));
    expect(screen.getByText('⛔ Não é possível publicar ainda')).toBeInTheDocument();
    expect(screen.getByText(/Frente sem prêmio: Meta batida/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeDisabled();
  });

  it('campanha ativa bloqueia regras críticas e oferece duplicar', async () => {
    abrir('/fase1/admin/campanhas/outubro-campeao', 'B', 'ADMIN');
    expect(await screen.findByText(/regras críticas bloqueadas/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '2. Período' }));
    expect(screen.getByLabelText('Início')).toBeDisabled();
  });

  it('encerrar campanha congela o resultado e ela vai para o histórico da vendedora', async () => {
    abrir('/fase1/admin/campanhas/outubro-campeao', 'B', 'ADMIN');
    await userEvent.click(await screen.findByRole('button', { name: 'Encerrar' }));
    await userEvent.click(screen.getAllByRole('button', { name: /Ver como vendedora/ })[0]);
    await userEvent.click(within(await screen.findByRole('navigation', { name: 'Navegação principal' })).getByRole('link', { name: /Desafios/ }));
    await userEvent.click(await screen.findByRole('tab', { name: 'Campanha' }));
    expect(await screen.findByText('Nenhuma campanha ativa agora')).toBeInTheDocument();
    expect(screen.getAllByText(/Vencedor:|Você venceu/).length).toBeGreaterThan(2);
  });

  it('XP e VendaCoins são somente consulta (nenhum campo de saldo editável)', async () => {
    abrir('/fase1/admin/vendacoins', 'B', 'ADMIN');
    expect(await screen.findByText(/Somente consulta/)).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });

  it('toda alteração entra na auditoria com antes e depois', async () => {
    abrir('/fase1/admin/indicadores', 'B', 'ADMIN');
    const pares = (await screen.findByText('Pares')).closest('li')!;
    await userEvent.click(within(pares).getByRole('checkbox'));
    await userEvent.click(screen.getAllByRole('link', { name: 'Auditoria' })[0]);
    expect(await screen.findAllByText('Ocultou indicador do vendedor')).not.toHaveLength(0);
  });
});
