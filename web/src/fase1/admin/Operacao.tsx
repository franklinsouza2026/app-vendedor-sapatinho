/**
 * Operação: Visão geral, Prontidão do piloto, Saúde dos dados, Auditoria e
 * Uso do piloto — tudo com dado REAL. Pendências e prontidão são calculadas do
 * estado vindo do servidor: resolver algo no Admin faz a pendência sumir.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../../utils/useApi';
import { PainelDeEngajamento } from '../../screens/admin/AdminEngajamento';
import { calcularPendencias, calcularProntidao, consistenciaMetasLoja, LIMITE_SYNC_MIN, minutosDesde, vendedoresAtivos, type SituacaoProntidao } from '../dominio/admin';
import { dataCurta, hora, inteiro, reais } from '../formato';
import { buscarSaude, sincronizarAgora, type EstadoSaude } from './api';
import { useAdmin } from './AdminDados';
import { Bloco, Botao, Feedback, INPUT, Kpi, LinkBotao, Selo, TabelaResponsiva, TituloPagina } from './ui';

const ICONE_SITUACAO: Record<SituacaoProntidao, { icone: string; texto: string; cor: string }> = {
  OK: { icone: '✓', texto: 'Pronto', cor: 'text-emerald-300' },
  ATENCAO: { icone: '⚠', texto: 'Atenção', cor: 'text-amber-200' },
  BLOQUEIO: { icone: '⛔', texto: 'Bloqueia o piloto', cor: 'text-rose-300' },
};

const VISUAL_SAUDE: Record<EstadoSaude, { icone: string; texto: string; tom: 'ok' | 'aviso' | 'erro' }> = {
  OPERACIONAL: { icone: '🟢', texto: 'Operacional', tom: 'ok' },
  ATENCAO: { icone: '🟡', texto: 'Atenção', tom: 'aviso' },
  FALHA: { icone: '🔴', texto: 'Falha', tom: 'erro' },
};

export function idadeSync(iso: string | null, agoraIso: string): { texto: string; tom: 'ok' | 'aviso' | 'erro'; icone: string } {
  if (!iso) return { texto: 'nunca sincronizou', tom: 'erro', icone: '🔴' };
  const min = minutosDesde(iso, agoraIso);
  const texto = min < 60 ? `há ${Math.max(0, min)} min` : `há ${Math.floor(min / 60)} h ${min % 60 ? `${min % 60} min` : ''}`.trim();
  if (min > LIMITE_SYNC_MIN) return { texto, tom: 'erro', icone: '🔴' };
  if (min > 60) return { texto, tom: 'aviso', icone: '🟡' };
  return { texto, tom: 'ok', icone: '🟢' };
}

// ================================================================== visão geral

export function VisaoGeral() {
  const { estado } = useAdmin();
  const pend = calcularPendencias(estado);
  const pront = calcularProntidao(estado);
  const ok = pront.filter((p) => p.situacao === 'OK').length;
  const bloqueios = pront.filter((p) => p.situacao === 'BLOQUEIO').length;
  const ativos = vendedoresAtivos(estado);
  const naoDesligados = estado.vendedores.filter((v) => v.status !== 'DESLIGADO');
  const comMeta = naoDesligados.filter((v) => estado.metas.individuais[v.id]?.mensal);
  const semMeta = naoDesligados.filter((v) => !estado.metas.individuais[v.id]?.mensal);
  const vendasHoje = estado.desempenho.reduce((a, d) => a + d.hoje.faturamento, 0);
  const vendasMes = estado.desempenho.reduce((a, d) => a + d.mes.faturamento, 0);

  return (
    <>
      <TituloPagina
        titulo="Visão geral"
        descricao="O sistema está pronto para os vendedores usarem hoje?"
        acoes={
          <>
            <LinkBotao para="/admin/campanhas/nova" tipo="primario">
              + Nova campanha
            </LinkBotao>
            <LinkBotao para="/admin/missoes/nova">+ Nova missão</LinkBotao>
          </>
        }
      />

      <Link to="/admin/prontidao" className="block rounded-2xl border border-slate-700/60 bg-gradient-to-r from-surface to-accent/10 p-4 active:opacity-90">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-300">Prontidão da Fase 1</p>
        <p className="mt-1 text-3xl font-extrabold text-white">
          {Math.round((ok / pront.length) * 100)}% pronto <span className="text-base font-medium text-slate-400">· {ok} de {pront.length} áreas</span>
        </p>
        <p className={`mt-1 text-sm ${bloqueios ? 'text-rose-200' : 'text-emerald-200'}`}>{bloqueios ? `Resolva ${bloqueios} ${bloqueios === 1 ? 'bloqueio' : 'bloqueios'} antes do piloto →` : 'Nenhum bloqueio para o piloto →'}</p>
      </Link>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi rotulo="Vendas hoje" valor={reais(vendasHoje)} detalhe="todas as lojas" />
        <Kpi rotulo="Vendas no mês" valor={reais(vendasMes)} />
        <Kpi rotulo="Lojas ativas" valor={estado.lojas.filter((l) => l.status === 'ATIVA').length} para="/admin/lojas" />
        <Kpi rotulo="Vendedores ativos" valor={ativos.length} detalhe={`${estado.vendedores.length} cadastrados`} para="/admin/vendedores" />
        <Kpi rotulo="Com meta" valor={comMeta.length} tom="ok" para="/admin/metas" />
        <Kpi rotulo="Sem meta" valor={semMeta.length} tom={semMeta.length ? 'aviso' : 'ok'} para="/admin/metas" />
        <Kpi rotulo="Campanhas ativas" valor={estado.campanhas.filter((c) => c.status === 'ATIVA').length} detalhe={`${estado.campanhas.filter((c) => c.status === 'RASCUNHO').length} em rascunho`} para="/admin/campanhas" />
        <Kpi rotulo="Missões ativas" valor={estado.missoes.filter((m) => m.status === 'ATIVA').length} para="/admin/missoes" />
        <Kpi rotulo="Competições ativas" valor={estado.competicoes.filter((c) => c.status === 'ATIVA').length} para="/admin/competicoes" />
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
        <Bloco titulo="Saúde dos dados" acao={<Link to="/admin/saude" className="text-sm text-accentSoft">Detalhes →</Link>}>
          <ul className="flex flex-col gap-2">
            {estado.lojas
              .filter((l) => l.status === 'ATIVA')
              .map((l) => {
                const s = idadeSync(l.ultimaSync, estado.agora);
                return (
                  <li key={l.id} className="flex items-center justify-between rounded-xl bg-slate-800/70 px-3 py-2 text-sm">
                    <span className="text-slate-200">
                      <span aria-hidden="true">{s.icone} </span>
                      {l.nome}
                    </span>
                    <Selo tom={s.tom}>{l.ultimaSync ? `atualizado ${s.texto}` : s.texto}</Selo>
                  </li>
                );
              })}
          </ul>
        </Bloco>
      </div>

      <Bloco titulo="Últimas ações" acao={<Link to="/admin/auditoria" className="text-sm text-accentSoft">Auditoria →</Link>}>
        {estado.auditoria.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhuma ação registrada ainda.</p>
        ) : (
          <ul className="divide-y divide-slate-800 text-sm">
            {estado.auditoria.slice(0, 4).map((a) => (
              <li key={a.id} className="py-2 text-slate-300">
                <strong className="text-white">{a.acao}</strong> · {a.entidade} <span className="text-xs text-slate-400">· {dataCurta(a.quando)} {hora(a.quando)} · {a.usuario}</span>
              </li>
            ))}
          </ul>
        )}
      </Bloco>
    </>
  );
}

// ================================================================== prontidão

export function Prontidao() {
  const { estado } = useAdmin();
  const itens = calcularProntidao(estado);
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

const ROTULO_FASE = { BACKFILL: 'carga inicial', CATCH_UP: 'colocando em dia', LIVE: 'em dia' } as const;

export function SaudeDados() {
  const { estado, executar } = useAdmin();
  const saude = useApi(() => buscarSaude(), []);
  const [feedback, setFeedback] = useState<string | null>(null);
  const vinculos = estado.vendedores.filter((v) => v.vinculoErp === 'PENDENTE' && v.status === 'ATIVO');
  const semMeta = estado.vendedores.filter((v) => v.status !== 'DESLIGADO' && !estado.metas.individuais[v.id]?.mensal);
  const inconsistencias = estado.lojas.map((l) => ({ l, c: consistenciaMetasLoja(estado, l.id) })).filter((x) => x.c.metaLoja !== null && x.c.diferenca !== 0);

  async function sincronizar(id: string) {
    const erro = await executar(() => sincronizarAgora(id));
    setFeedback(erro ?? 'Sincronização solicitada. Os números chegam em instantes.');
    setTimeout(() => saude.recarregar(), 4000);
  }

  const s = saude.dados;
  return (
    <>
      <TituloPagina titulo="Saúde dos dados" descricao={`Vendas chegam do ERP pela integração. Acima de ${LIMITE_SYNC_MIN} min sem sincronizar, o vendedor vê o aviso de dado atrasado e a loja vira pendência.`} acoes={<Botao onClick={() => saude.recarregar()}>Atualizar</Botao>} />
      <Feedback texto={feedback} />
      {saude.carregando && !s && <p className="text-sm text-slate-400">Verificando…</p>}
      {saude.erro && <p className="text-sm text-rose-300">Não foi possível verificar a saúde agora.</p>}
      {s && (
        <>
          <div className={`rounded-2xl border p-4 ${s.geral.estado === 'OPERACIONAL' ? 'border-emerald-500/40 bg-emerald-500/5' : s.geral.estado === 'ATENCAO' ? 'border-amber-500/40 bg-amber-500/5' : 'border-rose-500/40 bg-rose-500/5'}`} role="status">
            <p className="text-2xl font-extrabold text-white">
              {VISUAL_SAUDE[s.geral.estado].icone} {VISUAL_SAUDE[s.geral.estado].texto}
            </p>
            <p className="mt-1 text-sm text-slate-200">{s.geral.motivo}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi rotulo="Última sincronização" valor={s.ultimaSyncSucessoEm ? hora(s.ultimaSyncSucessoEm) : '—'} detalhe={s.ultimaSyncSucessoEm ? dataCurta(s.ultimaSyncSucessoEm) : 'nunca'} tom={VISUAL_SAUDE[s.geral.estado].tom} />
            <Kpi rotulo="Última venda recebida" valor={s.ultimaVendaEm ? hora(s.ultimaVendaEm) : '—'} detalhe={s.ultimaVendaEm ? dataCurta(s.ultimaVendaEm) : 'nenhuma ainda'} />
            <Kpi rotulo="Processador de tarefas" valor={`${VISUAL_SAUDE[s.worker.estado].icone} ${VISUAL_SAUDE[s.worker.estado].texto}`} detalhe={s.worker.motivo} tom={VISUAL_SAUDE[s.worker.estado].tom} />
            <Kpi rotulo="Fila" valor={s.fila.aguardando !== undefined ? `${inteiro(s.fila.aguardando)} aguardando` : '—'} detalhe={s.fila.motivo} tom={VISUAL_SAUDE[s.fila.estado].tom} />
          </div>
          {s.integracoes.length === 0 && (
            <Bloco titulo="Integração">
              <p className="text-sm text-amber-200">Nenhuma integração de vendas configurada. Sem ela o app não recebe vendas.</p>
              <div className="mt-2">
                <LinkBotao para="/admin/integracoes" tipo="primario">
                  Configurar integração →
                </LinkBotao>
              </div>
            </Bloco>
          )}
          {s.integracoes.map((i) => (
            <Bloco key={i.id} titulo={`Integração ${i.provedor}`} acao={i.status === 'ATIVA' ? <Botao onClick={() => void sincronizar(i.id)}>Sincronizar agora</Botao> : undefined}>
              <p className="text-sm">
                <Selo tom={VISUAL_SAUDE[i.estado].tom}>
                  {VISUAL_SAUDE[i.estado].icone} {VISUAL_SAUDE[i.estado].texto}
                </Selo>{' '}
                <span className="text-slate-300">{i.motivo}</span>
              </p>
              <p className="mt-2 text-xs text-slate-400">
                Lojas vinculadas: {i.lojasVinculadas.map((l) => `${l.nome} (${l.codigoExterno})`).join(', ') || 'nenhuma'} · erros nas últimas 24 h: {i.errosUltimas24h}
                {i.ajustesPendentes > 0 && ` · ${i.ajustesPendentes} cancelamento(s)/devolução(ões) aguardando a venda original`}
              </p>
              {i.cursores.length > 0 && (
                <p className="mt-1 text-xs text-slate-400">
                  Leitura incremental: {i.cursores.map((c) => `${c.metodo}${c.escopo !== '*' ? ` · ${c.escopo}` : ''}: ${ROTULO_FASE[c.fase]}`).join(' · ')}
                  {i.minutosDesdeUltimoAvanco !== null && ` · último avanço há ${i.minutosDesdeUltimoAvanco} min`}
                </p>
              )}
              <TabelaResponsiva
                legenda={`Últimas sincronizações ${i.provedor}`}
                linhas={i.execucoes}
                chave={(e) => e.id}
                vazio="Nenhuma sincronização ainda."
                colunas={[
                  { titulo: 'Quando', celula: (e) => `${dataCurta(e.iniciadaEm)} ${hora(e.iniciadaEm)}` },
                  { titulo: 'Situação', celula: (e) => <Selo tom={e.status === 'SUCESSO' ? 'ok' : e.status === 'ERRO' ? 'erro' : 'aviso'}>{e.status === 'SUCESSO' ? 'Sucesso' : e.status === 'ERRO' ? 'Erro' : 'Em andamento'}</Selo> },
                  { titulo: 'Eventos', celula: (e) => inteiro(e.eventosRecebidos), alinhar: 'direita' },
                  { titulo: 'Vendas novas', celula: (e) => inteiro(e.vendasNovas), alinhar: 'direita' },
                  { titulo: 'Tipo', celula: (e) => (e.tipo === 'RECONCILIACAO' ? 'Reconciliação' : 'Sincronização') },
                  { titulo: 'Cancel./Devol.', celula: (e) => `${inteiro(e.cancelamentos)} / ${inteiro(e.devolucoes)}`, alinhar: 'direita' },
                  { titulo: 'Aguardando venda', celula: (e) => inteiro(e.pendentes), alinhar: 'direita' },
                  { titulo: 'Ignorados', celula: (e) => inteiro(e.ignorados), alinhar: 'direita' },
                  { titulo: 'Detalhe', celula: (e) => e.erro ?? '—' },
                ]}
              />
            </Bloco>
          ))}
          {s.lojasSemVinculo.length > 0 && <p className="text-sm text-amber-200">⚠️ Lojas ativas sem vínculo com nenhuma integração: {s.lojasSemVinculo.join(', ')}.</p>}
        </>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        <Kpi rotulo="Vendedores ativos" valor={vendedoresAtivos(estado).length} />
        <Kpi rotulo="Sem venda recebida do ERP" valor={vinculos.length} tom={vinculos.length ? 'aviso' : 'ok'} detalhe={vinculos.map((v) => v.nome.split(' ')[0]).join(', ') || 'todos já com venda'} para="/admin/vendedores" />
        <Kpi rotulo="Sem meta" valor={semMeta.length} tom={semMeta.length ? 'aviso' : 'ok'} detalhe={semMeta.map((v) => v.nome.split(' ')[0]).join(', ') || 'todos com meta'} para="/admin/metas" />
      </div>
      <Bloco titulo="Inconsistências">
        {inconsistencias.length === 0 ? (
          <p className="text-sm text-emerald-200">✓ Soma das metas individuais confere com a meta de cada loja (onde a meta da loja foi cadastrada).</p>
        ) : (
          <ul className="text-sm text-amber-200">
            {inconsistencias.map(({ l, c }) => (
              <li key={l.id}>
                ⚠️ {l.nome}: metas individuais somam {reais(c.soma)}, meta da loja é {reais(c.metaLoja ?? 0)}.
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
  const { estado } = useAdmin();
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

export function Analytics() {
  return (
    <>
      <TituloPagina titulo="Uso do piloto" descricao="Os vendedores estão usando o produto? Acesso mede adoção — não mede resultado de vendas." />
      <PainelDeEngajamento linkRecompensa="/admin/acesso-diario" />
    </>
  );
}
