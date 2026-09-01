import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Evoluir } from './Evoluir';
import * as universidadeApi from '../api/universidade';

vi.mock('../api/universidade');

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(universidadeApi.buscarParaVoce).mockResolvedValue({ itens: [] });
});

function renderEvoluir() {
  return render(
    <MemoryRouter>
      <Evoluir />
    </MemoryRouter>
  );
}

describe('Evoluir', () => {
  it('mostra os 4 módulos com link pra rota correta de cada um', () => {
    renderEvoluir();

    expect(screen.getByRole('heading', { name: 'Evoluir' })).toBeInTheDocument();

    const coach = screen.getByText('Conselheiro', { exact: true }).closest('a');
    const treinador = screen.getByText('Treinador', { exact: true }).closest('a');
    const simulador = screen.getByText('Simulador', { exact: true }).closest('a');
    const academia = screen.getByText('Academia', { exact: true }).closest('a');

    expect(coach).toHaveAttribute('href', '/coach');
    expect(treinador).toHaveAttribute('href', '/treinador');
    expect(simulador).toHaveAttribute('href', '/simulador');
    expect(academia).toHaveAttribute('href', '/academia');
  });

  it('mostra o módulo Universidade', () => {
    renderEvoluir();
    const universidade = screen.getByText('Universidade', { exact: true }).closest('a');
    expect(universidade).toHaveAttribute('href', '/universidade');
  });

  it('mostra a seção "Para você" só quando há itens', async () => {
    vi.mocked(universidadeApi.buscarParaVoce).mockResolvedValue({
      itens: [{ tipo: 'REVIEW', titulo: 'Revisar objeções', descricao: 'Você errou uma questão recentemente', refId: 'review', href: '/universidade/revisao' }],
    });
    renderEvoluir();
    expect(await screen.findByText('Revisar objeções')).toBeInTheDocument();
  });
});
