import { FormEvent, useEffect, useState, useCallback } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { rotaInicialPara } from '../auth/rotaInicial';
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
  const aviso = (useLocation().state as { aviso?: string } | null)?.aviso ?? null;

  const carregarLojas = useCallback(() => {
    setErro(null);
    listarLojas()
      .then((res) => {
        setLojas(res.lojas);
        if (res.lojas.length > 0) setLojaId(res.lojas[0].id);
      })
      .catch(() => setErro('Não foi possível carregar as lojas. Verifique sua conexão.'));
  }, []);

  useEffect(() => {
    carregarLojas();
    window.addEventListener('online', carregarLojas);
    return () => window.removeEventListener('online', carregarLojas);
  }, [carregarLojas]);

  // Landing por papel (Fatia 9.7) — ADMIN nunca cai na Home de vendedor.
  if (sessao) return <Navigate to={rotaInicialPara(sessao.vendedor.papel)} replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      if (!lojas?.some((l) => l.id === lojaId)) throw new Error('loja inválida');
      await login(lojaId, matricula.trim(), senha);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setErro('Muitas tentativas de login. Aguarde alguns minutos e tente de novo.');
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

      {aviso && (
        <p role="status" className="mb-4 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {aviso}
        </p>
      )}

      {lojas === null && !erro && <LoadingState texto="Carregando lojas..." />}
      {lojas === null && erro && (
        <div role="alert" className="flex flex-col items-center gap-3 rounded-lg bg-red-500/10 px-3 py-4 text-center text-sm text-red-200">
          {erro}
          <button type="button" onClick={carregarLojas} className="min-h-[44px] rounded-full border border-red-300/40 px-5 font-medium text-red-100">
            Tentar de novo
          </button>
        </div>
      )}

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

      <Link to="/ativacao" className="mt-8 inline-flex min-h-[44px] items-center justify-center text-sm text-accentSoft">
        Primeiro acesso? Ative sua conta
      </Link>
    </div>
  );
}
