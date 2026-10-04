/**
 * Incentivos: campanhas (assistente em 10 etapas), missões (templates,
 * produtos, CRUD), competições e premiações.
 *
 * Ciclo de vida: RASCUNHO → PROGRAMADA/ATIVA → ENCERRADA → ARQUIVADA, ou
 * CANCELADA. Depois que começa, regra crítica não muda em silêncio: o editor
 * bloqueia e orienta a cancelar/duplicar. Publicar exige a checagem verde.
 */
import { ReactNode, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useFase1 } from '../demo/Fase1Contexto';
import { AGORA_DEMO, type CampanhaCad, type CompeticaoCad, type FrenteCampanha, type MissaoCad, novoId, type Premio, type StatusCiclo } from '../demo/estado';
import { descreverPremio } from '../demo/cenarios';
import { regrasEditaveis, ROTULO_STATUS, statusAoPublicar, validarCampanha, validarCompeticao, validarMissao } from '../dominio/admin';
import { UNIDADE_METRICA } from '../dominio/estimativas';
import type { Metrica, Missao, TipoMissao } from '../dominio/tipos';
import { CardMissao, ROTULO_TIPO_MISSAO } from '../componentes/blocos';
import { Abas } from '../componentes/ui';
import { dataCurta, periodo, reaisCentavos } from '../formato';
import { AvisoSimulacao, Bloco, Botao, Campo, ChecklistValidacao, Feedback, INPUT, LinkBotao, MolduraCelular, Selo, StatusCicloPill, TabelaResponsiva, TituloPagina } from './ui';

const paraInput = (iso: string) => iso.slice(0, 10);
const deInput = (data: string, fimDoDia = false) => `${data}T${fimDoDia ? '23:59' : '00:00'}:00`;

function lojasTexto(lojas: 'TODAS' | string[], nomes: (id: string) => string) {
  return lojas === 'TODAS' ? 'Todas as lojas' : lojas.map(nomes).join(', ') || 'nenhuma';
}

function SeletorLojas({ valor, onMudar, desabilitado }: { valor: 'TODAS' | string[]; onMudar: (v: 'TODAS' | string[]) => void; desabilitado?: boolean }) {
  const { estado } = useFase1();
  return (
    <fieldset className="flex flex-col gap-1" disabled={desabilitado}>
      <legend className="mb-1 text-sm font-medium text-slate-200">Lojas participantes</legend>
      <label className="flex min-h-[40px] items-center gap-2 text-sm text-slate-200">
        <input type="checkbox" className="h-5 w-5 accent-amber-500" checked={valor === 'TODAS'} onChange={(e) => onMudar(e.target.checked ? 'TODAS' : [])} /> Todas as lojas
      </label>
      {valor !== 'TODAS' &&
        estado.lojas.map((l) => (
          <label key={l.id} className="flex min-h-[40px] items-center gap-2 pl-6 text-sm text-slate-200">
            <input type="checkbox" className="h-5 w-5 accent-amber-500" checked={valor.includes(l.id)} onChange={(e) => onMudar(e.target.checked ? [...valor, l.id] : valor.filter((x) => x !== l.id))} /> {l.nome}
          </label>
        ))}
    </fieldset>
  );
}

function AvisoBloqueio({ status, onDuplicar }: { status: StatusCiclo; onDuplicar: () => void }) {
  if (regrasEditaveis(status)) return null;
  return (
    <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm text-amber-100" role="note">
      <p className="font-semibold">🔒 {ROTULO_STATUS[status]}: regras críticas bloqueadas</p>
      <p className="mt-1 text-amber-100/80">
        Período, participantes, objetivo, mecânica e recompensas não podem mudar depois do início — quem já está competindo seria prejudicado em silêncio. Para mudar, cancele e publique uma substituta.
      </p>
      <div className="mt-2">
        <Botao onClick={onDuplicar}>Duplicar como nova</Botao>
      </div>
    </div>
  );
}

// ================================================================== campanhas — lista

