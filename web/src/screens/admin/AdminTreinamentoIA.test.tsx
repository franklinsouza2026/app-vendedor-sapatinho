import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AbaTreinamentoIA } from './AdminTreinamentoIA';
import * as api from '../../api/trainingIntelligence';

vi.mock('../../api/trainingIntelligence');

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listarJobsTreinamento).mockResolvedValue({
    jobs: [
      {
        id: 'job-1',
        type: 'PACOTE_TREINAMENTO',
        topic: 'venda complementar',
        objective: null,
        status: 'WAITING_REVIEW',
        currentStep: 'waiting_review',
        errorMessage: null,
        governanceStatus: 'PASS',
        reviewOutcome: null,
        reviewNotes: null,
        updateRecommendation: null,
        createdAt: new Date().toISOString(),
        sources: [{ id: 's1', title: 'Fonte teste', url: 'https://x', publisher: 'Publisher', reliability: 'HIGH' }],
        findings: [],
        cenarios: [],
      },
    ],
  });
  vi.mocked(api.listarCenariosTreinamento).mockResolvedValue({ cenarios: [] });
  vi.mocked(api.buscarJobTreinamento).mockResolvedValue({
    job: {
      id: 'job-1',
      type: 'PACOTE_TREINAMENTO',
      topic: 'venda complementar',
      objective: null,
      status: 'WAITING_REVIEW',
      currentStep: 'waiting_review',
      errorMessage: null,
      governanceStatus: 'PASS',
      reviewOutcome: null,
      reviewNotes: null,
      updateRecommendation: null,
      createdAt: new Date().toISOString(),
      sources: [],
      findings: [],
      cenarios: [],
    },
    draftLesson: { id: 'lesson-1', title: 'Aula gerada por IA', content: 'conteúdo do rascunho', status: 'DRAFT' },
    draftQuestions: [],
    draftScenarios: [],
  });
});

describe('AbaTreinamentoIA', () => {
  it('cria um job a partir de um pedido em linguagem natural', async () => {
    const user = userEvent.setup();
    vi.mocked(api.criarJobTreinamento).mockResolvedValue({
      id: 'job-2',
      type: 'PACOTE_TREINAMENTO',
      topic: 'Crie um treinamento sobre PA',
      objective: null,
      status: 'QUEUED',
      currentStep: null,
      errorMessage: null,
      governanceStatus: null,
      reviewOutcome: null,
      reviewNotes: null,
      updateRecommendation: null,
      createdAt: new Date().toISOString(),
      sources: [],
      findings: [],
      cenarios: [],
    });

    render(<AbaTreinamentoIA />);
    await screen.findByText('venda complementar');

    await user.type(screen.getByPlaceholderText(/Crie um treinamento/), 'Crie um treinamento sobre PA');
    await user.click(screen.getByRole('button', { name: 'Gerar rascunho com IA' }));

    await waitFor(() => expect(api.criarJobTreinamento).toHaveBeenCalledWith({ naturalLanguageRequest: 'Crie um treinamento sobre PA', objective: undefined }));
  });

  it('lista jobs e abre o detalhe com o rascunho gerado, mostrando ações de revisão', async () => {
    const user = userEvent.setup();
    render(<AbaTreinamentoIA />);

    await user.click(await screen.findByText('venda complementar'));
    await expect(screen.findByText('Aula gerada por IA')).resolves.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aprovar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rejeitar' })).toBeInTheDocument();
  });

  it('aprovar chama a API de revisão com outcome APPROVED', async () => {
    const user = userEvent.setup();
    vi.mocked(api.revisarJobTreinamento).mockResolvedValue({
      id: 'job-1',
      type: 'PACOTE_TREINAMENTO',
      topic: 'venda complementar',
      objective: null,
      status: 'COMPLETED',
      currentStep: null,
      errorMessage: null,
      governanceStatus: 'PASS',
      reviewOutcome: 'APPROVED',
      reviewNotes: null,
      updateRecommendation: null,
      createdAt: new Date().toISOString(),
      sources: [],
      findings: [],
      cenarios: [],
    });

    render(<AbaTreinamentoIA />);
    await user.click(await screen.findByText('venda complementar'));
    await screen.findByText('Aula gerada por IA');
    await user.click(screen.getByRole('button', { name: 'Aprovar' }));

    await waitFor(() => expect(api.revisarJobTreinamento).toHaveBeenCalledWith('job-1', 'APPROVED', undefined));
  });
});
