import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../../utils/useApi';
import { buscarConfigRecompensa, buscarPainelEngajamento, LinhaEngajamento, PainelEngajamento, PeriodoEngajamento } from '../../api/engajamento';
import { listarLojasAdmin } from '../../api/admin';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { AdminNav } from './AdminNav';

// Engajamento (Admin) — ADOÇÃO do app, medida por acesso diário. Não é
// desempenho comercial: quem abre o app todo dia não é, por isso, melhor
// vendedor. Engajamento (ações relevantes) aparece em colunas próprias.

const PERIODOS: { id: PeriodoEngajamento; rotulo: string }[] = [
  { id: 'HOJE', rotulo: 'Hoje' },
  { id: 'SEMANA_ATUAL', rotulo: 'Semana atual' },
  { id: 'ULTIMOS_7', rotulo: 'Últimos 7 dias' },
  { id: 'SEMANA_PASSADA', rotulo: 'Semana passada' },
  { id: 'ULTIMOS_30', rotulo: 'Últimos 30 dias' },
  { id: 'PERSONALIZADO', rotulo: 'Personalizado' },
];

type Ordem = 'FREQ_DESC' | 'FREQ_ASC' | 'STREAK' | 'NOME' | 'ULTIMO';

function formatarUltimo(iso: string | null, hoje: string, tz: string): string {
  if (!iso) return 'Nunca acessou';
  const d = new Date(iso);
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(d);
  const ontem = new Date(`${hoje}T12:00:00Z`);
  ontem.setUTCDate(ontem.getUTCDate() - 1);
  if (dia === hoje) return `Hoje ${hora}`;
  if (dia === ontem.toISOString().slice(0, 10)) return `Ontem ${hora}`;
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)} ${hora}`;
}

const dataBr = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const plural = (n: number, um: string, varios = `${um}s`) => `${n} ${n === 1 ? um : varios}`;

export function AdminEngajamento() {
  const [periodo, setPeriodo] = useState<PeriodoEngajamento>('SEMANA_ATUAL');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [lojaId, setLojaId] = useState('');
  const [busca, setBusca] = useState('');
  const [soSemAcessoHoje, setSoSemAcessoHoje] = useState(false);
  const [ordem, setOrdem] = useState<Ordem>('FREQ_DESC');
  const personalizadoPronto = periodo !== 'PERSONALIZADO' || (de && ate);

  const lojas = useApi(() => listarLojasAdmin(), []);
  const config = useApi(() => buscarConfigRecompensa(), []);
  const painel = useApi(
    () => (personalizadoPronto ? buscarPainelEngajamento({ periodo, de: de || undefined, ate: ate || undefined, lojaId: lojaId || undefined }) : Promise.resolve(null)),
    [periodo, de, ate, lojaId]
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6">
      <AdminNav />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-white">Engajamento</h1>
          <p className="text-sm text-slate-400">Quem está usando o app. Acesso mede adoção — não mede resultado de vendas.</p>
        </div>
        {config.dados && (
          <Link to="/admin/gamificacao?aba=recompensa" className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:text-white">
            Recompensa diária: {config.dados.ativo ? `ligada (+${config.dados.xp} XP · +${config.dados.moedas} VendaCoins)` : 'desligada'} →
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-800 p-3">
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          Período
          <select className="rounded-lg bg-surface px-3 py-2 text-white" value={periodo} onChange={(e) => setPeriodo(e.target.value as PeriodoEngajamento)}>
            {PERIODOS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.rotulo}
              </option>
            ))}
          </select>
        </label>
        {periodo === 'PERSONALIZADO' && (
          <>
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              De
              <input type="date" className="rounded-lg bg-surface px-3 py-2 text-white" value={de} onChange={(e) => setDe(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              Até
              <input type="date" className="rounded-lg bg-surface px-3 py-2 text-white" value={ate} onChange={(e) => setAte(e.target.value)} />
            </label>
          </>
        )}
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          Loja
          <select className="rounded-lg bg-surface px-3 py-2 text-white" value={lojaId} onChange={(e) => setLojaId(e.target.value)}>
            <option value="">Todas as lojas</option>
            {lojas.dados?.lojas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          Vendedor
          <input className="rounded-lg bg-surface px-3 py-2 text-white" placeholder="Buscar pelo nome" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-300">
          Ordenar
          <select className="rounded-lg bg-surface px-3 py-2 text-white" value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)}>
            <option value="FREQ_DESC">Maior frequência</option>
            <option value="FREQ_ASC">Menor frequência</option>
            <option value="STREAK">Maior sequência</option>
            <option value="ULTIMO">Último acesso</option>
            <option value="NOME">Nome</option>
          </select>
        </label>
        <label className="flex min-h-[40px] items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" className="h-4 w-4 accent-amber-500" checked={soSemAcessoHoje} onChange={(e) => setSoSemAcessoHoje(e.target.checked)} />
          Só quem não acessou hoje
        </label>
      </div>

      {!personalizadoPronto && <p className="text-sm text-slate-400">Escolha as datas do período personalizado (até 92 dias).</p>}
      {painel.carregando && !painel.dados && personalizadoPronto && <LoadingState texto="Carregando engajamento..." />}
      {painel.erro && <ErrorState mensagem={painel.erro} onRetry={painel.recarregar} />}
      {painel.dados && <Conteudo p={painel.dados} busca={busca} soSemAcessoHoje={soSemAcessoHoje} ordem={ordem} />}
    </div>
  );
}

function Kpi({ titulo, valor, detalhe, tom = 'text-white' }: { titulo: string; valor: string; detalhe?: string; tom?: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-surface p-4">
      <p className="text-xs uppercase tracking-wide text-slate-400">{titulo}</p>
      <p className={`mt-1 text-3xl font-bold ${tom}`}>{valor}</p>
      {detalhe && <p className="text-sm text-slate-400">{detalhe}</p>}
    </div>
  );
}

function Conteudo({ p, busca, soSemAcessoHoje, ordem }: { p: PainelEngajamento; busca: string; soSemAcessoHoje: boolean; ordem: Ordem }) {
  const k = p.kpis;
  const rotuloPeriodo = p.periodo.inicio === p.periodo.fim ? dataBr(p.periodo.inicio) : `${dataBr(p.periodo.inicio)} a ${dataBr(p.periodo.fim)}`;
  const linhas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const filtradas = p.vendedores.filter((l) => (!termo || l.nome.toLowerCase().includes(termo)) && (!soSemAcessoHoje || !l.acessouHoje));
    const freq = (l: LinhaEngajamento) => l.periodo.percentual ?? -1;
    const ordenadores: Record<Ordem, (a: LinhaEngajamento, b: LinhaEngajamento) => number> = {
      FREQ_DESC: (a, b) => freq(b) - freq(a) || a.nome.localeCompare(b.nome),
      FREQ_ASC: (a, b) => freq(a) - freq(b) || a.nome.localeCompare(b.nome),
      STREAK: (a, b) => b.streakAtual - a.streakAtual || a.nome.localeCompare(b.nome),
      NOME: (a, b) => a.nome.localeCompare(b.nome),
      ULTIMO: (a, b) => (b.ultimoAcessoEm ?? '').localeCompare(a.ultimoAcessoEm ?? ''),
    };
    return [...filtradas].sort(ordenadores[ordem]);
  }, [p, busca, soSemAcessoHoje, ordem]);
  const maxSerie = Math.max(1, ...p.serie.map((s) => s.elegiveis));

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi titulo="Acessaram hoje" valor={`${k.hoje.acessaram}/${k.hoje.elegiveis}`} detalhe={`${k.hoje.percentual ?? 0}% de adesão hoje`} />
        <Kpi titulo="Não acessaram hoje" valor={String(k.hoje.naoAcessaram)} tom={k.hoje.naoAcessaram ? 'text-amber-200' : 'text-emerald-300'} />
        <Kpi titulo={`Adesão no período`} valor={`${k.periodo.percentual ?? 0}%`} detalhe={`${k.periodo.acessaram} de ${k.periodo.elegiveis} acessaram · ${rotuloPeriodo}`} />
        <Kpi titulo="Média de frequência" valor={`${k.periodo.mediaDiasComAcesso.toLocaleString('pt-BR')}/${k.periodo.mediaDiasValidos.toLocaleString('pt-BR')}`} detalhe="dias com acesso / dias válidos" />
        <Kpi titulo="Maior sequência" valor={k.maiorStreak ? `🔥 ${k.maiorStreak.dias}` : '—'} detalhe={`${k.maiorStreak ? `${k.maiorStreak.vendedor} · ` : ''}${plural(k.hoje.recompensasConcedidas, 'check-in premiado', 'check-ins premiados')} hoje`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-800 p-4" aria-label="Acessos por dia">
          <h2 className="text-sm font-semibold text-white">Acessos por dia</h2>
          <div className="mt-3 flex h-28 items-end gap-1" aria-hidden="true">
            {p.serie.map((s) => (
              <div key={s.dia} className="flex h-full flex-1 flex-col items-center justify-end" title={`${dataBr(s.dia)}: ${s.acessaram} de ${s.elegiveis}`}>
                <div className="w-full rounded-t bg-amber-400/80" style={{ height: `${(s.acessaram / maxSerie) * 100}%`, minHeight: s.acessaram ? 2 : 0 }} />
              </div>
            ))}
          </div>
          <table className="sr-only">
            <caption>Acessos por dia</caption>
            <tbody>
              {p.serie.map((s) => (
                <tr key={s.dia}>
                  <th>{dataBr(s.dia)}</th>
                  <td>
                    {s.acessaram} de {s.elegiveis}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 flex justify-between text-xs text-slate-500">
            <span>{p.serie[0] ? dataBr(p.serie[0].dia) : ''}</span>
            <span>{p.serie.length ? dataBr(p.serie[p.serie.length - 1].dia) : ''}</span>
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Distribuição no período:{' '}
            {k.periodo.distribuicao
              .filter((d) => d.vendedores > 0)
              .map((d) => `${d.vendedores} com ${d.dias} ${d.dias === 1 ? 'dia' : 'dias'}`)
              .join(' · ') || '—'}
          </p>
        </section>
        <section className="rounded-xl border border-slate-800 p-4" aria-label="Comparação entre lojas">
          <h2 className="text-sm font-semibold text-white">Comparação entre lojas</h2>
          <table className="mt-2 w-full text-left text-sm">
            <thead className="text-xs text-slate-400">
              <tr>
                <th className="py-1 font-medium">Loja</th>
                <th className="py-1 font-medium">Hoje</th>
                <th className="py-1 text-right font-medium">Adesão no período</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {p.porLoja.map((l) => (
                <tr key={l.lojaId} className="text-slate-200">
                  <td className="py-2">{l.loja}</td>
                  <td className="py-2">
                    {l.acessaramHoje}/{l.elegiveis}
                  </td>
                  <td className="py-2 text-right">{l.percentualPeriodo === null ? '—' : `${l.percentualPeriodo}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="overflow-x-auto rounded-xl border border-slate-800" aria-label="Vendedores">
        <table className="w-full min-w-[900px] text-left text-sm">
          <caption className="sr-only">Acesso e engajamento por vendedor</caption>
          <thead className="bg-surface text-xs text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Vendedor</th>
              <th className="px-3 py-2 font-medium">Loja</th>
              <th className="px-3 py-2 font-medium">Hoje</th>
              <th className="px-3 py-2 font-medium">Semana</th>
              <th className="px-3 py-2 font-medium">Período</th>
              <th className="px-3 py-2 font-medium">Frequência</th>
              <th className="px-3 py-2 font-medium">Sequência</th>
              <th className="px-3 py-2 font-medium">Último acesso</th>
              <th className="px-3 py-2 font-medium" title="Missões e desafios concluídos · aulas · quizzes aprovados · simulações (no período)">
                Engajamento no período
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {linhas.map((l) => (
              <tr key={l.vendedorId} className="text-slate-200">
                <th scope="row" className="px-3 py-2 font-medium text-white">
                  {l.nome}
                </th>
                <td className="px-3 py-2">{l.loja}</td>
                <td className="px-3 py-2">{l.acessouHoje ? <span className="text-emerald-300">✓ Sim</span> : <span className="text-amber-200">✕ Não</span>}</td>
                <td className="px-3 py-2">
                  {l.semana.diasComAcesso} de {l.semana.diasValidos} {l.semana.diasValidos === 1 ? 'dia' : 'dias'}
                </td>
                <td className="px-3 py-2">
                  {l.periodo.diasComAcesso} de {l.periodo.diasValidos}
                </td>
                <td className="px-3 py-2">{l.periodo.percentual === null ? '—' : `${l.periodo.percentual}%`}</td>
                <td className="px-3 py-2">{l.streakAtual > 0 ? `🔥 ${l.streakAtual}` : '—'}</td>
                <td className="px-3 py-2">{formatarUltimo(l.ultimoAcessoEm, p.hoje, p.timezone)}</td>
                <td className="px-3 py-2 text-slate-300">
                  {plural(l.engajamento.MISSAO_CONCLUIDA + l.engajamento.DESAFIO_CONCLUIDO, 'missão', 'missões')} · {plural(l.engajamento.AULA_CONCLUIDA, 'aula')} · {plural(l.engajamento.QUIZ_APROVADO, 'quiz', 'quizzes')} · {plural(l.engajamento.SIMULACAO_CONCLUIDA, 'simulação', 'simulações')}
                </td>
              </tr>
            ))}
            {linhas.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-slate-400">
                  Nenhum vendedor com esses filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      <p className="text-xs text-slate-500">
        Dias válidos = dias corridos já decorridos no período, a partir da admissão (ainda não há escala de trabalho no sistema). Elegíveis: vendedores ativos. Uso do Conselheiro não é exibido aqui, por privacidade.
      </p>
    </>
  );
}
