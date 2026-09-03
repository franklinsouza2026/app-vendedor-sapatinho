// Estrutura da Empresa (Fatia 9.6, seção 10) — visão Loja -> Gerente(s) ->
// Vendedor(es), só leitura (edição de vínculo continua no detalhe do
// usuário — nunca um organograma editável complexo aqui).
import { Link } from 'react-router-dom';
import { AdminNav } from './AdminNav';
import { useApi } from '../../utils/useApi';
import { buscarEstruturaDaEmpresa } from '../../api/admin';
import { LoadingState } from '../../components/LoadingState';

const LABEL_STATUS: Record<string, string> = { PENDING_ACTIVATION: 'pendente', ACTIVE: 'ativo', BLOCKED: 'bloqueado', OFFBOARDED: 'desligado' };

export function AdminEstrutura() {
  const { dados, carregando } = useApi(() => buscarEstruturaDaEmpresa(), []);

  if (carregando && !dados) return <LoadingState texto="Carregando estrutura..." />;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <AdminNav />
      <h1 className="text-2xl font-semibold text-white">Estrutura da Empresa</h1>

      <div className="flex flex-col gap-4">
        {dados?.estrutura.map((linha) => (
          <div key={linha.loja.id} className="rounded-lg border border-slate-800 p-4">
            <p className="font-semibold text-white">🏬 {linha.loja.nome}</p>
            <p className="mb-3 text-xs text-slate-500">código {linha.loja.codigoErp}</p>

            <p className="text-xs uppercase tracking-wide text-slate-500">Gerente(s)</p>
            {linha.gerentes.length === 0 && <p className="mb-2 text-sm text-slate-500">Nenhum gerente vinculado.</p>}
            <ul className="mb-3 flex flex-col gap-1">
              {linha.gerentes.map((g) => (
                <li key={g.id}>
                  <Link to={`/admin/usuarios/${g.id}`} className="text-sm text-accentSoft hover:underline">
                    👤 {g.nome} <span className="text-xs text-slate-500">({LABEL_STATUS[g.status]})</span>
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
                    {v.nome} <span className="text-xs text-slate-500">({LABEL_STATUS[v.status]})</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
