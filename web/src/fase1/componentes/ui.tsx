/**
 * Peças visuais da Fase 1. Partem do design system atual (slate escuro +
 * âmbar, `Card`, `ProgressBar`) e sobem um degrau: hierarquia mais forte,
 * números tabulares, marcos de meta, estados neutros.
 *
 * Regra de acessibilidade que vale para todas: nenhuma informação depende só
 * de cor — sempre há texto, ícone ou sinal (↑ ↓) junto.
 */
import { KeyboardEvent, ReactNode, useId, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { MARCOS_META } from '../dominio/estimativas';
import { pct, textoVariacao } from '../formato';

export function Painel({ children, className = '', destaque = false, as: Tag = 'section', rotulo }: { children: ReactNode; className?: string; destaque?: boolean; as?: 'section' | 'div' | 'article'; rotulo?: string }) {
  return (
    <Tag
      aria-label={rotulo}
      className={`rounded-2xl p-4 ${destaque ? 'border border-accent/30 bg-gradient-to-br from-surface via-surface to-accent/10 shadow-lg shadow-black/20' : 'border border-slate-700/60 bg-surface'} ${className}`}
    >
      {children}
    </Tag>
  );
}

export function TituloSecao({ children, acao }: { children: ReactNode; acao?: { para: string; texto: string } }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{children}</h2>
      {acao && (
        <Link to={acao.para} className="-my-3 inline-flex min-h-[44px] items-center text-sm font-medium text-accentSoft">
          {acao.texto} <span aria-hidden="true">&nbsp;→</span>
        </Link>
      )}
    </div>
  );
}

/**
 * "← Voltar" explícito para telas secundárias e detalhes. Volta para a tela de
 * origem quando a pessoa veio de dentro do app; se abriu o link direto (sem
 * histórico), cai na tela-mãe (`fallback`). Nunca depende do botão do navegador.
 */
export function BotaoVoltar({ fallback }: { fallback: string }) {
  const navegar = useNavigate();
  const location = useLocation();
  // No react-router, a primeira entrada da sessão tem key "default".
  const temOrigem = location.key !== 'default';
  return (
    <button
      type="button"
      onClick={() => (temOrigem ? navegar(-1) : navegar(fallback))}
      className="-ml-2 inline-flex min-h-[44px] items-center gap-1 rounded-full px-2 text-sm font-semibold text-accentSoft active:bg-surface"
    >
      <span aria-hidden="true" className="text-lg leading-none">
        ←
      </span>
      Voltar
    </button>
  );
}

export function CabecalhoTela({ titulo, subtitulo, voltar }: { titulo: string; subtitulo?: string; voltar?: string }) {
  return (
    <header className="flex flex-col items-start">
      {voltar && <BotaoVoltar fallback={voltar} />}
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-white">{titulo}</h1>
        {subtitulo && <p className="text-sm text-slate-400">{subtitulo}</p>}
      </div>
    </header>
  );
}

/** Selo que marca um número como ESTIMATIVA — nunca apresentado como certeza. */
export function SeloEstimativa({ base }: { base: string }) {
  return (
    <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-400">
      <span aria-hidden="true" className="mt-px rounded bg-slate-700 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
        est.
      </span>
      <span>Estimativa baseada {base}. Não é garantia.</span>
    </p>
  );
}

/** Mudança de posição sempre em palavras ("↑ 1 posição", "Manteve a posição"). A seta é reforço, não a informação. */
export function Variacao({ valor }: { valor: number | null }) {
  const texto = textoVariacao(valor);
  if (texto === null) return null;
  const cor = valor === 0 ? 'text-slate-400' : valor! > 0 ? 'text-emerald-400' : 'text-rose-300';
  return <span className={`text-xs font-semibold ${cor}`}>{texto}</span>;
}

