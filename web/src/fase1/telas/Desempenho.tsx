/**
 * Desempenho — três perguntas, três abas:
 *   Meu ritmo   → "o que preciso fazer?" (meta virando plano)
 *   Indicadores → "como estou?" (valor + referência + tendência)
 *   Comparar    → "como estou perto dos outros?" (eu × loja, eu × empresa)
 */
import { ReactNode, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useFase1 } from '../demo/Fase1Contexto';
import type { Fase1Dados, Metrica } from '../dominio/tipos';
import { falta, paresEstimados, percentual, projecaoMes, vendasEstimadas, vendasPorDia, UNIDADE_METRICA } from '../dominio/estimativas';
import { rankingCalculado } from '../dominio/alvos';
import { baseEstimativa, CardMetaHoje, CorridaMes } from '../componentes/blocos';
import { Abas, AvisoProvisorio, CabecalhoTela, Painel, SeloEstimativa, Tendencia, Vazio } from '../componentes/ui';
import { decimal, distanciaMetrica, inteiro, mesCurto, pct, plural, reais, valorMetrica } from '../formato';
import { Fase1Pagina } from './Fase1Pagina';

type Aba = 'ritmo' | 'indicadores' | 'comparar';

export function Desempenho() {
  const [params, setParams] = useSearchParams();
  const aba = (['ritmo', 'indicadores', 'comparar'].includes(params.get('aba') ?? '') ? params.get('aba') : 'ritmo') as Aba;

  return (
    <Fase1Pagina carregando="Carregando seu desempenho...">
      <CabecalhoTela titulo="Desempenho" subtitulo="Seu plano, seus números e sua comparação." />
      <Abas<Aba>
        rotulo="Seções de desempenho"
        ativa={aba}
        onTrocar={(id) => setParams({ aba: id }, { replace: true })}
        abas={[
          { id: 'ritmo', rotulo: 'Meu ritmo' },
          { id: 'indicadores', rotulo: 'Indicadores' },
          { id: 'comparar', rotulo: 'Comparar' },
        ]}
      />
      <div role="tabpanel" aria-label={aba} className="flex flex-col gap-4">
        {aba === 'ritmo' && <MeuRitmo />}
        {aba === 'indicadores' && <Indicadores />}
        {aba === 'comparar' && <Comparar />}
      </div>
    </Fase1Pagina>
  );
}

// =================================================================== MEU RITMO

function MeuRitmo() {
  const { dados } = useFase1();
  const [periodo, setPeriodo] = useState<'hoje' | 'mes'>('hoje');
  return (
    <>
      <Abas<'hoje' | 'mes'> compacta rotulo="Período do ritmo" ativa={periodo} onTrocar={setPeriodo} abas={[{ id: 'hoje', rotulo: 'Hoje' }, { id: 'mes', rotulo: 'Mês' }]} />
      {periodo === 'hoje' ? (
        <>
          <CardMetaHoje dados={dados} compacto />
          <PlanoHoje dados={dados} />
        </>
      ) : (
        <>
          <CorridaMes dados={dados} detalhado />
          <PlanoMes dados={dados} />
        </>
      )}
    </>
  );
}

function Linha({ rotulo, valor, destaque = false }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="text-sm text-slate-400">{rotulo}</dt>
      <dd className={`text-right text-sm font-semibold ${destaque ? 'text-accentSoft' : 'text-white'}`}>{valor}</dd>
    </div>
  );
}