export function Campanhas() {
  const { estado, alterar } = useFase1();
  const navegar = useNavigate();
  const [aba, setAba] = useState<'vigentes' | 'rascunhos' | 'historico'>('vigentes');
  const lista = estado.campanhas.filter((c) => (aba === 'vigentes' ? c.status === 'ATIVA' || c.status === 'PROGRAMADA' : aba === 'rascunhos' ? c.status === 'RASCUNHO' : ['ENCERRADA', 'ARQUIVADA', 'CANCELADA'].includes(c.status)));
  const lojaNome = (id: string) => estado.lojas.find((l) => l.id === id)?.nome ?? id;

  function duplicar(c: CampanhaCad) {
    const id = novoId('camp');
    alterar((st) => {
      st.campanhas.unshift({ ...structuredClone(c), id, nome: `${c.nome} (cópia)`, status: 'RASCUNHO', resultado: null, meusGanhos: null });
    }, { acao: 'Duplicou campanha', entidade: `Campanha “${c.nome}”`, depois: `Rascunho “${c.nome} (cópia)”` });
    navegar(`/fase1/admin/campanhas/${id}`);
  }

  return (
    <>
      <TituloPagina titulo="Campanhas" descricao="Programas de incentivo que reúnem competições, meta e missões, com premiação." acoes={<LinkBotao para="/fase1/admin/campanhas/nova" tipo="primario">+ Nova campanha</LinkBotao>} />
      <Abas<'vigentes' | 'rascunhos' | 'historico'>
        rotulo="Situação das campanhas"
        ativa={aba}
        onTrocar={setAba}
        abas={[
          { id: 'vigentes', rotulo: 'Ativas e programadas' },
          { id: 'rascunhos', rotulo: 'Rascunhos' },
          { id: 'historico', rotulo: 'Histórico' },
        ]}
      />
      {lista.length === 0 && <p className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">Nada por aqui.</p>}
      <ul className="grid gap-3 md:grid-cols-2">
        {lista.map((c) => (
          <li key={c.id}>
            <Bloco>
              <div className="flex flex-wrap items-center gap-2">
                <StatusCicloPill status={c.status} />
                <span className="text-xs text-slate-400">{periodo(c.inicio, c.fim)}</span>
              </div>
              <h2 className="mt-2 text-lg font-bold text-white">{c.nome}</h2>
              <p className="text-sm text-slate-400">{c.objetivo || c.descricao}</p>
              <p className="mt-2 text-xs text-slate-400">
                {c.frentes.length} frentes · {lojasTexto(c.lojas, lojaNome)}
              </p>
              {c.resultado && (
                <ul className="mt-2 text-xs text-slate-300">
                  {c.resultado.map((r) => (
                    <li key={r.frenteId}>
                      🏆 {c.frentes.find((f) => f.id === r.frenteId)?.titulo}: {r.vencedor} — {r.premio}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <LinkBotao para={`/fase1/admin/campanhas/${c.id}`}>{regrasEditaveis(c.status) ? 'Editar' : 'Abrir'}</LinkBotao>
                <Botao tipo="fantasma" onClick={() => duplicar(c)}>
                  Duplicar
                </Botao>
              </div>
            </Bloco>
          </li>
        ))}
      </ul>
    </>
  );
}

// ================================================================== campanhas — assistente

const ETAPAS = ['Identidade', 'Período', 'Participantes', 'Objetivo', 'Mecânica', 'Recompensas', 'Premiação', 'Regras', 'Preview', 'Publicação'] as const;

const PRESETS_FRENTE: Omit<FrenteCampanha, 'id'>[] = [
  { icone: '🏆', titulo: 'Top vendedor', mecanismo: 'COMPETICAO', refId: 'c-corrida', premioId: null },
  { icone: '🌱', titulo: 'Maior evolução', mecanismo: 'COMPETICAO', refId: 'c-cresceu', premioId: null },
  { icone: '🎯', titulo: 'Meta batida', mecanismo: 'META_MES', refId: null, premioId: null },
  { icone: '🏬', titulo: 'Loja campeã', mecanismo: 'COMPETICAO', refId: 'c-lojas', premioId: null },
  { icone: '🔥', titulo: 'Desafio semanal', mecanismo: 'COMPETICAO', refId: 'c-sprint', premioId: null },
];

function campanhaVazia(): CampanhaCad {
  return { id: novoId('camp'), nome: '', descricao: '', objetivo: '', inicio: '2026-11-01T00:00:00', fim: '2026-11-30T23:59:00', status: 'RASCUNHO', lojas: 'TODAS', frentes: [], regras: '', resultado: null, meusGanhos: null };
}

export function EditorCampanha() {
  const { id } = useParams();
  const { estado, alterar, verComoVendedor, dados } = useFase1();
  const navegar = useNavigate();
  const existente = id ? estado.campanhas.find((c) => c.id === id) : undefined;
  const [c, setC] = useState<CampanhaCad>(() => (existente ? structuredClone(existente) : campanhaVazia()));
  const [etapa, setEtapa] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [motivoCancelar, setMotivoCancelar] = useState('');
  const [cancelando, setCancelando] = useState(false);
  const editavel = regrasEditaveis(c.status);
  const validacao = validarCampanha(c, estado);
  const ok = validacao.every((v) => v.ok);
  const nomePremio = (pid: string | null) => estado.premios.find((p) => p.id === pid);

  if (id && !existente) return <TituloPagina titulo="Campanha não encontrada" voltar={{ para: '/fase1/admin/campanhas', texto: 'Campanhas' }} />;

  /** Ao encerrar, congela o resultado com a classificação do momento (vencedor e posição da persona). */
  function resultadoFinal(): CampanhaCad['resultado'] {
    return c.frentes.map((f) => {
      const comp = dados.competicoes.find((x) => x.id === f.refId);
      const i = comp ? comp.participantes.findIndex((p) => p.id === comp.meuId) : -1;
      const p = nomePremio(f.premioId);
      return { frenteId: f.id, vencedor: f.mecanismo === 'META_MES' ? 'Todas que bateram 100% da meta do mês' : (comp?.participantes[0]?.nome ?? '—'), premio: p ? descreverPremio(p) : 'Sem prêmio', minhaPosicao: i === -1 ? null : i + 1 };
    });
  }

  function salvar(status: StatusCiclo, acao: string, motivo?: string) {
    const final = { ...c, status, resultado: status === 'ENCERRADA' && !c.resultado ? resultadoFinal() : c.resultado };
    alterar(
      (st) => {
        const i = st.campanhas.findIndex((x) => x.id === final.id);
        if (i === -1) st.campanhas.unshift(final);
        else st.campanhas[i] = final;
      },
      { acao, entidade: `Campanha “${final.nome || 'sem nome'}”`, antes: existente ? ROTULO_STATUS[existente.status] : null, depois: ROTULO_STATUS[status], motivo: motivo ?? null }
    );
    setC(final);
    if (!id) navegar(`/fase1/admin/campanhas/${final.id}`, { replace: true });
  }

  function duplicar() {
    const nova = { ...structuredClone(c), id: novoId('camp'), nome: `${c.nome} (cópia)`, status: 'RASCUNHO' as const, resultado: null, meusGanhos: null };
    alterar((st) => {
      st.campanhas.unshift(nova);
    }, { acao: 'Duplicou campanha', entidade: `Campanha “${c.nome}”`, depois: `Rascunho “${nova.nome}”` });
    setC(nova);
    navegar(`/fase1/admin/campanhas/${nova.id}`);
  }

  const corpo: Record<(typeof ETAPAS)[number], ReactNode> = {
    Identidade: (
      <div className="grid gap-3">
        <Campo rotulo="Nome da campanha">
          <input className={INPUT} value={c.nome} disabled={!editavel} onChange={(e) => setC({ ...c, nome: e.target.value })} placeholder="Ex.: Novembro Black" />
        </Campo>
        <Campo rotulo="Descrição para o vendedor" ajuda="Aparece no topo da campanha no app.">
          <textarea rows={3} className={`${INPUT} py-2`} value={c.descricao} onChange={(e) => setC({ ...c, descricao: e.target.value })} />
        </Campo>
      </div>
    ),
    Período: (
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Início">
          <input type="date" className={INPUT} disabled={!editavel} value={paraInput(c.inicio)} onChange={(e) => setC({ ...c, inicio: deInput(e.target.value) })} />
        </Campo>
        <Campo rotulo="Fim">
          <input type="date" className={INPUT} disabled={!editavel} value={paraInput(c.fim)} onChange={(e) => setC({ ...c, fim: deInput(e.target.value, true) })} />
        </Campo>
        <p className="text-xs text-slate-400 sm:col-span-2">Se começar no futuro, a campanha fica PROGRAMADA e entra no ar sozinha na data.</p>
      </div>
    ),
    Participantes: <SeletorLojas valor={c.lojas} desabilitado={!editavel} onMudar={(v) => setC({ ...c, lojas: v })} />,
    Objetivo: (
      <Campo rotulo="Objetivo de negócio" ajuda="Para o Admin e para a auditoria: por que esta campanha existe.">
        <textarea rows={3} className={`${INPUT} py-2`} disabled={!editavel} value={c.objetivo} onChange={(e) => setC({ ...c, objetivo: e.target.value })} />
      </Campo>
    ),
    Mecânica: (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-slate-400">Frentes da campanha. Cada frente aponta para uma competição, para a meta do mês ou para uma missão.</p>
        <ul className="flex flex-col gap-2">
          {c.frentes.map((f) => (
            <li key={f.id} className="flex flex-col gap-2 rounded-xl bg-slate-800/70 p-3 sm:flex-row sm:items-center">
              <span className="flex-1 text-sm text-white">
                {f.icone} {f.titulo}
              </span>
              {f.mecanismo === 'COMPETICAO' ? (
                <label className="sm:w-64">
                  <span className="sr-only">Competição de {f.titulo}</span>
                  <select className={INPUT} disabled={!editavel} value={f.refId ?? ''} onChange={(e) => setC({ ...c, frentes: c.frentes.map((x) => (x.id === f.id ? { ...x, refId: e.target.value || null } : x)) })}>
                    <option value="">Escolha a competição…</option>
                    {estado.competicoes
                      .filter((x) => x.status !== 'CANCELADA' && x.status !== 'ARQUIVADA')
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.nome} ({ROTULO_STATUS[x.status].toLowerCase()})
                        </option>
                      ))}
                  </select>
                </label>
              ) : (
                <span className="text-xs text-slate-400">{f.mecanismo === 'META_MES' ? 'Bater 100% da meta do mês' : 'Missão'}</span>
              )}
              {editavel && (
                <Botao tipo="fantasma" onClick={() => setC({ ...c, frentes: c.frentes.filter((x) => x.id !== f.id) })}>
                  Remover
                </Botao>
              )}
            </li>
          ))}
        </ul>
        {editavel && (
          <div className="flex flex-wrap gap-2">
            {PRESETS_FRENTE.filter((p) => !c.frentes.some((f) => f.titulo === p.titulo)).map((p) => (
              <Botao key={p.titulo} onClick={() => setC({ ...c, frentes: [...c.frentes, { ...p, id: novoId('fr') }] })}>
                + {p.icone} {p.titulo}
              </Botao>
            ))}
          </div>
        )}
      </div>
    ),
    Recompensas: (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-slate-400">Escolha o prêmio de cada frente. Recompensa digital (XP, VendaCoins, badge) entra pelo ledger; prêmio empresarial é informativo.</p>
        {c.frentes.length === 0 && <p className="text-sm text-amber-200">Inclua frentes na etapa Mecânica.</p>}
        {c.frentes.map((f) => (
          <label key={f.id} className="flex flex-col gap-1 rounded-xl bg-slate-800/70 p-3 sm:flex-row sm:items-center">
            <span className="flex-1 text-sm text-white">
              {f.icone} {f.titulo}
            </span>
            <select className={`${INPUT} sm:w-72`} disabled={!editavel} value={f.premioId ?? ''} onChange={(e) => setC({ ...c, frentes: c.frentes.map((x) => (x.id === f.id ? { ...x, premioId: e.target.value || null } : x)) })}>
              <option value="">Sem prêmio</option>
              <optgroup label="Recompensa digital">
                {estado.premios.filter((p) => p.tipo === 'DIGITAL').map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} — {descreverPremio(p)}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Prêmio empresarial">
                {estado.premios.filter((p) => p.tipo === 'EMPRESARIAL').map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
        ))}
      </div>
    ),
    Premiação: (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-slate-400">Resumo do que a empresa se compromete a entregar. O sistema não paga nada — é registro administrativo.</p>
        <ul className="flex flex-col gap-2 text-sm">
          {c.frentes.map((f) => {
            const p = nomePremio(f.premioId);
            return (
              <li key={f.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-800/70 px-3 py-2">
                <span className="text-white">
                  {f.icone} {f.titulo}
                </span>
                {p ? <Selo tom={p.tipo === 'DIGITAL' ? 'info' : 'ok'}>{p.tipo === 'DIGITAL' ? 'Digital' : 'Empresarial'} · {p.nome}</Selo> : <Selo tom="erro">sem prêmio</Selo>}
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-slate-400">
          Precisa de um prêmio novo? <Link to="/fase1/admin/premiacoes" className="text-accentSoft underline">Cadastre em Premiações</Link> e volte.
        </p>
      </div>
    ),
    Regras: (
      <Campo rotulo="Regras (o que vale, quem participa, desempate)" ajuda="O vendedor vê isto em “Regras da campanha”.">
        <textarea rows={5} className={`${INPUT} py-2`} disabled={!editavel} value={c.regras} onChange={(e) => setC({ ...c, regras: e.target.value })} />
      </Campo>
    ),
    Preview: (
      <div className="grid gap-4 lg:grid-cols-2">
        <ChecklistValidacao itens={validacao} />
        <MolduraCelular>
          <div className="rounded-2xl border border-accent/30 bg-gradient-to-br from-surface to-accent/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-accentSoft">Campanha · {periodo(c.inicio, c.fim)}</p>
            <p className="mt-1 text-xl font-extrabold text-white">{c.nome || 'Sem nome'}</p>
            <p className="mt-1 text-sm text-slate-300">{c.descricao || '—'}</p>
          </div>
          {c.frentes.map((f) => {
            const p = nomePremio(f.premioId);
            return (
              <div key={f.id} className="flex gap-3 rounded-2xl border border-slate-700/60 bg-surface p-3">
                <span aria-hidden="true" className="text-2xl">
                  {f.icone}
                </span>
                <div>
                  <p className="font-semibold text-white">{f.titulo}</p>
                  <p className="text-sm text-slate-400">{estado.competicoes.find((x) => x.id === f.refId)?.nome ?? (f.mecanismo === 'META_MES' ? 'Bater 100% da meta do mês' : '—')}</p>
                  <p className="mt-1 text-xs text-slate-300">🎁 {p ? descreverPremio(p) : 'Prêmio a definir'}</p>
                </div>
              </div>
            );
          })}
        </MolduraCelular>
      </div>
    ),
    Publicação: (
      <div className="flex flex-col gap-3">
        <ChecklistValidacao itens={validacao} />
        {c.status === 'RASCUNHO' && (
          <p className="text-sm text-slate-300">
            Ao publicar, a campanha fica <strong className="text-white">{ROTULO_STATUS[statusAoPublicar(c.inicio, AGORA_DEMO)]}</strong>
            {statusAoPublicar(c.inicio, AGORA_DEMO) === 'ATIVA' ? ' e aparece agora no app dos vendedores.' : ` e entra no ar em ${dataCurta(c.inicio)}.`}
          </p>
        )}
      </div>
    ),
  };

  return (
    <>
      <TituloPagina
        titulo={c.nome || 'Nova campanha'}
        voltar={{ para: '/fase1/admin/campanhas', texto: 'Campanhas' }}
        acoes={
          <>
            <StatusCicloPill status={c.status} />
          </>
        }
      />
      <AvisoBloqueio status={c.status} onDuplicar={duplicar} />
      <Feedback texto={feedback} />

      <ol className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" aria-label="Etapas da campanha">
        {ETAPAS.map((e, i) => (
          <li key={e}>
            <button
              onClick={() => setEtapa(i)}
              aria-current={i === etapa ? 'step' : undefined}
              className={`min-h-[40px] whitespace-nowrap rounded-full px-3 text-xs font-semibold ${i === etapa ? 'bg-white text-slate-900' : 'bg-surface text-slate-300 ring-1 ring-slate-700'}`}
            >
              {i + 1}. {e}
            </button>
          </li>
        ))}
      </ol>

      <Bloco titulo={`${etapa + 1}. ${ETAPAS[etapa]}`}>{corpo[ETAPAS[etapa]]}</Bloco>

      <div className="flex flex-wrap items-center gap-2">
        <Botao disabled={etapa === 0} onClick={() => setEtapa((x) => x - 1)}>
          ← Anterior
        </Botao>
        {etapa < ETAPAS.length - 1 && (
          <Botao tipo="primario" onClick={() => setEtapa((x) => x + 1)}>
            Próxima →
          </Botao>
        )}
        <span className="flex-1" />
        {c.status === 'RASCUNHO' && (
          <Botao
            onClick={() => {
              salvar('RASCUNHO', existente ? 'Editou rascunho de campanha' : 'Criou rascunho de campanha');
              setFeedback('Rascunho salvo.');
            }}
          >
            Salvar rascunho
          </Botao>
        )}
        {regrasEditaveis(c.status) && c.status === 'PROGRAMADA' && (
          <Botao
            onClick={() => {
              salvar('PROGRAMADA', 'Editou campanha programada');
              setFeedback('Alterações salvas.');
            }}
          >
            Salvar alterações
          </Botao>
        )}
        {c.status === 'RASCUNHO' && (
          <Botao
            tipo="primario"
            disabled={!ok}
            titulo={ok ? undefined : 'Resolva as pendências da checagem'}
            onClick={() => {
              const st = statusAoPublicar(c.inicio, AGORA_DEMO);
              salvar(st, 'Publicou campanha');
              setFeedback(st === 'ATIVA' ? 'Campanha publicada e ativa. Já aparece para os vendedores.' : 'Campanha programada.');
            }}
          >
            Publicar
          </Botao>
        )}
        {!existente || c.status === 'RASCUNHO' ? null : (
          <>
            {c.status === 'ATIVA' && (
              <Botao
                onClick={() => {
                  salvar('ENCERRADA', 'Encerrou campanha');
                  setFeedback('Campanha encerrada. Fica no histórico.');
                }}
              >
                Encerrar
              </Botao>
            )}
            {(c.status === 'ATIVA' || c.status === 'PROGRAMADA') && (
              <Botao tipo="perigo" onClick={() => setCancelando(true)}>
                Cancelar campanha
              </Botao>
            )}
            {c.status === 'ENCERRADA' && (
              <Botao
                onClick={() => {
                  salvar('ARQUIVADA', 'Arquivou campanha');
                  setFeedback('Campanha arquivada.');
                }}
              >
                Arquivar
              </Botao>
            )}
          </>
        )}
        <Botao onClick={duplicar}>Duplicar</Botao>
        {c.status === 'ATIVA' && (
          <Botao
            onClick={() => {
              verComoVendedor();
              navegar('/fase1/desafios?aba=campanha');
            }}
          >
            👁 Ver como vendedora
          </Botao>
        )}
      </div>

      {cancelando && (
        <form
          className="grid max-w-xl gap-2 rounded-2xl border border-rose-500/40 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (motivoCancelar.trim().length < 5) return;
            salvar('CANCELADA', 'Cancelou campanha', motivoCancelar);
            setCancelando(false);
            setFeedback('Campanha cancelada. Os vendedores deixam de vê-la; nada é apagado.');
          }}
        >
          <Campo rotulo="Motivo do cancelamento (obrigatório, vai para a auditoria)">
            <input className={INPUT} value={motivoCancelar} onChange={(e) => setMotivoCancelar(e.target.value)} minLength={5} required />
          </Campo>
          <div className="flex gap-2">
            <Botao type="submit" tipo="perigo">
              Confirmar cancelamento
            </Botao>
            <Botao tipo="fantasma" onClick={() => setCancelando(false)}>
              Voltar
            </Botao>
          </div>
        </form>
      )}
    </>
  );
}

// ================================================================== missões

const TEMPLATES: { id: string; titulo: string; icone: string; descricao: string; base: Partial<MissaoCad> }[] = [
  { id: 'PRODUTO_SEMANA', titulo: 'Produto da Semana', icone: '👠', descricao: 'Venda X pares de uma referência.', base: { tipo: 'PRODUTO_SEMANA', unidade: 'par', alvo: 3, xp: 30, moedas: 10, regras: 'Conta par vendido da referência, qualquer numeração.' } },
  { id: 'DESAFIO_PA', titulo: 'Desafio de PA', icone: '👟', descricao: 'Vendas com 2 pares ou mais.', base: { tipo: 'SEMANAL', unidade: 'venda', alvo: 5, xp: 40, moedas: 15, regras: 'Venda com 2+ pares no mesmo cupom.' } },
  { id: 'SPRINT_META', titulo: 'Sprint de Meta', icone: '🎯', descricao: 'X vendas no dia.', base: { tipo: 'DIARIA', unidade: 'venda', alvo: 8, xp: 20, moedas: 5, regras: 'Conta toda venda finalizada no dia.' } },
  { id: 'PONTA_ESTOQUE', titulo: 'Ponta de Estoque', icone: '📦', descricao: 'Girar uma seleção de produtos.', base: { tipo: 'PONTA_ESTOQUE', unidade: 'par', alvo: 6, xp: 35, moedas: 15, regras: 'Qualquer par das referências selecionadas.' } },
  { id: 'CATEGORIA', titulo: 'Categoria', icone: '👜', descricao: 'Vender uma categoria (bolsa, tênis…).', base: { tipo: 'CATEGORIA', unidade: 'venda', alvo: 4, xp: 30, moedas: 10, regras: 'Cupom com ao menos 1 item da categoria.' } },
  { id: 'SUPERACAO', titulo: 'Superação Pessoal', icone: '🚀', descricao: 'Superar o próprio ticket/PA.', base: { tipo: 'PERFORMANCE', unidade: 'dia', alvo: 3, xp: 40, moedas: 15, regras: 'Dia com indicador acima da sua média do mês.' } },
  { id: 'CONSISTENCIA', titulo: 'Consistência', icone: '🔥', descricao: 'Bater a meta X dias seguidos.', base: { tipo: 'CONSISTENCIA', unidade: 'dia', alvo: 5, xp: 50, moedas: 20, regras: 'Dias de trabalho válidos do calendário.' } },
];

function missaoVazia(template?: (typeof TEMPLATES)[number]): MissaoCad {
  return {
    id: novoId('m'),
    nome: template ? template.titulo : '',
    tipo: 'SEMANAL',
    template: template?.id ?? null,
    descricao: '',
    unidade: 'venda',
    alvo: 1,
    xp: 0,
    moedas: 0,
    premioId: null,
    lojas: 'TODAS',
    inicio: '2026-10-22T09:00:00',
    fim: '2026-10-24T22:00:00',
    status: 'RASCUNHO',
    produtos: [],
    regras: '',
    progressoDemo: 0,
    ...(template?.base ?? {}),
  };
}

export function Missoes() {
  const { estado, alterar } = useFase1();
  const navegar = useNavigate();
  const [aba, setAba] = useState<'lista' | 'templates' | 'produtos'>('lista');
  const [filtro, setFiltro] = useState<'vigentes' | 'rascunhos' | 'historico'>('vigentes');
  const lista = estado.missoes.filter((m) => (filtro === 'vigentes' ? m.status === 'ATIVA' || m.status === 'PROGRAMADA' : filtro === 'rascunhos' ? m.status === 'RASCUNHO' : ['ENCERRADA', 'CANCELADA', 'ARQUIVADA'].includes(m.status)));

  function duplicar(m: MissaoCad) {
    const id = novoId('m');
    alterar((st) => {
      st.missoes.unshift({ ...structuredClone(m), id, nome: `${m.nome} (cópia)`, status: 'RASCUNHO', progressoDemo: 0 });
    }, { acao: 'Duplicou missão', entidade: `Missão “${m.nome}”`, depois: `Rascunho “${m.nome} (cópia)”` });
    navegar(`/fase1/admin/missoes/${id}`);
  }

  return (
    <>
      <TituloPagina titulo="Missões" descricao="Objetivos individuais com recompensa. Comece por um template e preencha só o necessário." acoes={<LinkBotao para="/fase1/admin/missoes/nova" tipo="primario">+ Nova missão</LinkBotao>} />
      <Abas<'lista' | 'templates' | 'produtos'>
        rotulo="Áreas de missões"
        ativa={aba}
        onTrocar={setAba}
        abas={[
          { id: 'lista', rotulo: 'Missões' },
          { id: 'templates', rotulo: 'Templates' },
          { id: 'produtos', rotulo: 'Produtos' },
        ]}
      />
      {aba === 'lista' && (
        <>
          <Abas<'vigentes' | 'rascunhos' | 'historico'>
            compacta
            rotulo="Situação das missões"
            ativa={filtro}
            onTrocar={setFiltro}
            abas={[
              { id: 'vigentes', rotulo: 'Ativas e programadas' },
              { id: 'rascunhos', rotulo: 'Rascunhos' },
              { id: 'historico', rotulo: 'Encerradas e canceladas' },
            ]}
          />
          <TabelaResponsiva
            legenda="Missões"
            linhas={lista}
            chave={(m) => m.id}
            vazio="Nenhuma missão nesta situação."
            colunas={[
              { titulo: 'Missão', celula: (m) => <Link to={`/fase1/admin/missoes/${m.id}`} className="text-white hover:underline">{m.nome}</Link> },
              { titulo: 'Tipo', celula: (m) => ROTULO_TIPO_MISSAO[m.tipo] },
              { titulo: 'Status', celula: (m) => <StatusCicloPill status={m.status} /> },
              { titulo: 'Período', celula: (m) => periodo(m.inicio, m.fim) },
              { titulo: 'Recompensa', celula: (m) => [m.xp ? `+${m.xp} XP` : '', m.moedas ? `+${m.moedas} 🪙` : ''].filter(Boolean).join(' · ') || '—' },
              { titulo: '', celula: (m) => <button onClick={() => duplicar(m)} className="min-h-[36px] text-sm text-accentSoft underline-offset-2 hover:underline">Duplicar</button> },
            ]}
          />
        </>
      )}
      {aba === 'templates' && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TEMPLATES.map((t) => (
            <li key={t.id}>
              <Link to={`/fase1/admin/missoes/nova?template=${t.id}`} className="flex h-full flex-col gap-1 rounded-2xl border border-slate-700/60 bg-surface p-4 hover:border-accentSoft/60">
                <span aria-hidden="true" className="text-2xl">
                  {t.icone}
                </span>
                <span className="font-semibold text-white">{t.titulo}</span>
                <span className="text-sm text-slate-400">{t.descricao}</span>
                <span className="mt-auto pt-2 text-sm font-medium text-accentSoft">Usar template →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {aba === 'produtos' && <Produtos />}
    </>
  );
}

function Produtos() {
  const { estado, alterar } = useFase1();
  const [novo, setNovo] = useState({ referencia: '', nome: '', categoria: 'Salto', preco: '', foto: '👠' });
  const [erro, setErro] = useState<string | null>(null);
  return (
    <>
      <AvisoSimulacao>Cadastro de demonstração — sem integração com o ERP. Na versão real, produtos virão do catálogo do Linx.</AvisoSimulacao>
      <TabelaResponsiva
        legenda="Produtos"
        linhas={estado.produtos}
        chave={(p) => p.referencia}
        colunas={[
          { titulo: 'Produto', celula: (p) => `${p.foto} ${p.nome}` },
          { titulo: 'Referência', celula: (p) => p.referencia },
          { titulo: 'Categoria', celula: (p) => p.categoria },
          { titulo: 'Preço', celula: (p) => reaisCentavos(p.preco), alinhar: 'direita' },
        ]}
      />
      <form
        className="grid gap-2 rounded-2xl border border-slate-700/60 bg-surface p-4 sm:grid-cols-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!/^\d{3,}$/.test(novo.referencia)) return setErro('Referência: só números, mínimo 3 dígitos.');
          if (estado.produtos.some((p) => p.referencia === novo.referencia)) return setErro('Referência já cadastrada.');
          setErro(null);
          alterar((st) => {
            st.produtos.push({ referencia: novo.referencia, nome: novo.nome.trim(), categoria: novo.categoria, preco: Number(novo.preco) || 0, foto: novo.foto });
          }, { acao: 'Cadastrou produto', entidade: `Produto Ref. ${novo.referencia}`, depois: novo.nome });
          setNovo({ referencia: '', nome: '', categoria: 'Salto', preco: '', foto: '👠' });
        }}
      >
        <Campo rotulo="Referência">
          <input className={INPUT} value={novo.referencia} onChange={(e) => setNovo({ ...novo, referencia: e.target.value })} required />
        </Campo>
        <Campo rotulo="Nome">
          <input className={INPUT} value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} required />
        </Campo>
        <Campo rotulo="Categoria">
          <select className={INPUT} value={novo.categoria} onChange={(e) => setNovo({ ...novo, categoria: e.target.value, foto: { Salto: '👠', Rasteira: '🩴', Bolsa: '👜', Tênis: '👟', Bota: '👢' }[e.target.value] ?? '👠' })}>
            {['Salto', 'Rasteira', 'Bolsa', 'Tênis', 'Bota'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Preço (R$)">
          <input type="number" step="0.01" min={0} className={INPUT} value={novo.preco} onChange={(e) => setNovo({ ...novo, preco: e.target.value })} />
        </Campo>
        <div className="self-end">
          <Botao type="submit" tipo="primario">
            Cadastrar
          </Botao>
        </div>
        {erro && (
          <p role="alert" className="text-sm text-rose-300 sm:col-span-5">
            {erro}
          </p>
        )}
      </form>
    </>
  );
}

const TIPOS_MISSAO: TipoMissao[] = ['DIARIA', 'SEMANAL', 'CATEGORIA', 'PRODUTO_SEMANA', 'PONTA_ESTOQUE', 'PERFORMANCE', 'CONSISTENCIA'];

export function EditorMissao() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { estado, alterar, verComoVendedor } = useFase1();
  const navegar = useNavigate();
  const existente = id ? estado.missoes.find((m) => m.id === id) : undefined;
  const template = TEMPLATES.find((t) => t.id === params.get('template'));
  const [m, setM] = useState<MissaoCad>(() => (existente ? structuredClone(existente) : missaoVazia(template)));
  const [feedback, setFeedback] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [categoria, setCategoria] = useState('todas');
  const editavel = regrasEditaveis(m.status);
  const validacao = validarMissao(m, estado);
  const ok = validacao.every((v) => v.ok);

  // Preview com o componente REAL do app da vendedora.
  const preview: Missao = useMemo(
    () => ({
      id: m.id,
      tipo: m.tipo,
      titulo: m.nome || 'Sem nome',
      descricao: m.descricao || '—',
      unidade: m.unidade,
      progresso: 0,
      alvo: Math.max(1, m.alvo),
      recompensa: { xp: m.xp, moedas: m.moedas },
      terminaEm: m.fim,
      produtos: m.produtos.length ? m.produtos.map((ref) => ({ referencia: ref, nome: estado.produtos.find((p) => p.referencia === ref)?.nome ?? '—', foto: estado.produtos.find((p) => p.referencia === ref)?.foto })) : undefined,
      premio: m.premioId ? estado.premios.find((p) => p.id === m.premioId)?.nome : undefined,
    }),
    [m, estado.produtos, estado.premios]
  );

  if (id && !existente) return <TituloPagina titulo="Missão não encontrada" voltar={{ para: '/fase1/admin/missoes', texto: 'Missões' }} />;

  function salvar(status: StatusCiclo, acao: string, motivoAcao?: string) {
    const final = { ...m, status };
    alterar(
      (st) => {
        const i = st.missoes.findIndex((x) => x.id === final.id);
        if (i === -1) st.missoes.unshift(final);
        else st.missoes[i] = final;
      },
      { acao, entidade: `Missão “${final.nome || 'sem nome'}”`, antes: existente ? ROTULO_STATUS[existente.status] : null, depois: ROTULO_STATUS[status], motivo: motivoAcao ?? null }
    );
    setM(final);
    if (!id) navegar(`/fase1/admin/missoes/${final.id}`, { replace: true });
  }

  function duplicar() {
    const nova = { ...structuredClone(m), id: novoId('m'), nome: `${m.nome} (cópia)`, status: 'RASCUNHO' as const, progressoDemo: 0 };
    alterar((st) => {
      st.missoes.unshift(nova);
    }, { acao: 'Duplicou missão', entidade: `Missão “${m.nome}”`, depois: `Rascunho “${nova.nome}”` });
    setM(nova);
    navegar(`/fase1/admin/missoes/${nova.id}`);
  }

  const categorias = ['todas', ...new Set(estado.produtos.map((p) => p.categoria))];
  const produtosVisiveis = estado.produtos.filter((p) => categoria === 'todas' || p.categoria === categoria);

  return (
    <>
      <TituloPagina titulo={m.nome || 'Nova missão'} voltar={{ para: '/fase1/admin/missoes', texto: 'Missões' }} descricao={template && !existente ? `Template: ${template.titulo}` : undefined} acoes={<StatusCicloPill status={m.status} />} />
      <AvisoBloqueio status={m.status} onDuplicar={duplicar} />
      <Feedback texto={feedback} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Bloco titulo="Identidade e objetivo">
            <fieldset disabled={!editavel} className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Nome">
                <input className={INPUT} value={m.nome} onChange={(e) => setM({ ...m, nome: e.target.value })} />
              </Campo>
              <Campo rotulo="Tipo">
                <select className={INPUT} value={m.tipo} onChange={(e) => setM({ ...m, tipo: e.target.value as TipoMissao })}>
                  {TIPOS_MISSAO.map((t) => (
                    <option key={t} value={t}>
                      {ROTULO_TIPO_MISSAO[t]}
                    </option>
                  ))}
                </select>
              </Campo>
              <div className="sm:col-span-2">
                <Campo rotulo="Objetivo (texto que o vendedor lê)">
                  <input className={INPUT} value={m.descricao} onChange={(e) => setM({ ...m, descricao: e.target.value })} placeholder="Ex.: Venda 3 pares do Scarpin Ref. 12345 até sábado." />
                </Campo>
              </div>
              <Campo rotulo="Métrica">
                <select className={INPUT} value={m.unidade} onChange={(e) => setM({ ...m, unidade: e.target.value as MissaoCad['unidade'] })}>
                  <option value="venda">Vendas</option>
                  <option value="par">Pares</option>
                  <option value="dia">Dias</option>
                  <option value="reais">Reais (R$)</option>
                </select>
              </Campo>
              <Campo rotulo="Meta da missão">
                <input type="number" min={1} className={INPUT} value={m.alvo} onChange={(e) => setM({ ...m, alvo: Number(e.target.value) })} />
              </Campo>
            </fieldset>
          </Bloco>
          <Bloco titulo="Participantes e período">
            <fieldset disabled={!editavel} className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Início">
                <input type="date" className={INPUT} value={paraInput(m.inicio)} onChange={(e) => setM({ ...m, inicio: `${e.target.value}T09:00:00` })} />
              </Campo>
              <Campo rotulo="Fim">
                <input type="date" className={INPUT} value={paraInput(m.fim)} onChange={(e) => setM({ ...m, fim: `${e.target.value}T22:00:00` })} />
              </Campo>
              <div className="sm:col-span-2">
                <SeletorLojas valor={m.lojas} desabilitado={!editavel} onMudar={(v) => setM({ ...m, lojas: v })} />
              </div>
            </fieldset>
          </Bloco>
          <Bloco titulo="Produtos">
            <fieldset disabled={!editavel}>
              <div className="mb-2 flex flex-wrap gap-2">
                {categorias.map((c) => (
                  <button key={c} type="button" onClick={() => setCategoria(c)} aria-pressed={categoria === c} className={`min-h-[36px] rounded-full px-3 text-xs font-semibold ${categoria === c ? 'bg-slate-600 text-white' : 'text-slate-300 ring-1 ring-slate-700'}`}>
                    {c === 'todas' ? 'Todas' : c}
                  </button>
                ))}
              </div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {produtosVisiveis.map((p) => (
                  <li key={p.referencia}>
                    <label className="flex min-h-[44px] items-center gap-2 rounded-xl bg-slate-800/70 px-3 py-2 text-sm text-slate-200">
                      <input type="checkbox" className="h-5 w-5 accent-amber-500" checked={m.produtos.includes(p.referencia)} onChange={(e) => setM({ ...m, produtos: e.target.checked ? [...m.produtos, p.referencia] : m.produtos.filter((x) => x !== p.referencia) })} />
                      <span aria-hidden="true">{p.foto}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {p.nome} <span className="text-xs text-slate-400">· Ref. {p.referencia}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          </Bloco>
          <Bloco titulo="Recompensa e regras">
            <fieldset disabled={!editavel} className="grid gap-3 sm:grid-cols-3">
              <Campo rotulo="XP">
                <input type="number" min={0} className={INPUT} value={m.xp} onChange={(e) => setM({ ...m, xp: Number(e.target.value) })} />
              </Campo>
              <Campo rotulo="VendaCoins">
                <input type="number" min={0} className={INPUT} value={m.moedas} onChange={(e) => setM({ ...m, moedas: Number(e.target.value) })} />
              </Campo>
              <Campo rotulo="Prêmio (opcional)">
                <select className={INPUT} value={m.premioId ?? ''} onChange={(e) => setM({ ...m, premioId: e.target.value || null })}>
                  <option value="">Nenhum</option>
                  {estado.premios.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              </Campo>
              <div className="sm:col-span-3">
                <Campo rotulo="Regra de contagem" ajuda="O que conta para o progresso — o vendedor precisa entender.">
                  <input className={INPUT} value={m.regras} onChange={(e) => setM({ ...m, regras: e.target.value })} />
                </Campo>
              </div>
            </fieldset>
          </Bloco>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <MolduraCelular>
            <CardMissao missao={preview} />
          </MolduraCelular>
          <ChecklistValidacao itens={validacao} />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {m.status === 'RASCUNHO' && (
          <>
            <Botao
              onClick={() => {
                salvar('RASCUNHO', existente ? 'Editou rascunho de missão' : 'Criou rascunho de missão');
                setFeedback('Rascunho salvo.');
              }}
            >
              Salvar rascunho
            </Botao>
            <Botao
              tipo="primario"
              disabled={!ok}
              titulo={ok ? undefined : 'Resolva as pendências da checagem'}
              onClick={() => {
                const st = statusAoPublicar(m.inicio, AGORA_DEMO);
                salvar(st, st === 'ATIVA' ? 'Publicou missão' : 'Programou missão');
                setFeedback(st === 'ATIVA' ? 'Missão publicada. Já aparece para as vendedoras participantes.' : 'Missão programada.');
              }}
            >
              {statusAoPublicar(m.inicio, AGORA_DEMO) === 'ATIVA' ? 'Publicar agora' : 'Programar'}
            </Botao>
          </>
        )}
        {m.status === 'PROGRAMADA' && (
          <Botao
            onClick={() => {
              salvar('PROGRAMADA', 'Editou missão programada');
              setFeedback('Alterações salvas.');
            }}
          >
            Salvar alterações
          </Botao>
        )}
        {m.status === 'ATIVA' && (
          <>
            <Botao
              onClick={() => {
                salvar('ENCERRADA', 'Encerrou missão');
                setFeedback('Missão encerrada.');
              }}
            >
              Encerrar
            </Botao>
            <Botao
              onClick={() => {
                verComoVendedor();
                navegar('/fase1/desafios');
              }}
            >
              👁 Ver como vendedora
            </Botao>
          </>
        )}
        {(m.status === 'ATIVA' || m.status === 'PROGRAMADA') && (
          <Botao tipo="perigo" onClick={() => setCancelando(true)}>
            Cancelar missão
          </Botao>
        )}
        <Botao onClick={duplicar}>Duplicar</Botao>
      </div>
      {cancelando && (
        <form
          className="grid max-w-xl gap-2 rounded-2xl border border-rose-500/40 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (motivo.trim().length < 5) return;
            salvar('CANCELADA', 'Cancelou missão', motivo);
            setCancelando(false);
            setFeedback('Missão cancelada. Some do app; nada é apagado.');
          }}
        >
          <Campo rotulo="Motivo do cancelamento (obrigatório)">
            <input className={INPUT} value={motivo} onChange={(e) => setMotivo(e.target.value)} minLength={5} required />
          </Campo>
          <div className="flex gap-2">
            <Botao type="submit" tipo="perigo">
              Confirmar
            </Botao>
            <Botao tipo="fantasma" onClick={() => setCancelando(false)}>
              Voltar
            </Botao>
          </div>
        </form>
      )}
    </>
  );
}

// ================================================================== competições

const METRICAS_COMPETICAO: { metrica: Metrica; unidade: CompeticaoCad['unidade'] }[] = [
  { metrica: 'PERCENTUAL_META', unidade: 'percentual' },
  { metrica: 'EVOLUCAO', unidade: 'pp' },
  { metrica: 'SCORE', unidade: 'pontos' },
  { metrica: 'PA', unidade: 'pontos' },
  { metrica: 'TICKET', unidade: 'pontos' },
];

export function Competicoes() {
  const { estado, alterar, dados } = useFase1();
  const [aberta, setAberta] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [nova, setNova] = useState<CompeticaoCad>(() => ({ id: '', nome: '', tipo: 'VENDEDOR', formato: 'SEMANAL', metrica: 'PERCENTUAL_META', unidade: 'percentual', valoresDemo: null, escopo: 'TODAS', regra: '', inicio: '2026-10-26T09:00:00', fim: '2026-10-31T22:00:00', status: 'RASCUNHO', premioIds: [] }));
  const validacao = validarCompeticao(nova);

  function transicao(c: CompeticaoCad, status: StatusCiclo, acao: string) {
    alterar((st) => {
      st.competicoes.find((x) => x.id === c.id)!.status = status;
    }, { acao, entidade: `Competição “${c.nome}”`, antes: ROTULO_STATUS[c.status], depois: ROTULO_STATUS[status] });
    setFeedback(`${acao}: ${c.nome}.`);
  }

  return (
    <>
      <TituloPagina titulo="Competições" descricao="Disputas com período, regra e prêmio. Individual, loja × loja, evolução, % meta, PA, ticket e score." acoes={<Botao tipo="primario" onClick={() => setCriando((v) => !v)}>+ Nova competição</Botao>} />
      <Feedback texto={feedback} />
      {criando && (
        <Bloco titulo="Nova competição">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Campo rotulo="Nome">
              <input className={INPUT} value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} />
            </Campo>
            <Campo rotulo="Tipo">
              <select className={INPUT} value={nova.tipo} onChange={(e) => setNova({ ...nova, tipo: e.target.value as CompeticaoCad['tipo'], ...(e.target.value === 'LOJA' ? { metrica: null, unidade: 'pontos' } : {}) })}>
                <option value="VENDEDOR">Individual</option>
                <option value="EVOLUCAO">Evolução</option>
                <option value="LOJA">Loja × Loja</option>
              </select>
            </Campo>
            {nova.tipo !== 'LOJA' && (
              <Campo rotulo="Indicador">
                <select
                  className={INPUT}
                  value={nova.metrica ?? ''}
                  onChange={(e) => {
                    const m = METRICAS_COMPETICAO.find((x) => x.metrica === e.target.value)!;
                    setNova({ ...nova, metrica: m.metrica, unidade: m.unidade });
                  }}
                >
                  {METRICAS_COMPETICAO.map((m) => (
                    <option key={m.metrica} value={m.metrica}>
                      {UNIDADE_METRICA[m.metrica].rotulo}
                    </option>
                  ))}
                </select>
              </Campo>
            )}
            <Campo rotulo="Formato">
              <select className={INPUT} value={nova.formato} onChange={(e) => setNova({ ...nova, formato: e.target.value as CompeticaoCad['formato'] })}>
                <option value="SEMANAL">Semanal</option>
                <option value="MENSAL">Mensal</option>
                <option value="ESPECIAL">Especial</option>
              </select>
            </Campo>
            <Campo rotulo="Início">
              <input type="date" className={INPUT} value={paraInput(nova.inicio)} onChange={(e) => setNova({ ...nova, inicio: `${e.target.value}T09:00:00` })} />
            </Campo>
            <Campo rotulo="Fim">
              <input type="date" className={INPUT} value={paraInput(nova.fim)} onChange={(e) => setNova({ ...nova, fim: `${e.target.value}T22:00:00` })} />
            </Campo>
            <Campo rotulo="Abrangência">
              <select className={INPUT} value={nova.escopo} onChange={(e) => setNova({ ...nova, escopo: e.target.value as CompeticaoCad['escopo'] })}>
                <option value="TODAS">Todas as lojas</option>
                <option value="MINHA_LOJA">Cada loja disputa entre si</option>
              </select>
            </Campo>
            <Campo rotulo="Prêmio">
              <select className={INPUT} value={nova.premioIds[0] ?? ''} onChange={(e) => setNova({ ...nova, premioIds: e.target.value ? [e.target.value] : [] })}>
                <option value="">Escolha…</option>
                {estado.premios.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </Campo>
            <div className="sm:col-span-2 lg:col-span-3">
              <Campo rotulo="Regra (o vendedor lê)">
                <input className={INPUT} value={nova.regra} onChange={(e) => setNova({ ...nova, regra: e.target.value })} />
              </Campo>
            </div>
          </div>
          <div className="mt-3">
            <ChecklistValidacao itens={validacao} />
          </div>
          <div className="mt-3 flex gap-2">
            <Botao
              tipo="primario"
              disabled={!validacao.every((v) => v.ok)}
              onClick={() => {
                const st = statusAoPublicar(nova.inicio, AGORA_DEMO);
                const final = { ...nova, id: novoId('c'), status: st };
                alterar((s) => {
                  s.competicoes.unshift(final);
                }, { acao: 'Publicou competição', entidade: `Competição “${final.nome}”`, depois: ROTULO_STATUS[st] });
                setCriando(false);
                setFeedback(`Competição “${final.nome}” ${st === 'ATIVA' ? 'publicada' : 'programada'}.`);
              }}
            >
              Publicar
            </Botao>
            <Botao tipo="fantasma" onClick={() => setCriando(false)}>
              Cancelar
            </Botao>
          </div>
        </Bloco>
      )}
      <ul className="flex flex-col gap-3">
        {estado.competicoes.map((c) => {
          const visao = dados.competicoes.find((x) => x.id === c.id);
          const premios = c.premioIds.map((pid) => estado.premios.find((p) => p.id === pid)?.nome).filter(Boolean).join(' + ');
          return (
            <li key={c.id}>
              <Bloco>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusCicloPill status={c.status} />
                  <Selo>{c.tipo === 'LOJA' ? 'Loja × Loja' : c.tipo === 'EVOLUCAO' ? 'Evolução' : c.tipo === 'CATEGORIA' ? 'Categoria' : 'Individual'}</Selo>
                  <span className="text-xs text-slate-400">{periodo(c.inicio, c.fim)}</span>
                </div>
                <h2 className="mt-2 font-bold text-white">{c.nome}</h2>
                <p className="text-sm text-slate-400">{c.regra}</p>
                <p className="mt-1 text-xs text-slate-300">🎁 {premios || 'sem prêmio'} · {c.metrica ? UNIDADE_METRICA[c.metrica].rotulo : c.tipo === 'LOJA' ? 'pontuação de loja' : 'indicador próprio'}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {visao && visao.participantes.length > 0 && (
                    <Botao tipo="fantasma" onClick={() => setAberta(aberta === c.id ? null : c.id)}>
                      {aberta === c.id ? 'Ocultar classificação' : `Classificação (${visao.participantes.length})`}
                    </Botao>
                  )}
                  {c.status === 'RASCUNHO' && <Botao onClick={() => transicao(c, statusAoPublicar(c.inicio, AGORA_DEMO), 'Publicou competição')}>Publicar</Botao>}
                  {c.status === 'ATIVA' && <Botao onClick={() => transicao(c, 'ENCERRADA', 'Encerrou competição')}>Encerrar</Botao>}
                  {(c.status === 'ATIVA' || c.status === 'PROGRAMADA') && (
                    <Botao tipo="perigo" onClick={() => transicao(c, 'CANCELADA', 'Cancelou competição')}>
                      Cancelar
                    </Botao>
                  )}
                </div>
                {aberta === c.id && visao && (
                  <ol className="mt-3 divide-y divide-slate-800 rounded-xl bg-slate-800/50 text-sm">
                    {visao.participantes.map((p, i) => (
                      <li key={p.id} className="flex justify-between px-3 py-2">
                        <span className="text-slate-200">
                          {i + 1}º {p.nome}
                        </span>
                        <span className="font-semibold text-white">{p.valor.toLocaleString('pt-BR')}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </Bloco>
            </li>
          );
        })}
      </ul>
      <AvisoSimulacao>“Cada loja disputa entre si” mostra no Admin a classificação da loja da persona (Caruaru). Regras críticas de competição ativa não são editáveis — cancele e crie outra.</AvisoSimulacao>
    </>
  );
}

// ================================================================== premiações

export function Premiacoes() {
  const { estado, alterar } = useFase1();
  const [novo, setNovo] = useState<Omit<Premio, 'id'>>({ nome: '', tipo: 'DIGITAL', xp: 0, moedas: 0, badge: null, categoria: null, descricao: '' });
  const [erro, setErro] = useState<string | null>(null);
  const usadoEm = (pid: string) => [
    ...estado.campanhas.filter((c) => c.frentes.some((f) => f.premioId === pid)).map((c) => `Campanha ${c.nome}`),
    ...estado.competicoes.filter((c) => c.premioIds.includes(pid)).map((c) => `Competição ${c.nome}`),
    ...estado.missoes.filter((m) => m.premioId === pid).map((m) => `Missão ${m.nome}`),
  ];

  return (
    <>
      <TituloPagina titulo="Premiações" descricao="O que o vendedor pode ganhar. Recompensa digital entra pelo ledger; prêmio empresarial é informativo — o sistema não paga nada." />
      {(['DIGITAL', 'EMPRESARIAL'] as const).map((tipo) => (
        <Bloco key={tipo} titulo={tipo === 'DIGITAL' ? 'Recompensa digital (XP, VendaCoins, badge)' : 'Prêmio empresarial (dinheiro, vale, produto, experiência)'}>
          <ul className="grid gap-2 md:grid-cols-2">
            {estado.premios
              .filter((p) => p.tipo === tipo)
              .map((p) => {
                const usos = usadoEm(p.id);
                return (
                  <li key={p.id} className="rounded-xl bg-slate-800/70 p-3 text-sm">
                    <p className="font-semibold text-white">{p.nome}</p>
                    <p className="text-slate-300">{tipo === 'DIGITAL' ? descreverPremio(p) : `${p.categoria ? { DINHEIRO: 'Dinheiro', VALE: 'Vale', PRODUTO: 'Produto', EXPERIENCIA: 'Experiência', OUTRO: 'Outro' }[p.categoria] : ''} · ${p.descricao}`}</p>
                    <p className="mt-1 text-xs text-slate-400">{usos.length ? `Usado em: ${usos.join(' · ')}` : 'Ainda não usado'}</p>
                  </li>
                );
              })}
          </ul>
        </Bloco>
      ))}
      <Bloco titulo="Cadastrar prêmio">
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (novo.nome.trim().length < 3) return setErro('Dê um nome ao prêmio.');
            if (novo.tipo === 'DIGITAL' && !novo.xp && !novo.moedas && !novo.badge) return setErro('Recompensa digital precisa de XP, VendaCoins ou badge.');
            if (novo.tipo === 'EMPRESARIAL' && !novo.categoria) return setErro('Escolha a categoria do prêmio empresarial.');
            setErro(null);
            alterar((st) => {
              st.premios.push({ ...novo, id: novoId('p'), nome: novo.nome.trim() });
            }, { acao: 'Cadastrou prêmio', entidade: `Prêmio “${novo.nome.trim()}”`, depois: novo.tipo === 'DIGITAL' ? descreverPremio({ ...novo }) : novo.descricao });
            setNovo({ nome: '', tipo: 'DIGITAL', xp: 0, moedas: 0, badge: null, categoria: null, descricao: '' });
          }}
        >
          <Campo rotulo="Nome">
            <input className={INPUT} value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
          </Campo>
          <Campo rotulo="Tipo">
            <select className={INPUT} value={novo.tipo} onChange={(e) => setNovo({ ...novo, tipo: e.target.value as Premio['tipo'] })}>
              <option value="DIGITAL">Recompensa digital</option>
              <option value="EMPRESARIAL">Prêmio empresarial</option>
            </select>
          </Campo>
          {novo.tipo === 'DIGITAL' ? (
            <>
              <Campo rotulo="XP">
                <input type="number" min={0} className={INPUT} value={novo.xp} onChange={(e) => setNovo({ ...novo, xp: Number(e.target.value) })} />
              </Campo>
              <Campo rotulo="VendaCoins">
                <input type="number" min={0} className={INPUT} value={novo.moedas} onChange={(e) => setNovo({ ...novo, moedas: Number(e.target.value) })} />
              </Campo>
            </>
          ) : (
            <>
              <Campo rotulo="Categoria">
                <select className={INPUT} value={novo.categoria ?? ''} onChange={(e) => setNovo({ ...novo, categoria: (e.target.value || null) as Premio['categoria'] })}>
                  <option value="">Escolha…</option>
                  <option value="DINHEIRO">Dinheiro</option>
                  <option value="VALE">Vale</option>
                  <option value="PRODUTO">Produto</option>
                  <option value="EXPERIENCIA">Experiência</option>
                  <option value="OUTRO">Outro</option>
                </select>
              </Campo>
              <Campo rotulo="Descrição (como será entregue)">
                <input className={INPUT} value={novo.descricao} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} />
              </Campo>
            </>
          )}
          <div className="self-end">
            <Botao type="submit" tipo="primario">
              Cadastrar prêmio
            </Botao>
          </div>
          {erro && (
            <p role="alert" className="text-sm text-rose-300 sm:col-span-2 lg:col-span-3">
              {erro}
            </p>
          )}
        </form>
      </Bloco>
      <AvisoSimulacao>VendaCoins nunca viram dinheiro. Prêmio empresarial é só registro — pagamento e entrega ficam fora do sistema.</AvisoSimulacao>
    </>
  );
}
