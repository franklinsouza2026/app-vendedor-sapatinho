/**
 * Desafios — reúne os três mecanismos, cada um com o seu significado:
 *   MISSÃO     = objetivo individual (eu contra o alvo)
 *   COMPETIÇÃO = disputa (eu contra outros, ou minha loja contra outras)
 *   CAMPANHA   = programa da empresa que agrupa vários mecanismos
 *
 * ⚠️ As missões de VENDA aqui são UX/mock: o motor de missões atual só
 * conhece missões de treinamento (actionType → Treinador/Academia...).
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useFase1 } from '../demo/Fase1Contexto';
import type { Competicao, Fase1Dados } from '../dominio/tipos';
import { faltaMissao } from '../dominio/alvos';
import { CardMissao } from '../componentes/blocos';
import { Abas, AvisoProvisorio, Medalha, Painel, Pilula, Vazio } from '../componentes/ui';
import { decimal, inteiro, periodo, plural, tempoRestante } from '../formato';
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
            <CardMissao key={m.id} missao={m} />
          ))}
        </section>
      )}
      {concluidas.length > 0 && (
        <section aria-labelledby="m-concluidas" className="flex flex-col gap-3">
          <h2 id="m-concluidas" className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Concluídas
          </h2>
          {concluidas.map((m) => (
            <CardMissao key={m.id} missao={m} />
          ))}
        </section>
      )}
      <AvisoProvisorio>Missões de venda são protótipo de UX. O motor atual só gera missões de treinamento — critérios de venda (categoria, produto, PA) dependem de backend.</AvisoProvisorio>
    </>
  );
}

// ================================================================== competições

const ROTULO_FORMATO: Record<Competicao['formato'], string> = { MENSAL: 'Mensal', SEMANAL: 'Semanal', ESPECIAL: 'Especial' };
const ROTULO_TIPO: Record<Competicao['tipo'], string> = { VENDEDOR: 'Individual', LOJA: 'Loja × Loja', EVOLUCAO: 'Evolução', CATEGORIA: 'Categoria', DUELO: 'Duelo' };

function valorCompeticao(c: Competicao, v: number): string {
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
  const [filtro, setFiltro] = useState<Competicao['status']>('ATIVA');
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
        onTrocar={setFiltro}
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

function CardCompeticao({ c, dados }: { c: Competicao; dados: Fase1Dados }) {
  const [aberto, setAberto] = useState(false);
  const i = c.participantes.findIndex((p) => p.id === c.meuId);
  const minha = i >= 0 ? c.participantes[i] : null;
  const acima = i > 0 ? c.participantes[i - 1] : null;
  const ehLoja = c.tipo === 'LOJA';
  const lider = c.participantes[0];

  return (
    <Painel as="article">
      <div className="flex flex-wrap items-center gap-2">
        <Pilula tom="accent">{ROTULO_TIPO[c.tipo]}</Pilula>
        <Pilula>{ROTULO_FORMATO[c.formato]}</Pilula>
        {c.status === 'ATIVA' && <span className="ml-auto text-xs font-medium text-amber-200">⏱ {tempoRestante(c.terminaEm, dados.agora)}</span>}
        {c.status === 'PROXIMA' && <span className="ml-auto text-xs text-slate-400">começa {periodo(c.iniciaEm, c.terminaEm)}</span>}
      </div>
      <h3 className="mt-2 text-lg font-bold text-white">{c.nome}</h3>
      <p className="text-sm text-slate-400">{c.regra}</p>
      <p className="mt-1 text-xs text-slate-400">Período: {periodo(c.iniciaEm, c.terminaEm)}</p>

      {minha && c.status !== 'PROXIMA' && (
        <div className="mt-3 rounded-xl bg-slate-800/80 p-3">
          <p className="text-sm text-slate-300">
            {ehLoja ? 'Sua loja' : 'Você'} {c.status === 'ENCERRADA' ? 'terminou em' : 'está em'} <strong className="text-xl text-white">#{i + 1}</strong> de {c.participantes.length} · {valorCompeticao(c, minha.valor)}
          </p>
          {c.status === 'ATIVA' && acima && (
            <p className="mt-1 text-sm text-slate-300">
              Faltam <strong className="text-white">{distanciaCompeticao(c, acima.valor - minha.valor)}</strong> para {i === 1 ? 'alcançar a liderança' : `alcançar ${acima.nome.split(' ')[0]}`}.
            </p>
          )}
          {c.status === 'ATIVA' && !acima && lider && <p className="mt-1 text-sm text-emerald-300">🏆 {ehLoja ? 'Sua loja lidera.' : 'Você lidera.'}</p>}
        </div>
      )}
      {!minha && c.status === 'ATIVA' && <p className="mt-3 text-sm text-slate-400">Você não participa desta competição.</p>}

      <p className="mt-3 text-sm text-slate-300">
        <span aria-hidden="true">🎁 </span>
        <span className="sr-only">Prêmio: </span>
        {c.premio}
      </p>

      {c.participantes.length > 0 && (
        <>
          <button onClick={() => setAberto((v) => !v)} aria-expanded={aberto} className="mt-2 min-h-[44px] text-sm font-medium text-accentSoft">
            {aberto ? 'Ocultar classificação' : `Ver classificação (${c.participantes.length})`}
          </button>
          {aberto && (
            <ol className="mt-1 divide-y divide-slate-700/60 rounded-xl bg-slate-800/60">
              {c.participantes.map((p, pos) => {
                const eu = p.id === c.meuId;
                return (
                  <li key={p.id} aria-current={eu ? 'true' : undefined} className={`flex min-h-[44px] items-center gap-2 px-2 py-1.5 text-sm ${eu ? 'bg-accent/15' : ''}`}>
                    <Medalha posicao={pos + 1} />
                    <span className={`min-w-0 flex-1 truncate ${eu ? 'font-bold text-accentSoft' : 'text-slate-200'}`}>{eu && !ehLoja ? 'Você' : p.nome}</span>
                    <span className="font-semibold text-white">{valorCompeticao(c, p.valor)}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
    </Painel>
  );
}

// ================================================================== campanha

function CampanhaAba() {
  const { dados } = useFase1();
  const camp = dados.campanha;
  if (!camp) {
    return <Vazio icone="📣" titulo="Nenhuma campanha ativa" texto="Campanhas são programas de incentivo da empresa. Quando houver uma, ela aparece aqui." />;
  }
  return (
    <>
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
              </div>
            </Painel>
          </li>
        ))}
      </ul>
      <AvisoProvisorio>“Campanha” ainda não existe como entidade no backend (hoje há Temporada + Competições). Política de premiação a definir.</AvisoProvisorio>
    </>
  );
}