function PlanoHoje({ dados }: { dados: Fase1Dados }) {
  const { meta, realizado } = dados.hoje;
  if (dados.status.diaDeFolga || dados.status.lojaFechada || meta === null) return null;
  const f = falta(realizado.faturamento, meta)!;
  const t = dados.referencia.ticketMedio;
  const vendas = vendasEstimadas(f, t);
  const pares = paresEstimados(vendas, dados.referencia.pa);
  return (
    <Painel rotulo="Plano de hoje">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Plano de hoje</h2>
      <dl className="mt-1 divide-y divide-slate-700/60">
        <Linha rotulo="Meta" valor={reais(meta)} />
        <Linha rotulo="Realizado" valor={`${reais(realizado.faturamento)} · ${pct(percentual(realizado.faturamento, meta)!)}`} />
        <Linha rotulo="Vendas fechadas" valor={`${realizado.vendas} · ${realizado.pares} pares`} />
        <Linha rotulo="Falta" valor={f === 0 ? 'nada — meta batida' : reais(f)} destaque={f > 0} />
        {f > 0 && <Linha rotulo="Ticket médio usado" valor={t !== null ? reais(t) : 'sem base'} />}
        {f > 0 && <Linha rotulo="Vendas estimadas" valor={vendas !== null ? `≈ ${vendas}` : '—'} destaque />}
        {f > 0 && <Linha rotulo="Pares estimados" valor={pares !== null ? `≈ ${pares}` : '—'} />}
      </dl>
      {f > 0 && vendas !== null && <SeloEstimativa base={baseEstimativa(dados)} />}
    </Painel>
  );
}

function PlanoMes({ dados }: { dados: Fase1Dados }) {
  const { meta, realizado, diasTrabalhoRestantes, diasTrabalhados } = dados.mes;
  if (meta === null) return null;
  const f = falta(realizado.faturamento, meta)!;
  const t = dados.referencia.ticketMedio;
  const vendas = vendasEstimadas(f, t);
  const porDia = vendasPorDia(vendas, diasTrabalhoRestantes);
  const reaisPorDia = diasTrabalhoRestantes ? f / diasTrabalhoRestantes : null;
  const mediaDiaria = diasTrabalhados > 0 ? realizado.faturamento / diasTrabalhados : null;
  const projecao = projecaoMes(realizado.faturamento, diasTrabalhados, diasTrabalhoRestantes);

  return (
    <Painel rotulo="Plano do mês">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Plano do mês</h2>
      <dl className="mt-1 divide-y divide-slate-700/60">
        <Linha rotulo="Dias trabalhados" valor={plural(diasTrabalhados, 'dia')} />
        <Linha rotulo="Dias de trabalho restantes" valor={diasTrabalhoRestantes !== null ? plural(diasTrabalhoRestantes, 'dia') : 'escala não cadastrada'} />
        <Linha rotulo="Sua média por dia" valor={mediaDiaria !== null ? reais(mediaDiaria) : '—'} />
        {f > 0 && <Linha rotulo="Necessário por dia" valor={reaisPorDia !== null ? reais(reaisPorDia) : '—'} destaque />}
        {f > 0 && <Linha rotulo="Vendas por dia" valor={porDia !== null ? `≈ ${porDia}` : '—'} destaque />}
        {projecao !== null && <Linha rotulo="Projeção no ritmo atual" valor={`${reais(projecao)} · ${pct((projecao / meta) * 100)}`} />}
      </dl>
      {f > 0 && mediaDiaria !== null && reaisPorDia !== null && (
        <p className={`mt-2 rounded-xl px-3 py-2 text-sm ${mediaDiaria >= reaisPorDia ? 'bg-emerald-500/10 text-emerald-200' : 'bg-slate-800/80 text-slate-300'}`}>
          {mediaDiaria >= reaisPorDia
            ? `Seu ritmo atual (${reais(mediaDiaria)}/dia) já é suficiente para bater a meta.`
            : `Para bater a meta, o ritmo precisa subir de ${reais(mediaDiaria)} para ${reais(reaisPorDia)} por dia.`}
        </p>
      )}
      {diasTrabalhoRestantes !== null && <AvisoProvisorio>Dias de trabalho vêm de escala simulada. O backend ainda não tem cadastro de escala — decisão pendente.</AvisoProvisorio>}
    </Painel>
  );
}

// =================================================================== INDICADORES

