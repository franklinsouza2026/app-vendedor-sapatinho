import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Equipe } from './Equipe';
import * as api from '../api/universidade';
import * as competicoesApi from '../api/competicoes';
import * as managerPanelApi from '../api/managerPanel';

vi.mock('../api/universidade');
vi.mock('../api/competicoes');
vi.mock('../api/managerPanel');

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(managerPanelApi.listarVisaoEquipe).mockResolvedValue({
    vendedores: [{ vendedorId: 'v1', nome: 'Vendedor Um', percentualMetaDia: 50, pa: 2, ticketMedio: 100, missoesAtivas: 0, pdiAtivo: false, certificacoesExpirando: 0, alertasAbertos: 0, alertaMaisSeveroTipo: null, alertaMaisSeveroSeveridade: null }],
  });
  vi.mocked(api.buscarDesenvolvimentoVendedor).mockResolvedValue({
    vendedor: { id: 'v1', nome: 'Vendedor Um' },
    matriz: [{ competencyId: 'c1', code: 'FECHAMENTO', name: 'Fechamento', category: null, status: 'OK', score: 50, confidence: 'LOW', nivel: 'INICIANTE', lastEvidenceAt: null, evidenceCount: 2, target: 80, gap: 30, priority: 'HIGH', breakdown: [] }],
    pdis: [],
    avaliacoes: [],
  });
  vi.mocked(managerPanelApi.buscarEquipeDetalhe).mockResolvedValue({
    vendedor: { id: 'v1', nome: 'Vendedor Um' },
    matriz: [],
    pdis: [],
    alertas: [],
    oneOnOnes: [],
    planos: [],
    certificacoes: [],
    missoes: [],
  });
  vi.mocked(managerPanelApi.listarOneOnOnes).mockResolvedValue({ encontros: [] });
  vi.mocked(managerPanelApi.buscarRoteiroSugerido1a1).mockResolvedValue({ perguntas: [] });
});

function renderTela() {
  return render(
    <MemoryRouter>
      <Equipe />
    </MemoryRouter>
  );
}

describe('Equipe', () => {
  it('lista vendedores e abre o desenvolvimento individual', async () => {
    const user = userEvent.setup();
    renderTela();

    await user.click(await screen.findByText('Vendedor Um'));
    expect(await screen.findByRole('heading', { name: 'Vendedor Um' })).toBeInTheDocument();
    expect(screen.getAllByText('Fechamento').length).toBeGreaterThan(0);
    expect(screen.getByText('50')).toBeInTheDocument();
  });

  it('registra uma avaliação chamando a API certa (rating 1-5, nunca score direto)', async () => {
    const user = userEvent.setup();
    vi.mocked(api.registrarAvaliacao).mockResolvedValue({});

    renderTela();
    await user.click(await screen.findByText('Vendedor Um'));
    const opcaoCompetencia = await screen.findByRole('option', { name: 'Fechamento' });
    const selectCompetencia = opcaoCompetencia.closest('select')!;

    await user.selectOptions(selectCompetencia, 'c1');
    await user.click(screen.getByRole('button', { name: 'Registrar' }));

    await waitFor(() => expect(api.registrarAvaliacao).toHaveBeenCalledWith('v1', { competencyId: 'c1', rating: 3, evidenceNote: undefined }));
  });

  it('reconhece um vendedor (social, nunca altera KPI/score)', async () => {
    const user = userEvent.setup();
    vi.mocked(competicoesApi.reconhecerVendedor).mockResolvedValue({ id: 'r1', tipo: 'TEAMWORK', authorId: 'ger1', subjectId: 'v1', message: 'Ótimo!', createdAt: new Date().toISOString() });

    renderTela();
    await user.click(await screen.findByText('Vendedor Um'));
    await user.click(screen.getByRole('button', { name: 'Reconhecer' }));

    await waitFor(() => expect(competicoesApi.reconhecerVendedor).toHaveBeenCalledWith('v1', { tipo: 'PERFORMANCE', message: undefined }));
    expect(await screen.findByText('Reconhecimento enviado ✓')).toBeInTheDocument();
  });

  it('pede sugestão de IA pra competência com prioridade HIGH', async () => {
    const user = userEvent.setup();
    vi.mocked(api.sugerirSequenciaIA).mockResolvedValue({ sugestoes: [{ tipo: 'LESSON', sourceId: 'l1', rationale: 'Reforça fechamento', title: 'Aula de fechamento' }] });

    renderTela();
    await user.click(await screen.findByText('Vendedor Um'));
    await user.click(await screen.findByRole('button', { name: 'Sugerir conteúdo com IA' }));

    expect(await screen.findByText('Aula de fechamento')).toBeInTheDocument();
    expect(api.sugerirSequenciaIA).toHaveBeenCalledWith('v1', 'c1');
  });
});
