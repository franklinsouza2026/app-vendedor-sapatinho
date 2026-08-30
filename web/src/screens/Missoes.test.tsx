import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { Missoes } from './Missoes';
import * as missoesApi from '../api/missoes';
import { Missao } from '../types';

vi.mock('../api/missoes');

function renderMissoes() {
  return render(
    <MemoryRouter>
      <Missoes />
    </MemoryRouter>
  );
}

const MISSAO_ATIVA: Missao = {
  id: 'm1',
  status: 'ASSIGNED',
  progressoAtual: 1,
  progressoAlvo: 3,
  startsAt: '2026-08-30T00:00:00Z',
  expiresAt: '2026-08-31T00:00:00Z',
  completedAt: null,
  missao: { code: 'PA_IMPROVEMENT', title: 'Supere seu PA de referência', description: 'Fique 5% acima da média.', category: 'PERFORMANCE', actionType: 'TRAINER', actionReference: { mode: 'PA' } },
};

beforeEach(() => {
  vi.mocked(missoesApi.buscarMissoesAtivas).mockResolvedValue({ missoes: [] });
  vi.mocked(missoesApi.buscarDesafiosAtivos).mockResolvedValue({ desafios: [] });
  vi.mocked(missoesApi.buscarHistoricoMissoes).mockResolvedValue({ missoes: [] });
});

describe('Missoes', () => {
  it('mostra empty state quando não há missões nem histórico', async () => {
    renderMissoes();
    expect(await screen.findByText('Nenhuma missão pra hoje ainda.')).toBeInTheDocument();
    expect(screen.getByText('Suas missões concluídas vão aparecer aqui.')).toBeInTheDocument();
  });

  it('mostra a missão ativa com progresso e CTA levando pra rota certa', async () => {
    vi.mocked(missoesApi.buscarMissoesAtivas).mockResolvedValue({ missoes: [MISSAO_ATIVA] });

    renderMissoes();

    expect(await screen.findByText('Supere seu PA de referência')).toBeInTheDocument();
    expect(screen.getByText('Fique 5% acima da média.')).toBeInTheDocument();
    expect(screen.getByText('33%')).toBeInTheDocument();
    const cta = screen.getByRole('link', { name: 'Treinar agora' });
    expect(cta).toHaveAttribute('href', '/treinador');
  });

  it('missão concluída não mostra CTA, mostra "Concluída ✓"', async () => {
    vi.mocked(missoesApi.buscarMissoesAtivas).mockResolvedValue({
      missoes: [{ ...MISSAO_ATIVA, status: 'COMPLETED', progressoAtual: 3, completedAt: '2026-08-30T10:00:00Z' }],
    });

    renderMissoes();

    expect(await screen.findByText('Concluída ✓')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Treinar agora' })).not.toBeInTheDocument();
  });

  it('mostra desafios da semana com progresso', async () => {
    vi.mocked(missoesApi.buscarDesafiosAtivos).mockResolvedValue({
      desafios: [
        {
          id: 'd1',
          status: 'IN_PROGRESS',
          progressoAtual: 1,
          progressoAlvo: 3,
          startsAt: '2026-08-24T00:00:00Z',
          expiresAt: '2026-08-31T00:00:00Z',
          completedAt: null,
          desafio: { code: '3_LESSONS_WEEK', title: 'Complete 3 aulas nesta semana' },
        },
      ],
    });

    renderMissoes();

    expect(await screen.findByText('Desafios da semana')).toBeInTheDocument();
    expect(screen.getByText('Complete 3 aulas nesta semana')).toBeInTheDocument();
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('mostra o histórico de missões concluídas/encerradas', async () => {
    vi.mocked(missoesApi.buscarHistoricoMissoes).mockResolvedValue({
      missoes: [{ ...MISSAO_ATIVA, id: 'm-antiga', status: 'EXPIRED' }],
    });

    renderMissoes();

    expect(await screen.findByText('Supere seu PA de referência')).toBeInTheDocument();
    expect(screen.getByText('encerrada')).toBeInTheDocument();
  });

  it('mostra tela de erro com opção de tentar de novo quando a API falha', async () => {
    vi.mocked(missoesApi.buscarMissoesAtivas).mockRejectedValue(new Error('falha de rede'));

    renderMissoes();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
  });
});
