// Admin — configuração dos alertas do Painel Gerencial (Fatia 9, seção
// 66-70). Só ajusta thresholds já existentes — nunca uma fórmula livre
// (cada parâmetro já vem com nome fixo do backend).
import { FormEvent, useState } from 'react';
import { AdminNav } from './AdminNav';
import { useApi } from '../../utils/useApi';
import { LoadingState } from '../../components/LoadingState';
import { ApiError } from '../../api/client';
import { atualizarConfigAlerta, listarConfigsAlertas, ConfigAlertaDTO } from '../../api/adminGerencial';

export function AdminAlertasGerenciais() {
  const { dados, carregando, recarregar } = useApi(() => listarConfigsAlertas(), []);

  if (carregando && !dados) return <LoadingState texto="Carregando configuração..." />;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <AdminNav />
      <h1 className="text-2xl font-semibold text-white">Gerencial — Alertas</h1>
      <p className="text-sm text-slate-400">Ajuste os limiares que disparam cada alerta pro gerente. Defaults neutros/conservadores — nunca invente um número sem uma base real.</p>

      <div className="flex flex-col gap-3">
        {dados?.configs.map((config) => <LinhaConfig key={config.tipo} config={config} onSalvo={recarregar} />)}
      </div>
    </div>
  );
}

function LinhaConfig({ config, onSalvo }: { config: ConfigAlertaDTO; onSalvo: () => void }) {
  const [ativo, setAtivo] = useState(config.ativo);
  const [parametros, setParametros] = useState<Record<string, number>>(config.parametros);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function handleSalvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      await atualizarConfigAlerta(config.tipo, ativo, parametros);
      onSalvo();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'não foi possível salvar');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={handleSalvar} className="flex flex-col gap-2 rounded-lg border border-slate-800 p-4">
      <div className="flex items-center justify-between">
        <p className="font-medium text-white">{config.tipo}</p>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
          Ativo
        </label>
      </div>
      {Object.entries(parametros).map(([chave, valor]) => (
        <label key={chave} className="flex items-center justify-between text-xs text-slate-400">
          {chave}
          <input
            type="number"
            value={valor}
            onChange={(e) => setParametros({ ...parametros, [chave]: Number(e.target.value) })}
            className="w-24 rounded-lg bg-surface px-2 py-1 text-sm text-white"
          />
        </label>
      ))}
      <button type="submit" disabled={salvando} className="self-start rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
        Salvar (v{config.versao})
      </button>
      {erro && <p className="text-xs text-red-400">{erro}</p>}
    </form>
  );
}
