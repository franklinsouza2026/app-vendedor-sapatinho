import { useState } from 'react';
import { useApi } from '../../utils/useApi';
import {
  atualizarMetaAdmin,
  criarMetaAdmin,
  listarMetasAdmin,
  listarLojasAdmin,
  listarVendedoresAdmin,
  removerMetaAdmin,
  type MetaAdmin,
  type PeriodoMeta,
  type TipoMeta,
} from '../../api/admin';
import { ApiError } from '../../api/client';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import { formatarMoeda } from '../../utils/format';
import { labelPeriodoMeta, labelTipoMeta } from '../../utils/labels';
import { AdminNav } from './AdminNav';

const PERIODOS: PeriodoMeta[] = ['DIA', 'SEMANA', 'MES'];
const TIPOS: TipoMeta[] = ['FATURAMENTO', 'TICKET_MEDIO', 'PA'];

function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Gestão de metas (Fatia 9.7, P0). Antes desta tela, `Meta` só existia via
 * seed — ou seja, em produção ninguém conseguia cadastrar meta pra ninguém, e
 * Home, Performance, gamificação e Reunião do Dia ficavam vazias pra todo mundo.
 *
 * Meta de período já encerrado aparece, mas não é editável: o backend recusa
 * (a gamificação daquele período já foi calculada com o valor antigo) e a UI
 * reflete isso em vez de deixar o Admin tentar e tomar erro.
 */
