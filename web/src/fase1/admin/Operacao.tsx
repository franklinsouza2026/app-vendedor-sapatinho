/**
 * Operação: Visão geral, Prontidão do piloto, Saúde dos dados, Auditoria e
 * Uso do piloto. Pendências e prontidão são CALCULADAS do estado — resolver
 * algo no Admin faz a pendência sumir na hora.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFase1 } from '../demo/Fase1Contexto';
import { AGORA_DEMO } from '../demo/estado';
import { calcularPendencias, calcularProntidao, consistenciaMetasLoja, LIMITE_SYNC_MIN, minutosDesde, vendedoresAtivos, type SituacaoProntidao } from '../dominio/admin';
import { dataCurta, hora, inteiro } from '../formato';
import { AvisoSimulacao, Bloco, Botao, INPUT, Kpi, LinkBotao, Selo, TabelaResponsiva, TituloPagina } from './ui';

const ICONE_SITUACAO: Record<SituacaoProntidao, { icone: string; texto: string; cor: string }> = {
  OK: { icone: '✓', texto: 'Pronto', cor: 'text-emerald-300' },
  ATENCAO: { icone: '⚠', texto: 'Atenção', cor: 'text-amber-200' },
  BLOQUEIO: { icone: '⛔', texto: 'Bloqueia o piloto', cor: 'text-rose-300' },
};

function idadeSync(iso: string): { texto: string; tom: 'ok' | 'aviso' | 'erro'; icone: string } {
  const min = minutosDesde(iso, AGORA_DEMO);
  const texto = min < 60 ? `há ${min} min` : `há ${Math.floor(min / 60)} h ${min % 60 ? `${min % 60} min` : ''}`.trim();
  if (min > LIMITE_SYNC_MIN) return { texto, tom: 'erro', icone: '🔴' };
  if (min > 60) return { texto, tom: 'aviso', icone: '🟡' };
  return { texto, tom: 'ok', icone: '🟢' };
}

// ================================================================== visão geral

export function VisaoGeral() {
  const { estado } = useFase1();
  const pend = calcularPendencias(estado, AGORA_DEMO);
  const pront = calcularProntidao(estado, AGORA_DEMO);
  const ok = pront.filter((p) => p.situacao === 'OK').length;
  const bloqueios = pront.filter((p) => p.situacao === 'BLOQUEIO').length;
  const ativos = vendedoresAtivos(estado);
  const comMeta = estado.vendedores.filter((v) => v.status !== 'DESLIGADO' && estado.metas.individuais[v.id]?.mensal);
  const semMeta = estado.vendedores.filter((v) => v.status !== 'DESLIGADO' && !estado.metas.individuais[v.id]?.mensal);

  return (
    <>
      <TituloPagina
        titulo="Visão geral"
        descricao="O sistema está pronto para os vendedores usarem hoje?"
        acoes={
          <>
            <LinkBotao para="/fase1/admin/campanhas/nova" tipo="primario">
              + Nova campanha
            </LinkBotao>
            <LinkBotao para="/fase1/admin/missoes/nova">+ Nova missão</LinkBotao>
          </>
        }
      />

      <Link to="/fase1/admin/prontidao" className="block rounded-2xl border border-slate-700/60 bg-gradient-to-r from-surface to-accent/10 p-4 active:opacity-90">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-300">Prontidão da Fase 1</p>
        <p className="mt-1 text-3xl font-extrabold text-white">
          {Math.round((ok / pront.length) * 100)}% pronto <span className="text-base font-medium text-slate-400">· {ok} de {pront.length} áreas</span>
        </p>
        <p className={`mt-1 text-sm ${bloqueios ? 'text-rose-200' : 'text-emerald-200'}`}>{bloqueios ? `Resolva ${bloqueios} ${bloqueios === 1 ? 'bloqueio' : 'bloqueios'} antes do piloto →` : 'Nenhum bloqueio para o piloto →'}</p>
      </Link>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi rotulo="Lojas ativas" valor={estado.lojas.filter((l) => l.status === 'ATIVA').length} para="/fase1/admin/lojas" />
        <Kpi rotulo="Vendedores ativos" valor={ativos.length} detalhe={`${estado.vendedores.length} cadastrados`} para="/fase1/admin/vendedores" />
        <Kpi rotulo="Com meta" valor={comMeta.length} tom="ok" para="/fase1/admin/metas" />
        <Kpi rotulo="Sem meta" valor={semMeta.length} tom={semMeta.length ? 'aviso' : 'ok'} para="/fase1/admin/metas" />
        <Kpi rotulo="Campanhas ativas" valor={estado.campanhas.filter((c) => c.status === 'ATIVA').length} detalhe={`${estado.campanhas.filter((c) => c.status === 'RASCUNHO').length} em rascunho`} para="/fase1/admin/campanhas" />
        <Kpi rotulo="Missões ativas" valor={estado.missoes.filter((m) => m.status === 'ATIVA').length} para="/fase1/admin/missoes" />
        <Kpi rotulo="Competições ativas" valor={estado.competicoes.filter((c) => c.status === 'ATIVA').length} para="/fase1/admin/competicoes" />
        <Kpi rotulo="Pendências" valor={pend.length} tom={pend.some((p) => p.bloqueiaPiloto) ? 'erro' : pend.length ? 'aviso' : 'ok'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Bloco titulo="⚠️ Pendências">
          {pend.length === 0 ? (
            <p className="text-sm text-emerald-200">Nenhuma pendência. Tudo configurado.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {pend.map((p) => (
                <li key={p.id}>
                  <Link to={p.rota} className="flex min-h-[44px] items-start gap-2 rounded-xl bg-slate-800/70 px-3 py-2 text-sm hover:bg-slate-800">
                    <span aria-hidden="true">{p.bloqueiaPiloto ? '⛔' : '⚠️'}</span>
                    <span className="min-w-0 flex-1 text-slate-200">
                      {p.texto}
                      <span className="block text-xs text-slate-400">
                        {p.area}
                        {p.bloqueiaPiloto ? ' · bloqueia o piloto' : ''}
                      </span>
                    </span>
                    <span aria-hidden="true" className="text-slate-400">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Bloco>
        <Bloco titulo="Saúde dos dados" acao={<Link to="/fase1/admin/saude" className="text-sm text-accentSoft">Detalhes →</Link>}>
          <ul className="flex flex-col gap-2">
            {estado.lojas.map((l) => {
              const s = idadeSync(l.ultimaSync);
              return (
                <li key={l.id} className="flex items-center justify-between rounded-xl bg-slate-800/70 px-3 py-2 text-sm">
                  <span className="text-slate-200">
                    <span aria-hidden="true">{s.icone} </span>
                    {l.nome}
                  </span>
                  <Selo tom={s.tom}>atualizado {s.texto}</Selo>
                </li>
              );
            })}
          </ul>
        </Bloco>
      </div>

      <Bloco titulo="Últimas ações" acao={<Link to="/fase1/admin/auditoria" className="text-sm text-accentSoft">Auditoria →</Link>}>
        <ul className="divide-y divide-slate-800 text-sm">
          {estado.auditoria.slice(0, 4).map((a) => (
            <li key={a.id} className="py-2 text-slate-300">
              <strong className="text-white">{a.acao}</strong> · {a.entidade} <span className="text-xs text-slate-400">· {dataCurta(a.quando)} {hora(a.quando)}</span>
            </li>
          ))}
        </ul>
      </Bloco>
    </>
  );
}

// ================================================================== prontidão

export function Prontidao() {
  const { estado } = useFase1();
  const itens = calcularProntidao(estado, AGORA_DEMO);
  const ok = itens.filter((i) => i.situacao === 'OK').length;
  const bloqueios = itens.filter((i) => i.situacao === 'BLOQUEIO');
  return (
    <>
      <TituloPagina titulo="Prontidão do piloto" descricao="Checklist calculado a partir da configuração atual. Resolva os bloqueios antes de liberar o app nas lojas." />
      <div className={`rounded-2xl border p-5 ${bloqueios.length ? 'border-rose-500/40 bg-rose-500/5' : 'border-emerald-500/40 bg-emerald-500/5'}`}>
        <p className="text-4xl font-extrabold text-white">{Math.round((ok / itens.length) * 100)}% pronto</p>
        <p className={`mt-1 ${bloqueios.length ? 'text-rose-200' : 'text-emerald-200'}`}>
          {bloqueios.length ? `Resolva ${bloqueios.length} ${bloqueios.length === 1 ? 'bloqueio' : 'bloqueios'} antes do piloto: ${bloqueios.map((b) => b.area).join(', ')}.` : 'Pronto para o piloto. Os itens de atenção não impedem o início.'}
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {itens.map((i) => {
          const s = ICONE_SITUACAO[i.situacao];
          return (
            <li key={i.area}>
              <Link to={i.rota} className="flex min-h-[56px] items-start gap-3 rounded-2xl border border-slate-700/60 bg-surface px-4 py-3 hover:bg-slate-800">
                <span className={`w-6 text-lg ${s.cor}`} aria-hidden="true">
                  {s.icone}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-white">{i.area}</span>
                    <span className={`text-xs font-semibold ${s.cor}`}>{s.texto}</span>
                  </span>
                  <span className="block text-sm text-slate-400">{i.detalhe}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

// ================================================================== saúde dos dados

export function SaudeDados() {
  const { estado, alterar } = useFase1();
  const vinculos = estado.vendedores.filter((v) => v.vinculoErp === 'PENDENTE' && v.status !== 'DESLIGADO');
  const semMeta = estado.vendedores.filter((v) => v.status !== 'DESLIGADO' && !estado.metas.individuais[v.id]?.mensal);
  const inconsistencias = estado.lojas.map((l) => ({ l, c: consistenciaMetasLoja(estado, l.id) })).filter((x) => x.c.diferenca !== 0);

  function simularSync(lojaId: string, minutosAtras: number, acao: string) {
    const loja = estado.lojas.find((l) => l.id === lojaId)!;
    const novo = new Date(new Date(AGORA_DEMO).getTime() - minutosAtras * 60000);
    const iso = `${novo.getFullYear()}-${String(novo.getMonth() + 1).padStart(2, '0')}-${String(novo.getDate()).padStart(2, '0')}T${String(novo.getHours()).padStart(2, '0')}:${String(novo.getMinutes()).padStart(2, '0')}:00`;
    alterar((e) => {
      e.lojas.find((l) => l.id === lojaId)!.ultimaSync = iso;
    }, { acao, entidade: `Loja ${loja.nome}`, antes: hora(loja.ultimaSync), depois: hora(iso) });
  }

  return (
    <>
      <TituloPagina titulo="Saúde dos dados" descricao={`O ERP sincroniza de hora em hora. Acima de ${LIMITE_SYNC_MIN} min sem sync, o vendedor vê o aviso de dado atrasado e a loja vira pendência.`} />
      <Bloco titulo="Sincronização por loja">
        <ul className="flex flex-col gap-2">
          {estado.lojas.map((l) => {
            const s = idadeSync(l.ultimaSync);
            return (
              <li key={l.id} className="flex flex-col gap-2 rounded-xl bg-slate-800/70 p-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm">
                  <span aria-hidden="true">{s.icone} </span>
                  <strong className="text-white">{l.nome}</strong>
                  <span className="text-slate-400"> — último sync {hora(l.ultimaSync)} · {s.texto}</span>
                </span>
                <span className="flex gap-2">
                  <Botao onClick={() => simularSync(l.id, 2, 'Simulou sync do ERP')}>Simular sync agora</Botao>
                  <Botao tipo="fantasma" onClick={() => simularSync(l.id, 200, 'Simulou atraso de sync')}>
                    Simular atraso
                  </Botao>
                </span>
              </li>
            );
          })}
        </ul>
        <div className="mt-3">
          <AvisoSimulacao>“Simular atraso” em Caruaru Shopping faz o app da Ana mostrar o aviso de dado desatualizado (cenário B).</AvisoSimulacao>
        </div>
      </Bloco>
      <div className="grid gap-4 md:grid-cols-3">
        <Kpi rotulo="Vendedores ativos" valor={vendedoresAtivos(estado).length} />
        <Kpi rotulo="Vínculos ERP pendentes" valor={vinculos.length} tom={vinculos.length ? 'aviso' : 'ok'} detalhe={vinculos.map((v) => v.nome.split(' ')[0]).join(', ') || 'todos verificados'} para="/fase1/admin/vendedores" />
        <Kpi rotulo="Sem meta" valor={semMeta.length} tom={semMeta.length ? 'aviso' : 'ok'} detalhe={semMeta.map((v) => v.nome.split(' ')[0]).join(', ') || 'todos com meta'} para="/fase1/admin/metas" />
      </div>
      <Bloco titulo="Inconsistências">
        {inconsistencias.length === 0 ? (
          <p className="text-sm text-emerald-200">✓ Soma das metas individuais confere com a meta de cada loja.</p>
        ) : (
          <ul className="text-sm text-amber-200">
            {inconsistencias.map(({ l, c }) => (
              <li key={l.id}>
                ⚠️ {l.nome}: metas individuais somam R$ {inteiro(c.soma)}, meta da loja é R$ {inteiro(c.metaLoja)}.
              </li>
            ))}
          </ul>
        )}
      </Bloco>
    </>
  );
}

// ================================================================== auditoria

export function Auditoria() {
  const { estado } = useFase1();
  const [busca, setBusca] = useState('');
  const termo = busca.trim().toLowerCase();
  const linhas = estado.auditoria.filter((a) => !termo || `${a.acao} ${a.entidade} ${a.usuario} ${a.motivo ?? ''}`.toLowerCase().includes(termo));
  return (
    <>
      <TituloPagina titulo="Log de auditoria" descricao="Toda alteração feita no Admin entra aqui, com antes, depois e motivo quando exigido. Nada é apagado." />
      <label className="max-w-sm">
        <span className="sr-only">Buscar na auditoria</span>
        <input className={INPUT} placeholder="Buscar ação, entidade ou motivo…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </label>
      <TabelaResponsiva
        legenda="Log de auditoria"
        linhas={linhas}
        chave={(a) => a.id}
        vazio="Nenhum registro encontrado."
        colunas={[
          { titulo: 'Ação', celula: (a) => a.acao },
          { titulo: 'Entidade', celula: (a) => a.entidade },
          { titulo: 'Antes', celula: (a) => a.antes ?? '—' },
          { titulo: 'Depois', celula: (a) => a.depois ?? '—' },
          { titulo: 'Motivo', celula: (a) => a.motivo ?? '—' },
          { titulo: 'Usuário', celula: (a) => a.usuario },
          { titulo: 'Quando', celula: (a) => `${dataCurta(a.quando)} ${hora(a.quando)}` },
        ]}
      />
    </>
  );
}

// ================================================================== uso do piloto

const USO = {
  abriramHoje: 12,
  abriramSemana: 15,
  telas: [
    { nome: 'Meta do dia (Home)', pct: 100 },
    { nome: 'Ranking', pct: 87 },
    { nome: 'Missões', pct: 73 },
    { nome: 'Competições', pct: 53 },
    { nome: 'Conquistas', pct: 40 },
  ],
  missoesConcluidas: 31,
  diasMediosPorSemana: 5.2,
};

export function Analytics() {
  const { estado } = useFase1();
  const ativos = vendedoresAtivos(estado).length;
  return (
    <>
      <TituloPagina titulo="Uso do piloto" descricao="Os vendedores estão usando o produto? Números agregados por loja — sem rastrear pessoa a pessoa." />
      <AvisoSimulacao>Números simulados. No piloto real virão de eventos de uso anônimos e agregados (decisão de privacidade pendente).</AvisoSimulacao>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi rotulo="Vendedores ativos" valor={ativos} />
        <Kpi rotulo="Abriram hoje" valor={USO.abriramHoje} detalhe={`${Math.round((USO.abriramHoje / ativos) * 100)}% dos ativos`} tom="ok" />
        <Kpi rotulo="Abriram na semana" valor={USO.abriramSemana} detalhe={`${Math.round((USO.abriramSemana / ativos) * 100)}% dos ativos`} tom="ok" />
        <Kpi rotulo="Retorno médio" valor={`${USO.diasMediosPorSemana.toLocaleString('pt-BR')} dias`} detalhe="por semana" />
      </div>
      <Bloco titulo="Quantos vendedores visualizaram cada área (semana)">
        <ul className="flex flex-col gap-3">
          {USO.telas.map((t) => (
            <li key={t.nome}>
              <div className="flex justify-between text-sm">
                <span className="text-slate-200">{t.nome}</span>
                <span className="font-semibold text-white">{t.pct}%</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-slate-700" aria-hidden="true">
                <div className="h-2 rounded-full bg-accentSoft" style={{ width: `${t.pct}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </Bloco>
      <div className="grid gap-3 md:grid-cols-2">
        <Kpi rotulo="Missões concluídas na semana" valor={USO.missoesConcluidas} />
        <Kpi rotulo="Competições acessadas" valor="53%" detalhe="dos ativos abriram ao menos uma" />
      </div>
    </>
  );
}
