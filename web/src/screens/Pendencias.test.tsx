import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Pendencias } from './Pendencias';
import * as managerPanelApi from '../api/managerPanel';

vi.mock('../api/managerPanel');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Pendencias — tom não-judicativo (Fatia 9, seção 61)', () => {
  it('mostra o resumo em linguagem factual e permite concluir um follow-up', async () => {
    const user = userEvent.setup();
    vi.mocked(managerPanelApi.buscarPendencias).mockResolvedValue({
      resumo: { vendedoresAbaixoDaMetaEsperada: 2, followUpsPendentes: 1, followUpsVencidos: 0, reconhecimentosSugeridos: 1, treinamentosPendentes: 0 },
      itens: [{ tipo: 'FOLLOWUP', sellerId: 'v1', refId: 'f1', detalhe: { descricao: 'Conversar sobre PA', dueAt: new Date().toISOString() } }],
    });
    vi.mocked(managerPanelApi.concluirFollowUp).mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <Pendencias />
      </MemoryRouter>
    );

    expect(await screen.findByText(/2 vendedor\(es\) abaixo do ritmo esperado/)).toBeInTheDocument();
    expect(screen.getByText('Conversar sobre PA')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Concluir' }));
    expect(managerPanelApi.concluirFollowUp).toHaveBeenCalledWith('f1');
  });

  it('sem nenhuma pendência mostra estado vazio', async () => {
    vi.mocked(managerPanelApi.buscarPendencias).mockResolvedValue({
      resumo: { vendedoresAbaixoDaMetaEsperada: 0, followUpsPendentes: 0, followUpsVencidos: 0, reconhecimentosSugeridos: 0, treinamentosPendentes: 0 },
      itens: [],
    });

    render(
      <MemoryRouter>
        <Pendencias />
      </MemoryRouter>
    );

    expect(await screen.findByText(/Nenhuma pendência agora/)).toBeInTheDocument();
  });
});