export function AdminMetas() {
  const [lojaId, setLojaId] = useState('');
  const [versao, setVersao] = useState(0);

  // Endpoint ADMIN (escopado pelo token), não o público de login.
  const { dados: lojasData } = useApi(() => listarLojasAdmin(), []);
  const { dados: vendedoresData } = useApi(() => listarVendedoresAdmin({ status: 'ACTIVE' }), []);
  const { dados, carregando, erro, recarregar } = useApi(
    () => listarMetasAdmin({ lojaId: lojaId || undefined }),
    [lojaId, versao]
  );

  // Meta é de quem vende — Admin/Gerente não têm meta comercial própria.
  const vendedoresElegiveis = (vendedoresData?.vendedores ?? []).filter((v) => v.papel === 'VENDEDOR');

  function recarregarTudo() {
    setVersao((v) => v + 1);
    recarregar();
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <AdminNav />
      <h1 className="text-2xl font-semibold text-white">Metas</h1>
      <p className="text-sm text-slate-400">
        A meta é a base da Home, da Performance, das missões e da gamificação do vendedor. Sem meta cadastrada, o vendedor
        vê a tela vazia.
      </p>

      <NovaMeta vendedores={vendedoresElegiveis} onCriada={recarregarTudo} />

      <div className="flex items-center gap-3">
        <label htmlFor="filtro-loja" className="text-sm text-slate-400">
          Loja
        </label>
        <select
          id="filtro-loja"
          value={lojaId}
          onChange={(e) => setLojaId(e.target.value)}
          className="rounded-lg border border-slate-700 bg-surface px-3 py-2 text-sm text-white"
        >
          <option value="">Todas as lojas</option>
          {lojasData?.lojas.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nome}
            </option>
          ))}
        </select>
      </div>

      {carregando && <LoadingState />}
      {erro && <ErrorState mensagem="Não foi possível carregar as metas." onRetry={recarregar} />}
      {dados && dados.metas.length === 0 && <EmptyState texto="Nenhuma meta cadastrada ainda." />}

      {dados && dados.metas.length > 0 && (
        <table className="w-full overflow-hidden rounded-xl border border-slate-800 text-left text-sm">
          <thead className="bg-surface text-slate-400">
            <tr>
              <th className="px-4 py-3">Vendedor</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Período</th>
              <th className="px-4 py-3">Referência</th>
              <th className="px-4 py-3">Meta</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {dados.metas.map((meta) => (
              <LinhaMeta key={meta.id} meta={meta} onMudou={recarregarTudo} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function NovaMeta({ vendedores, onCriada }: { vendedores: { id: string; nome: string }[]; onCriada: () => void }) {
  const [vendedorId, setVendedorId] = useState('');
  const [tipo, setTipo] = useState<TipoMeta>('FATURAMENTO');
  const [periodo, setPeriodo] = useState<PeriodoMeta>('DIA');
  const [referencia, setReferencia] = useState(hojeISO());
  const [valorMeta, setValorMeta] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      await criarMetaAdmin({ vendedorId, tipo, periodo, referencia, valorMeta: Number(valorMeta) });
      setValorMeta('');
      onCriada();
    } catch (err) {
      // Mensagem do backend já vem em PT-BR e explica o motivo real
      // (duplicada / período encerrado / vendedor fora do escopo).
      setErro(err instanceof ApiError ? err.message : 'Não foi possível cadastrar a meta.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-surface p-4">
      <p className="text-sm font-medium text-white">Cadastrar meta</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Vendedor
          <select
            required
            value={vendedorId}
            onChange={(e) => setVendedorId(e.target.value)}
            className="rounded-lg border border-slate-700 bg-bg px-3 py-2 text-sm text-white"
          >
            <option value="">Selecione</option>
            {vendedores.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nome}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoMeta)} className="rounded-lg border border-slate-700 bg-bg px-3 py-2 text-sm text-white">
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {labelTipoMeta(t)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Período
          <select value={periodo} onChange={(e) => setPeriodo(e.target.value as PeriodoMeta)} className="rounded-lg border border-slate-700 bg-bg px-3 py-2 text-sm text-white">
            {PERIODOS.map((p) => (
              <option key={p} value={p}>
                {labelPeriodoMeta(p)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Data de referência
          <input
            type="date"
            required
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            className="rounded-lg border border-slate-700 bg-bg px-3 py-2 text-sm text-white"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Valor
          <input
            type="number"
            min="0.01"
            step="0.01"
            required
            value={valorMeta}
            onChange={(e) => setValorMeta(e.target.value)}
            placeholder="1000.00"
            className="w-32 rounded-lg border border-slate-700 bg-bg px-3 py-2 text-sm text-white"
          />
        </label>

        <button
          type="submit"
          disabled={salvando}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white active:opacity-80 disabled:opacity-50"
        >
          {salvando ? 'Salvando...' : 'Cadastrar meta'}
        </button>
      </div>
      {erro && <p className="text-sm text-red-400">{erro}</p>}
    </form>
  );
}

function LinhaMeta({ meta, onMudou }: { meta: MetaAdmin; onMudou: () => void }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(String(meta.valorMeta));
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    setErro(null);
    try {
      await atualizarMetaAdmin(meta.id, Number(valor));
      setEditando(false);
      onMudou();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível salvar.');
    }
  }

  async function remover() {
    setErro(null);
    try {
      await removerMetaAdmin(meta.id);
      onMudou();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível remover.');
    }
  }

  const referenciaFormatada = new Date(meta.referencia).toLocaleDateString('pt-BR');

  return (
    <tr className="border-t border-slate-800">
      <td className="px-4 py-3 text-white">{meta.vendedorNome}</td>
      <td className="px-4 py-3 text-slate-300">{labelTipoMeta(meta.tipo)}</td>
      <td className="px-4 py-3 text-slate-300">{labelPeriodoMeta(meta.periodo)}</td>
      <td className="px-4 py-3 text-slate-400">{referenciaFormatada}</td>
      <td className="px-4 py-3 text-white">
        {editando ? (
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            aria-label={`Novo valor da meta de ${meta.vendedorNome}`}
            className="w-28 rounded border border-slate-700 bg-bg px-2 py-1 text-sm text-white"
          />
        ) : (
          formatarMoeda(meta.valorMeta)
        )}
        {erro && <p className="text-xs text-red-400">{erro}</p>}
      </td>
      <td className="px-4 py-3 text-right">
        {!meta.editavel ? (
          // Período encerrado: o histórico é imutável porque XP e moedas já
          // foram concedidos com base nesta meta.
          <span className="text-xs text-slate-500">período encerrado</span>
        ) : editando ? (
          <div className="flex justify-end gap-2">
            <button onClick={salvar} className="text-xs text-emerald-400">
              Salvar
            </button>
            <button onClick={() => setEditando(false)} className="text-xs text-slate-500">
              Cancelar
            </button>
          </div>
        ) : (
          <div className="flex justify-end gap-3">
            <button onClick={() => setEditando(true)} className="text-xs text-slate-300 hover:text-white">
              Editar
            </button>
            <button onClick={remover} className="text-xs text-slate-500 hover:text-red-400">
              Remover
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
