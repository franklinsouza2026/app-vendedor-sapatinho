import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listarLojas } from '../../api/auth';
import { preAutorizarVendedor } from '../../api/admin';
import { ApiError } from '../../api/client';
import { Loja } from '../../types';

// Pré-autorização de vendedor (Fatia 7.5A, seção 39) — Admin cria a
// identidade profissional; o vendedor ativa a própria credencial depois com
// o código gerado aqui. Sem infraestrutura de e-mail/SMS ainda, o código
// precisa ser repassado manualmente pelo Admin (mostrado UMA vez só).
export function AdminNovoVendedor() {
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [lojaId, setLojaId] = useState('');
  const [matriculaErp, setMatriculaErp] = useState('');
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ nome: string; tokenAtivacao: string } | null>(null);

  useEffect(() => {
    listarLojas().then((res) => {
      setLojas(res.lojas);
      if (res.lojas.length > 0) setLojaId(res.lojas[0].id);
    });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const res = await preAutorizarVendedor({ lojaId, matriculaErp, nome, cpf });
      setResultado({ nome: res.nome, tokenAtivacao: res.tokenAtivacao });
    } catch (err) {
      if (err instanceof ApiError && err.type === 'cpf_invalido') setErro('CPF inválido.');
      else if (err instanceof ApiError && err.type === 'cpf_duplicado') setErro('Já existe um vendedor com este CPF nesta empresa.');
      else if (err instanceof ApiError && err.type === 'matricula_duplicada') setErro('Já existe um vendedor com esta matrícula nesta loja.');
      else setErro('Não foi possível pré-autorizar este vendedor agora.');
    } finally {
      setEnviando(false);
    }
  }

  if (resultado) {
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-4 p-6">
        <h1 className="text-2xl font-semibold text-white">Vendedor pré-autorizado</h1>
        <p className="text-slate-300">
          <strong>{resultado.nome}</strong> foi criado como pendente de ativação.
        </p>
        <div className="rounded-lg border border-amber-700 bg-amber-950/30 p-4">
          <p className="mb-2 text-sm text-amber-300">
            Repasse este código de ativação ao vendedor por um canal seguro — ele não será mostrado de novo.
          </p>
          <code className="block break-all rounded bg-base p-3 text-sm text-white">{resultado.tokenAtivacao}</code>
        </div>
        <Link to="/admin/usuarios" className="text-sm text-accentSoft">
          Voltar pra Usuários
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-4 p-6">
      <Link to="/admin/usuarios" className="text-sm text-accentSoft">
        ← Voltar pra Usuários
      </Link>
      <h1 className="text-2xl font-semibold text-white">Pré-autorizar vendedor</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-300">Loja</span>
          <select value={lojaId} onChange={(e) => setLojaId(e.target.value)} className="rounded-lg bg-surface px-4 py-3 text-white" required>
            {lojas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-300">Nome completo</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} className="rounded-lg bg-surface px-4 py-3 text-white" required />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-300">Matrícula (loja)</span>
          <input
            value={matriculaErp}
            onChange={(e) => setMatriculaErp(e.target.value)}
            className="rounded-lg bg-surface px-4 py-3 text-white"
            required
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-slate-300">CPF</span>
          <input
            value={cpf}
            onChange={(e) => setCpf(e.target.value)}
            placeholder="000.000.000-00"
            className="rounded-lg bg-surface px-4 py-3 text-white"
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
          {enviando ? 'Criando...' : 'Pré-autorizar'}
        </button>
      </form>
    </div>
  );
}
