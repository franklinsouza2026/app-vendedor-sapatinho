/**
 * Blocos de negócio da Fase 1, compartilhados entre Home, Meu Ritmo e
 * Desempenho. Cada um transforma número em posição, distância e próximo passo.
 */
import { Link } from 'react-router-dom';
import type { Alvo, Fase1Dados, Missao } from '../dominio/tipos';
import { falta, paresEstimados, percentual, projecaoMes, proximoMarco, vendasEstimadas, vendasPorDia } from '../dominio/estimativas';
import { faltaMissao, minhaPosicao, textoUnidade } from '../dominio/alvos';
import { plural, pct, reais } from '../formato';
import { BarraMeta, BarraSimples, Painel, Pilula, SeloEstimativa, Variacao } from './ui';

export function baseEstimativa(dados: Fase1Dados): string {
  const t = dados.referencia.ticketMedio;
  if (t === null) return '';
  return dados.referencia.origem === 'LOJA' ? `no ticket médio da sua loja (${reais(t)}), porque você ainda está começando` : `no seu ticket médio do mês (${reais(t)})`;
}

// ---------------------------------------------------------------- meta de hoje

export function CardMetaHoje({ dados, compacto = false, ehProximoAlvo = false }: { dados: Fase1Dados; compacto?: boolean; ehProximoAlvo?: boolean }) {
  const { meta, realizado } = dados.hoje;
  const ticket = dados.referencia.ticketMedio;

  if (dados.status.lojaFechada) {
    return (
      <Painel rotulo="Hoje">
        <p className="text-sm font-semibold text-white">🏬 A loja não abre hoje</p>
        <p className="mt-1 text-sm text-slate-400">Feriado municipal. Sua meta do mês já considera esta data — aproveite o descanso.</p>
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
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Hoje</p>
        <p className="mt-1 text-3xl font-bold text-white">{reais(realizado.faturamento)}</p>
        <p className="text-sm text-slate-400">vendidos em {plural(realizado.vendas, 'venda')}</p>
        <p className="mt-3 rounded-xl bg-slate-800/80 px-3 py-2 text-sm text-slate-300">Sua meta de hoje ainda não foi cadastrada. Assim que a loja lançar, você vê aqui quanto falta.</p>
      </Painel>
    );
  }

  const p = percentual(realizado.faturamento, meta)!;
  const f = falta(realizado.faturamento, meta)!;
  const vendas = vendasEstimadas(f, ticket);
  const batida = p >= 100;
  const marco = batida ? proximoMarco(realizado.faturamento, meta) : null;

  return (
    <Painel destaque rotulo="Meta de hoje" className={batida ? '!border-emerald-400/40 !from-surface !to-emerald-500/10' : ''}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">{batida ? '🎉 Meta do dia batida!' : 'Meta de hoje'}</h2>
          {ehProximoAlvo && <p className="mt-1 text-xs font-bold uppercase tracking-wider text-accentSoft">⚡ Seu próximo alvo</p>}
        </div>
        <span className={`text-2xl font-extrabold ${batida ? 'text-emerald-300' : 'text-white'}`}>{pct(p)}</span>
      </div>
      <p className="mt-1">
        <span className="text-4xl font-extrabold tracking-tight text-white">{reais(realizado.faturamento)}</span>
        <span className="text-base text-slate-400"> / {reais(meta)}</span>
      </p>
      <div className="mt-3">
        <BarraMeta percentual={p} rotulo="Meta de hoje" />
      </div>

      {!batida && realizado.vendas === 0 && (
        <p className="mt-3 text-sm text-slate-300">
          Ainda sem vendas hoje. Sua meta é <strong className="text-white">{reais(meta)}</strong>
          {vendas !== null && (
            <>
              {' '}
              — <strong className="text-white">≈ {plural(vendas, 'venda')}</strong>
            </>
          )}
          .
        </p>
      )}
      {!batida && realizado.vendas > 0 && (
        <p className="mt-3 text-base text-slate-200">
          Faltam <strong className="text-white">{reais(f)}</strong>
          {vendas !== null && (
            <>
              {' '}
              — <strong className="text-accentSoft">≈ {plural(vendas, 'venda')}</strong>
            </>
          )}
          .
        </p>
      )}
      {batida && marco && (
        <p className="mt-3 text-base text-slate-200">
          A corrida continua: faltam <strong className="text-white">{reais(marco.faltaReais)}</strong> para <strong className="text-emerald-300">{marco.marco}%</strong>
          {vendasEstimadas(marco.faltaReais, ticket) !== null && <> (≈ {plural(vendasEstimadas(marco.faltaReais, ticket)!, 'venda')})</>}.
        </p>
      )}
      {batida && !marco && <p className="mt-3 text-base text-emerald-200">Todos os marcos do dia conquistados — 100, 110, 120 e 150%. Dia histórico.</p>}

      {!compacto && !batida && vendas !== null && <SeloEstimativa base={baseEstimativa(dados)} />}
      {!compacto && ticket === null && f > 0 && <p className="mt-2 text-xs text-slate-400">Ainda não há vendas suficientes para estimar quantas vendas isso representa.</p>}
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
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Corrida do mês</h2>
        <p className="mt-1 text-2xl font-bold text-white">{reais(realizado.faturamento)}</p>
        <p className="text-sm text-slate-400">vendidos em outubro · sem meta cadastrada ainda</p>
      </Painel>
    );
  }

  const p = percentual(realizado.faturamento, meta)!;
  const f = falta(realizado.faturamento, meta)!;
  const vendas = vendasEstimadas(f, ticket);
  const pares = paresEstimados(vendas, pa);
  const porDia = vendasPorDia(vendas, diasTrabalhoRestantes);
  const projecao = projecaoMes(realizado.faturamento, diasTrabalhados, diasTrabalhoRestantes);

  return (
    <Painel rotulo="Corrida do mês">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Corrida do mês</h2>
        <span className="text-lg font-bold text-white">{pct(p)}</span>
      </div>
      <p className="mt-1">
        <span className="text-2xl font-bold text-white">{reais(realizado.faturamento)}</span>
        <span className="text-sm text-slate-400"> / {reais(meta)}</span>
      </p>
      <div className="mt-2">
        <BarraSimples percentual={p} rotulo="Meta do mês" cor={p >= 100 ? 'emerald' : 'accent'} />
      </div>

      {f === 0 ? (
        <p className="mt-3 text-sm text-emerald-300">Meta do mês batida. Tudo o que vier agora é recorde e prêmio de campanha.</p>
      ) : (
        <>
          <p className="mt-3 text-sm text-slate-300">
            Faltam <strong className="text-white">{reais(f)}</strong>
            {diasTrabalhoRestantes !== null && <> em {plural(diasTrabalhoRestantes, 'dia')} de trabalho</>}.
          </p>
          {vendas !== null && (
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              <Numero rotulo="vendas" valor={`≈ ${vendas}`} />
              <Numero rotulo="pares" valor={pares !== null ? `≈ ${pares}` : '—'} />
              <Numero rotulo="vendas/dia" valor={porDia !== null ? `≈ ${porDia}` : '—'} />
            </dl>
          )}
          {vendas !== null && detalhado && <SeloEstimativa base={`${baseEstimativa(dados)}${pa ? ` e no seu PA de ${pa.toFixed(1).replace('.', ',')}` : ''}`} />}
          {vendas !== null && !detalhado && <p className="mt-2 text-xs text-slate-400">Estimativas no seu ticket médio do mês.</p>}
          {vendas === null && <p className="mt-2 text-xs text-slate-400">Sem base suficiente para converter em vendas ainda.</p>}
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
    <div className="rounded-xl bg-slate-800/80 px-1 py-2">
      <dt className="sr-only">{rotulo}</dt>
      <dd className="text-lg font-bold text-white">{valor}</dd>
      <dd aria-hidden="true" className="text-[11px] text-slate-400">
        {rotulo}
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------- posição

export function MinhaCorrida({ dados }: { dados: Fase1Dados }) {
  if (!dados.status.rankingDisponivel) {
    return (
      <Painel rotulo="Sua posição">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Sua posição</h2>
        <p className="mt-2 text-sm text-slate-300">O ranking volta assim que os dados do ERP sincronizarem. Suas vendas continuam contando normalmente.</p>
      </Painel>
    );
  }
  if (dados.vendedor.novo) {
    return (
      <Painel rotulo="Sua posição">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Sua posição</h2>
        <p className="mt-2 text-sm text-slate-300">
          Você está nos primeiros dias. Sua posição no ranking aparece depois do período de adaptação — até lá, a disputa é com você mesma.
        </p>
      </Painel>
    );
  }
  const loja = minhaPosicao(dados, 'loja', 'VENDAS');
  const geral = minhaPosicao(dados, 'geral', 'VENDAS');
  if (!loja || !geral) return null;
  const vendasAteAcima = loja.distanciaAcima !== null ? vendasEstimadas(loja.distanciaAcima, dados.referencia.ticketMedio) : null;

  return (
    <Painel rotulo="Sua posição">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Sua posição · vendas do mês</h2>
        <Link to="/fase1/ranking" className="-my-3 inline-flex min-h-[44px] items-center text-sm font-medium text-accentSoft">
          Ranking →
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-slate-800/80 p-3">
          <p className="text-3xl font-extrabold text-white">#{loja.posicao}</p>
          <p className="text-xs text-slate-400">na sua loja</p>
          <Variacao valor={loja.variacao} />
        </div>
        <div className="rounded-xl bg-slate-800/80 p-3">
          <p className="text-3xl font-extrabold text-white">#{geral.posicao}</p>
          <p className="text-xs text-slate-400">no ranking geral</p>
          <Variacao valor={geral.variacao} />
        </div>
      </div>
      {loja.posicao === 1 ? (
        <p className="mt-3 text-sm text-emerald-300">🏆 Você lidera a sua loja. Mantenha o ritmo.</p>
      ) : (
        loja.distanciaAcima !== null && (
          <p className="mt-3 text-sm text-slate-300">
            Faltam <strong className="text-white">{reais(loja.distanciaAcima)}</strong> para alcançar o <strong className="text-white">#{loja.posicao - 1}</strong> da loja
            {vendasAteAcima !== null && <> — ≈ {plural(vendasAteAcima, 'venda')} no seu ticket médio</>}.
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
      {alvo.esforcoVendas !== null && alvo.falta.startsWith('R$') && <p className="mt-1 text-sm text-slate-300">≈ {plural(alvo.esforcoVendas, 'venda')} no seu ticket médio · estimativa</p>}
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

export function CardMissao({ missao }: { missao: Missao }) {
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
              <span aria-hidden="true">👠</span>
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
          <Pilula tom="info">+{missao.recompensa.xp} XP</Pilula>
          <Pilula tom="aviso">+{missao.recompensa.moedas} 🪙</Pilula>
        </span>
      </div>
    </Painel>
  );
}