function Indicadores() {
  const { dados } = useFase1();
  const [periodo, setPeriodo] = useState<'hoje' | 'mes' | 'historico'>('mes');
  return (
    <>
      <Abas<'hoje' | 'mes' | 'historico'>
        compacta
        rotulo="Período dos indicadores"
        ativa={periodo}
        onTrocar={setPeriodo}
        abas={[
          { id: 'hoje', rotulo: 'Hoje' },
          { id: 'mes', rotulo: 'Mês' },
          { id: 'historico', rotulo: 'Histórico' },
        ]}
      />
      {periodo === 'historico' ? <Historico dados={dados} /> : <GradeIndicadores dados={dados} periodo={periodo} />}
      <p className="text-xs text-slate-400">
        Conversão não aparece: ainda não registramos atendimentos sem venda, então qualquer taxa seria inventada.
      </p>
    </>
  );
}

function Indicador({ rotulo, valor, contexto, tendencia }: { rotulo: string; valor: string; contexto?: string; tendencia?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-700/60 bg-surface p-3">
      <p className="text-xs text-slate-400">{rotulo}</p>
      <p className="mt-0.5 text-xl font-bold text-white">{valor}</p>
      {tendencia}
      {contexto && <p className="mt-0.5 text-xs text-slate-400">{contexto}</p>}
    </div>
  );
}

function GradeIndicadores({ dados, periodo }: { dados: Fase1Dados; periodo: 'hoje' | 'mes' }) {
  const p = periodo === 'hoje' ? dados.hoje : dados.mes;
  const r = p.realizado;
  if (periodo === 'hoje' && r.vendas === 0) {
    return <Vazio icone="☀️" titulo="Ainda sem vendas hoje" texto="Assim que a primeira venda sincronizar, seus indicadores do dia aparecem aqui." />;
  }
  const pctMeta = percentual(r.faturamento, p.meta);
  // Comparação justa: hoje × sua média diária do mês; mês × mesmo período do mês anterior.
  const dias = Math.max(1, dados.mes.diasTrabalhados);
  const ref =
    periodo === 'hoje'
      ? { faturamento: dados.mes.realizado.faturamento / dias, vendas: dados.mes.realizado.vendas / dias, pares: dados.mes.realizado.pares / dias, ticketMedio: dados.mes.realizado.ticketMedio, pa: dados.mes.realizado.pa }
      : dados.comparavel;
  const rotuloRef = periodo === 'hoje' ? 'vs. sua média diária do mês' : 'vs. mesmo período de setembro';
  const score = rankingCalculado(dados, 'loja', 'SCORE').find((l) => l.linha.pessoaId === dados.vendedor.id);
  const evolucao = pctMeta !== null && periodo === 'mes' ? pctMeta - dados.comparavel.percentualMeta : null;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      <Indicador rotulo="Vendas (R$)" valor={reais(r.faturamento)} tendencia={<Tendencia atual={r.faturamento} anterior={ref.faturamento} rotuloComparacao={rotuloRef} />} />
      <Indicador rotulo="Nº de vendas" valor={inteiro(r.vendas)} tendencia={<Tendencia atual={r.vendas} anterior={ref.vendas} rotuloComparacao={rotuloRef} />} />
      <Indicador rotulo="Pares" valor={inteiro(r.pares)} tendencia={<Tendencia atual={r.pares} anterior={ref.pares} rotuloComparacao={rotuloRef} />} />
      <Indicador rotulo="Ticket médio" valor={r.ticketMedio !== null ? reais(r.ticketMedio) : '—'} tendencia={<Tendencia atual={r.ticketMedio} anterior={ref.ticketMedio} rotuloComparacao={rotuloRef} />} />
      <Indicador rotulo="PA" valor={r.pa !== null ? decimal(r.pa, 2) : '—'} contexto="pares por venda" tendencia={<Tendencia atual={r.pa} anterior={ref.pa} rotuloComparacao={rotuloRef} />} />
      <Indicador rotulo="% da meta" valor={pctMeta !== null ? pct(pctMeta) : 'sem meta'} contexto={p.meta !== null ? `de ${reais(p.meta)}` : undefined} />
      {periodo === 'mes' && (
        <Indicador
          rotulo="Evolução"
          valor={evolucao !== null ? `${evolucao >= 0 ? '+' : ''}${decimal(evolucao)} p.p.` : '—'}
          contexto="% da meta vs. mesmo período de setembro"
        />
      )}
      {periodo === 'mes' && score && <Indicador rotulo="Score Geral" valor={inteiro(score.linha.valor)} contexto={`#${score.posicao} na loja`} />}
    </div>
  );
}

