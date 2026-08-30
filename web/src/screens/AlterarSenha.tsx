import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { alterarSenha } from '../api/auth';
import { ApiError } from '../api/client';
import { Card } from '../components/Card';

export function AlterarSenha() {
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setSucesso(false);

    if (novaSenha !== confirmarSenha) {
      setErro('As senhas não coincidem.');
      return;
    }

    setEnviando(true);
    try {
      await alterarSenha(senhaAtual, novaSenha);
      setSucesso(true);
      setSenhaAtual('');
      setNovaSenha('');
      setConfirmarSenha('');
    } catch (err) {
      if (err instanceof ApiError && err.type === 'senha_atual_incorreta') {
        setErro('Senha atual incorreta.');
      } else if (err instanceof ApiError && err.status === 429) {
        setErro('Muitas tentativas. Aguarde um instante e tente de novo.');
      } else {
        setErro('Não foi possível trocar a senha agora. Tente de novo.');
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-24">
      <div className="flex items-center gap-2">
        <Link to="/perfil" className="text-slate-400" aria-label="Voltar pro Perfil">
          ←
        </Link>
        <h1 className="text-xl font-semibold text-white">Alterar senha</h1>
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-slate-300">Senha atual</span>
            <input
              type="password"
              value={senhaAtual}
              onChange={(e) => setSenhaAtual(e.target.value)}
              className="rounded-lg bg-base px-4 py-3 text-white"
              autoComplete="current-password"
              required
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-slate-300">Nova senha</span>
            <input
              type="password"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              className="rounded-lg bg-base px-4 py-3 text-white"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-slate-300">Confirme a nova senha</span>
            <input
              type="password"
              value={confirmarSenha}
              onChange={(e) => setConfirmarSenha(e.target.value)}
              className="rounded-lg bg-base px-4 py-3 text-white"
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
          {sucesso && <p className="text-sm text-emerald-400">Senha alterada com sucesso.</p>}

          <button
            type="submit"
            disabled={enviando}
            className="mt-2 rounded-lg bg-accent py-3 font-semibold text-white active:opacity-80 disabled:opacity-50"
          >
            {enviando ? 'Salvando...' : 'Salvar nova senha'}
          </button>
        </form>
      </Card>
    </div>
  );
}
