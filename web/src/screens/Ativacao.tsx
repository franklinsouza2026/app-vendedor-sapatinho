import { FormEvent, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ativarConta, listarLojas } from '../api/auth';
import { ApiError } from '../api/client';
import { Loja } from '../types';
import { LoadingState } from '../components/LoadingState';

// Ativação de conta pré-autorizada (Fatia 7.5A, seção 10/11) — só quem já foi
// cadastrado pelo Admin (nome/CPF/loja) consegue ativar; nunca autocadastro
// aberto. Mesma identidade visual do Login, fora do bottom nav.
export function Ativacao() {
  const { sessao, adotarToken } = useAuth();
  const navigate = useNavigate();
  const [lojas, setLojas] = useState<Loja[] | null>(null);
  const [lojaId, setLojaId] = useState('');
  const [cpf, setCpf] = useState('');
  const [token, setTokenAtivacao] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    listarLojas()
      .then((res) => {
        setLojas(res.lojas);
        if (res.lojas.length > 0) setLojaId(res.lojas[0].id);
      })
      .catch(() => setErro('Não foi possível carregar as lojas. Verifique sua conexão.'));
  }, []);

  if (sessao) return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);

    if (senha !== confirmarSenha) {
      setErro('As senhas não coincidem.');
      return;
    }

    const lojaEscolhida = lojas?.find((l) => l.id === lojaId);
    if (!lojaEscolhida?.codigoErp) {
      setErro('Loja inválida.');
      return;
    }

    setEnviando(true);
    try {
      const resultado = await ativarConta({ codigoErpLoja: lojaEscolhida.codigoErp, cpf, token, senha });
      await adotarToken(resultado.token);
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setErro('Muitas tentativas. Aguarde um instante e tente de novo.');
      } else {
        setErro('CPF, código de ativação ou senha inválidos. Confira os dados com quem te convidou.');
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-6 py-12">
      <h1 className="mb-1 text-3xl font-bold text-white">Ativar minha conta</h1>
      <p className="mb-8 text-slate-400">Use o CPF e o código de ativação que sua loja te passou.</p>

      {lojas === null && <LoadingState texto="Carregando lojas..." />}

      {lojas !== null && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-slate-300">Loja</span>
            <select
              value={lojaId}
              onChange={(e) => setLojaId(e.target.value)}
              className="rounded-lg bg-surface px-4 py-3 text-white"
              required
            >
              {lojas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-slate-300">CPF</span>
            <input
              type="text"
              inputMode="numeric"
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
              className="rounded-lg bg-surface px-4 py-3 text-white"
              placeholder="000.000.000-00"
              required
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-slate-300">Código de ativação</span>
            <input
              type="text"
              value={token}
              onChange={(e) => setTokenAtivacao(e.target.value)}
              className="rounded-lg bg-surface px-4 py-3 text-white"
              required
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-slate-300">Crie uma senha</span>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="rounded-lg bg-surface px-4 py-3 text-white"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-slate-300">Confirme a senha</span>
            <input
              type="password"
              value={confirmarSenha}
              onChange={(e) => setConfirmarSenha(e.target.value)}
              className="rounded-lg bg-surface px-4 py-3 text-white"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>

          {erro && (
            <p role="alert" className="text-sm text-red-400">
              {erro}
            </p>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="mt-2 rounded-lg bg-accent py-3 font-semibold text-white active:opacity-80 disabled:opacity-50"
          >
            {enviando ? 'Ativando...' : 'Ativar conta'}
          </button>

          <Link to="/login" className="text-center text-sm text-accentSoft">
            Já tenho conta — fazer login
          </Link>
        </form>
      )}
    </div>
  );
}
