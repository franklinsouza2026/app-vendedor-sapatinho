/**
 * Desafios — reúne os três mecanismos, cada um com o seu significado:
 *   MISSÃO     = objetivo individual (eu contra o alvo)
 *   COMPETIÇÃO = disputa (eu contra outros, ou minha loja contra outras)
 *   CAMPANHA   = programa da empresa que agrupa vários mecanismos
 *
 * ⚠️ As missões de VENDA aqui são UX/mock: o motor de missões atual só
 * conhece missões de treinamento (actionType → Treinador/Academia...).
 */
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useFase1 } from '../contexto';
import type { Competicao, Fase1Dados } from '../dominio/tipos';
import { faltaMissao } from '../dominio/alvos';
import { CardMissao } from '../componentes/blocos';
import { Abas, CabecalhoTela, Medalha, Painel, Pilula, Vazio } from '../componentes/ui';
import { dataCurta, decimal, inteiro, periodo, plural, tempoRestante } from '../formato';
import { Fase1Pagina } from './Fase1Pagina';

type Aba = 'missoes' | 'competicoes' | 'campanha';

const EXPLICACAO: Record<Aba, string> = {
  missoes: 'Objetivos seus. Você contra o alvo — sem disputar com ninguém.',
  competicoes: 'Disputas com período, regra e prêmio. Contra colegas ou entre lojas.',
  campanha: 'O programa de incentivo da empresa. Reúne várias formas de ganhar.',
};

export function Desafios() {
  const [params, setParams] = useSearchParams();
  const aba = (['missoes', 'competicoes', 'campanha'].includes(params.get('aba') ?? '') ? params.get('aba') : 'missoes') as Aba;
  return (
    <Fase1Pagina carregando="Carregando desafios...">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-white">Desafios</h1>
        <p className="text-sm text-slate-400">{EXPLICACAO[aba]}</p>
      </header>
      <Abas<Aba>
        rotulo="Tipo de desafio"
        ativa={aba}
        onTrocar={(id) => setParams({ aba: id }, { replace: true })}
        abas={[
          { id: 'missoes', rotulo: 'Missões' },
          { id: 'competicoes', rotulo: 'Competições' },
          { id: 'campanha', rotulo: 'Campanha' },
        ]}
      />
      <div role="tabpanel" aria-label={aba} className="flex flex-col gap-4">
        {aba === 'missoes' && <Missoes />}
        {aba === 'competicoes' && <Competicoes />}
        {aba === 'campanha' && <CampanhaAba />}
      </div>
    </Fase1Pagina>
  );
}

// ================================================================== missões

function Missoes() {
  const { dados } = useFase1();
  const { simularMissao } = useFase1();
  if (dados.missoes.length === 0) {
    return <Vazio icone="🎯" titulo="Nenhuma missão ativa agora" texto="Quando a loja lançar uma missão, ela aparece aqui com o objetivo e a recompensa." />;
  }
  // Mais perto de concluir primeiro: é a que mais vale a pena olhar agora.
  const abertas = dados.missoes.filter((m) => !m.concluidaEm).sort((a, b) => faltaMissao(a) / a.alvo - faltaMissao(b) / b.alvo);
  const concluidas = dados.missoes.filter((m) => m.concluidaEm);
  return (
    <>
      {abertas.length > 0 && (
        <section aria-labelledby="m-abertas" className="flex flex-col gap-3">
          <h2 id="m-abertas" className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Em andamento · {abertas.length}
          </h2>
          {abertas.map((m) => (
            <CardMissao key={m.id} missao={m} onSimular={simularMissao ? () => simularMissao(m) : undefined} para={`/desafios/missao/${m.id}`} />
          ))}
        </section>
      )}
      {concluidas.length > 0 && (
        <section aria-labelledby="m-concluidas" className="flex flex-col gap-3">
          <h2 id="m-concluidas" className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Concluídas
          </h2>
          {concluidas.map((m) => (
            <CardMissao key={m.id} missao={m} para={`/desafios/missao/${m.id}`} />
          ))}
        </section>
      )}
    </>
  );
}

// ================================================================== competições

const ROTULO_FORMATO: Record<Competicao['formato'], string> = { MENSAL: 'Mensal', SEMANAL: 'Semanal', ESPECIAL: 'Especial' };
const ROTULO_TIPO: Record<Competicao['tipo'], string> = { VENDEDOR: 'Individual', LOJA: 'Loja × Loja', EVOLUCAO: 'Evolução', CATEGORIA: 'Categoria' };

