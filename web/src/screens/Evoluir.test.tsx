import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Evoluir } from './Evoluir';

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

    const coach = screen.getByText('Coach', { exact: true }).closest('a');
    const treinador = screen.getByText('Treinador', { exact: true }).closest('a');
    const simulador = screen.getByText('Simulador', { exact: true }).closest('a');
    const academia = screen.getByText('Academia', { exact: true }).closest('a');

    expect(coach).toHaveAttribute('href', '/coach');
    expect(treinador).toHaveAttribute('href', '/treinador');
    expect(simulador).toHaveAttribute('href', '/simulador');
    expect(academia).toHaveAttribute('href', '/academia');
  });
});
