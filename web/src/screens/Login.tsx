import { FormEvent, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { listarLojas } from '../api/auth';
import { ApiError } from '../api/client';
import { Loja } from '../types';
import { LoadingState } from '../components/LoadingState';

export function Login() {
  const { sessao, erroSessao, login } = useAuth();
  const [lojas, setLojas] = useState<Loja[] | null>(null);
  const [lojaId, setLojaId] = useState('');
  const [matricula, setMatricula] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(erroSessao);
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
    setEnviando(true);
    const lojaEscolhida = lojas?.find((l) => l.id === lojaId);
    try {
      if (!lojaEscolhida?.codigoErp) throw new Error('loja inválida');
      await login(lojaEscolhida.codigoErp, matricula.trim(), senha);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setErro('Muitas tentativas de login. Aguarde um instante e tente de novo.');
      } else {
        setErro(err instanceof ApiError ? 'Matrícula, senha ou loja incorretos.' : 'Não foi possível entrar. Tente de novo.');
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-6 py-12">
      <h1 className="mb-1 text-3xl font-bold text-white">Vendedor IA</h1>
      <p className="mb-8 text-slate-400">Sua meta, seu ranking, sua evolução — todo dia.</p>

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
            <span className="text-sm text-slate-300">Matrícula</span>
            <input
              type="text"
              value={matricula}
              onChange={(e) => setMatricula(e.target.value)}
              className="rounded-lg bg-surface px-4 py-3 text-white"
              autoComplete="username"
              required
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-slate-300">Senha</span>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="rounded-lg bg-surface px-4 py-3 text-white"
              autoComplete="current-password"
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
            {enviando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      )}
    </div>
  );
}
