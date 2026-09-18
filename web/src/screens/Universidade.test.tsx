import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Universidade } from './Universidade';
import { AuthProvider } from '../auth/AuthContext';
import * as api from '../api/universidade';
import * as authApi from '../api/auth';
import { ApiError } from '../api/client';

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

function renderTela(rota = '/universidade') {
  return render(
    <MemoryRouter initialEntries={[rota]}>
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

// Etapa 2A — o elo "gap → recomendação → próxima ação".
//
// Antes, o card dizia "Faltam 25 pontos" e acabava ali: o vendedor via o
// diagnóstico e não tinha caminho nenhum pra agir. E a etapa do PDI mostrava só
// o tipo ("Aula"), sem dizer QUAL aula nem como chegar nela.
describe('Universidade — o que estudar pra fechar o gap', () => {
  it('só chama a IA quando o vendedor pede, e mostra o que estudar', async () => {
    const user = userEvent.setup();
    vi.mocked(api.sugerirParaMim).mockResolvedValue({
      sugestoes: [{ tipo: 'LESSON', sourceId: 'a1', title: 'Fechamento sem pressão', rationale: 'Cobre a técnica que está puxando seu score pra baixo.', href: '/academia' }],
    });

    renderTela();
    await screen.findByText('Fechamento');
    // A chamada custa dinheiro: não pode disparar sozinha ao abrir a tela.
    expect(api.sugerirParaMim).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'O que estudar pra isso?' }));

    expect(await screen.findByText('Fechamento sem pressão')).toBeInTheDocument();
    expect(screen.getByText(/puxando seu score/)).toBeInTheDocument();
    expect(api.sugerirParaMim).toHaveBeenCalledWith('c1');
  });

  it('sugestão de SIMULAÇÃO leva ao Simulador, nunca à Academia', async () => {
    const user = userEvent.setup();
    // O destino vem do backend (mesma tabela do PDI). Com link fixo, o vendedor
    // clicava em "Cliente indeciso" e caía na Academia.
    vi.mocked(api.sugerirParaMim).mockResolvedValue({
      sugestoes: [{ tipo: 'SIMULATION', sourceId: 'c1', title: 'Cliente indeciso', rationale: 'Treina fechamento sob hesitação.', href: '/simulador' }],
    });

    renderTela();
    await screen.findByText('Fechamento');
    await user.click(screen.getByRole('button', { name: 'O que estudar pra isso?' }));

    expect(await screen.findByRole('link', { name: /Cliente indeciso/ })).toHaveAttribute('href', '/simulador');
  });

  it('competência sem gap não oferece a ação — não há o que fechar', async () => {
    vi.mocked(api.buscarMinhaMatriz).mockResolvedValue({
      competencias: [
        { competencyId: 'c1', code: 'FECHAMENTO', name: 'Fechamento', category: 'COMERCIAL', status: 'OK', score: 90, confidence: 'HIGH', nivel: 'AVANCADO', lastEvidenceAt: null, evidenceCount: 5, target: 80, gap: 0, priority: 'LOW', breakdown: [] },
      ],
    });

    renderTela();
    await screen.findByText('Fechamento');
    expect(screen.queryByRole('button', { name: 'O que estudar pra isso?' })).not.toBeInTheDocument();
  });

  it('IA indisponível não quebra a tela — a matriz continua legível', async () => {
    const user = userEvent.setup();
    vi.mocked(api.sugerirParaMim).mockRejectedValue(new ApiError(503, 'A IA está indisponível agora.'));

    renderTela();
    await screen.findByText('Fechamento');
    await user.click(screen.getByRole('button', { name: 'O que estudar pra isso?' }));

    expect(await screen.findByText('A IA está indisponível agora.')).toBeInTheDocument();
    expect(screen.getByText('Fechamento')).toBeInTheDocument();
  });
});

describe('Universidade — etapas do plano levam a algum lugar', () => {
  const plano = {
    id: 'p1',
    subjectUserId: 'v1',
    competencyId: 'c1',
    baselineScore: 55,
    targetScore: 80,
    status: 'ACTIVE' as const,
    startedAt: new Date().toISOString(),
    targetDate: null,
    completedAt: null,
    competencia: { id: 'c1', name: 'Fechamento' },
    itens: [
      { id: 'i1', tipo: 'LESSON' as const, sourceId: 'a1', status: 'PENDING' as const, required: true, titulo: 'Fechamento sem pressão', href: '/academia' },
      { id: 'i2', tipo: 'PRACTICE' as const, sourceId: null, status: 'PENDING' as const, required: false, titulo: null, href: null },
    ],
  };

  it('mostra o título da etapa e leva pra tela certa', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listarMeusPDIs).mockResolvedValue({ planos: [plano] });
    vi.mocked(api.buscarPDI).mockResolvedValue({ plano, evolucao: null });

    renderTela();
    await user.click(screen.getByRole('button', { name: 'Meu Plano' }));
    await user.click(await screen.findByText('Fechamento'));

    const link = await screen.findByRole('link', { name: /Fechamento sem pressão/ });
    expect(link).toHaveAttribute('href', '/academia');
  });

  it('etapa que acontece fora do app não vira link quebrado', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listarMeusPDIs).mockResolvedValue({ planos: [plano] });
    vi.mocked(api.buscarPDI).mockResolvedValue({ plano, evolucao: null });

    renderTela();
    await user.click(screen.getByRole('button', { name: 'Meu Plano' }));
    await user.click(await screen.findByText('Fechamento'));

    // Prática em loja não tem destino no app — aparece como texto, e o rótulo
    // cai pro tipo porque não existe conteúdo pra nomear.
    const pratica = await screen.findByText('Prática em loja');
    expect(pratica.closest('a')).toBeNull();
  });
});

// Etapa 2A — a aba vem da URL, pra que o link do "Para Você" aterrisse no lugar
// certo. Derivada da query string (não copiada pra estado), senão um segundo
// link interno ou o voltar do navegador não trocariam a aba.
describe('Universidade — aba vem da URL', () => {
  it('?aba=plano abre direto em Meu Plano', async () => {
    renderTela('/universidade?aba=plano');
    expect(await screen.findByText(/ainda não tem um plano/)).toBeInTheDocument();
  });

  it('?aba=certificacoes abre direto em Certificações', async () => {
    renderTela('/universidade?aba=certificacoes');
    expect(await screen.findByText(/ainda não tem certificações/)).toBeInTheDocument();
  });

  it('valor desconhecido na URL cai na aba padrão, nunca em tela vazia', async () => {
    renderTela('/universidade?aba=inventada');
    expect(await screen.findByText('Fechamento')).toBeInTheDocument();
  });
});