function Historico({ dados }: { dados: Fase1Dados }) {
  if (dados.historico.length === 0) {
    return <Vazio icone="🗓️" titulo="Seu histórico começa agora" texto="Ao fechar o primeiro mês, ele aparece aqui para você comparar a sua evolução." />;
  }
  const meses = [...dados.historico, { mes: dados.agora.slice(0, 7), faturamento: dados.mes.realizado.faturamento, meta: dados.mes.meta ?? 0, ticketMedio: dados.mes.realizado.ticketMedio ?? 0, pa: dados.mes.realizado.pa ?? 0, vendas: dados.mes.realizado.vendas, parcial: true }];
  const max = Math.max(...meses.map((m) => Math.max(m.faturamento, m.meta)));
  const melhor = Math.max(...dados.historico.map((m) => m.faturamento));

  return (
    <>
      <Painel rotulo="Vendas por mês">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Vendas por mês</h2>
        <p className="text-xs text-slate-400">A marca horizontal é a meta do mês. Mês atual é parcial.</p>
        <div className="mt-4 flex h-40 items-end gap-2" aria-hidden="true">
          {meses.map((m) => {
            const parcial = 'parcial' in m;
            const altura = (m.faturamento / max) * 100;
            const alturaMeta = m.meta ? (m.meta / max) * 100 : null;
            return (
              <div key={m.mes} className="relative flex h-full flex-1 flex-col justify-end" title={`${mesCurto(m.mes)}: ${reais(m.faturamento)}${m.meta ? ` de ${reais(m.meta)}` : ''}`}>
                <div className={`rounded-t ${parcial ? 'bg-accentSoft/50' : m.faturamento === melhor ? 'bg-accentSoft' : 'bg-slate-500'}`} style={{ height: `${altura}%` }} />
                {alturaMeta !== null && <div className="absolute inset-x-0 h-0.5 bg-white/80" style={{ bottom: `${alturaMeta}%` }} />}
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex gap-2" aria-hidden="true">
          {meses.map((m) => (
            <span key={m.mes} className="flex-1 text-center text-[11px] text-slate-400">
              {mesCurto(m.mes)}
            </span>
          ))}
        </div>
        <table className="mt-4 w-full text-left text-sm">
          <caption className="sr-only">Histórico mensal: vendas, meta, ticket médio e PA</caption>
          <thead>
            <tr className="text-xs text-slate-400">
              <th scope="col" className="pb-1 font-medium">Mês</th>
              <th scope="col" className="pb-1 text-right font-medium">Vendas</th>
              <th scope="col" className="pb-1 text-right font-medium">% meta</th>
              <th scope="col" className="pb-1 text-right font-medium">Ticket</th>
              <th scope="col" className="pb-1 text-right font-medium">PA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/60">
            {[...meses].reverse().map((m) => (
              <tr key={m.mes} className="text-slate-200">
                <th scope="row" className="py-1.5 font-medium">
                  {mesCurto(m.mes)}
                  {'parcial' in m && <span className="text-xs text-slate-400"> (parcial)</span>}
                  {m.faturamento === melhor && !('parcial' in m) && <span className="text-xs text-accentSoft"> ★ melhor</span>}
                </th>
                <td className="py-1.5 text-right">{reais(m.faturamento)}</td>
                <td className="py-1.5 text-right">{m.meta ? pct((m.faturamento / m.meta) * 100) : '—'}</td>
                <td className="py-1.5 text-right">{m.ticketMedio ? reais(m.ticketMedio) : '—'}</td>
                <td className="py-1.5 text-right">{m.pa ? decimal(m.pa, 2) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Painel>
    </>
  );
}

// =================================================================== COMPARAR

const METRICAS_LOJA: Metrica[] = ['VENDAS', 'PERCENTUAL_META', 'PA', 'TICKET', 'EVOLUCAO', 'CONSISTENCIA'];
// Entre lojas, R$ absoluto é injusto (lojas de tamanhos diferentes): só métricas relativas.
const METRICAS_EMPRESA: Metrica[] = ['PERCENTUAL_META', 'PA', 'TICKET', 'EVOLUCAO', 'CONSISTENCIA'];

function Comparar() {
  const { dados } = useFase1();
  const [escopo, setEscopo] = useState<'loja' | 'geral'>('loja');

  if (dados.vendedor.novo) {
    return <Vazio icone="🌱" titulo="Comparações depois da adaptação" texto="Nos primeiros dias, comparar com quem já tem meses de casa não é justo. Por enquanto, acompanhe sua própria evolução." />;
  }
  if (!dados.status.rankingDisponivel) {
    return <Vazio icone="⏳" titulo="Comparações indisponíveis agora" texto="Voltam assim que os dados do ERP sincronizarem." />;
  }

  const metricas = escopo === 'loja' ? METRICAS_LOJA : METRICAS_EMPRESA;
  return (
    <>
      <Abas<'loja' | 'geral'> compacta rotulo="Comparar com" ativa={escopo} onTrocar={setEscopo} abas={[{ id: 'loja', rotulo: 'Eu × Minha loja' }, { id: 'geral', rotulo: 'Eu × Empresa' }]} />
      <p className="text-sm text-slate-400">
        {escopo === 'loja'
          ? 'Você comparada com a média das vendedoras da sua loja, no mês.'
          : 'Você comparada com a média de todas as lojas. Sem R$ absoluto: lojas de tamanhos diferentes não se comparam em faturamento.'}
      </p>
      <ul className="flex flex-col gap-3">
        {metricas.map((m) => (
          <LinhaComparacao key={m} dados={dados} escopo={escopo} metrica={m} />
        ))}
      </ul>
    </>
  );
}

function LinhaComparacao({ dados, escopo, metrica }: { dados: Fase1Dados; escopo: 'loja' | 'geral'; metrica: Metrica }) {
  const linhas = rankingCalculado(dados, escopo, metrica);
  const eu = linhas.find((l) => l.linha.pessoaId === dados.vendedor.id);
  if (!eu) return null;
  const media = linhas.reduce((a, l) => a + l.linha.valor, 0) / linhas.length;
  const acima = eu.linha.valor >= media;
  const u = UNIDADE_METRICA[metrica];
  const diferenca = Math.abs(eu.linha.valor - media);
  return (
    <li className="rounded-2xl border border-slate-700/60 bg-surface p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-white">{u.rotulo}</p>
        <p className="text-xs text-slate-400">
          #{eu.posicao} de {linhas.length}
        </p>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <p>
          <span className="block text-xs text-slate-400">Você</span>
          <strong className="text-white">{valorMetrica(metrica, eu.linha.valor)}</strong>
        </p>
        <p>
          <span className="block text-xs text-slate-400">Média {escopo === 'loja' ? 'da loja' : 'da empresa'}</span>
          <strong className="text-slate-200">{valorMetrica(metrica, media)}</strong>
        </p>
      </div>
      <p className={`mt-2 text-xs ${acima ? 'text-emerald-300' : 'text-slate-300'}`}>
        <span aria-hidden="true">{acima ? '↑ ' : '↓ '}</span>
        {distanciaMetrica(metrica, diferenca)} {acima ? 'acima da média' : 'abaixo da média — espaço para crescer aqui'}.
      </p>
    </li>
  );
}