function valorCompeticao(c: Competicao, v: number | null): string {
  // Valor financeiro de colega nunca chega ao app (privacidade).
  if (v === null) return '•••';
  switch (c.unidade) {
    case 'vendas':
      return plural(v, 'venda');
    case 'pares':
      return plural(v, 'par', 'pares');
    case 'pontos':
      return `${inteiro(v)} pts`;
    case 'percentual':
      return `${decimal(v)}%`;
    case 'pp':
      return `${v >= 0 ? '+' : ''}${decimal(v)} p.p.`;
  }
}

function distanciaCompeticao(c: Competicao, v: number): string {
  if (c.unidade === 'percentual' || c.unidade === 'pp') return `${decimal(v)} p.p.`;
  if (c.unidade === 'pontos') return plural(v, 'ponto');
  return valorCompeticao(c, v);
}

function Competicoes() {
  const { dados } = useFase1();
  const [params, setParams] = useSearchParams();
  // Situação na URL: ao voltar do detalhe, a vendedora cai na mesma lista.
  const filtro = (['ATIVA', 'PROXIMA', 'ENCERRADA'].includes(params.get('situacao') ?? '') ? params.get('situacao') : 'ATIVA') as Competicao['status'];
  if (dados.competicoes.length === 0) {
    return <Vazio icone="🏁" titulo="Nenhuma competição no momento" texto="Quando uma competição começar, você vê aqui a regra, o prêmio e a sua posição." />;
  }
  const lista = dados.competicoes.filter((c) => c.status === filtro);
  return (
    <>
      <Abas<Competicao['status']>
        compacta
        rotulo="Situação das competições"
        ativa={filtro}
        onTrocar={(id) => setParams({ aba: 'competicoes', situacao: id }, { replace: true })}
        abas={[
          { id: 'ATIVA', rotulo: `Ativas · ${dados.competicoes.filter((c) => c.status === 'ATIVA').length}` },
          { id: 'PROXIMA', rotulo: 'Próximas' },
          { id: 'ENCERRADA', rotulo: 'Encerradas' },
        ]}
      />
      {lista.length === 0 && <p className="text-sm text-slate-400">Nada por aqui.</p>}
      {lista.map((c) => (
        <CardCompeticao key={c.id} c={c} dados={dados} />
      ))}
    </>
  );
}

/** Posição + distância — o mesmo bloco no card da lista e no detalhe. */
function MinhaPosicaoCompeticao({ c }: { c: Competicao }) {
  const i = c.participantes.findIndex((p) => p.id === c.meuId);
  const minha = i >= 0 ? c.participantes[i] : null;
  const minhaPosicao = minha ? (minha.posicao ?? i + 1) : 0;
  // Acima = o último participante com posição melhor que a minha (empate = mesma posição).
  const acima = minha ? ([...c.participantes].filter((p) => (p.posicao ?? c.participantes.indexOf(p) + 1) < minhaPosicao).pop() ?? null) : null;
  const ehLoja = c.tipo === 'LOJA';
  if (c.status === 'PROXIMA') return null;
  if (!minha) return c.status === 'ATIVA' ? <p className="mt-3 text-sm text-slate-400">Você não participa desta competição.</p> : null;
  return (
    <div className="mt-3 rounded-xl bg-slate-800/80 p-3">
      <p className="text-sm text-slate-300">
        {ehLoja ? 'Sua loja' : 'Você'} {c.status === 'ENCERRADA' ? 'terminou em' : 'está em'} <strong className="text-xl text-white">{minhaPosicao}º lugar</strong> de {c.participantes.length} · {valorCompeticao(c, minha.valor)}
      </p>
      {c.status === 'ATIVA' && acima && acima.valor !== null && minha.valor !== null && (
        <p className="mt-1 text-sm text-slate-300">
          Faltam <strong className="text-white">{distanciaCompeticao(c, acima.valor - minha.valor)}</strong> para {(acima.posicao ?? 1) === 1 ? 'alcançar a liderança' : `alcançar ${acima.nome.split(' ')[0]} (${acima.posicao}º lugar)`}.
        </p>
      )}
      {c.status === 'ATIVA' && !acima && <p className="mt-1 text-sm text-emerald-300">🏆 {ehLoja ? 'Sua loja está em 1º lugar.' : 'Você está em 1º lugar.'}</p>}
    </div>
  );
}

