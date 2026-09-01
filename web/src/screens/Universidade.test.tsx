import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Universidade } from './Universidade';
import * as api from '../api/universidade';

vi.mock('../api/universidade');

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.buscarMinhaMatriz).mockResolvedValue({
    competencias: [
      { competencyId: 'c1', code: 'FECHAMENTO', name: 'Fechamento', category: 'COMERCIAL', status: 'OK', score: 55, confidence: 'MEDIUM', nivel: 'EM_DESENVOLVIMENTO', lastEvidenceAt: null, evidenceCount: 3, target: 80, gap: 25, priority: 'HIGH', breakdown: [] },
      { competencyId: 'c2', code: 'SONDAGEM', name: 'Sondagem', category: 'COMERCIAL', status: 'NOT_ENOUGH_DATA', score: null, confidence: null, nivel: null, lastEvidenceAt: null, evidenceCount: 0, target: 70, gap: null, priority: 'MEDIUM', breakdown: [] },
    ],
  });
  vi.mocked(api.listarMeusPDIs).mockResolvedValue({ planos: [] });
  vi.mocked(api.listarMinhasCertificacoes).mockResolvedValue({ certificacoes: [] });
  vi.mocked(api.listarCertificacoesDisponiveis).mockResolvedValue({ disponiveis: [] });
});

function renderTela() {
  return render(
    <MemoryRouter>
      <Universidade />
    </MemoryRouter>
  );
}

describe('Universidade — Minha Evolução', () => {
  it('mostra score real e "sem dados suficientes" quando aplicável', async () => {
    renderTela();
    expect(await screen.findByText('Fechamento')).toBeInTheDocument();
    expect(screen.getByText('55')).toBeInTheDocument();
    expect(screen.getByText('Sondagem')).toBeInTheDocument();
    expect(screen.getByText(/Ainda sem dados suficientes/)).toBeInTheDocument();
  });
});

describe('Universidade — abas', () => {
  it('troca pra aba de certificações e mostra disponíveis/já emitidas', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listarMinhasCertificacoes).mockResolvedValue({
      certificacoes: [{ id: 'cert1', definitionId: 'd1', definitionVersion: 1, issuedAt: new Date().toISOString(), expiresAt: null, status: 'VALID', definicao: { id: 'd1', name: 'Certificação de Vendas', description: 'd' } }],
    });

    renderTela();
    await user.click(screen.getByRole('button', { name: 'Certificações' }));

    expect(await screen.findByText('Certificação de Vendas')).toBeInTheDocument();
    expect(screen.getByText('ativa')).toBeInTheDocument();
  });

  it('botão Emitir fica desabilitado quando não elegível', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listarCertificacoesDisponiveis).mockResolvedValue({
      disponiveis: [{ definicao: { id: 'd2', name: 'Cert X', description: 'd', status: 'PUBLISHED' }, elegibilidade: { elegivel: false, pendencias: ['falta o quiz'] } }],
    });

    renderTela();
    await user.click(screen.getByRole('button', { name: 'Certificações' }));

    await screen.findByText('Cert X');
    expect(screen.getByRole('button', { name: 'Emitir' })).toBeDisabled();
  });
});
