import { FormEvent, useState } from 'react';
import { useApi } from '../../utils/useApi';
import { labelEspecialista } from '../../utils/specialistLabels';
import {
  ativarProvider,
  atualizarBudgetIA,
  atualizarModelo,
  buscarUsoIA,
  buscarVisaoGeralIA,
  NomeProviderIA,
  ProviderStatus,
  removerCredencial,
  salvarCredencial,
  testarConexao,
} from '../../api/adminAi';
import { ApiError } from '../../api/client';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { AdminNav } from './AdminNav';

const LABEL_PROVIDER: Record<NomeProviderIA, string> = { MOCK: 'Mock (determinístico)', ANTHROPIC: 'Anthropic', OPENAI: 'OpenAI', GEMINI: 'Gemini' };
const LABEL_HEALTH: Record<ProviderStatus['health']['status'], string> = {
  NEVER_TESTED: 'nunca testado',
  LAST_CALL_OK: 'última chamada OK',
  LAST_CALL_FAILED: 'última chamada falhou',
};
const COR_HEALTH: Record<ProviderStatus['health']['status'], string> = {
  NEVER_TESTED: 'text-slate-500',
  LAST_CALL_OK: 'text-emerald-400',
  LAST_CALL_FAILED: 'text-red-400',
};

// Admin AI Control Plane (Fatia 7.5B) — visão geral + gestão de providers.
// Credencial é sempre write-only: nunca é reexibida depois de salva.
export function AdminIA() {
  const { dados, carregando, erro, recarregar } = useApi(() => buscarVisaoGeralIA(), []);
  const { dados: uso } = useApi(() => buscarUsoIA(), []);

  if (carregando && !dados) return <LoadingState texto="Carregando configuração de IA..." />;
  if (erro) return <ErrorState mensagem={erro} onRetry={recarregar} />;
  if (!dados) return null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <AdminNav />

      <div>
        <h1 className="text-2xl font-semibold text-white">Central de IA</h1>
        <p className="text-sm text-slate-400">
          Provider ativo: <strong className="text-white">{LABEL_PROVIDER[dados.activeProvider]}</strong> · modo manual
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-medium text-white">Orçamento mensal</h2>
        <BudgetCard monthlyLimitUSD={dados.budget.monthlyLimitUSD} gastoMensalUSD={dados.budget.gastoMensalUSD} onSalvo={recarregar} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium text-white">Provedores</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {dados.providers.map((p) => (
            <ProviderCard key={p.provider} status={p} onMudou={recarregar} />
          ))}
        </div>
      </section>

      {uso && (
        <section>
          <h2 className="mb-3 text-lg font-medium text-white">Uso e custo (mês atual)</h2>
          <div className="grid grid-cols-3 gap-3 rounded-lg border border-slate-800 p-4 text-sm">
            <div>
              <p className="text-slate-500">Chamadas</p>
              <p className="text-lg font-semibold text-white">{uso.total.chamadas}</p>
            </div>
            <div>
              <p className="text-slate-500">Tokens (in+out)</p>
              <p className="text-lg font-semibold text-white">{uso.total.inputTokens + uso.total.outputTokens}</p>
            </div>
            <div>
              <p className="text-slate-500">Custo estimado</p>
              <p className="text-lg font-semibold text-white">${uso.total.custoEstimadoUSD.toFixed(4)}</p>
            </div>
          </div>
          {uso.porEspecialista.length > 0 && (
            <table className="mt-3 w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-1">Especialista</th>
                  <th className="py-1">Chamadas</th>
                  <th className="py-1">Custo estimado</th>
                </tr>
              </thead>
              <tbody className="text-slate-200">
                {uso.porEspecialista.map((e) => (
                  <tr key={e.specialist}>
                    <td className="py-1">{labelEspecialista(e.specialist)}</td>
                    <td className="py-1">{e.chamadas}</td>
                    <td className="py-1">${e.custoEstimadoUSD.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </div>
  );
}

function BudgetCard({ monthlyLimitUSD, gastoMensalUSD, onSalvo }: { monthlyLimitUSD: number; gastoMensalUSD: number; onSalvo: () => void }) {
  const [valor, setValor] = useState(String(monthlyLimitUSD));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const percentual = monthlyLimitUSD > 0 ? Math.min(100, (gastoMensalUSD / monthlyLimitUSD) * 100) : 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    try {
      await atualizarBudgetIA(Number(valor));
      onSalvo();
    } catch {
      setErro('Não foi possível salvar o orçamento.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-800 p-4">
      <p className="text-sm text-slate-400">
        Custo estimado do mês: <strong className="text-white">${gastoMensalUSD.toFixed(4)}</strong> de ${monthlyLimitUSD.toFixed(2)} ({percentual.toFixed(0)}%)
      </p>
      <div className="mt-2 h-2 w-full rounded-full bg-slate-800">
        <div className={`h-2 rounded-full ${percentual >= 100 ? 'bg-red-500' : percentual >= 75 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${percentual}%` }} />
      </div>
      <form onSubmit={handleSubmit} className="mt-3 flex items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-400">Limite mensal (USD)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            className="w-32 rounded-lg bg-surface px-3 py-2 text-sm text-white"
          />
        </label>
        <button type="submit" disabled={salvando} className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
          Salvar
        </button>
      </form>
      {erro && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {erro}
        </p>
      )}
    </div>
  );
}

function ProviderCard({ status, onMudou }: { status: ProviderStatus; onMudou: () => void }) {
  const [apiKey, setApiKey] = useState('');
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [executando, setExecutando] = useState(false);
  const precisaCredencial = status.provider !== 'MOCK';

  async function comTratamento(acao: () => Promise<void>) {
    setErro(null);
    setMensagem(null);
    setExecutando(true);
    try {
      await acao();
      onMudou();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível concluir a ação.');
    } finally {
      setExecutando(false);
    }
  }

  async function handleSalvarCredencial(e: FormEvent) {
    e.preventDefault();
    if (!apiKey.trim()) return;
    await comTratamento(async () => {
      await salvarCredencial(status.provider, apiKey);
      setApiKey('');
      setMensagem('Credencial configurada ✓');
    });
  }

  async function handleTestar() {
    await comTratamento(async () => {
      const resultado = await testarConexao(status.provider);
      setMensagem(resultado.ok ? `Conexão OK (${resultado.latencyMs}ms)` : `Falha: ${resultado.errorType}`);
    });
  }

  return (
    <div className={`rounded-lg border p-4 ${status.active ? 'border-accent' : 'border-slate-800'}`}>
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-white">{LABEL_PROVIDER[status.provider]}</h3>
        {status.active && <span className="rounded-full bg-accent/20 px-2 py-0.5 text-xs text-accentSoft">Ativo</span>}
      </div>

      <p className={`mt-1 text-xs ${COR_HEALTH[status.health.status]}`}>{LABEL_HEALTH[status.health.status]}</p>
      {status.model && <p className="text-xs text-slate-500">Modelo: {status.model}</p>}

      {precisaCredencial && (
        <div className="mt-3">
          {status.configured ? (
            <div className="flex items-center justify-between text-sm">
              <span className="text-emerald-400">Configurada ✓</span>
              <button
                onClick={() => comTratamento(() => removerCredencial(status.provider))}
                disabled={executando}
                className="text-xs text-slate-400 underline disabled:opacity-50"
              >
                Remover credencial
              </button>
            </div>
          ) : (
            <form onSubmit={handleSalvarCredencial} className="flex gap-2">
              <input
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Chave de API"
                aria-label={`Chave de API — ${LABEL_PROVIDER[status.provider]}`}
                className="flex-1 rounded-lg bg-surface px-3 py-2 text-sm text-white"
              />
              <button type="submit" disabled={executando} className="rounded-lg bg-surface px-3 py-2 text-sm text-white disabled:opacity-50">
                Salvar
              </button>
            </form>
          )}
        </div>
      )}

      {status.modelosPermitidos.length > 1 && (
        <label className="mt-3 flex flex-col gap-1 text-xs text-slate-400">
          Modelo
          <select
            value={status.model ?? ''}
            onChange={(e) => comTratamento(() => atualizarModelo(status.provider, e.target.value))}
            className="rounded-lg bg-surface px-3 py-2 text-sm text-white"
          >
            <option value="" disabled>
              Escolher modelo
            </option>
            {status.modelosPermitidos.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="mt-3 flex gap-2">
        <button
          onClick={handleTestar}
          disabled={executando || (precisaCredencial && !status.configured)}
          className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 disabled:opacity-50"
        >
          Testar conexão
        </button>
        {!status.active && (
          <button
            onClick={() => comTratamento(() => ativarProvider(status.provider))}
            disabled={executando || (precisaCredencial && !status.configured)}
            className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            Ativar
          </button>
        )}
      </div>

      {mensagem && <p className="mt-2 text-xs text-emerald-400">{mensagem}</p>}
      {erro && (
        <p role="alert" className="mt-2 text-xs text-red-400">
          {erro}
        </p>
      )}
    </div>
  );
}
