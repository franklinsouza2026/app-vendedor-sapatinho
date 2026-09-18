import { FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApi } from '../../utils/useApi';
import { bloquearVendedor, desbloquearVendedor, desligarVendedor, detalharVendedorAdmin, reativarVendedor, realocarVendedor, reemitirAcesso } from '../../api/admin';
import { listarLojas } from '../../api/auth';
import { ApiError } from '../../api/client';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { labelPapel, labelStatusVinculoErp } from '../../utils/labels';

const LABEL_STATUS: Record<string, string> = {
  PENDING_ACTIVATION: 'pendente de ativação',
  ACTIVE: 'ativo',
  BLOCKED: 'bloqueado',
  OFFBOARDED: 'desligado',
};

type AcaoCritica = 'bloquear' | 'desbloquear' | 'desligar' | 'reativar';

const EXECUTAR: Record<AcaoCritica, (id: string) => Promise<unknown>> = {
  bloquear: bloquearVendedor,
  desbloquear: desbloquearVendedor,
  desligar: desligarVendedor,
  reativar: reativarVendedor,
};

// Ações críticas exigem confirmação explícita (Fatia 7.5A, seção 68) — sem
// dialog nativo do browser (difícil de testar/automatizar): um segundo clique
// num botão "Confirmar" que só aparece depois do primeiro.
export function AdminUsuarioDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { dados, carregando, erro, recarregar } = useApi(() => detalharVendedorAdmin(id!), [id]);
  const [acaoPendente, setAcaoPendente] = useState<AcaoCritica | null>(null);
  const [executando, setExecutando] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);

  async function confirmar(acao: AcaoCritica) {
    setExecutando(true);
    setErroAcao(null);
    try {
      await EXECUTAR[acao](id!);
      setAcaoPendente(null);
      recarregar();
    } catch (err) {
      setErroAcao(err instanceof ApiError ? err.message : 'Não foi possível concluir a ação.');
    } finally {
      setExecutando(false);
    }
  }

  if (carregando && !dados) return <LoadingState texto="Carregando usuário..." />;
  if (erro) return <ErrorState mensagem={erro} onRetry={recarregar} />;
  if (!dados) return null;

  const acoesDisponiveis: AcaoCritica[] =
    dados.status === 'ACTIVE'
      ? ['bloquear', 'desligar']
      : dados.status === 'BLOCKED'
        ? ['desbloquear', 'desligar']
        : dados.status === 'OFFBOARDED'
          ? ['reativar']
          : [];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
      <Link to="/admin/usuarios" className="text-sm text-accentSoft">
        ← Voltar pra Usuários
      </Link>

      <div>
        <h1 className="text-2xl font-semibold text-white">{dados.nome}</h1>
        <p className="text-slate-400">
          {dados.loja.nome} · {labelPapel(dados.papel)} · matrícula {dados.matriculaErp}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-4 rounded-lg border border-slate-800 p-4 text-sm">
        <div>
          <dt className="text-slate-500">Status</dt>
          <dd className="font-medium text-white">{LABEL_STATUS[dados.status]}</dd>
        </div>
        <div>
          <dt className="text-slate-500">CPF</dt>
          <dd className="text-white">{dados.cpfMascarado ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Cadastrado em</dt>
          <dd className="text-white">{new Date(dados.createdAt).toLocaleDateString('pt-BR')}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Identidade externa (ERP)</dt>
          <dd className="text-white">
            {dados.identidadesExternas.length === 0
              ? 'nenhuma (fundação pra Fatia 10 — Linx real)'
              : dados.identidadesExternas.map((i) => `${i.provider}: ${labelStatusVinculoErp(i.status)}`).join(', ')}
          </dd>
        </div>
      </dl>

      {erroAcao && (
        <p role="alert" className="text-sm text-red-400">
          {erroAcao}
        </p>
      )}

      <div className="flex gap-3">
        {acoesDisponiveis.map((acao) =>
          acaoPendente === acao ? (
            <div key={acao} className="flex items-center gap-2">
              <span className="text-sm text-slate-300">Confirmar {LABEL_ACAO[acao]}?</span>
              <button
                onClick={() => confirmar(acao)}
                disabled={executando}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Confirmar
              </button>
              <button onClick={() => setAcaoPendente(null)} className="rounded-lg bg-surface px-3 py-2 text-sm text-slate-300">
                Cancelar
              </button>
            </div>
          ) : (
            <button
              key={acao}
              onClick={() => setAcaoPendente(acao)}
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 active:opacity-80"
            >
              {LABEL_ACAO[acao]}
            </button>
          )
        )}
      </div>

      <SecaoRealocacao vendedorId={id!} lojaAtualId={dados.loja.id} onRealocado={recarregar} />

      <SecaoReemitirAcesso vendedorId={id!} status={dados.status} onReemitido={recarregar} />

      <button onClick={() => navigate(-1)} className="mt-4 text-sm text-slate-500">
        Voltar
      </button>
    </div>
  );
}