function CardCompeticao({ c, dados }: { c: Competicao; dados: Fase1Dados }) {
  return (
    <Painel as="article">
      <div className="flex flex-wrap items-center gap-2">
        <Pilula tom="accent">{ROTULO_TIPO[c.tipo]}</Pilula>
        <Pilula>{ROTULO_FORMATO[c.formato]}</Pilula>
        {c.status === 'ATIVA' && <span className="ml-auto text-xs font-medium text-amber-200">⏱ {tempoRestante(c.terminaEm, dados.agora)}</span>}
        {c.status === 'PROXIMA' && <span className="ml-auto text-xs text-slate-400">começa {dataCurta(c.iniciaEm)}</span>}
      </div>
      <h3 className="mt-2 text-lg font-bold text-white">{c.nome}</h3>
      <p className="text-sm text-slate-400">{c.regra}</p>
      <MinhaPosicaoCompeticao c={c} />
      <p className="mt-3 text-sm text-slate-300">
        <span aria-hidden="true">🎁 </span>
        <span className="sr-only">Prêmio: </span>
        {c.premio}
      </p>
      <Link to={`/desafios/competicao/${c.id}`} className="mt-2 inline-flex min-h-[44px] items-center text-sm font-semibold text-accentSoft">
        Ver detalhes e classificação →
      </Link>
    </Painel>
  );
}

export function DetalheCompeticao() {
  const { id } = useParams();
  const { dados } = useFase1();
  const c = dados.competicoes.find((x) => x.id === id);
  return (
    <Fase1Pagina carregando="Carregando competição...">
      <CabecalhoTela titulo={c?.nome ?? 'Competição não encontrada'} voltar="/desafios?aba=competicoes" />
      {!c ? (
        <Vazio icone="🏁" titulo="Essa competição não está mais disponível" texto="Ela pode ter sido encerrada ou cancelada. Volte para ver as competições ativas." />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Pilula tom="accent">{ROTULO_TIPO[c.tipo]}</Pilula>
            <Pilula>{ROTULO_FORMATO[c.formato]}</Pilula>
            {c.status === 'ATIVA' && <Pilula tom="aviso">⏱ {tempoRestante(c.terminaEm, dados.agora)}</Pilula>}
            {c.status === 'ENCERRADA' && <Pilula>Encerrada</Pilula>}
          </div>
          <Painel rotulo="Regra">
            <h2 className="text-sm font-bold text-white">Como funciona</h2>
            <p className="mt-1 text-sm text-slate-300">{c.regra}</p>
            <p className="mt-2 text-sm text-slate-400">Período: {periodo(c.iniciaEm, c.terminaEm)}</p>
            <p className="mt-2 text-sm text-slate-300">🎁 Prêmio: {c.premio}</p>
          </Painel>
          <MinhaPosicaoCompeticao c={c} />
          {c.participantes.length > 0 && (
            <Painel className="!p-0" rotulo="Classificação">
              <h2 className="px-4 pt-3 text-sm font-bold text-white">Classificação</h2>
              <ol className="mt-2 divide-y divide-slate-700/60">
                {c.participantes.map((p, pos) => {
                  const eu = p.id === c.meuId;
                  return (
                    <li key={p.id} aria-current={eu ? 'true' : undefined} className={`flex min-h-[48px] items-center gap-2 px-3 py-2 text-sm ${eu ? 'bg-accent/15' : ''}`}>
                      <Medalha posicao={p.posicao ?? pos + 1} />
                      <span className={`min-w-0 flex-1 truncate ${eu ? 'font-bold text-accentSoft' : 'text-slate-200'}`}>{eu && c.tipo !== 'LOJA' ? 'Você' : p.nome}</span>
                      <span className="shrink-0 font-semibold text-white">{valorCompeticao(c, p.valor)}</span>
                    </li>
                  );
                })}
              </ol>
            </Painel>
          )}
        </>
      )}
    </Fase1Pagina>
  );
}

export function DetalheMissao() {
  const { id } = useParams();
  const { dados } = useFase1();
  const { simularMissao } = useFase1();
  const m = dados.missoes.find((x) => x.id === id);
  return (
    <Fase1Pagina carregando="Carregando missão...">
      <CabecalhoTela titulo={m?.titulo ?? 'Missão não encontrada'} voltar="/desafios" />
      {!m ? (
        <Vazio icone="🎯" titulo="Essa missão não está mais ativa" texto="Ela pode ter terminado ou sido cancelada. Volte para ver as missões de hoje." />
      ) : (
        <>
          {!m.concluidaEm && <p className="-mt-2 text-sm font-medium text-amber-200">⏱ {tempoRestante(m.terminaEm, dados.agora)}</p>}
          <CardMissao missao={m} onSimular={simularMissao ? () => simularMissao(m) : undefined} />
          <Painel rotulo="Como conta">
            <h2 className="text-sm font-bold text-white">O que conta para o progresso</h2>
            <p className="mt-1 text-sm text-slate-300">{m.regra ?? m.descricao}</p>
            <p className="mt-2 text-sm text-slate-400">Termina em {dataCurta(m.terminaEm)}.</p>
          </Painel>
        </>
      )}
    </Fase1Pagina>
  );
}

