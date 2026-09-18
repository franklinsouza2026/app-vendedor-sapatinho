import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AdminMetas } from './AdminMetas';
import * as adminApi from '../../api/admin';

vi.mock('../../api/admin');

const META_ABERTA: adminApi.MetaAdmin = {
  id: 'meta-1',
  vendedorId: 'v1',
  vendedorNome: 'Marina Silva',
  matriculaErp: 'VEND001',
  lojaId: 'loja-1',
  tipo: 'FATURAMENTO',
  periodo: 'DIA',
  referencia: '2026-09-17T00:00:00.000Z',
  valorMeta: 1200,
  editavel: true,
};

const META_ENCERRADA: adminApi.MetaAdmin = { ...META_ABERTA, id: 'meta-2', valorMeta: 900, editavel: false };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(adminApi.listarLojasAdmin).mockResolvedValue({
    lojas: [{ id: 'loja-1', nome: 'Loja Piloto', codigoErp: 'LOJA001', ativa: true, gerentes: 1, vendedores: 2 }],
  });
  vi.mocked(adminApi.listarVendedoresAdmin).mockResolvedValue({
    vendedores: [
      { id: 'v1', nome: 'Marina Silva', matriculaErp: 'VEND001', papel: 'VENDEDOR', status: 'ACTIVE', loja: { id: 'loja-1', nome: 'Loja Piloto' }, cpfMascarado: null, createdAt: '2026-01-01' },
      { id: 'g1', nome: 'Paulo Santos', matriculaErp: 'GER001', papel: 'GERENTE', status: 'ACTIVE', loja: { id: 'loja-1', nome: 'Loja Piloto' }, cpfMascarado: null, createdAt: '2026-01-01' },
    ] as never,
  });
  vi.mocked(adminApi.listarMetasAdmin).mockResolvedValue({ metas: [META_ABERTA] });
});

function renderTela() {
  return render(
    <MemoryRouter>
      <AdminMetas />
    </MemoryRouter>
  );
}

describe('AdminMetas', () => {
  it('lista metas com nome do vendedor e rótulos em PT-BR', async () => {
    renderTela();

    expect(await screen.findByRole('cell', { name: 'Marina Silva' })).toBeInTheDocument();
    // 'Faturamento'/'Diária' também aparecem nas <option> do formulário — escopa na linha da tabela.
    expect(screen.getByRole('cell', { name: 'Faturamento' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Diária' })).toBeInTheDocument();
  });

  it('só oferece VENDEDOR no seletor — gerente não tem meta comercial própria', async () => {
    renderTela();

    await screen.findByRole('cell', { name: 'Marina Silva' });
    const seletorVendedor = screen.getByRole('combobox', { name: /Vendedor/i });
    expect(seletorVendedor).toHaveTextContent('Marina Silva');
    expect(seletorVendedor).not.toHaveTextContent('Paulo Santos');
  });

  it('cadastra uma meta enviando exatamente o que o Admin preencheu', async () => {
    const user = userEvent.setup();
    vi.mocked(adminApi.criarMetaAdmin).mockResolvedValue({ id: 'meta-nova' });
    renderTela();

    await screen.findByRole('cell', { name: 'Marina Silva' });
    await user.selectOptions(screen.getByRole('combobox', { name: /Vendedor/i }), 'v1');
    await user.type(screen.getByRole('spinbutton', { name: /Valor/i }), '1500');
    await user.click(screen.getByRole('button', { name: 'Cadastrar meta' }));

    expect(adminApi.criarMetaAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ vendedorId: 'v1', tipo: 'FATURAMENTO', periodo: 'DIA', valorMeta: 1500 })
    );
  });

  it('mostra a mensagem real do backend quando a meta é duplicada (não uma genérica)', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../../api/client');
    vi.mocked(adminApi.criarMetaAdmin).mockRejectedValue(
      new ApiError(409, 'já existe uma meta deste tipo para este vendedor neste período', 'meta_duplicada')
    );
    renderTela();

    await screen.findByRole('cell', { name: 'Marina Silva' });
    await user.selectOptions(screen.getByRole('combobox', { name: /Vendedor/i }), 'v1');
    await user.type(screen.getByRole('spinbutton', { name: /Valor/i }), '1500');
    await user.click(screen.getByRole('button', { name: 'Cadastrar meta' }));

    expect(await screen.findByText(/já existe uma meta deste tipo/)).toBeInTheDocument();
  });

  it('meta de período encerrado não oferece editar nem remover — histórico é imutável', async () => {
    vi.mocked(adminApi.listarMetasAdmin).mockResolvedValue({ metas: [META_ENCERRADA] });
    renderTela();

    expect(await screen.findByText('período encerrado')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remover' })).not.toBeInTheDocument();
  });

  it('edita o valor de uma meta ainda aberta', async () => {
    const user = userEvent.setup();
    vi.mocked(adminApi.atualizarMetaAdmin).mockResolvedValue({ id: 'meta-1' });
    renderTela();

    await screen.findByRole('cell', { name: 'Marina Silva' });
    await user.click(screen.getByRole('button', { name: 'Editar' }));

    const campo = screen.getByRole('spinbutton', { name: /Novo valor da meta de Marina Silva/i });
    await user.clear(campo);
    await user.type(campo, '2000');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(adminApi.atualizarMetaAdmin).toHaveBeenCalledWith('meta-1', 2000);
  });
});
