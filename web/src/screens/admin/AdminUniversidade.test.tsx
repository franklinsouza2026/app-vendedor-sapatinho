import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AdminUniversidade } from './AdminUniversidade';
import * as api from '../../api/universidade';
import * as adminTrainingApi from '../../api/adminTraining';

vi.mock('../../api/universidade');
vi.mock('../../api/adminTraining');

function renderTela() {
  return render(
    <MemoryRouter>
      <AdminUniversidade />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listarEscolasAdmin).mockResolvedValue({ escolas: [{ id: 'e1', code: 'vendas', name: 'Escola de Vendas', description: 'd', audience: 'SELLER', active: true }] });
  vi.mocked(api.listarCompetenciasAdmin).mockResolvedValue({ competencias: [{ id: 'c1', code: 'FECHAMENTO', name: 'Fechamento', description: 'd', audience: 'SELLER', category: null, status: 'ACTIVE' }] });
  vi.mocked(api.listarCertificacoesAdmin).mockResolvedValue({
    definicoes: [{ id: 'd1', code: 'cert-1', name: 'Certificação 13 Mandamentos', description: 'd', status: 'DRAFT', version: 1, validityMonths: null, requisitos: [], templateTitle: null, templateBody: null, signatureName: null, signatureRole: null }],
  });
  vi.mocked(api.listarPDIsAdmin).mockResolvedValue({ planos: [] });
  vi.mocked(adminTrainingApi.listarTrilhasAdmin).mockResolvedValue({
    trilhas: [{ id: 't1', code: 'abertura', title: 'Fundamentos de Abertura', description: 'd', status: 'PUBLISHED', audience: 'SELLER', active: true, aulas: [{ id: 'a1', title: 'Como abrir bem um atendimento', status: 'PUBLISHED' }] }],
  });
});

describe('AdminUniversidade', () => {
  it('mostra escolas e cria uma nova', async () => {
    const user = userEvent.setup();
    vi.mocked(api.criarEscolaAdmin).mockResolvedValue({ id: 'e2', code: 'nova', name: 'Nova', description: 'd', audience: 'BOTH', active: true });

    renderTela();
    expect(await screen.findByText('Escola de Vendas')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Código'), 'nova');
    await user.type(screen.getByPlaceholderText('Nome'), 'Nova');
    await user.type(screen.getByPlaceholderText('Descrição'), 'd');
    await user.click(screen.getByRole('button', { name: 'Nova escola' }));

    expect(api.criarEscolaAdmin).toHaveBeenCalledWith({ code: 'nova', name: 'Nova', description: 'd' });
  });

  it('troca pra aba de competências e define uma meta por papel', async () => {
    const user = userEvent.setup();
    vi.mocked(api.definirTargetAdmin).mockResolvedValue({});

    renderTela();
    await user.click(screen.getByRole('button', { name: 'Competências' }));
    await screen.findByText('Fechamento');

    await user.click(screen.getByRole('button', { name: 'Metas' }));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(api.definirTargetAdmin).toHaveBeenCalledWith('c1', 'VENDEDOR', 70);
  });

  it('certificação DRAFT sem requisitos mostra atalho pra requisito dos 13 Mandamentos, nunca o botão Publicar direto', async () => {
    const user = userEvent.setup();
    renderTela();
    await user.click(screen.getByRole('button', { name: 'Certificações' }));

    expect(await screen.findByText('Certificação 13 Mandamentos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ requisito 13 Mandamentos' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publicar' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar pra revisão' })).toBeInTheDocument();
  });

  it('aba de Mapeamento associa uma aula real a uma competência', async () => {
    const user = userEvent.setup();
    vi.mocked(api.mapearCompetenciasAdmin).mockResolvedValue({});

    renderTela();
    await user.click(screen.getByRole('button', { name: 'Mapeamento' }));

    const selectConteudo = await screen.findByRole('combobox', { name: /^Conteúdo/ });
    await user.selectOptions(selectConteudo, 'a1');
    await user.click(screen.getByRole('button', { name: 'Fechamento' }));
    await user.click(screen.getByRole('button', { name: 'Mapear' }));

    expect(api.mapearCompetenciasAdmin).toHaveBeenCalledWith('lesson', 'a1', ['c1']);
    expect(await screen.findByText('mapeamento salvo ✓')).toBeInTheDocument();
  });
});
