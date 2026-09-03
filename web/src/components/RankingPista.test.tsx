import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { RankingPista } from './RankingPista';
import { RankingLinha } from '../types';

const RANKING: RankingLinha[] = [
  { vendedorId: 'outro', nomeVendedor: 'Outro Vendedor', posicao: 1, valor: null, gapParaAnterior: null, provisorio: false },
  { vendedorId: 'v1', nomeVendedor: 'Ana Vendedora', posicao: 2, valor: '2000.00', gapParaAnterior: 500, provisorio: false },
];

describe('RankingPista — visual (Fatia 9.6, seção 54-61)', () => {
  it('renderiza um marcador por posição, sempre aria-hidden (decorativo — a lista de texto já existente continua sendo a fonte acessível real, seção 57)', () => {
    const { container } = render(<RankingPista ranking={RANKING} vendedorId="v1" />);
    const raiz = container.querySelector('[aria-hidden="true"]');
    expect(raiz).not.toBeNull();
    expect(container.querySelectorAll('svg text').length).toBeGreaterThan(0);
  });

  it('renderiza os nomes reais recebidos, nunca inventa dado (motor de ranking preservado)', () => {
    const { getByText } = render(<RankingPista ranking={RANKING} vendedorId="v1" />);
    expect(getByText('Outro')).toBeInTheDocument();
    expect(getByText('Ana')).toBeInTheDocument();
  });
});
