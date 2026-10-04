/**
 * Blocos de negócio da Fase 1, compartilhados entre Home, Meu Ritmo e
 * Desempenho. Cada um transforma número em posição, distância e próximo passo.
 */
import { Link } from 'react-router-dom';
import type { Alvo, Fase1Dados, Missao } from '../dominio/tipos';
import { UNIDADE_METRICA, falta, paresEstimados, percentual, projecaoMes, proximoMarco, vendasEstimadas, vendasPorDia } from '../dominio/estimativas';
import { faltaMissao, minhaPosicao, textoUnidade } from '../dominio/alvos';
import { distanciaMetrica, ordinal, plural, pct, reais } from '../formato';
import { BarraMeta, BarraSimples, Painel, Pilula, Variacao } from './ui';

/**
 * Nota única sobre a conversão R$ → vendas. Vai UMA vez no rodapé da tela,
 * nunca repetida em cada card (decisão da homologação).
 */
export function NotaTicket({ dados }: { dados: Fase1Dados }) {
  const t = dados.referencia.ticketMedio;
  if (t === null) return null;
  return (
    <p className="text-center text-xs text-slate-400">
      {dados.referencia.origem === 'LOJA'
        ? `A quantidade de vendas é calculada com o ticket médio da sua loja (${reais(t)}), porque você ainda está começando.`
        : 'A quantidade de vendas é calculada com o seu ticket médio atual.'}
    </p>
  );
}

/** Par "rótulo em cima, valor embaixo" — meta e realizado nunca ficam ambíguos. */
function ValorRotulado({ rotulo, valor, destaque = false }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{rotulo}</dt>
      <dd className={`whitespace-nowrap font-bold tracking-tight ${destaque ? 'text-2xl text-white' : 'text-xl text-slate-200'}`}>{valor}</dd>
    </div>
  );
}

