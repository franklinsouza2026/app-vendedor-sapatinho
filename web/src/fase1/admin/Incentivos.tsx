/**
 * Incentivos: campanhas (assistente em 10 etapas), missões (templates
 * governados, produtos, CRUD), competições e premiações — tudo pela API real.
 *
 * Ciclo de vida decidido pelo SERVIDOR: RASCUNHO → PROGRAMADA/ATIVA (pela
 * data) → ENCERRADA → ARQUIVADA, ou CANCELADA. Depois que começa, regra
 * crítica não muda (o servidor recusa): cancelar e duplicar. Publicar exige a
 * checagem verde — a mesma validação que o servidor aplica.
 */
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { regrasEditaveis, ROTULO_STATUS, type ItemValidacao } from '../dominio/admin';
import type { Missao, TipoMissao } from '../dominio/tipos';
import { CardMissao, ROTULO_TIPO_MISSAO } from '../componentes/blocos';
import { Abas } from '../componentes/ui';
import { dataCurta, periodo, reaisCentavos } from '../formato';
import { acaoCampanha, acaoCompeticao, acaoMissao, atualizarCampanha, atualizarMissao, criarCampanha, criarCompeticao, criarMissao, criarPremio, criarProduto, validarCampanha, validarMissao, type CampanhaEntrada, type CompeticaoEntrada, type MissaoEntrada } from './api';
import { useAdmin } from './AdminDados';
import type { CampanhaCad, CompeticaoCad, FrenteCampanha, MissaoCad, Premio, StatusCiclo } from './tiposAdmin';
import { Bloco, Botao, Campo, ChecklistValidacao, Feedback, INPUT, LinkBotao, MolduraCelular, Selo, StatusCicloPill, TabelaResponsiva, TituloPagina } from './ui';

// ------------------------------------------------------------------ datas (fuso do navegador do Admin = fuso da loja)

function paraInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function deInput(data: string, fimDoDia = false): string {
  return new Date(`${data}T${fimDoDia ? '23:59:59' : '00:00:00'}`).toISOString();
}
function hojeMais(dias: number, fimDoDia = false): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return deInput(paraInput(d.toISOString()), fimDoDia);
}

export function descreverPremio(p: Pick<Premio, 'tipo' | 'nome' | 'xp' | 'moedas' | 'badge'>): string {
  if (p.tipo === 'EMPRESARIAL') return p.nome;
  const partes = [p.xp ? `+${p.xp} XP` : '', p.moedas ? `+${p.moedas} VendaCoins` : '', p.badge ? `badge “${p.nome}”` : ''].filter(Boolean);
  return partes.join(' · ') || p.nome;
}

/** Validação do SERVIDOR (fonte única), refeita com pequeno atraso enquanto o Admin edita. */
function useValidacaoServidor<T>(validar: (d: T) => Promise<{ itens: ItemValidacao[] }>, dado: T, ativo: boolean) {
  const [itens, setItens] = useState<ItemValidacao[] | null>(null);
  const chave = JSON.stringify(dado);
  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    const t = setTimeout(() => {
      validar(dado)
        .then((r) => vivo && setItens(r.itens))
        .catch(() => vivo && setItens([{ ok: false, rotulo: 'Dados', problema: 'Preencha os campos obrigatórios (nome, datas e textos).' }]));
    }, 350);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, ativo]);
  return itens;
}

function lojasTexto(lojas: 'TODAS' | string[], nomes: (id: string) => string) {
  return lojas === 'TODAS' ? 'Todas as lojas' : lojas.map(nomes).join(', ') || 'nenhuma';
}

