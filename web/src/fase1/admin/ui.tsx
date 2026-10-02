/**
 * Peças do Admin da Fase 1. Mesma linguagem visual do app da vendedora,
 * com densidade de "central de comando": tabelas que viram cartões no
 * celular, status sempre com texto (nunca só cor), validação explícita.
 */
import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { StatusCiclo } from '../demo/estado';
import { ROTULO_STATUS, type ItemValidacao } from '../dominio/admin';

export function TituloPagina({ titulo, descricao, acoes, voltar }: { titulo: string; descricao?: string; acoes?: ReactNode; voltar?: { para: string; texto: string } }) {
  return (
    <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {voltar && (
          <Link to={voltar.para} className="mb-1 inline-flex min-h-[32px] items-center text-sm text-slate-400 hover:text-white">
            ← {voltar.texto}
          </Link>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-white">{titulo}</h1>
        {descricao && <p className="mt-0.5 max-w-2xl text-sm text-slate-400">{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </header>
  );
}

export function Bloco({ titulo, children, acao, className = '' }: { titulo?: string; children: ReactNode; acao?: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-700/60 bg-surface p-4 ${className}`} aria-label={titulo}>
      {(titulo || acao) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {titulo && <h2 className="text-sm font-semibold text-white">{titulo}</h2>}
          {acao}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({ rotulo, valor, detalhe, tom = 'neutro', para }: { rotulo: string; valor: ReactNode; detalhe?: string; tom?: 'neutro' | 'ok' | 'aviso' | 'erro'; para?: string }) {
  const cor = { neutro: 'text-white', ok: 'text-emerald-300', aviso: 'text-amber-200', erro: 'text-rose-300' }[tom];
  const corpo = (
    <div className="h-full rounded-2xl border border-slate-700/60 bg-surface p-3">
      <p className="text-xs text-slate-400">{rotulo}</p>
      <p className={`mt-0.5 text-2xl font-bold ${cor}`}>{valor}</p>
      {detalhe && <p className="text-xs text-slate-400">{detalhe}</p>}
    </div>
  );
  return para ? (
    <Link to={para} className="block active:opacity-90">
      {corpo}
    </Link>
  ) : (
    corpo
  );
}

const TOM_STATUS: Record<StatusCiclo, string> = {
  RASCUNHO: 'bg-slate-600/60 text-slate-100',
  PROGRAMADA: 'bg-sky-500/20 text-sky-200',
  ATIVA: 'bg-emerald-500/20 text-emerald-200',
  ENCERRADA: 'bg-slate-700 text-slate-300',
  ARQUIVADA: 'bg-slate-800 text-slate-400',
  CANCELADA: 'bg-rose-500/15 text-rose-200',
};

const ICONE_STATUS: Record<StatusCiclo, string> = { RASCUNHO: '✎', PROGRAMADA: '⏱', ATIVA: '●', ENCERRADA: '■', ARQUIVADA: '▤', CANCELADA: '✕' };

export function StatusCicloPill({ status }: { status: StatusCiclo }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${TOM_STATUS[status]}`}>
      <span aria-hidden="true">{ICONE_STATUS[status]}</span>
      {ROTULO_STATUS[status]}
    </span>
  );
}

export function Selo({ children, tom = 'neutro' }: { children: ReactNode; tom?: 'neutro' | 'ok' | 'aviso' | 'erro' | 'info' }) {
  const cor = { neutro: 'bg-slate-700/70 text-slate-200', ok: 'bg-emerald-500/15 text-emerald-200', aviso: 'bg-amber-500/15 text-amber-200', erro: 'bg-rose-500/15 text-rose-200', info: 'bg-sky-500/15 text-sky-200' }[tom];
  return <span className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${cor}`}>{children}</span>;
}

export function Botao({ children, onClick, tipo = 'secundario', type = 'button', disabled, titulo }: { children: ReactNode; onClick?: () => void; tipo?: 'primario' | 'secundario' | 'perigo' | 'fantasma'; type?: 'button' | 'submit'; disabled?: boolean; titulo?: string }) {
  const estilo = {
    primario: 'bg-accent text-white',
    secundario: 'border border-slate-600 bg-slate-800 text-slate-100',
    perigo: 'border border-rose-500/50 bg-rose-500/10 text-rose-200',
    fantasma: 'text-slate-300 hover:text-white',
  }[tipo];
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={titulo} className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold active:opacity-80 disabled:cursor-not-allowed disabled:opacity-40 ${estilo}`}>
      {children}
    </button>
  );
}

export function LinkBotao({ para, children, tipo = 'secundario' }: { para: string; children: ReactNode; tipo?: 'primario' | 'secundario' }) {
  const estilo = tipo === 'primario' ? 'bg-accent text-white' : 'border border-slate-600 bg-slate-800 text-slate-100';
  return (
    <Link to={para} className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold active:opacity-80 ${estilo}`}>
      {children}
    </Link>
  );
}

export const INPUT = 'min-h-[44px] w-full rounded-lg border border-slate-600 bg-base px-3 text-white disabled:opacity-50';

export function Campo({ rotulo, children, ajuda }: { rotulo: string; children: ReactNode; ajuda?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-slate-200">{rotulo}</span>
      {children}
      {ajuda && <span className="text-xs text-slate-400">{ajuda}</span>}
    </label>
  );
}

/** Lista de checagens antes de publicar. Mostra exatamente o que falta. */
export function ChecklistValidacao({ itens }: { itens: ItemValidacao[] }) {
  const pendentes = itens.filter((i) => !i.ok);
  return (
    <div className={`rounded-2xl border p-4 ${pendentes.length ? 'border-rose-500/40 bg-rose-500/5' : 'border-emerald-500/40 bg-emerald-500/5'}`} role="status">
      <p className={`font-semibold ${pendentes.length ? 'text-rose-200' : 'text-emerald-200'}`}>{pendentes.length ? '⛔ Não é possível publicar ainda' : '✓ Pronto para publicar'}</p>
      <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
        {itens.map((i) => (
          <li key={i.rotulo} className={i.ok ? 'text-slate-300' : 'text-rose-200'}>
            <span aria-hidden="true">{i.ok ? '✓' : '✕'}</span> {i.rotulo}
            {!i.ok && i.problema && <span className="block pl-4 text-xs text-rose-200/80">{i.problema}</span>}
            <span className="sr-only">{i.ok ? ' — ok' : ' — pendente'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Moldura de celular para a pré-visualização "como a vendedora vê". */
export function MolduraCelular({ children, titulo = 'Como a vendedora vê' }: { children: ReactNode; titulo?: string }) {
  return (
    <div className="mx-auto w-full max-w-[360px]">
      <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wider text-violet-300">👁 {titulo}</p>
      <div className="fase1 rounded-[2rem] border-4 border-slate-700 bg-base p-3 shadow-2xl">
        <div className="flex flex-col gap-3">{children}</div>
      </div>
    </div>
  );
}

export function AvisoSimulacao({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-sky-500/50 bg-sky-500/5 px-3 py-2 text-xs text-sky-100">
      <span aria-hidden="true">🧪 </span>
      {children}
    </p>
  );
}

/**
 * Tabela no desktop, cartões no celular — nunca tabela impossível de ler em 360px.
 * `colunas[0]` é o título do cartão no celular.
 */
export function TabelaResponsiva<T>({ linhas, colunas, chave, vazio, legenda }: { linhas: T[]; colunas: { titulo: string; celula: (l: T) => ReactNode; alinhar?: 'direita' }[]; chave: (l: T) => string; vazio?: string; legenda: string }) {
  if (linhas.length === 0) return <p className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">{vazio ?? 'Nada por aqui.'}</p>;
  return (
    <>
      <div className="hidden overflow-hidden rounded-2xl border border-slate-700/60 md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{legenda}</caption>
          <thead className="bg-surface text-xs text-slate-400">
            <tr>
              {colunas.map((c) => (
                <th key={c.titulo} scope="col" className={`px-3 py-2 font-medium ${c.alinhar === 'direita' ? 'text-right' : ''}`}>
                  {c.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {linhas.map((l) => (
              <tr key={chave(l)} className="align-middle">
                {colunas.map((c, i) =>
                  i === 0 ? (
                    <th key={c.titulo} scope="row" className="px-3 py-2.5 font-medium text-white">
                      {c.celula(l)}
                    </th>
                  ) : (
                    <td key={c.titulo} className={`px-3 py-2.5 text-slate-300 ${c.alinhar === 'direita' ? 'text-right' : ''}`}>
                      {c.celula(l)}
                    </td>
                  )
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-2 md:hidden" aria-label={legenda}>
        {linhas.map((l) => (
          <li key={chave(l)} className="rounded-2xl border border-slate-700/60 bg-surface p-3">
            <div className="font-semibold text-white">{colunas[0].celula(l)}</div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
              {colunas.slice(1).map((c) => (
                <div key={c.titulo} className="min-w-0 break-words">
                  <dt className="text-xs text-slate-400">{c.titulo}</dt>
                  <dd className="text-slate-200">{c.celula(l)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}

export function Feedback({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return (
    <p role="status" className="rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
      ✓ {texto}
    </p>
  );
}