/**
 * Reemissão de acesso (Fatia 9.7) — é o "esqueci minha senha" possível nesta
 * arquitetura, que não tem e-mail/SMS. O Admin NUNCA vê nem define a senha:
 * gera um código de uso único, repassa por canal próprio, e a própria pessoa
 * escolhe a senha na tela de ativação.
 */
function SecaoReemitirAcesso({ vendedorId, status, onReemitido }: { vendedorId: string; status: string; onReemitido: () => void }) {
  const [token, setToken] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  // Conta bloqueada/desligada não reemite: reemissão não é atalho pra
  // contornar o ciclo de vida da conta (o backend também recusa).
  const inelegivel = status === 'BLOCKED' || status === 'OFFBOARDED';

  async function reemitir() {
    setErro(null);
    setEnviando(true);
    try {
      const res = await reemitirAcesso(vendedorId);
      setToken(res.tokenAtivacao);
      setConfirmando(false);
      onReemitido();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível reemitir o acesso agora.');
    } finally {
      setEnviando(false);
    }
  }

  if (token) {
    return (
      <div className="mt-6 rounded-lg border border-amber-700 bg-amber-950/30 p-4">
        <p className="mb-2 text-sm text-amber-300">
          Novo código de ativação gerado. Repasse por um canal seguro — ele não será mostrado de novo. A senha anterior
          deixou de valer e a própria pessoa vai escolher uma nova ao ativar.
        </p>
        <code className="block break-all rounded bg-base p-3 text-sm text-white">{token}</code>
      </div>
    );
  }

  return (
    <div className="mt-6 border-t border-slate-800 pt-4">
      <p className="mb-1 text-sm font-medium text-white">Acesso</p>
      <p className="mb-3 text-xs text-slate-500">
        Use quando a pessoa perdeu a senha. Você nunca define a senha dela — só gera um código de ativação de uso único.
      </p>

      {inelegivel ? (
        <p className="text-sm text-slate-500">
          Conta {status === 'BLOCKED' ? 'bloqueada' : 'desligada'} não tem acesso reemitido. Desbloqueie ou reative primeiro.
        </p>
      ) : confirmando ? (
        <div className="flex items-center gap-3">
          <span className="text-sm text-amber-300">Isso invalida a senha atual. Confirmar?</span>
          <button onClick={reemitir} disabled={enviando} className="rounded-lg bg-accent px-3 py-1.5 text-sm text-white disabled:opacity-50">
            {enviando ? 'Gerando...' : 'Confirmar'}
          </button>
          <button onClick={() => setConfirmando(false)} className="text-sm text-slate-500">
            Cancelar
          </button>
        </div>
      ) : (
        <button onClick={() => setConfirmando(true)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200">
          Reemitir acesso
        </button>
      )}

      {erro && <p className="mt-2 text-sm text-red-400">{erro}</p>}
    </div>
  );
}

function SecaoRealocacao({ vendedorId, lojaAtualId, onRealocado }: { vendedorId: string; lojaAtualId: string; onRealocado: () => void }) {
  const { dados: lojas } = useApi(() => listarLojas(), []);
  const [novaLojaId, setNovaLojaId] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [sucesso, setSucesso] = useState(false);

  const opcoes = lojas?.lojas.filter((l) => l.id !== lojaAtualId) ?? [];
  if (opcoes.length === 0) return null;

  async function handleRealocar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setSucesso(false);
    setEnviando(true);
    try {
      await realocarVendedor(vendedorId, novaLojaId);
      setSucesso(true);
      setNovaLojaId('');
      onRealocado();
    } catch (err) {
      setErro(err instanceof ApiError ? err.message : 'Não foi possível realocar.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={handleRealocar} className="flex flex-col gap-2 rounded-lg border border-slate-800 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">Realocar pra outra loja</p>
      <p className="text-xs text-slate-500">Vale só a partir de agora — vendas/histórico já registrados continuam na loja anterior.</p>
      <select value={novaLojaId} onChange={(e) => setNovaLojaId(e.target.value)} required className="rounded-lg bg-surface px-3 py-2 text-sm text-white">
        <option value="">Nova loja...</option>
        {opcoes.map((l) => (
          <option key={l.id} value={l.id}>
            {l.nome}
          </option>
        ))}
      </select>
      <button type="submit" disabled={enviando || !novaLojaId} className="self-start rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        Realocar
      </button>
      {sucesso && <p className="text-xs text-emerald-400">Realocado com sucesso ✓</p>}
      {erro && <p className="text-xs text-red-400">{erro}</p>}
    </form>
  );
}

const LABEL_ACAO: Record<AcaoCritica, string> = {
  bloquear: 'Bloquear',
  desbloquear: 'Desbloquear',
  desligar: 'Desligar',
  reativar: 'Reativar',
};
