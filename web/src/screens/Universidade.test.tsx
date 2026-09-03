import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Universidade } from './Universidade';
import { AuthProvider } from '../auth/AuthContext';
import * as api from '../api/universidade';
import * as authApi from '../api/auth';

vi.mock('../api/universidade');
vi.mock('../api/auth');

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('vendedor-ia:token', 'token-valido');
  vi.mocked(authApi.buscarSessaoAtual).mockResolvedValue({
    vendedor: { id: 'v1', nome: 'Ana Vendedora', papel: 'VENDEDOR' },
    loja: { id: 'loja-1', nome: 'Loja Piloto' },
    empresa: { nome: 'Sapatinho de Luxo' },
  });
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
      <AuthProvider>
        <Universidade />
      </AuthProvider>
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
      certificacoes: [{ id: 'cert1', definitionId: 'd1', definitionVersion: 1, issuedAt: new Date().toISOString(), expiresAt: null, status: 'VALID', definicao: { id: 'd1', name: 'Certificação de Vendas', description: 'd', templateTitle: null, templateBody: null, signatureName: null, signatureRole: null } }],
    });

    renderTela();
    await user.click(screen.getByRole('button', { name: 'Certificações' }));

    expect(await screen.findByText('Certificação de Vendas')).toBeInTheDocument();
    expect(screen.getByText('ativa')).toBeInTheDocument();
  });

  it('abre o certificado visual com nome do participante e template do Admin (Fatia 9.6, seção 46-48)', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listarMinhasCertificacoes).mockResolvedValue({
      certificacoes: [
        {
          id: 'cert1',
          definitionId: 'd1',
          definitionVersion: 1,
          issuedAt: new Date('2026-01-15').toISOString(),
          expiresAt: null,
          status: 'VALID',
          definicao: { id: 'd1', name: 'Certificação de Vendas', description: 'd', templateTitle: 'Certificado de Excelência', templateBody: 'Parabéns pela conclusão.', signatureName: 'Admin Piloto', signatureRole: 'Diretor' },
        },
      ],
    });

    renderTela();
    await user.click(screen.getByRole('button', { name: 'Certificações' }));
    await user.click(await screen.findByRole('button', { name: 'ver certificado' }));

    expect(screen.getByText('Certificado de Excelência')).toBeInTheDocument();
    expect(screen.getByText('Ana Vendedora')).toBeInTheDocument();
    expect(screen.getByText('Parabéns pela conclusão.')).toBeInTheDocument();
    expect(screen.getByText('Admin Piloto')).toBeInTheDocument();
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
