// Estrutura da Empresa — visão Loja -> Gerente(s) -> Vendedor(es).
//
// Fatia 9.7: deixou de ser contemplativa. O Admin é master DENTRO da própria
// empresa e agora cria/edita/inativa loja aqui. O que continua fora, por
// decisão explícita: criar EMPRESA (seria papel de plataforma/super admin, que
// não existe neste produto) e mover pessoa de loja (isso já vive no detalhe do
// usuário, via Realocação — nunca duas portas pra mesma operação).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminNav } from './AdminNav';
import { useApi } from '../../utils/useApi';
import {
  atualizarLoja,
  buscarEstruturaDaEmpresa,
  criarLoja,
  inativarLoja,
  reativarLoja,
  type LinhaEstrutura,
} from '../../api/admin';
import { ApiError } from '../../api/client';
import { LoadingState } from '../../components/LoadingState';
import { labelStatusConta } from '../../utils/labels';

export function AdminEstrutura() {
  const [versao, setVersao] = useState(0);
  const { dados, carregando, recarregar } = useApi(() => buscarEstruturaDaEmpresa(), [versao]);

  function recarregarTudo() {
    setVersao((v) => v + 1);
    recarregar();
  }

  if (carregando && !dados) return <LoadingState texto="Carregando estrutura..." />;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <AdminNav />
      <h1 className="text-2xl font-semibold text-white">Estrutura da Empresa</h1>

      <NovaLoja onCriada={recarregarTudo} />

      <div className="flex flex-col gap-4">
        {dados?.estrutura.map((linha) => (
          <CardLoja key={linha.loja.id} linha={linha} onMudou={recarregarTudo} />
        ))}
      </div>
    </div>
  );
}

function NovaLoja({ onCriada }: { onCriada: () => void }) {
  const [nome, setNome] = useState('');
  const [codigoErp, setCodigoErp] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      await criarLoja({ nome, codigoErp });
      setNome('');
      setCodigoErp('');
      onCriada();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível criar a loja.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-surface p-4">
      <p className="text-sm font-medium text-white">Nova loja</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Nome
          <input
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Loja Shopping Centro"
            className="rounded-lg border border-slate-700 bg-bg px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-400">
          Código no ERP
          <input
            required
            value={codigoErp}
            onChange={(e) => setCodigoErp(e.target.value)}
            placeholder="LOJA002"
            className="rounded-lg border border-slate-700 bg-bg px-3 py-2 text-sm text-white"
          />
        </label>
        <button
          type="submit"
          disabled={salvando}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white active:opacity-80 disabled:opacity-50"
        >
          {salvando ? 'Criando...' : 'Criar loja'}
        </button>
      </div>
      <p className="text-xs text-slate-500">
        O código do ERP é a chave que o sistema usa pra casar a loja com o ERP e pra o vendedor entrar — precisa ser único.
      </p>
      {erro && <p className="text-sm text-red-400">{erro}</p>}
    </form>
  );
}

function CardLoja({ linha, onMudou }: { linha: LinhaEstrutura; onMudou: () => void }) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(linha.loja.nome);
  const [codigoErp, setCodigoErp] = useState(linha.loja.codigoErp);
  const [erro, setErro] = useState<string | null>(null);

  async function acao(executar: () => Promise<unknown>) {
    setErro(null);
    try {
      await executar();
      setEditando(false);
      onMudou();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível concluir a ação.');
    }
  }

  return (
    <div className={`rounded-lg border p-4 ${linha.loja.ativa ? 'border-slate-800' : 'border-slate-800 opacity-60'}`}>
      <div className="flex items-start justify-between gap-3">
        {editando ? (
          <div className="flex flex-1 flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Nome
              <input value={nome} onChange={(e) => setNome(e.target.value)} className="rounded border border-slate-700 bg-bg px-2 py-1 text-sm text-white" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Código no ERP
              <input
                value={codigoErp}
                onChange={(e) => setCodigoErp(e.target.value)}
                className="rounded border border-slate-700 bg-bg px-2 py-1 text-sm text-white"
              />
            </label>
            <button onClick={() => acao(() => atualizarLoja(linha.loja.id, { nome, codigoErp }))} className="text-xs text-emerald-400">
              Salvar
            </button>
            <button onClick={() => setEditando(false)} className="text-xs text-slate-500">
              Cancelar
            </button>
          </div>
        ) : (
          <div>
            <p className="font-semibold text-white">
              🏬 {linha.loja.nome}
              {!linha.loja.ativa && <span className="ml-2 text-xs font-normal text-slate-500">(inativa)</span>}
            </p>
            <p className="text-xs text-slate-500">código {linha.loja.codigoErp}</p>
          </div>
        )}

        {!editando && (
          <div className="flex shrink-0 gap-3">
            <button onClick={() => setEditando(true)} className="text-xs text-slate-300 hover:text-white">
              Editar
            </button>
            {linha.loja.ativa ? (
              <button onClick={() => acao(() => inativarLoja(linha.loja.id))} className="text-xs text-slate-500 hover:text-amber-400">
                Inativar
              </button>
            ) : (
              <button onClick={() => acao(() => reativarLoja(linha.loja.id))} className="text-xs text-emerald-400">
                Reativar
              </button>
            )}
          </div>
        )}
      </div>

      {erro && <p className="mt-2 text-sm text-red-400">{erro}</p>}

      <p className="mt-3 text-xs uppercase tracking-wide text-slate-500">Gerente(s)</p>
      {linha.gerentes.length === 0 && <p className="mb-2 text-sm text-slate-500">Nenhum gerente vinculado.</p>}
      <ul className="mb-3 flex flex-col gap-1">
        {linha.gerentes.map((g) => (
          <li key={g.id}>
            <Link to={`/admin/usuarios/${g.id}`} className="text-sm text-accentSoft hover:underline">
              👤 {g.nome} <span className="text-xs text-slate-500">({labelStatusConta(g.status)})</span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="text-xs uppercase tracking-wide text-slate-500">Vendedor(es)</p>
      {linha.vendedores.length === 0 && <p className="text-sm text-slate-500">Nenhum vendedor vinculado.</p>}
      <ul className="flex flex-col gap-1 pl-4">
        {linha.vendedores.map((v) => (
          <li key={v.id}>
            <Link to={`/admin/usuarios/${v.id}`} className="text-sm text-slate-300 hover:underline">
              {v.nome} <span className="text-xs text-slate-500">({labelStatusConta(v.status)})</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
