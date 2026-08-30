import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../../utils/useApi';
import { listarVendedoresAdmin } from '../../api/admin';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import { StatusConta } from '../../types';
import { AdminNav } from './AdminNav';

const LABEL_STATUS: Record<StatusConta, string> = {
  PENDING_ACTIVATION: 'pendente de ativação',
  ACTIVE: 'ativo',
  BLOCKED: 'bloqueado',
  OFFBOARDED: 'desligado',
};

const COR_STATUS: Record<StatusConta, string> = {
  PENDING_ACTIVATION: 'text-amber-400',
  ACTIVE: 'text-emerald-400',
  BLOCKED: 'text-red-400',
  OFFBOARDED: 'text-slate-500',
};

// Admin Foundation (Fatia 7.5A, seção 35-37) — shell desktop-first, sem
// imitar a tela mobile do vendedor. Ações de mutação (bloquear/desligar)
// ficam no detalhe (AdminUsuarioDetalhe), não na listagem.
export function AdminUsuarios() {
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState<StatusConta | ''>('');
  const { dados, carregando, erro, recarregar } = useApi(() => listarVendedoresAdmin({ busca: busca || undefined, status: status || undefined }), [busca, status]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <AdminNav />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Usuários</h1>
        <Link to="/admin/usuarios/novo" className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white active:opacity-80">
          + Pré-autorizar vendedor
        </Link>
      </div>

      <div className="flex gap-3">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome..."
          className="flex-1 rounded-lg bg-surface px-4 py-2 text-white"
        />
        <select value={status} onChange={(e) => setStatus(e.target.value as StatusConta | '')} className="rounded-lg bg-surface px-4 py-2 text-white">
          <option value="">Todos os status</option>
          {(Object.keys(LABEL_STATUS) as StatusConta[]).map((s) => (
            <option key={s} value={s}>
              {LABEL_STATUS[s]}
            </option>
          ))}
        </select>
      </div>

      {carregando && !dados && <LoadingState texto="Carregando usuários..." />}
      {erro && <ErrorState mensagem={erro} onRetry={recarregar} />}
      {dados && dados.vendedores.length === 0 && <EmptyState texto="Nenhum usuário encontrado." />}

      {dados && dados.vendedores.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-slate-400">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Matrícula</th>
                <th className="px-4 py-3">Loja</th>
                <th className="px-4 py-3">Papel</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">CPF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {dados.vendedores.map((v) => (
                <tr key={v.id} className="text-slate-200">
                  <td className="px-4 py-3">
                    <Link to={`/admin/usuarios/${v.id}`} className="text-accentSoft hover:underline">
                      {v.nome}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{v.matriculaErp}</td>
                  <td className="px-4 py-3">{v.loja.nome}</td>
                  <td className="px-4 py-3">{v.papel}</td>
                  <td className={`px-4 py-3 font-medium ${COR_STATUS[v.status]}`}>{LABEL_STATUS[v.status]}</td>
                  <td className="px-4 py-3 text-slate-500">{v.cpfMascarado ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