/** Tendência percentual contra o período comparável — "↑ 6% vs. set". */
export function Tendencia({ atual, anterior, rotuloComparacao }: { atual: number | null; anterior: number | null; rotuloComparacao: string }) {
  if (atual === null || anterior === null || anterior === 0) return null;
  const delta = ((atual - anterior) / anterior) * 100;
  const igual = Math.abs(delta) < 0.5;
  return (
    <p className={`text-xs ${igual ? 'text-slate-400' : delta > 0 ? 'text-emerald-400' : 'text-rose-300'}`}>
      <span aria-hidden="true">{igual ? '=' : delta > 0 ? '↑' : '↓'}</span> {igual ? 'estável' : `${Math.abs(Math.round(delta))}%`} <span className="text-slate-400">{rotuloComparacao}</span>
    </p>
  );
}

/**
 * Barra de meta com marcos. Abaixo de 100%: escala 0–100. Acima: a escala
 * estica até 150% e os marcos 100/110/120/150 aparecem — "a corrida continua".
 */
export function BarraMeta({ percentual, rotulo }: { percentual: number; rotulo: string }) {
  const escala = percentual >= 100 ? 150 : 100;
  const largura = Math.min(100, (percentual / escala) * 100);
  const batida = percentual >= 100;
  return (
    <div>
      <div
        role="progressbar"
        aria-label={rotulo}
        aria-valuenow={Math.round(percentual)}
        aria-valuemin={0}
        aria-valuemax={escala}
        aria-valuetext={`${pct(percentual)} atingido`}
        className="relative h-3 w-full overflow-hidden rounded-full bg-slate-700/80"
      >
        <div className={`h-full rounded-full transition-[width] duration-700 motion-reduce:transition-none ${batida ? 'bg-gradient-to-r from-emerald-500 to-emerald-300' : 'bg-gradient-to-r from-accent to-accentSoft'}`} style={{ width: `${largura}%` }} />
        {batida &&
          MARCOS_META.map((m) => (
            <span key={m} aria-hidden="true" className="absolute top-0 h-full w-0.5 bg-base/70" style={{ left: `${(m / escala) * 100}%` }} />
          ))}
      </div>
      {batida && (
        <ol className="mt-2 flex justify-between gap-1" aria-label="Marcos da meta">
          {MARCOS_META.map((m) => {
            const ok = percentual >= m;
            return (
              <li key={m} className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-700/60 text-slate-400'}`}>
                <span aria-hidden="true">{ok ? '✓' : '○'}</span>
                {m}%<span className="sr-only">{ok ? ' atingido' : ' ainda não'}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export function BarraSimples({ percentual, rotulo, cor = 'accent' }: { percentual: number; rotulo: string; cor?: 'accent' | 'emerald' | 'sky' }) {
  const v = Math.max(0, Math.min(100, percentual));
  const fundo = cor === 'emerald' ? 'bg-emerald-400' : cor === 'sky' ? 'bg-sky-400' : 'bg-accentSoft';
  return (
    <div role="progressbar" aria-label={rotulo} aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} className="h-2 w-full overflow-hidden rounded-full bg-slate-700/80">
      <div className={`h-full rounded-full ${fundo}`} style={{ width: `${v}%` }} />
    </div>
  );
}

/**
 * Abas acessíveis (WAI-ARIA tabs): setas ← → trocam a aba, Home/End vão às
 * pontas. Rolam na horizontal sem estourar a página em telas de 320px.
 */
export function Abas<T extends string>({ abas, ativa, onTrocar, rotulo, compacta = false }: { abas: { id: T; rotulo: string }[]; ativa: T; onTrocar: (id: T) => void; rotulo: string; compacta?: boolean }) {
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent, i: number) {
    let alvo = -1;
    if (e.key === 'ArrowRight') alvo = (i + 1) % abas.length;
    if (e.key === 'ArrowLeft') alvo = (i - 1 + abas.length) % abas.length;
    if (e.key === 'Home') alvo = 0;
    if (e.key === 'End') alvo = abas.length - 1;
    if (alvo === -1) return;
    e.preventDefault();
    onTrocar(abas[alvo].id);
    refs.current[alvo]?.focus();
  }

  return (
    <div role="tablist" aria-label={rotulo} className={`-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]`}>
      {abas.map((a, i) => {
        const sel = a.id === ativa;
        return (
          <button
            key={a.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            id={`${base}-${a.id}`}
            aria-selected={sel}
            tabIndex={sel ? 0 : -1}
            onClick={() => onTrocar(a.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`shrink-0 whitespace-nowrap rounded-full px-4 font-semibold transition-colors ${compacta ? '' : 'text-sm'} ${
              compacta
                ? `min-h-[40px] text-[13px] ${sel ? 'bg-slate-600 text-white' : 'text-slate-300 ring-1 ring-slate-700'}`
                : `min-h-[44px] ${sel ? 'bg-white text-slate-900' : 'bg-surface text-slate-300 ring-1 ring-slate-700'}`
            }`}
          >
            {a.rotulo}
          </button>
        );
      })}
    </div>
  );
}

export function Vazio({ icone, titulo, texto, acao }: { icone: string; titulo: string; texto: string; acao?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-700 px-6 py-10 text-center">
      <span aria-hidden="true" className="text-3xl">
        {icone}
      </span>
      <p className="font-semibold text-white">{titulo}</p>
      <p className="max-w-xs text-sm text-slate-400">{texto}</p>
      {acao}
    </div>
  );
}

export function Carregando({ texto }: { texto: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3">
      <span className="sr-only">{texto}</span>
      <div className="h-7 w-2/3 animate-pulse rounded-lg bg-surface motion-reduce:animate-none" />
      <div className="h-40 animate-pulse rounded-2xl bg-surface motion-reduce:animate-none" />
      <div className="h-24 animate-pulse rounded-2xl bg-surface motion-reduce:animate-none" />
      <div className="h-24 animate-pulse rounded-2xl bg-surface motion-reduce:animate-none" />
    </div>
  );
}

export function Erro({ onTentar }: { onTentar: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-slate-700 px-6 py-12 text-center">
      <span aria-hidden="true" className="text-3xl">
        📡
      </span>
      <p className="font-semibold text-white">Não conseguimos carregar agora</p>
      <p className="max-w-xs text-sm text-slate-400">Seus números estão seguros. Verifique a conexão e tente de novo em instantes.</p>
      <button onClick={onTentar} className="mt-1 min-h-[44px] rounded-full bg-accent px-6 font-semibold text-white active:opacity-80">
        Tentar de novo
      </button>
    </div>
  );
}

export function Avatar({ nome, destaque = false, tamanho = 'md' }: { nome: string; destaque?: boolean; tamanho?: 'sm' | 'md' | 'lg' }) {
  const iniciais = nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
  const tam = tamanho === 'lg' ? 'h-16 w-16 text-xl' : tamanho === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm';
  return (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full font-bold ${tam} ${destaque ? 'bg-accentSoft text-slate-900' : 'bg-slate-700 text-slate-200'}`}>
      {iniciais}
    </span>
  );
}

export function Medalha({ posicao }: { posicao: number }) {
  const medalha = posicao === 1 ? '🥇' : posicao === 2 ? '🥈' : posicao === 3 ? '🥉' : null;
  return (
    <span className="flex w-8 shrink-0 justify-center text-sm font-bold tabular-nums text-slate-300">
      {medalha ? (
        <>
          <span aria-hidden="true" className="text-lg">
            {medalha}
          </span>
          <span className="sr-only">{posicao}º</span>
        </>
      ) : (
        `${posicao}º`
      )}
    </span>
  );
}

export function Pilula({ children, tom = 'neutro' }: { children: ReactNode; tom?: 'neutro' | 'accent' | 'sucesso' | 'info' | 'aviso' }) {
  const cores = {
    neutro: 'bg-slate-700/70 text-slate-200',
    accent: 'bg-accent/20 text-accentSoft',
    sucesso: 'bg-emerald-500/15 text-emerald-300',
    info: 'bg-sky-500/15 text-sky-300',
    aviso: 'bg-amber-500/15 text-amber-200',
  }[tom];
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${cores}`}>{children}</span>;
}

/** Marca de protótipo — telas/regras que ainda dependem de decisão ou backend. */
export function AvisoProvisorio({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-2 rounded-xl border border-dashed border-sky-500/40 bg-sky-500/5 px-3 py-2 text-xs text-sky-200">
      <span aria-hidden="true">🧪</span>
      <span>{children}</span>
    </p>
  );
}