/** Meta × Realizado × % — empilha no celular estreito, lado a lado quando há espaço. */
function MetaRealizado({ rotuloMeta, meta, realizado, percentual: p, batida }: { rotuloMeta: string; meta: number; realizado: number; percentual: number; batida: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <dl className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
        <ValorRotulado rotulo={rotuloMeta} valor={reais(meta)} />
        <ValorRotulado rotulo="Realizado" valor={reais(realizado)} destaque />
      </dl>
      <div className="shrink-0 text-right">
        <p className={`text-4xl font-extrabold leading-none ${batida ? 'text-emerald-300' : 'text-white'}`}>{pct(p)}</p>
        <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">da meta</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- meta de hoje

export function CardMetaHoje({ dados, ehProximoAlvo = false }: { dados: Fase1Dados; ehProximoAlvo?: boolean }) {
  const { meta, realizado } = dados.hoje;
  const ticket = dados.referencia.ticketMedio;

  if (dados.status.lojaFechada) {
    return (
      <Painel rotulo="Hoje">
        <p className="text-sm font-semibold text-white">🏬 A loja não abre hoje</p>
        <p className="mt-1 text-sm text-slate-400">Feriado. Sua meta do mês já considera esta data — aproveite o descanso.</p>
      </Painel>
    );
  }
  if (dados.status.diaDeFolga) {
    return (
      <Painel rotulo="Hoje">
        <p className="text-sm font-semibold text-white">🌿 Hoje é sua folga</p>
        <p className="mt-1 text-sm text-slate-400">Nada para correr atrás hoje. Abaixo, o resumo do seu mês para quando voltar.</p>
      </Painel>
    );
  }
  if (meta === null) {
    return (
      <Painel rotulo="Meta de hoje">
        <dl>
          <ValorRotulado rotulo="Realizado hoje" valor={reais(realizado.faturamento)} destaque />
        </dl>
        <p className="text-sm text-slate-400">em {plural(realizado.vendas, 'venda')}</p>
        <p className="mt-3 rounded-xl bg-slate-800/80 px-3 py-2 text-sm text-slate-300">Sua meta de hoje ainda não foi cadastrada. Assim que a loja lançar, você vê aqui quanto falta.</p>
      </Painel>
    );
  }

  const p = percentual(realizado.faturamento, meta)!;
  const f = falta(realizado.faturamento, meta)!;
  const vendas = vendasEstimadas(f, ticket);
  const batida = p >= 100;
  const marco = batida ? proximoMarco(realizado.faturamento, meta) : null;
  const vendasMarco = marco ? vendasEstimadas(marco.faltaReais, ticket) : null;

  return (
    <Painel destaque rotulo="Meta de hoje" className={batida ? '!border-emerald-400/40 !from-surface !to-emerald-500/10' : ''}>
      {(batida || ehProximoAlvo) && (
        <p className={`mb-2 text-xs font-bold uppercase tracking-wider ${batida ? 'text-emerald-300' : 'text-accentSoft'}`}>{batida ? '🎉 Meta do dia batida!' : '⚡ Seu próximo alvo'}</p>
      )}
      <MetaRealizado rotuloMeta="Meta de hoje" meta={meta} realizado={realizado.faturamento} percentual={p} batida={batida} />
      <div className="mt-3">
        <BarraMeta percentual={p} rotulo="Meta de hoje" />
      </div>

      {!batida && (
        <p className="mt-3 text-base text-slate-200">
          {vendas !== null ? (
            <>
              Faltam <strong className="text-accentSoft">{plural(vendas, 'venda')}</strong> para atingir a meta do dia
              <span className="block text-sm text-slate-400">{reais(f)} restantes</span>
            </>
          ) : (
            <>
              Faltam <strong className="text-white">{reais(f)}</strong> para atingir a meta do dia
            </>
          )}
        </p>
      )}
      {batida && marco && (
        <p className="mt-3 text-base text-slate-200">
          A corrida continua: faltam <strong className="text-white">{reais(marco.faltaReais)}</strong>
          {vendasMarco !== null && <> ({plural(vendasMarco, 'venda')})</>} para chegar a <strong className="text-emerald-300">{marco.marco}%</strong>.
        </p>
      )}
      {batida && !marco && <p className="mt-3 text-base text-emerald-200">Todos os marcos do dia conquistados — 100, 110, 120 e 150%. Dia histórico.</p>}
    </Painel>
  );
}

// ---------------------------------------------------------------- corrida do mês

export function CorridaMes({ dados, detalhado = false }: { dados: Fase1Dados; detalhado?: boolean }) {
  const { meta, realizado, diasTrabalhoRestantes, diasTrabalhados } = dados.mes;
  const ticket = dados.referencia.ticketMedio;
  const pa = dados.referencia.pa;

  if (meta === null) {
    return (
      <Painel rotulo="Corrida do mês">
        <h2 className="mb-2 text-sm font-bold text-white">Corrida do mês</h2>
        <dl>
          <ValorRotulado rotulo="Realizado no mês" valor={reais(realizado.faturamento)} destaque />
        </dl>
        <p className="mt-2 text-sm text-slate-400">Sem meta mensal cadastrada ainda.</p>
      </Painel>
    );
  }

  const p = percentual(realizado.faturamento, meta)!;
  const f = falta(realizado.faturamento, meta)!;
  const vendas = vendasEstimadas(f, ticket);
  const pares = paresEstimados(vendas, pa);
  const porDia = vendasPorDia(vendas, diasTrabalhoRestantes);
  const projecao = projecaoMes(realizado.faturamento, diasTrabalhados, diasTrabalhoRestantes);
  const mostrarPares = dados.indicadores.PARES && pares !== null;
  const mostrarTicket = dados.indicadores.TICKET && ticket !== null;

  return (
    <Painel rotulo="Corrida do mês">
      <h2 className="mb-2 text-sm font-bold text-white">Corrida do mês</h2>
      <MetaRealizado rotuloMeta="Meta mensal" meta={meta} realizado={realizado.faturamento} percentual={p} batida={p >= 100} />
      <div className="mt-3">
        <BarraSimples percentual={p} rotulo="Meta do mês" cor={p >= 100 ? 'emerald' : 'accent'} />
      </div>

      {f === 0 ? (
        <p className="mt-3 text-sm text-emerald-300">Meta do mês batida. Tudo o que vier agora é recorde e prêmio de campanha.</p>
      ) : (
        <p className="mt-3 text-base text-slate-200">
          Faltam <strong className="text-white">{reais(f)}</strong>
          {diasTrabalhoRestantes === null ? (
            ' para bater a meta do mês.'
          ) : diasTrabalhoRestantes === 0 ? (
            ' e hoje é o último dia do mês.'
          ) : (
            <>
              {' '}
              e <strong className="text-white">{plural(diasTrabalhoRestantes, 'dia')}</strong> para encerrar o mês.
            </>
          )}
        </p>
      )}

      {(vendas !== null || mostrarTicket) && (
        <>
          {f > 0 && vendas !== null && <p className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Para bater a meta do mês</p>}
          <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {f > 0 && vendas !== null && <Numero rotulo="vendas" valor={String(vendas)} />}
            {f > 0 && mostrarPares && <Numero rotulo="pares" valor={String(pares)} />}
            {f > 0 && porDia !== null && <Numero rotulo="vendas por dia" valor={String(porDia)} />}
            {mostrarTicket && <Numero rotulo="ticket médio atual" valor={reais(ticket!)} />}
          </dl>
        </>
      )}
      {detalhado && projecao !== null && (
        <p className="mt-3 rounded-xl bg-slate-800/80 px-3 py-2 text-sm text-slate-300">
          No ritmo atual, você fecha o mês perto de <strong className="text-white">{reais(projecao)}</strong> ({pct((projecao / meta) * 100)} da meta).
        </p>
      )}
    </Painel>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-slate-800/80 px-2 py-2 text-center">
      <dd className="whitespace-nowrap text-lg font-bold text-white">{valor}</dd>
      <dt className="text-[11px] leading-tight text-slate-400">{rotulo}</dt>
    </div>
  );
}

// ---------------------------------------------------------------- posição

export function MinhaCorrida({ dados }: { dados: Fase1Dados }) {
  if (!dados.status.rankingDisponivel) {
    return (
      <Painel rotulo="Sua posição">
        <h2 className="text-sm font-bold text-white">Sua posição</h2>
        <p className="mt-2 text-sm text-slate-300">O ranking volta assim que os dados do ERP sincronizarem. Suas vendas continuam contando normalmente.</p>
      </Painel>
    );
  }
  if (!dados.elegibilidade.elegivel) {
    return (
      <Painel rotulo="Sua posição">
        <h2 className="text-sm font-bold text-white">Sua posição</h2>
        <p className="mt-2 text-sm text-slate-300">
          {dados.vendedor.novo
            ? 'Você está nos primeiros dias. Sua posição no ranking aparece depois do período de adaptação — até lá, a disputa é com você mesma.'
            : `Você está fora do ranking neste período. ${dados.elegibilidade.motivo ?? ''}`}
        </p>
      </Painel>
    );
  }
  const metrica = dados.metricaCorrida;
  const emReais = metrica === 'VENDAS';
  const loja = minhaPosicao(dados, 'loja', metrica);
  const geral = minhaPosicao(dados, 'geral', metrica);
  if (!loja || !geral) return null;
  const vendasAteAcima = emReais && loja.distanciaAcima !== null ? vendasEstimadas(loja.distanciaAcima, dados.referencia.ticketMedio) : null;

  return (
    <Painel rotulo="Sua posição">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-white">Sua posição · {emReais ? 'vendas do mês' : UNIDADE_METRICA[metrica].rotulo}</h2>
        <Link to="/ranking" className="-my-3 inline-flex min-h-[44px] shrink-0 items-center text-sm font-medium text-accentSoft">
          Ver ranking
        </Link>
      </div>
      <dl className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-slate-800/80 p-3">
          <dd className="text-4xl font-extrabold leading-none text-white">{loja.posicao}</dd>
          <dt className="mt-1 text-sm text-slate-300">na sua loja</dt>
          <dd>
            <Variacao valor={loja.variacao} />
          </dd>
        </div>
        <div className="rounded-xl bg-slate-800/80 p-3">
          <dd className="text-4xl font-extrabold leading-none text-white">{geral.posicao}</dd>
          <dt className="mt-1 text-sm text-slate-300">no ranking geral</dt>
          <dd>
            <Variacao valor={geral.variacao} />
          </dd>
        </div>
      </dl>
      {loja.posicao === 1 ? (
        <p className="mt-3 text-sm text-emerald-300">🏆 Você está em 1º lugar na sua loja. Mantenha o ritmo.</p>
      ) : (
        loja.distanciaAcima !== null && (
          <p className="mt-3 text-base text-slate-200">
            Faltam <strong className="text-white">{emReais ? reais(loja.distanciaAcima) : distanciaMetrica(metrica, loja.distanciaAcima)}</strong> para alcançar o <strong className="text-white">{ordinal(loja.posicao - 1)} lugar</strong> da loja
            {vendasAteAcima !== null && <> — {plural(vendasAteAcima, 'venda')} no seu ticket médio atual</>}.
          </p>
        )
      )}
    </Painel>
  );
}

// ---------------------------------------------------------------- alvos

export function ProximoAlvo({ alvo }: { alvo: Alvo }) {
  return (
    <Link to={alvo.rota} className="block rounded-2xl border border-accentSoft/40 bg-gradient-to-r from-accent/25 via-accent/10 to-transparent p-4 active:opacity-90">
      <p className="text-xs font-bold uppercase tracking-wider text-accentSoft">⚡ Próximo alvo</p>
      <p className="mt-1 text-xl font-bold leading-snug text-white">
        <span aria-hidden="true">{alvo.icone} </span>
        {alvo.falta} <span className="font-medium text-slate-200">{alvo.objetivo}</span>
      </p>
      {alvo.esforcoVendas !== null && alvo.falta.startsWith('R$') && <p className="mt-1 text-sm text-slate-300">{plural(alvo.esforcoVendas, 'venda')} no seu ticket médio atual</p>}
    </Link>
  );
}

export function VocePerto({ alvos }: { alvos: Alvo[] }) {
  if (alvos.length === 0) return null;
  return (
    <section aria-labelledby="perto-titulo">
      <h2 id="perto-titulo" className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Você também está perto de
      </h2>
      <ul className="flex flex-col gap-2">
        {alvos.map((a) => (
          <li key={a.id}>
            <Link to={a.rota} className="flex min-h-[48px] items-center gap-3 rounded-xl border border-slate-700/60 bg-surface px-3 py-2 active:opacity-90">
              <span aria-hidden="true" className="text-lg">
                {a.icone}
              </span>
              <span className="text-sm text-slate-300">
                <strong className="text-white">{a.falta}</strong> {a.objetivo}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------- missão

export const ROTULO_TIPO_MISSAO: Record<Missao['tipo'], string> = {
  DIARIA: 'Diária',
  SEMANAL: 'Semanal',
  CATEGORIA: 'Categoria',
  PERFORMANCE: 'Performance',
  CONSISTENCIA: 'Consistência',
  PRODUTO_SEMANA: 'Produto da Semana',
  PONTA_ESTOQUE: 'Desafio comercial',
};

export function CardMissao({ missao, onSimular, para }: { missao: Missao; onSimular?: () => void; para?: string }) {
  const concluida = Boolean(missao.concluidaEm);
  const f = faltaMissao(missao);
  return (
    <Painel as="article" className={concluida ? '!border-emerald-500/40' : ''}>
      <div className="flex flex-wrap items-center gap-2">
        <Pilula tom={missao.tipo === 'PRODUTO_SEMANA' || missao.tipo === 'PONTA_ESTOQUE' ? 'accent' : 'neutro'}>{ROTULO_TIPO_MISSAO[missao.tipo]}</Pilula>
        {concluida && <Pilula tom="sucesso">✓ Concluída</Pilula>}
      </div>
      <h3 className="mt-2 font-semibold text-white">{missao.titulo}</h3>
      <p className="text-sm text-slate-400">{missao.descricao}</p>
      {missao.produtos && (
        <ul className="mt-2 flex flex-col gap-1">
          {missao.produtos.map((p) => (
            <li key={p.referencia} className="flex items-center gap-2 rounded-lg bg-slate-800/80 px-2 py-1.5 text-xs text-slate-300">
              <span aria-hidden="true">{p.foto ?? '👠'}</span>
              <span className="font-mono text-slate-400">Ref. {p.referencia}</span>
              <span className="truncate">{p.nome}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3">
        <BarraSimples percentual={(missao.progresso / missao.alvo) * 100} rotulo={`Progresso de ${missao.titulo}`} cor={concluida ? 'emerald' : 'accent'} />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-slate-300">
          <strong className="text-white">
            {missao.progresso} / {missao.alvo}
          </strong>{' '}
          {!concluida && f > 0 && <span className="text-slate-400">· falta {textoUnidade(missao.unidade, f)}</span>}
        </span>
        <span className="flex gap-1.5">
          {missao.recompensa.xp > 0 && <Pilula tom="info">+{missao.recompensa.xp} XP</Pilula>}
          {missao.recompensa.moedas > 0 && <Pilula tom="aviso">+{missao.recompensa.moedas} 🪙</Pilula>}
        </span>
      </div>
      {missao.premio && <p className="mt-2 text-xs text-slate-300">🎁 Prêmio: {missao.premio}</p>}
      {para && (
        <Link to={para} className="mt-1 inline-flex min-h-[44px] items-center text-sm font-semibold text-accentSoft">
          Ver detalhes da missão →
        </Link>
      )}
      {onSimular && !concluida && (
        <button onClick={onSimular} className="mt-3 min-h-[40px] w-full rounded-xl border border-dashed border-sky-400/50 text-xs font-semibold text-sky-200">
          🧪 Simular {missao.unidade === 'par' ? 'um par vendido' : missao.unidade === 'dia' ? 'mais um dia cumprido' : 'uma venda'} (demo)
        </button>
      )}
    </Painel>
  );
}