// ================================================================== campanha

function CampanhaAba() {
  const { dados } = useFase1();
  const ativas = dados.campanhas.filter((c) => c.status === 'ATIVA');
  const encerradas = dados.campanhas.filter((c) => c.status === 'ENCERRADA');
  if (dados.campanhas.length === 0) {
    return <Vazio icone="📣" titulo="Nenhuma campanha ativa" texto="Campanhas são programas de incentivo da empresa. Quando houver uma, ela aparece aqui." />;
  }
  return (
    <>
      {ativas.length === 0 && <Vazio icone="📣" titulo="Nenhuma campanha ativa agora" texto="Veja abaixo o resultado das campanhas que já terminaram." />}
      {ativas.map((camp) => (
        <div key={camp.id} className="flex flex-col gap-3">
          <Painel destaque rotulo={camp.nome}>
            <p className="text-xs font-semibold uppercase tracking-wider text-accentSoft">Campanha · {periodo(camp.iniciaEm, camp.terminaEm)}</p>
            <h2 className="mt-1 text-2xl font-extrabold text-white">{camp.nome}</h2>
            <p className="mt-1 text-sm text-slate-300">{camp.descricao}</p>
            <p className="mt-2 text-sm font-medium text-amber-200">⏱ {tempoRestante(camp.terminaEm, dados.agora)}</p>
          </Painel>
          <ul className="flex flex-col gap-3">
            {camp.frentes.map((f) => (
              <li key={f.id}>
                <Painel as="article" className="flex gap-3">
                  <span aria-hidden="true" className="text-2xl">
                    {f.icone}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-white">{f.titulo}</h3>
                    <p className="text-sm text-slate-400">{f.descricao}</p>
                    <p className="mt-2 text-sm font-semibold text-white">{f.situacao}</p>
                    <p className="mt-1 text-xs text-slate-300">🎁 {f.premio}</p>
                    {f.competicaoId && (
                      <Link to={`/desafios/competicao/${f.competicaoId}`} className="mt-1 inline-flex min-h-[44px] items-center text-sm font-semibold text-accentSoft">
                        Ver classificação →
                      </Link>
                    )}
                  </div>
                </Painel>
              </li>
            ))}
          </ul>
          {camp.regras && (
            <details className="rounded-2xl border border-slate-700/60 bg-surface p-4 text-sm text-slate-300">
              <summary className="min-h-[24px] cursor-pointer font-medium text-white">Regras da campanha</summary>
              <p className="mt-2">{camp.regras}</p>
            </details>
          )}
        </div>
      ))}
      {encerradas.length > 0 && (
        <section aria-labelledby="camp-hist" className="flex flex-col gap-3">
          <h2 id="camp-hist" className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Encerradas
          </h2>
          {encerradas.map((c) => (
            <Painel key={c.id} as="article" rotulo={c.nome}>
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="font-semibold text-white">{c.nome}</h3>
                <span className="text-xs text-slate-400">{periodo(c.iniciaEm, c.terminaEm)}</span>
              </div>
              {c.meusGanhos && (
                <p className="mt-2 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                  Você ganhou +{c.meusGanhos.xp} XP e +{c.meusGanhos.moedas} VendaCoins.
                </p>
              )}
              <ul className="mt-2 divide-y divide-slate-700/60 text-sm">
                {(c.resultado ?? []).map((r) => (
                  <li key={r.titulo} className="py-2">
                    <p className="font-medium text-white">{r.titulo}</p>
                    {r.minhaPosicao === 1 ? (
                      <p className="text-xs font-semibold text-emerald-300">🏆 Você venceu esta frente · 🎁 {r.premio}</p>
                    ) : (
                      <p className="text-xs text-slate-400">
                        Vencedor: {r.vencedor} · 🎁 {r.premio}
                      </p>
                    )}
                    {r.minhaPosicao !== null && r.minhaPosicao > 1 && <p className="text-xs text-slate-300">Sua posição final: {r.minhaPosicao}º lugar</p>}
                  </li>
                ))}
              </ul>
            </Painel>
          ))}
        </section>
      )}
    </>
  );
}
