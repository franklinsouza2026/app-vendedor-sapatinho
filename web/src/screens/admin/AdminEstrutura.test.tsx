import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AdminEstrutura } from './AdminEstrutura';
import * as adminApi from '../../api/admin';

vi.mock('../../api/admin');

const ESTRUTURA: adminApi.LinhaEstrutura[] = [
  {
    loja: { id: 'loja-1', nome: 'Loja Piloto', codigoErp: 'LOJA001', ativa: true },
    gerentes: [{ id: 'g1', nome: 'Paulo Santos', status: 'ACTIVE' }],
    vendedores: [{ id: 'v1', nome: 'Marina Silva', status: 'PENDING_ACTIVATION' }],
  },
  {
    loja: { id: 'loja-2', nome: 'Loja Antiga', codigoErp: 'LOJA002', ativa: false },
    gerentes: [],
    vendedores: [],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(adminApi.buscarEstruturaDaEmpresa).mockResolvedValue({ estrutura: ESTRUTURA });
});

function renderTela() {
  return render(
    <MemoryRouter>
      <AdminEstrutura />
    </MemoryRouter>
  );
}

describe('AdminEstrutura', () => {
  it('mostra a hierarquia Loja → Gerente(s) → Vendedor(es) com status em PT-BR', async () => {
    renderTela();

    expect(await screen.findByText(/Loja Piloto/)).toBeInTheDocument();
    expect(screen.getByText(/Paulo Santos/)).toBeInTheDocument();
    expect(screen.getByText(/Marina Silva/)).toBeInTheDocument();
    // Status traduzido, não 'PENDING_ACTIVATION' cru.
    expect(screen.getByText(/Aguardando ativação/)).toBeInTheDocument();
  });

  it('marca visualmente a loja inativa', async () => {
    renderTela();
    expect(await screen.findByText('(inativa)')).toBeInTheDocument();
  });

  it('cria loja enviando nome e código do ERP', async () => {
    const user = userEvent.setup();
    vi.mocked(adminApi.criarLoja).mockResolvedValue({ id: 'nova', nome: 'Loja Shopping', codigoErp: 'LOJA003', ativa: true, gerentes: 0, vendedores: 0 });
    renderTela();

    await screen.findByText(/Loja Piloto/);
    await user.type(screen.getByRole('textbox', { name: /Nome/i }), 'Loja Shopping');
    await user.type(screen.getByRole('textbox', { name: /Código no ERP/i }), 'LOJA003');
    await user.click(screen.getByRole('button', { name: 'Criar loja' }));

    expect(adminApi.criarLoja).toHaveBeenCalledWith({ nome: 'Loja Shopping', codigoErp: 'LOJA003' });
  });

  it('mostra a mensagem real do backend quando o código do ERP já existe', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../../api/client');
    vi.mocked(adminApi.criarLoja).mockRejectedValue(
      new ApiError(409, 'já existe uma loja com este código de ERP nesta empresa', 'codigo_erp_duplicado')
    );
    renderTela();

    await screen.findByText(/Loja Piloto/);
    await user.type(screen.getByRole('textbox', { name: /Nome/i }), 'Duplicada');
    await user.type(screen.getByRole('textbox', { name: /Código no ERP/i }), 'LOJA001');
    await user.click(screen.getByRole('button', { name: 'Criar loja' }));

    expect(await screen.findByText(/já existe uma loja com este código de ERP/)).toBeInTheDocument();
  });

  it('loja ativa oferece Inativar; loja inativa oferece Reativar (nunca excluir)', async () => {
    renderTela();
    await screen.findByText(/Loja Piloto/);

    expect(screen.getByRole('button', { name: 'Inativar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reativar' })).toBeInTheDocument();
    // Loja nunca é apagada — tem histórico de venda/meta/gamificação pendurado.
    expect(screen.queryByRole('button', { name: /Excluir|Apagar|Remover/i })).not.toBeInTheDocument();
  });

  it('mostra o motivo quando o backend recusa inativar loja com gente ativa', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../../api/client');
    vi.mocked(adminApi.inativarLoja).mockRejectedValue(
      new ApiError(409, 'esta loja ainda tem 2 pessoa(s) ativa(s) — realoque ou desligue antes de inativar', 'loja_com_pessoas_ativas')
    );
    renderTela();

    await screen.findByText(/Loja Piloto/);
    await user.click(screen.getByRole('button', { name: 'Inativar' }));

    expect(await screen.findByText(/realoque ou desligue antes de inativar/)).toBeInTheDocument();
  });
});