function SeletorLojas({ valor, onMudar, desabilitado }: { valor: 'TODAS' | string[]; onMudar: (v: 'TODAS' | string[]) => void; desabilitado?: boolean }) {
  const { estado } = useAdmin();
  return (
    <fieldset className="flex flex-col gap-1" disabled={desabilitado}>
      <legend className="mb-1 text-sm font-medium text-slate-200">Lojas participantes</legend>
      <label className="flex min-h-[40px] items-center gap-2 text-sm text-slate-200">
        <input type="checkbox" className="h-5 w-5 accent-amber-500" checked={valor === 'TODAS'} onChange={(e) => onMudar(e.target.checked ? 'TODAS' : [])} /> Todas as lojas
      </label>
      {valor !== 'TODAS' &&
        estado.lojas
          .filter((l) => l.status === 'ATIVA')
          .map((l) => (
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

function FormCancelar({ onConfirmar, onVoltar, rotulo }: { onConfirmar: (motivo: string) => void; onVoltar: () => void; rotulo: string }) {
  const [motivo, setMotivo] = useState('');
  return (
    <form
      className="grid max-w-xl gap-2 rounded-2xl border border-rose-500/40 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (motivo.trim().length >= 5) onConfirmar(motivo.trim());
      }}
    >
      <Campo rotulo={rotulo}>
        <input className={INPUT} value={motivo} onChange={(e) => setMotivo(e.target.value)} minLength={5} required />
      </Campo>
      <div className="flex gap-2">
        <Botao type="submit" tipo="perigo">
          Confirmar cancelamento
        </Botao>
        <Botao tipo="fantasma" onClick={onVoltar}>
          Voltar
        </Botao>
      </div>
    </form>
  );
}

// ================================================================== campanhas — lista

export function Campanhas() {
  const { estado, executar } = useAdmin();
  const navegar = useNavigate();
  const [aba, setAba] = useState<'vigentes' | 'rascunhos' | 'historico'>('vigentes');
  const [feedback, setFeedback] = useState<string | null>(null);
  const lista = estado.campanhas.filter((c) => (aba === 'vigentes' ? c.status === 'ATIVA' || c.status === 'PROGRAMADA' : aba === 'rascunhos' ? c.status === 'RASCUNHO' : ['ENCERRADA', 'ARQUIVADA', 'CANCELADA'].includes(c.status)));
  const lojaNome = (id: string) => estado.lojas.find((l) => l.id === id)?.nome ?? id;

  async function duplicar(c: CampanhaCad) {
    let nova: CampanhaCad | null = null;
    const erro = await executar(async () => {
      nova = await acaoCampanha(c.id, 'duplicar');
    });
    if (erro) return setFeedback(erro);
    navegar(`/admin/campanhas/${(nova as unknown as CampanhaCad).id}`);
  }

  return (
    <>
      <TituloPagina titulo="Campanhas" descricao="Programas de incentivo que reúnem competições, meta e missões, com premiação." acoes={<LinkBotao para="/admin/campanhas/nova" tipo="primario">+ Nova campanha</LinkBotao>} />
      <Feedback texto={feedback} />
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
                <LinkBotao para={`/admin/campanhas/${c.id}`}>{regrasEditaveis(c.status) ? 'Editar' : 'Abrir'}</LinkBotao>
                <Botao tipo="fantasma" onClick={() => void duplicar(c)}>
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

const PRESETS_FRENTE: Omit<FrenteCampanha, 'id' | 'refId'>[] = [
  { icone: '🏆', titulo: 'Top vendedor', mecanismo: 'COMPETICAO', premioId: null },
  { icone: '🌱', titulo: 'Maior evolução', mecanismo: 'COMPETICAO', premioId: null },
  { icone: '🎯', titulo: 'Meta batida', mecanismo: 'META_MES', premioId: null },
  { icone: '🏬', titulo: 'Loja campeã', mecanismo: 'COMPETICAO', premioId: null },
  { icone: '🔥', titulo: 'Desafio semanal', mecanismo: 'COMPETICAO', premioId: null },
  { icone: '✅', titulo: 'Missão da campanha', mecanismo: 'MISSAO', premioId: null },
];

function campanhaVazia(): CampanhaEntrada {
  return { nome: '', descricao: '', objetivo: '', inicio: hojeMais(1), fim: hojeMais(30, true), lojas: 'TODAS', frentes: [], regras: '' };
}

let seqFrente = 0;
const idFrente = () => `fr-${Date.now().toString(36)}-${++seqFrente}`;

export function EditorCampanha() {
  const { id } = useParams();
  const { estado, executar } = useAdmin();
  const navegar = useNavigate();
  const existente = id ? estado.campanhas.find((c) => c.id === id) : undefined;
  const [c, setC] = useState<CampanhaEntrada>(() => (existente ? { nome: existente.nome, descricao: existente.descricao, objetivo: existente.objetivo, inicio: existente.inicio, fim: existente.fim, lojas: existente.lojas, frentes: existente.frentes, regras: existente.regras } : campanhaVazia()));
  const status: StatusCiclo = existente?.status ?? 'RASCUNHO';
  const [etapa, setEtapa] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const editavel = regrasEditaveis(status);
  const validacao = useValidacaoServidor(validarCampanha, c, editavel) ?? [];
  const ok = validacao.length > 0 && validacao.every((v) => v.ok);
  const premio = (pid: string | null) => estado.premios.find((p) => p.id === pid);

  if (id && !existente) return <TituloPagina titulo="Campanha não encontrada" voltar={{ para: '/admin/campanhas', texto: 'Campanhas' }} />;

  async function salvar(): Promise<string | null> {
    let salva: CampanhaCad | null = null;
    const erro = await executar(async () => {
      salva = existente ? await atualizarCampanha(existente.id, c) : await criarCampanha(c);
    });
    if (erro) {
      setFeedback(erro);
      return null;
    }
    const nova = salva as unknown as CampanhaCad;
    if (!existente) navegar(`/admin/campanhas/${nova.id}`, { replace: true });
    return nova.id;
  }

  async function acao(a: 'publicar' | 'encerrar' | 'cancelar' | 'arquivar' | 'duplicar', okTexto: string, motivo?: string) {
    let alvoId = existente?.id ?? null;
    if (a === 'publicar' && (!alvoId || editavel)) alvoId = await salvar();
    if (!alvoId) return;
    let r: CampanhaCad | null = null;
    const erro = await executar(async () => {
      r = await acaoCampanha(alvoId!, a, motivo);
    });
    setFeedback(erro ?? okTexto);
    if (!erro && a === 'duplicar') navegar(`/admin/campanhas/${(r as unknown as CampanhaCad).id}`);
    if (!erro) setCancelando(false);
  }

  const corpo: Record<(typeof ETAPAS)[number], ReactNode> = {
    Identidade: (
      <div className="grid gap-3">
        <Campo rotulo="Nome da campanha">
          <input className={INPUT} value={c.nome} disabled={!editavel} onChange={(e) => setC({ ...c, nome: e.target.value })} placeholder="Ex.: Novembro Black" />
        </Campo>
        <Campo rotulo="Descrição para o vendedor" ajuda="Aparece no topo da campanha no app.">
          <textarea rows={3} className={`${INPUT} py-2`} value={c.descricao} disabled={!editavel} onChange={(e) => setC({ ...c, descricao: e.target.value })} />
        </Campo>
      </div>
    ),
    Período: (
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Início">
          <input type="date" className={INPUT} disabled={!editavel} value={paraInput(c.inicio)} onChange={(e) => e.target.value && setC({ ...c, inicio: deInput(e.target.value) })} />
        </Campo>
        <Campo rotulo="Fim">
          <input type="date" className={INPUT} disabled={!editavel} value={paraInput(c.fim)} onChange={(e) => e.target.value && setC({ ...c, fim: deInput(e.target.value, true) })} />
        </Campo>
        <p className="text-xs text-slate-400 sm:col-span-2">Se começar no futuro, a campanha fica PROGRAMADA e entra no ar sozinha na data. No fim do período ela encerra sozinha e o resultado fica congelado.</p>
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
        <p className="text-sm text-slate-400">Frentes da campanha. Cada frente aponta para uma competição, para a meta do período ou para uma missão.</p>
        <ul className="flex flex-col gap-2">
          {c.frentes.map((f) => (
            <li key={f.id} className="flex flex-col gap-2 rounded-xl bg-slate-800/70 p-3 sm:flex-row sm:items-center">
              <span className="flex-1 text-sm text-white">
                {f.icone} {f.titulo}
              </span>
              {f.mecanismo === 'META_MES' ? (
                <span className="text-xs text-slate-400">Bater 100% da meta do período</span>
              ) : (
                <label className="sm:w-72">
                  <span className="sr-only">
                    {f.mecanismo === 'COMPETICAO' ? 'Competição' : 'Missão'} de {f.titulo}
                  </span>
                  <select className={INPUT} disabled={!editavel} value={f.refId ?? ''} onChange={(e) => setC({ ...c, frentes: c.frentes.map((x) => (x.id === f.id ? { ...x, refId: e.target.value || null } : x)) })}>
                    <option value="">{f.mecanismo === 'COMPETICAO' ? 'Escolha a competição…' : 'Escolha a missão…'}</option>
                    {(f.mecanismo === 'COMPETICAO' ? estado.competicoes : estado.missoes)
                      .filter((x) => x.status !== 'CANCELADA' && x.status !== 'ARQUIVADA')
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.nome} ({ROTULO_STATUS[x.status].toLowerCase()})
                        </option>
                      ))}
                  </select>
                </label>
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
              <Botao key={p.titulo} onClick={() => setC({ ...c, frentes: [...c.frentes, { ...p, id: idFrente(), refId: null }] })}>
                + {p.icone} {p.titulo}
              </Botao>
            ))}
          </div>
        )}
        {editavel && estado.competicoes.length === 0 && (
          <p className="text-xs text-slate-400">
            Ainda não há competições.{' '}
            <Link to="/admin/competicoes" className="text-accentSoft underline">
              Crie em Competições
            </Link>{' '}
            e volte.
          </p>
        )}
      </div>
    ),
    Recompensas: (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-slate-400">Escolha o prêmio de cada frente. Recompensa digital (XP, VendaCoins, badge) entra pelo ledger ao encerrar; prêmio empresarial é informativo.</p>
        {c.frentes.length === 0 && <p className="text-sm text-amber-200">Inclua frentes na etapa Mecânica.</p>}
        {c.frentes.map((f) => (
          <label key={f.id} className="flex flex-col gap-1 rounded-xl bg-slate-800/70 p-3 sm:flex-row sm:items-center">
            <span className="flex-1 text-sm text-white">
              {f.icone} {f.titulo}
            </span>
            <select className={`${INPUT} sm:w-72`} disabled={!editavel} value={f.premioId ?? ''} onChange={(e) => setC({ ...c, frentes: c.frentes.map((x) => (x.id === f.id ? { ...x, premioId: e.target.value || null } : x)) })}>
              <option value="">Sem prêmio</option>
              <optgroup label="Recompensa digital">
                {estado.premios
                  .filter((p) => p.tipo === 'DIGITAL')
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome} — {descreverPremio(p)}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Prêmio empresarial">
                {estado.premios
                  .filter((p) => p.tipo === 'EMPRESARIAL')
                  .map((p) => (
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
        <p className="text-sm text-slate-400">Resumo do que a empresa se compromete a entregar. O sistema não paga nada — prêmio empresarial é registro administrativo.</p>
        <ul className="flex flex-col gap-2 text-sm">
          {c.frentes.map((f) => {
            const p = premio(f.premioId);
            return (
              <li key={f.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-800/70 px-3 py-2">
                <span className="text-white">
                  {f.icone} {f.titulo}
                </span>
                {p ? (
                  <Selo tom={p.tipo === 'DIGITAL' ? 'info' : 'ok'}>
                    {p.tipo === 'DIGITAL' ? 'Digital' : 'Empresarial'} · {p.nome}
                  </Selo>
                ) : (
                  <Selo tom="erro">sem prêmio</Selo>
                )}
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-slate-400">
          Precisa de um prêmio novo?{' '}
          <Link to="/admin/premiacoes" className="text-accentSoft underline">
            Cadastre em Premiações
          </Link>{' '}
          e volte.
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
        {editavel && <ChecklistValidacao itens={validacao} />}
        <MolduraCelular>
          <div className="rounded-2xl border border-accent/30 bg-gradient-to-br from-surface to-accent/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-accentSoft">Campanha · {periodo(c.inicio, c.fim)}</p>
            <p className="mt-1 text-xl font-extrabold text-white">{c.nome || 'Sem nome'}</p>
            <p className="mt-1 text-sm text-slate-300">{c.descricao || '—'}</p>
          </div>
          {c.frentes.map((f) => {
            const p = premio(f.premioId);
            const ref = f.mecanismo === 'COMPETICAO' ? estado.competicoes.find((x) => x.id === f.refId)?.nome : f.mecanismo === 'MISSAO' ? estado.missoes.find((x) => x.id === f.refId)?.nome : 'Bater 100% da meta do período';
            return (
              <div key={f.id} className="flex gap-3 rounded-2xl border border-slate-700/60 bg-surface p-3">
                <span aria-hidden="true" className="text-2xl">
                  {f.icone}
                </span>
                <div>
                  <p className="font-semibold text-white">{f.titulo}</p>
                  <p className="text-sm text-slate-400">{ref ?? '—'}</p>
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
        {editavel && <ChecklistValidacao itens={validacao} />}
        {status === 'RASCUNHO' && <p className="text-sm text-slate-300">Ao publicar, a campanha fica {new Date(c.inicio) > new Date() ? `PROGRAMADA e entra no ar em ${dataCurta(c.inicio)}.` : 'ATIVA e aparece agora no app dos vendedores.'}</p>}
      </div>
    ),
  };

  return (
    <>
      <TituloPagina titulo={c.nome || 'Nova campanha'} voltar={{ para: '/admin/campanhas', texto: 'Campanhas' }} acoes={<StatusCicloPill status={status} />} />
      <AvisoBloqueio status={status} onDuplicar={() => void acao('duplicar', 'Cópia criada como rascunho.')} />
      <Feedback texto={feedback} />

      <ol className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" aria-label="Etapas da campanha">
        {ETAPAS.map((e, i) => (
          <li key={e}>
            <button onClick={() => setEtapa(i)} aria-current={i === etapa ? 'step' : undefined} className={`min-h-[40px] whitespace-nowrap rounded-full px-3 text-xs font-semibold ${i === etapa ? 'bg-white text-slate-900' : 'bg-surface text-slate-300 ring-1 ring-slate-700'}`}>
              {i + 1}. {e}
            </button>
          </li>
        ))}
      </ol>

      <Bloco titulo={`${etapa + 1}. ${ETAPAS[etapa]}`}>{corpo[ETAPAS[etapa]]}</Bloco>

      {existente?.resultado && (
        <Bloco titulo="Resultado congelado">
          <ul className="text-sm text-slate-200">
            {existente.resultado.map((r) => (
              <li key={r.frenteId}>
                🏆 {existente.frentes.find((f) => f.id === r.frenteId)?.titulo}: {r.vencedor} — {r.premio}
              </li>
            ))}
          </ul>
        </Bloco>
      )}

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
        {editavel && <Botao onClick={() => void salvar().then((r) => r && setFeedback(status === 'RASCUNHO' ? 'Rascunho salvo.' : 'Alterações salvas.'))}>{status === 'RASCUNHO' ? 'Salvar rascunho' : 'Salvar alterações'}</Botao>}
        {status === 'RASCUNHO' && (
          <Botao tipo="primario" disabled={!ok} titulo={ok ? undefined : 'Resolva as pendências da checagem'} onClick={() => void acao('publicar', 'Campanha publicada.')}>
            Publicar
          </Botao>
        )}
        {status === 'ATIVA' && <Botao onClick={() => void acao('encerrar', 'Campanha encerrada. Resultado congelado e prêmios digitais creditados.')}>Encerrar</Botao>}
        {(status === 'ATIVA' || status === 'PROGRAMADA') && (
          <Botao tipo="perigo" onClick={() => setCancelando(true)}>
            Cancelar campanha
          </Botao>
        )}
        {status === 'ENCERRADA' && <Botao onClick={() => void acao('arquivar', 'Campanha arquivada.')}>Arquivar</Botao>}
        {existente && <Botao onClick={() => void acao('duplicar', 'Cópia criada como rascunho.')}>Duplicar</Botao>}
      </div>

      {cancelando && <FormCancelar rotulo="Motivo do cancelamento (obrigatório, vai para a auditoria)" onVoltar={() => setCancelando(false)} onConfirmar={(m) => void acao('cancelar', 'Campanha cancelada. Os vendedores deixam de vê-la; nada é apagado.', m)} />}
    </>
  );
}

// ================================================================== missões

const TEMPLATES: { id: string; titulo: string; icone: string; descricao: string; base: Partial<MissaoEntrada> }[] = [
  { id: 'PRODUTO_SEMANA', titulo: 'Produto da Semana', icone: '👠', descricao: 'Venda X pares de uma referência.', base: { tipo: 'PRODUTO_SEMANA', unidade: 'par', alvo: 3, xp: 30, moedas: 10, regras: 'Conta par vendido da referência, qualquer numeração.' } },
  { id: 'DESAFIO_PA', titulo: 'Desafio de PA', icone: '👟', descricao: 'Vendas com 2 peças ou mais.', base: { tipo: 'SEMANAL', unidade: 'venda', alvo: 5, xp: 40, moedas: 15, regras: 'Venda com 2+ peças no mesmo cupom.', parametros: { minimoPares: 2 } } },
  { id: 'SPRINT_META', titulo: 'Sprint de Meta', icone: '🎯', descricao: 'X vendas no período.', base: { tipo: 'DIARIA', unidade: 'venda', alvo: 8, xp: 20, moedas: 5, regras: 'Conta toda venda finalizada no período.' } },
  { id: 'PONTA_ESTOQUE', titulo: 'Ponta de Estoque', icone: '📦', descricao: 'Girar uma seleção de produtos.', base: { tipo: 'PONTA_ESTOQUE', unidade: 'par', alvo: 6, xp: 35, moedas: 15, regras: 'Qualquer par das referências selecionadas.' } },
  { id: 'CATEGORIA', titulo: 'Categoria', icone: '👜', descricao: 'Vender uma categoria (bolsa, tênis…).', base: { tipo: 'CATEGORIA', unidade: 'venda', alvo: 4, xp: 30, moedas: 10, regras: 'Cupom com ao menos 1 item da categoria.' } },
  { id: 'SUPERACAO', titulo: 'Superação Pessoal', icone: '🚀', descricao: 'Dias com ticket acima de um valor.', base: { tipo: 'PERFORMANCE', unidade: 'dia', alvo: 3, xp: 40, moedas: 15, regras: 'Dia com ticket médio acima do valor definido.' } },
  { id: 'CONSISTENCIA', titulo: 'Consistência', icone: '🔥', descricao: 'Bater a meta X dias trabalhados seguidos.', base: { tipo: 'CONSISTENCIA', unidade: 'dia', alvo: 5, xp: 50, moedas: 20, regras: 'Dias trabalhados seguidos com a meta do dia batida (folga não quebra).' } },
];

/** Unidades que cada template mede (o servidor aplica a mesma regra). */
const UNIDADES_DO_TEMPLATE: Record<string, MissaoCad['unidade'][]> = {
  SPRINT_META: ['venda', 'reais'],
  PRODUTO_SEMANA: ['par', 'venda'],
  PONTA_ESTOQUE: ['par', 'venda'],
  DESAFIO_PA: ['venda'],
  CATEGORIA: ['venda', 'par'],
  SUPERACAO: ['dia'],
  CONSISTENCIA: ['dia'],
};

const CATEGORIAS_PADRAO = ['Salto', 'Rasteira', 'Bolsa', 'Tênis', 'Bota'];

function missaoVazia(template?: (typeof TEMPLATES)[number]): MissaoEntrada {
  return { nome: template ? template.titulo : '', tipo: 'SEMANAL', template: template?.id ?? 'SPRINT_META', descricao: '', unidade: 'venda', alvo: 1, xp: 0, moedas: 0, premioId: null, lojas: 'TODAS', inicio: hojeMais(0), fim: hojeMais(6, true), produtos: [], regras: '', parametros: {}, ...(template?.base ?? {}) };
}

export function Missoes() {
  const { estado, executar } = useAdmin();
  const navegar = useNavigate();
  const [aba, setAba] = useState<'lista' | 'templates' | 'produtos'>('lista');
  const [filtro, setFiltro] = useState<'vigentes' | 'rascunhos' | 'historico'>('vigentes');
  const [feedback, setFeedback] = useState<string | null>(null);
  const lista = estado.missoes.filter((m) => (filtro === 'vigentes' ? m.status === 'ATIVA' || m.status === 'PROGRAMADA' : filtro === 'rascunhos' ? m.status === 'RASCUNHO' : ['ENCERRADA', 'CANCELADA', 'ARQUIVADA'].includes(m.status)));

  async function duplicar(m: MissaoCad) {
    let nova: MissaoCad | null = null;
    const erro = await executar(async () => {
      nova = await acaoMissao(m.id, 'duplicar');
    });
    if (erro) return setFeedback(erro);
    navegar(`/admin/missoes/${(nova as unknown as MissaoCad).id}`);
  }

  return (
    <>
      <TituloPagina titulo="Missões" descricao="Objetivos individuais com recompensa, sempre a partir de um template. O progresso vem das vendas reais — o vendedor não marca nada." acoes={<LinkBotao para="/admin/missoes/nova" tipo="primario">+ Nova missão</LinkBotao>} />
      <Feedback texto={feedback} />
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
              {
                titulo: 'Missão',
                celula: (m) => (
                  <Link to={`/admin/missoes/${m.id}`} className="text-white hover:underline">
                    {m.nome}
                  </Link>
                ),
              },
              { titulo: 'Tipo', celula: (m) => ROTULO_TIPO_MISSAO[m.tipo] },
              { titulo: 'Status', celula: (m) => <StatusCicloPill status={m.status} /> },
              { titulo: 'Período', celula: (m) => periodo(m.inicio, m.fim) },
              { titulo: 'Recompensa', celula: (m) => [m.xp ? `+${m.xp} XP` : '', m.moedas ? `+${m.moedas} 🪙` : ''].filter(Boolean).join(' · ') || '—' },
              {
                titulo: '',
                celula: (m) => (
                  <button onClick={() => void duplicar(m)} className="min-h-[36px] text-sm text-accentSoft underline-offset-2 hover:underline">
                    Duplicar
                  </button>
                ),
              },
            ]}
          />
        </>
      )}
      {aba === 'templates' && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TEMPLATES.map((t) => (
            <li key={t.id}>
              <Link to={`/admin/missoes/nova?template=${t.id}`} className="flex h-full flex-col gap-1 rounded-2xl border border-slate-700/60 bg-surface p-4 hover:border-accentSoft/60">
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

const ICONE_CATEGORIA: Record<string, string> = { Salto: '👠', Rasteira: '🩴', Bolsa: '👜', Tênis: '👟', Bota: '👢' };
const iconeProduto = (categoria: string, foto?: string | null) => (foto && foto.length <= 4 ? foto : (ICONE_CATEGORIA[categoria] ?? '🛍️'));

function Produtos() {
  const { estado, executar } = useAdmin();
  const [novo, setNovo] = useState({ referencia: '', nome: '', categoria: 'Salto', preco: '' });
  const [erro, setErro] = useState<string | null>(null);
  return (
    <>
      <p className="rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-300">A referência precisa ser a mesma do ERP: é ela que liga as vendas recebidas ao Produto da Semana. Quando a integração Linx estiver ativa, o catálogo poderá vir do ERP.</p>
      <TabelaResponsiva
        legenda="Produtos"
        linhas={estado.produtos}
        chave={(p) => p.id}
        vazio="Nenhum produto cadastrado."
        colunas={[
          { titulo: 'Produto', celula: (p) => `${iconeProduto(p.categoria, p.foto)} ${p.nome}` },
          { titulo: 'Referência', celula: (p) => p.referencia },
          { titulo: 'Categoria', celula: (p) => p.categoria },
          { titulo: 'Preço', celula: (p) => reaisCentavos(p.preco), alinhar: 'direita' },
        ]}
      />
      <form
        className="grid gap-2 rounded-2xl border border-slate-700/60 bg-surface p-4 sm:grid-cols-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!novo.referencia.trim()) return setErro('Informe a referência do ERP.');
          setErro(null);
          void executar(() => criarProduto({ referencia: novo.referencia.trim(), nome: novo.nome.trim(), categoria: novo.categoria, preco: Number(novo.preco) || 0 })).then((falha) => {
            if (falha) setErro(falha);
            else setNovo({ referencia: '', nome: '', categoria: novo.categoria, preco: '' });
          });
        }}
      >
        <Campo rotulo="Referência">
          <input className={INPUT} value={novo.referencia} onChange={(e) => setNovo({ ...novo, referencia: e.target.value })} required />
        </Campo>
        <Campo rotulo="Nome">
          <input className={INPUT} value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} required minLength={2} />
        </Campo>
        <Campo rotulo="Categoria">
          <select className={INPUT} value={novo.categoria} onChange={(e) => setNovo({ ...novo, categoria: e.target.value })}>
            {[...CATEGORIAS_PADRAO, 'Outro'].map((c) => (
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
  const { estado, executar } = useAdmin();
  const navegar = useNavigate();
  const existente = id ? estado.missoes.find((m) => m.id === id) : undefined;
  const template = TEMPLATES.find((t) => t.id === params.get('template'));
  const [m, setM] = useState<MissaoEntrada>(() => {
    if (!existente) return missaoVazia(template);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _i, status: _s, ...resto } = existente;
    return resto;
  });
  const status: StatusCiclo = existente?.status ?? 'RASCUNHO';
  const [feedback, setFeedback] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [categoria, setCategoria] = useState('todas');
  const editavel = regrasEditaveis(status);
  const validacao = useValidacaoServidor(validarMissao, m, editavel) ?? [];
  const ok = validacao.length > 0 && validacao.every((v) => v.ok);
  const tpl = TEMPLATES.find((t) => t.id === m.template);
  const unidades = UNIDADES_DO_TEMPLATE[m.template ?? ''] ?? ['venda'];
  const categoriasCatalogo = [...new Set(estado.produtos.map((p) => p.categoria))];
  const premioDigital = estado.premios.find((p) => p.id === m.premioId && p.tipo === 'DIGITAL');

  // Preview com o componente REAL do app da vendedora.
  const preview: Missao = useMemo(
    () => ({
      id: existente?.id ?? 'nova',
      tipo: m.tipo,
      titulo: m.nome || 'Sem nome',
      descricao: m.descricao || '—',
      unidade: m.unidade,
      progresso: 0,
      alvo: Math.max(1, m.alvo),
      recompensa: { xp: m.xp + (premioDigital?.xp ?? 0), moedas: m.moedas + (premioDigital?.moedas ?? 0) },
      terminaEm: m.fim,
      produtos: m.produtos.length ? m.produtos.map((ref) => ({ referencia: ref, nome: estado.produtos.find((p) => p.referencia === ref)?.nome ?? '—' })) : undefined,
      premio: m.premioId ? estado.premios.find((p) => p.id === m.premioId)?.nome : undefined,
    }),
    [m, estado.produtos, estado.premios, existente?.id, premioDigital]
  );

  if (id && !existente) return <TituloPagina titulo="Missão não encontrada" voltar={{ para: '/admin/missoes', texto: 'Missões' }} />;

  async function salvar(): Promise<string | null> {
    let salva: MissaoCad | null = null;
    const erro = await executar(async () => {
      salva = existente ? await atualizarMissao(existente.id, m) : await criarMissao(m);
    });
    if (erro) {
      setFeedback(erro);
      return null;
    }
    const nova = salva as unknown as MissaoCad;
    if (!existente) navegar(`/admin/missoes/${nova.id}`, { replace: true });
    return nova.id;
  }

  async function acao(a: 'publicar' | 'encerrar' | 'cancelar' | 'arquivar' | 'duplicar', okTexto: string, motivo?: string) {
    let alvoId = existente?.id ?? null;
    if (a === 'publicar' && (!alvoId || editavel)) alvoId = await salvar();
    if (!alvoId) return;
    let r: MissaoCad | null = null;
    const erro = await executar(async () => {
      r = await acaoMissao(alvoId!, a, motivo);
    });
    setFeedback(erro ?? okTexto);
    if (!erro && a === 'duplicar') navegar(`/admin/missoes/${(r as unknown as MissaoCad).id}`);
    if (!erro) setCancelando(false);
  }

  const produtosVisiveis = estado.produtos.filter((p) => categoria === 'todas' || p.categoria === categoria);
  const futura = new Date(m.inicio) > new Date();

  return (
    <>
      <TituloPagina titulo={m.nome || 'Nova missão'} voltar={{ para: '/admin/missoes', texto: 'Missões' }} descricao={tpl ? `Template: ${tpl.titulo}` : undefined} acoes={<StatusCicloPill status={status} />} />
      <AvisoBloqueio status={status} onDuplicar={() => void acao('duplicar', 'Cópia criada como rascunho.')} />
      <Feedback texto={feedback} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Bloco titulo="Identidade e objetivo">
            <fieldset disabled={!editavel} className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Template (define como o progresso é contado)">
                <select
                  className={INPUT}
                  value={m.template ?? ''}
                  onChange={(e) => {
                    const t = TEMPLATES.find((x) => x.id === e.target.value)!;
                    setM({ ...m, template: t.id, unidade: UNIDADES_DO_TEMPLATE[t.id][0], parametros: t.base.parametros ?? {} });
                  }}
                >
                  {TEMPLATES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.icone} {t.titulo}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Nome">
                <input className={INPUT} value={m.nome} onChange={(e) => setM({ ...m, nome: e.target.value })} />
              </Campo>
              <Campo rotulo="Tipo (como aparece no app)">
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
                  {unidades.map((u) => (
                    <option key={u} value={u}>
                      {{ venda: 'Vendas', par: 'Pares', dia: 'Dias', reais: 'Reais (R$)' }[u]}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Meta da missão">
                <input type="number" min={1} className={INPUT} value={m.alvo} onChange={(e) => setM({ ...m, alvo: Number(e.target.value) })} />
              </Campo>
              {m.template === 'CATEGORIA' && (
                <Campo rotulo="Categoria">
                  <select className={INPUT} value={String(m.parametros.categoria ?? '')} onChange={(e) => setM({ ...m, parametros: { categoria: e.target.value } })}>
                    <option value="">Escolha…</option>
                    {[...new Set([...categoriasCatalogo, ...CATEGORIAS_PADRAO])].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Campo>
              )}
              {m.template === 'SUPERACAO' && (
                <Campo rotulo="Ticket mínimo do dia (R$)" ajuda="Conta cada dia trabalhado com ticket médio acima deste valor.">
                  <input type="number" min={1} step="0.01" className={INPUT} value={String(m.parametros.ticketMinimo ?? '')} onChange={(e) => setM({ ...m, parametros: { ticketMinimo: Number(e.target.value) } })} />
                </Campo>
              )}
              {m.template === 'DESAFIO_PA' && (
                <Campo rotulo="Mínimo de peças na mesma venda">
                  <input type="number" min={2} max={10} className={INPUT} value={String(m.parametros.minimoPares ?? 2)} onChange={(e) => setM({ ...m, parametros: { minimoPares: Number(e.target.value) } })} />
                </Campo>
              )}
            </fieldset>
          </Bloco>
          <Bloco titulo="Participantes e período">
            <fieldset disabled={!editavel} className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Início">
                <input type="date" className={INPUT} value={paraInput(m.inicio)} onChange={(e) => e.target.value && setM({ ...m, inicio: deInput(e.target.value) })} />
              </Campo>
              <Campo rotulo="Fim">
                <input type="date" className={INPUT} value={paraInput(m.fim)} onChange={(e) => e.target.value && setM({ ...m, fim: deInput(e.target.value, true) })} />
              </Campo>
              <div className="sm:col-span-2">
                <SeletorLojas valor={m.lojas} desabilitado={!editavel} onMudar={(v) => setM({ ...m, lojas: v })} />
              </div>
            </fieldset>
          </Bloco>
          {(m.template === 'PRODUTO_SEMANA' || m.template === 'PONTA_ESTOQUE') && (
            <Bloco titulo="Produtos">
              {estado.produtos.length === 0 ? (
                <p className="text-sm text-amber-200">Cadastre os produtos na aba Produtos (referência igual à do ERP).</p>
              ) : (
                <fieldset disabled={!editavel}>
                  <div className="mb-2 flex flex-wrap gap-2">
                    {['todas', ...categoriasCatalogo].map((c) => (
                      <button key={c} type="button" onClick={() => setCategoria(c)} aria-pressed={categoria === c} className={`min-h-[36px] rounded-full px-3 text-xs font-semibold ${categoria === c ? 'bg-slate-600 text-white' : 'text-slate-300 ring-1 ring-slate-700'}`}>
                        {c === 'todas' ? 'Todas' : c}
                      </button>
                    ))}
                  </div>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {produtosVisiveis.map((p) => (
                      <li key={p.id}>
                        <label className="flex min-h-[44px] items-center gap-2 rounded-xl bg-slate-800/70 px-3 py-2 text-sm text-slate-200">
                          <input type="checkbox" className="h-5 w-5 accent-amber-500" checked={m.produtos.includes(p.referencia)} onChange={(e) => setM({ ...m, produtos: e.target.checked ? [...m.produtos, p.referencia] : m.produtos.filter((x) => x !== p.referencia) })} />
                          <span aria-hidden="true">{iconeProduto(p.categoria, p.foto)}</span>
                          <span className="min-w-0 flex-1 truncate">
                            {p.nome} <span className="text-xs text-slate-400">· Ref. {p.referencia}</span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </fieldset>
              )}
            </Bloco>
          )}
          <Bloco titulo="Recompensa e regras">
            <fieldset disabled={!editavel} className="grid gap-3 sm:grid-cols-3">
              <Campo rotulo="XP">
                <input type="number" min={0} max={1000} className={INPUT} value={m.xp} onChange={(e) => setM({ ...m, xp: Number(e.target.value) })} />
              </Campo>
              <Campo rotulo="VendaCoins">
                <input type="number" min={0} max={1000} className={INPUT} value={m.moedas} onChange={(e) => setM({ ...m, moedas: Number(e.target.value) })} />
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
          {editavel && <ChecklistValidacao itens={validacao} />}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {editavel && <Botao onClick={() => void salvar().then((r) => r && setFeedback(status === 'RASCUNHO' ? 'Rascunho salvo.' : 'Alterações salvas.'))}>{status === 'RASCUNHO' ? 'Salvar rascunho' : 'Salvar alterações'}</Botao>}
        {status === 'RASCUNHO' && (
          <Botao tipo="primario" disabled={!ok} titulo={ok ? undefined : 'Resolva as pendências da checagem'} onClick={() => void acao('publicar', futura ? 'Missão programada.' : 'Missão publicada. Já aparece para os vendedores participantes.')}>
            {futura ? 'Programar' : 'Publicar agora'}
          </Botao>
        )}
        {status === 'ATIVA' && <Botao onClick={() => void acao('encerrar', 'Missão encerrada.')}>Encerrar</Botao>}
        {(status === 'ATIVA' || status === 'PROGRAMADA') && (
          <Botao tipo="perigo" onClick={() => setCancelando(true)}>
            Cancelar missão
          </Botao>
        )}
        {status === 'ENCERRADA' && <Botao onClick={() => void acao('arquivar', 'Missão arquivada.')}>Arquivar</Botao>}
        {existente && <Botao onClick={() => void acao('duplicar', 'Cópia criada como rascunho.')}>Duplicar</Botao>}
      </div>
      {cancelando && <FormCancelar rotulo="Motivo do cancelamento (obrigatório)" onVoltar={() => setCancelando(false)} onConfirmar={(mo) => void acao('cancelar', 'Missão cancelada. Some do app; nada é apagado.', mo)} />}
    </>
  );
}

// ================================================================== competições

const METRICAS_COMPETICAO: { metrica: NonNullable<CompeticaoCad['metrica']>; rotulo: string }[] = [
  { metrica: 'PERCENTUAL_META', rotulo: '% da meta' },
  { metrica: 'EVOLUCAO', rotulo: 'Evolução (p.p.)' },
  { metrica: 'SCORE', rotulo: 'Score do período' },
  { metrica: 'QTD_VENDAS', rotulo: 'Quantidade de vendas' },
  { metrica: 'PA', rotulo: 'PA (peças por atendimento)' },
  { metrica: 'TICKET', rotulo: 'Ticket médio' },
  { metrica: 'PARES_CATEGORIA', rotulo: 'Pares de uma categoria' },
];

function competicaoVazia(): CompeticaoEntrada {
  return { nome: '', tipo: 'VENDEDOR', formato: 'SEMANAL', metrica: 'PERCENTUAL_META', categoria: null, escopo: 'TODAS', lojas: 'TODAS', regra: '', inicio: hojeMais(0), fim: hojeMais(6, true), premioIds: [] };
}

export function Competicoes() {
  const { estado, executar } = useAdmin();
  const [aberta, setAberta] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [nova, setNova] = useState<CompeticaoEntrada>(competicaoVazia);
  const [cancelando, setCancelando] = useState<string | null>(null);
  const lojaNome = (id: string | null) => (id ? (estado.lojas.find((l) => l.id === id)?.nome ?? '—') : '');
  const pendencias = [
    nova.nome.trim().length < 3 && 'Dê um nome.',
    new Date(nova.fim) <= new Date(nova.inicio) && 'O fim precisa ser depois do início.',
    nova.tipo !== 'LOJA' && !nova.metrica && 'Escolha o indicador.',
    nova.metrica === 'PARES_CATEGORIA' && !nova.categoria && 'Escolha a categoria.',
    nova.premioIds.length === 0 && 'Vincule ao menos um prêmio.',
    nova.regra.trim().length === 0 && 'Explique a regra da disputa.',
  ].filter(Boolean) as string[];

  async function publicar() {
    const erro = await executar(() => criarCompeticao(nova));
    setFeedback(erro ?? `Competição “${nova.nome}” ${new Date(nova.inicio) > new Date() ? 'programada' : 'publicada'}.`);
    if (!erro) {
      setCriando(false);
      setNova(competicaoVazia());
    }
  }

  async function transicao(c: CompeticaoCad, a: 'encerrar' | 'cancelar' | 'arquivar', okTexto: string, motivo?: string) {
    const erro = await executar(() => acaoCompeticao(c.id, a, motivo));
    setFeedback(erro ?? okTexto);
    if (!erro) setCancelando(null);
  }

  return (
    <>
      <TituloPagina
        titulo="Competições"
        descricao="Disputas com período, regra e prêmio. Individual, evolução, categoria ou Loja × Loja — classificação calculada das vendas reais."
        acoes={
          <Botao tipo="primario" onClick={() => setCriando((v) => !v)}>
            + Nova competição
          </Botao>
        }
      />
      <Feedback texto={feedback} />
      {criando && (
        <Bloco titulo="Nova competição">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Campo rotulo="Nome">
              <input className={INPUT} value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} />
            </Campo>
            <Campo rotulo="Tipo">
              <select
                className={INPUT}
                value={nova.tipo}
                onChange={(e) => {
                  const tipo = e.target.value as CompeticaoCad['tipo'];
                  setNova({ ...nova, tipo, ...(tipo === 'LOJA' ? { metrica: null, escopo: 'TODAS' as const } : tipo === 'EVOLUCAO' ? { metrica: 'EVOLUCAO' as const } : tipo === 'CATEGORIA' ? { metrica: 'PARES_CATEGORIA' as const } : { metrica: nova.metrica ?? 'PERCENTUAL_META' }) });
                }}
              >
                <option value="VENDEDOR">Individual</option>
                <option value="EVOLUCAO">Evolução</option>
                <option value="CATEGORIA">Categoria</option>
                <option value="LOJA">Loja × Loja</option>
              </select>
            </Campo>
            {nova.tipo !== 'LOJA' && (
              <Campo rotulo="Indicador">
                <select className={INPUT} value={nova.metrica ?? ''} onChange={(e) => setNova({ ...nova, metrica: e.target.value as CompeticaoCad['metrica'] })}>
                  {METRICAS_COMPETICAO.map((m) => (
                    <option key={m.metrica} value={m.metrica}>
                      {m.rotulo}
                    </option>
                  ))}
                </select>
              </Campo>
            )}
            {nova.metrica === 'PARES_CATEGORIA' && (
              <Campo rotulo="Categoria">
                <select className={INPUT} value={nova.categoria ?? ''} onChange={(e) => setNova({ ...nova, categoria: e.target.value || null })}>
                  <option value="">Escolha…</option>
                  {[...new Set([...estado.produtos.map((p) => p.categoria), ...CATEGORIAS_PADRAO])].map((c) => (
                    <option key={c}>{c}</option>
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
              <input type="date" className={INPUT} value={paraInput(nova.inicio)} onChange={(e) => e.target.value && setNova({ ...nova, inicio: deInput(e.target.value) })} />
            </Campo>
            <Campo rotulo="Fim">
              <input type="date" className={INPUT} value={paraInput(nova.fim)} onChange={(e) => e.target.value && setNova({ ...nova, fim: deInput(e.target.value, true) })} />
            </Campo>
            {nova.tipo !== 'LOJA' && (
              <Campo rotulo="Abrangência">
                <select className={INPUT} value={nova.escopo} onChange={(e) => setNova({ ...nova, escopo: e.target.value as CompeticaoCad['escopo'] })}>
                  <option value="TODAS">Todas as lojas (uma classificação)</option>
                  <option value="MINHA_LOJA">Cada loja disputa entre si</option>
                </select>
              </Campo>
            )}
            <Campo rotulo="Prêmio (1º lugar)">
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
            <ChecklistValidacao itens={pendencias.length ? pendencias.map((p) => ({ ok: false, rotulo: p, problema: p })) : [{ ok: true, rotulo: 'Pronta para publicar' }]} />
          </div>
          <div className="mt-3 flex gap-2">
            <Botao tipo="primario" disabled={pendencias.length > 0} onClick={() => void publicar()}>
              Publicar
            </Botao>
            <Botao tipo="fantasma" onClick={() => setCriando(false)}>
              Cancelar
            </Botao>
          </div>
        </Bloco>
      )}
      {estado.competicoes.length === 0 && !criando && <p className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">Nenhuma competição ainda.</p>}
      <ul className="flex flex-col gap-3">
        {estado.competicoes.map((c) => {
          const premios = c.premioIds
            .map((pid) => estado.premios.find((p) => p.id === pid)?.nome)
            .filter(Boolean)
            .join(' + ');
          return (
            <li key={c.id}>
              <Bloco>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusCicloPill status={c.status} />
                  <Selo>{c.tipo === 'LOJA' ? 'Loja × Loja' : c.tipo === 'EVOLUCAO' ? 'Evolução' : c.tipo === 'CATEGORIA' ? 'Categoria' : 'Individual'}</Selo>
                  {c.escopo === 'MINHA_LOJA' && <Selo>cada loja entre si</Selo>}
                  <span className="text-xs text-slate-400">{periodo(c.inicio, c.fim)}</span>
                </div>
                <h2 className="mt-2 font-bold text-white">{c.nome}</h2>
                <p className="text-sm text-slate-400">{c.regra}</p>
                <p className="mt-1 text-xs text-slate-300">
                  🎁 {premios || 'sem prêmio'} · {c.metrica ? METRICAS_COMPETICAO.find((m) => m.metrica === c.metrica)?.rotulo : 'pontuação de loja (% da meta coletiva)'}
                  {c.categoria ? ` · ${c.categoria}` : ''}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {c.classificacao.length > 0 && (
                    <Botao tipo="fantasma" onClick={() => setAberta(aberta === c.id ? null : c.id)}>
                      {aberta === c.id ? 'Ocultar classificação' : `Classificação (${c.classificacao.length})`}
                    </Botao>
                  )}
                  {c.status === 'ATIVA' && <Botao onClick={() => void transicao(c, 'encerrar', 'Competição encerrada: resultado congelado e prêmio do 1º lugar creditado.')}>Encerrar</Botao>}
                  {(c.status === 'ATIVA' || c.status === 'PROGRAMADA') && (
                    <Botao tipo="perigo" onClick={() => setCancelando(c.id)}>
                      Cancelar
                    </Botao>
                  )}
                  {c.status === 'ENCERRADA' && <Botao onClick={() => void transicao(c, 'arquivar', 'Competição arquivada.')}>Arquivar</Botao>}
                </div>
                {cancelando === c.id && (
                  <div className="mt-3">
                    <FormCancelar rotulo="Motivo do cancelamento (obrigatório)" onVoltar={() => setCancelando(null)} onConfirmar={(mo) => void transicao(c, 'cancelar', 'Competição cancelada.', mo)} />
                  </div>
                )}
                {aberta === c.id && (
                  <ol className="mt-3 divide-y divide-slate-800 rounded-xl bg-slate-800/50 text-sm">
                    {c.classificacao.map((p) => (
                      <li key={`${p.grupo}-${p.id}`} className="flex justify-between px-3 py-2">
                        <span className="text-slate-200">
                          {p.posicao}º {p.nome}
                          {p.grupo && <span className="text-xs text-slate-400"> · {lojaNome(p.grupo)}</span>}
                        </span>
                        <span className="font-semibold text-white">{p.valor === null ? '—' : p.valor.toLocaleString('pt-BR')}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </Bloco>
            </li>
          );
        })}
      </ul>
    </>
  );
}

// ================================================================== premiações

const ROTULO_CATEGORIA_PREMIO: Record<NonNullable<Premio['categoria']>, string> = { DINHEIRO: 'Dinheiro', VALE: 'Vale', PRODUTO: 'Produto', EXPERIENCIA: 'Experiência', OUTRO: 'Outro' };

export function Premiacoes() {
  const { estado, executar } = useAdmin();
  const vazio = { nome: '', tipo: 'DIGITAL' as Premio['tipo'], xp: 0, moedas: 0, comBadge: false, categoria: null as Premio['categoria'], descricao: '' };
  const [novo, setNovo] = useState(vazio);
  const [erro, setErro] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const usadoEm = (pid: string) => [
    ...estado.campanhas.filter((c) => c.frentes.some((f) => f.premioId === pid)).map((c) => `Campanha ${c.nome}`),
    ...estado.competicoes.filter((c) => c.premioIds.includes(pid)).map((c) => `Competição ${c.nome}`),
    ...estado.missoes.filter((m) => m.premioId === pid).map((m) => `Missão ${m.nome}`),
  ];

  return (
    <>
      <TituloPagina titulo="Premiações" descricao="O que o vendedor pode ganhar. Recompensa digital entra pelo ledger; prêmio empresarial é informativo — o sistema não paga nada." />
      <Feedback texto={feedback} />
      {(['DIGITAL', 'EMPRESARIAL'] as const).map((tipo) => (
        <Bloco key={tipo} titulo={tipo === 'DIGITAL' ? 'Recompensa digital (XP, VendaCoins, badge)' : 'Prêmio empresarial (dinheiro, vale, produto, experiência)'}>
          {estado.premios.filter((p) => p.tipo === tipo).length === 0 ? (
            <p className="text-sm text-slate-400">Nenhum prêmio deste tipo ainda.</p>
          ) : (
            <ul className="grid gap-2 md:grid-cols-2">
              {estado.premios
                .filter((p) => p.tipo === tipo)
                .map((p) => {
                  const usos = usadoEm(p.id);
                  return (
                    <li key={p.id} className="rounded-xl bg-slate-800/70 p-3 text-sm">
                      <p className="font-semibold text-white">{p.nome}</p>
                      <p className="text-slate-300">{tipo === 'DIGITAL' ? descreverPremio(p) : [p.categoria ? ROTULO_CATEGORIA_PREMIO[p.categoria] : '', p.descricao].filter(Boolean).join(' · ')}</p>
                      <p className="mt-1 text-xs text-slate-400">{usos.length ? `Usado em: ${usos.join(' · ')}` : 'Ainda não usado'}</p>
                    </li>
                  );
                })}
            </ul>
          )}
        </Bloco>
      ))}
      <Bloco titulo="Cadastrar prêmio">
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (novo.nome.trim().length < 3) return setErro('Dê um nome ao prêmio.');
            if (novo.tipo === 'DIGITAL' && !novo.xp && !novo.moedas && !novo.comBadge) return setErro('Recompensa digital precisa de XP, VendaCoins ou badge.');
            if (novo.tipo === 'EMPRESARIAL' && !novo.categoria) return setErro('Escolha a categoria do prêmio empresarial.');
            setErro(null);
            const nome = novo.nome.trim();
            void executar(() => criarPremio({ ...novo, nome })).then((falha) => {
              if (falha) setErro(falha);
              else {
                setFeedback(`Prêmio “${nome}” cadastrado.`);
                setNovo(vazio);
              }
            });
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
                <input type="number" min={0} max={1000} className={INPUT} value={novo.xp} onChange={(e) => setNovo({ ...novo, xp: Number(e.target.value) })} />
              </Campo>
              <Campo rotulo="VendaCoins">
                <input type="number" min={0} max={1000} className={INPUT} value={novo.moedas} onChange={(e) => setNovo({ ...novo, moedas: Number(e.target.value) })} />
              </Campo>
              <label className="flex min-h-[44px] items-center gap-2 self-end text-sm text-slate-200">
                <input type="checkbox" className="h-5 w-5 accent-amber-500" checked={novo.comBadge} onChange={(e) => setNovo({ ...novo, comBadge: e.target.checked })} /> Inclui badge com o nome do prêmio
              </label>
            </>
          ) : (
            <>
              <Campo rotulo="Categoria">
                <select className={INPUT} value={novo.categoria ?? ''} onChange={(e) => setNovo({ ...novo, categoria: (e.target.value || null) as Premio['categoria'] })}>
                  <option value="">Escolha…</option>
                  {Object.entries(ROTULO_CATEGORIA_PREMIO).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
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
    </>
  );
}
