/**
 * Pessoas: vendedores (lista, detalhe, cadastro, ações de ciclo de vida) e
 * lojas (lista, cadastro e detalhe). Tudo pela API real — cadastro emite o
 * código de ativação (mostrado UMA vez), status/transferência derrubam as
 * sessões abertas no servidor e entram na auditoria com motivo.
 */
import { FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { bloquearVendedor, criarLoja, desbloquearVendedor, desligarVendedor, inativarLoja, preAutorizarVendedor, reativarLoja, reativarVendedor, realocarVendedor, reemitirAcesso } from '../../api/admin';
import { consistenciaMetasLoja, LIMITE_SYNC_MIN, minutosDesde } from '../dominio/admin';
import { hora, inteiro, mesCurto, pct, reais } from '../formato';
import { definirElegibilidade, salvarMetaVendedor } from './api';
import { useAdmin } from './AdminDados';
import type { MotivoInelegivel, StatusVendedor } from './tiposAdmin';
import { Bloco, Botao, Campo, Feedback, INPUT, Kpi, LinkBotao, Selo, TabelaResponsiva, TituloPagina } from './ui';

const ROTULO_STATUS: Record<StatusVendedor, { texto: string; tom: 'ok' | 'aviso' | 'erro' | 'neutro' }> = {
  ATIVO: { texto: '● Ativo', tom: 'ok' },
  PENDENTE: { texto: '◌ Aguardando ativação', tom: 'aviso' },
  BLOQUEADO: { texto: '⏸ Bloqueado', tom: 'erro' },
  DESLIGADO: { texto: '✕ Desligado', tom: 'neutro' },
};

export const ROTULO_MOTIVO_INELEGIVEL: Record<MotivoInelegivel, string> = {
  NOVO: 'Vendedor novo (adaptação)',
  DESLIGADO: 'Fora do quadro ativo',
  TRANSFERIDO: 'Transferido no período',
  PERIODO_INSUFICIENTE: 'Período insuficiente',
  EXCECAO: 'Exceção manual',
};

export function StatusVendedorSelo({ status }: { status: StatusVendedor }) {
  const s = ROTULO_STATUS[status];
  return <Selo tom={s.tom}>{s.texto}</Selo>;
}

/** Código de ativação: aparece uma única vez (o servidor guarda só o hash). */
function CodigoAtivacao({ codigo, expiraEm }: { codigo: string; expiraEm: string }) {
  return (
    <div role="status" className="rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-4 text-sm text-emerald-100">
      <p className="font-semibold">Código de ativação (mostrado só agora):</p>
      <p className="mt-1 select-all break-all font-mono text-lg text-white">{codigo}</p>
      <p className="mt-1 text-xs text-emerald-200/80">
        Entregue pessoalmente. Vale até {new Date(expiraEm).toLocaleString('pt-BR')}. O vendedor ativa em “Primeiro acesso? Ative sua conta” com CPF + este código e cria a própria senha.
      </p>
    </div>
  );
}

// ================================================================== lista

export function Vendedores() {
  const { estado } = useAdmin();
  const [loja, setLoja] = useState('todas');
  const [status, setStatus] = useState('todos');
  const [busca, setBusca] = useState('');
  const termo = busca.trim().toLowerCase();
  const linhas = estado.vendedores.filter((v) => (loja === 'todas' || v.lojaId === loja) && (status === 'todos' || v.status === status) && (!termo || `${v.nome} ${v.matricula}`.toLowerCase().includes(termo)));
  const lojaNome = (id: string) => estado.lojas.find((l) => l.id === id)?.nome ?? id;

  return (
    <>
      <TituloPagina titulo="Vendedores" descricao="Cadastro, status, elegibilidade e meta de cada pessoa." acoes={<LinkBotao para="/admin/vendedores/novo" tipo="primario">+ Cadastrar vendedor</LinkBotao>} />
      <div className="grid gap-2 sm:grid-cols-3">
        <label>
          <span className="sr-only">Buscar</span>
          <input className={INPUT} placeholder="Buscar nome ou matrícula…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
        <label>
          <span className="sr-only">Loja</span>
          <select className={INPUT} value={loja} onChange={(e) => setLoja(e.target.value)}>
            <option value="todas">Todas as lojas</option>
            {estado.lojas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Status</span>
          <select className={INPUT} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="todos">Todos os status</option>
            {(Object.keys(ROTULO_STATUS) as StatusVendedor[]).map((s) => (
              <option key={s} value={s}>
                {ROTULO_STATUS[s].texto.slice(2)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <TabelaResponsiva
        legenda="Vendedores"
        linhas={linhas}
        chave={(v) => v.id}
        vazio={estado.vendedores.length ? 'Nenhum vendedor com esses filtros.' : 'Nenhum vendedor cadastrado ainda.'}
        colunas={[
          {
            titulo: 'Vendedor',
            celula: (v) => (
              <Link to={`/admin/vendedores/${v.id}`} className="text-white underline-offset-2 hover:underline">
                {v.nome}
              </Link>
            ),
          },
          { titulo: 'Loja', celula: (v) => lojaNome(v.lojaId) },
          { titulo: 'Status', celula: (v) => <StatusVendedorSelo status={v.status} /> },
          { titulo: 'Meta do mês', celula: (v) => (estado.metas.individuais[v.id]?.mensal ? reais(estado.metas.individuais[v.id].mensal!) : <Selo tom="aviso">sem meta</Selo>) },
          { titulo: 'Ranking', celula: (v) => (v.elegivel ? <Selo tom="ok">elegível</Selo> : <Selo tom="aviso">{v.motivoInelegivel ? ROTULO_MOTIVO_INELEGIVEL[v.motivoInelegivel] : 'não elegível'}</Selo>) },
          { titulo: 'ERP', celula: (v) => (v.vinculoErp === 'VERIFICADO' ? <Selo tom="ok">✓ vendas recebidas</Selo> : <Selo tom="aviso">sem venda recebida</Selo>) },
        ]}
      />
    </>
  );
}

// ================================================================== cadastro

export function NovoVendedor() {
  const { estado, executar } = useAdmin();
  const navegar = useNavigate();
  const lojasAtivas = estado.lojas.filter((l) => l.status === 'ATIVA');
  const [form, setForm] = useState({ nome: '', matricula: '', cpf: '', lojaId: lojasAtivas[0]?.id ?? '', meta: '', dias: '' });
  const [erro, setErro] = useState<string | null>(null);
  const [emitido, setEmitido] = useState<{ id: string; codigo: string; expiraEm: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (form.nome.trim().split(' ').length < 2) return setErro('Informe nome e sobrenome.');
    if (!/^[A-Z0-9-]{2,}$/i.test(form.matricula.trim())) return setErro('Matrícula inválida (use letras/números como no ERP).');
    if (form.cpf.replace(/\D/g, '').length !== 11) return setErro('CPF precisa ter 11 dígitos.');
    setEnviando(true);
    let criado: { id: string; tokenAtivacao: string; expiraEm: string } | null = null;
    const falha = await executar(async () => {
      criado = await preAutorizarVendedor({ lojaId: form.lojaId, matriculaErp: form.matricula.trim(), nome: form.nome.trim(), cpf: form.cpf });
      const meta = Number(form.meta) || null;
      const dias = Number(form.dias) || null;
      if (meta || dias) await salvarMetaVendedor(estado.mes, criado.id, { mensal: meta, diasPrevistos: dias });
    });
    setEnviando(false);
    if (falha) return setErro(falha.includes('matr') || falha.includes('CPF') ? falha : `Não foi possível cadastrar: ${falha}`);
    const c = criado as unknown as { id: string; tokenAtivacao: string; expiraEm: string };
    setEmitido({ id: c.id, codigo: c.tokenAtivacao, expiraEm: c.expiraEm });
  }

  if (emitido) {
    return (
      <>
        <TituloPagina titulo="Vendedor cadastrado" voltar={{ para: '/admin/vendedores', texto: 'Vendedores' }} />
        <CodigoAtivacao codigo={emitido.codigo} expiraEm={emitido.expiraEm} />
        <div className="flex gap-2">
          <Botao tipo="primario" onClick={() => navegar(`/admin/vendedores/${emitido.id}`)}>
            Ver cadastro
          </Botao>
          <Botao onClick={() => { setEmitido(null); setForm({ ...form, nome: '', matricula: '', cpf: '', meta: '', dias: '' }); }}>Cadastrar outro</Botao>
        </div>
      </>
    );
  }

  return (
    <>
      <TituloPagina titulo="Cadastrar vendedor" voltar={{ para: '/admin/vendedores', texto: 'Vendedores' }} descricao="O acesso é emitido como “aguardando ativação”: a pessoa ativa com CPF + código e cria a própria senha. O Admin nunca define nem vê a senha." />
      {lojasAtivas.length === 0 ? (
        <p className="text-sm text-amber-200">Cadastre uma loja ativa antes. <Link to="/admin/lojas" className="underline">Lojas →</Link></p>
      ) : (
        <form onSubmit={salvar} className="grid max-w-xl gap-3">
          <Campo rotulo="Nome completo">
            <input className={INPUT} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
          </Campo>
          <Campo rotulo="Matrícula no ERP" ajuda="A mesma do ERP — é ela que liga as vendas a esta pessoa.">
            <input className={INPUT} value={form.matricula} onChange={(e) => setForm({ ...form, matricula: e.target.value })} required />
          </Campo>
          <Campo rotulo="CPF" ajuda="Usado só para confirmar a identidade na ativação (guardado como hash).">
            <input className={INPUT} inputMode="numeric" value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} required />
          </Campo>
          <Campo rotulo="Loja">
            <select className={INPUT} value={form.lojaId} onChange={(e) => setForm({ ...form, lojaId: e.target.value })}>
              {lojasAtivas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </select>
          </Campo>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo={`Meta de ${mesCurto(estado.mes)} (opcional)`} ajuda="Sem meta, o vendedor aparece como pendência.">
              <input type="number" min={0} step={100} className={INPUT} value={form.meta} onChange={(e) => setForm({ ...form, meta: e.target.value })} />
            </Campo>
            <Campo rotulo="Dias de trabalho no mês (opcional)" ajuda="Base da meta do dia (meta ÷ dias).">
              <input type="number" min={1} max={31} className={INPUT} value={form.dias} onChange={(e) => setForm({ ...form, dias: e.target.value })} />
            </Campo>
          </div>
          {erro && (
            <p role="alert" className="text-sm text-rose-300">
              {erro}
            </p>
          )}
          <div>
            <Botao type="submit" tipo="primario" disabled={enviando}>
              {enviando ? 'Cadastrando…' : 'Cadastrar e emitir acesso'}
            </Botao>
          </div>
        </form>
      )}
    </>
  );
}

// ================================================================== detalhe

export function VendedorDetalhe() {
  const { id } = useParams();
  const { estado, executar } = useAdmin();
  const v = estado.vendedores.find((x) => x.id === id);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [acao, setAcao] = useState<null | 'transferir' | 'desligar' | 'bloquear' | 'excecao'>(null);
  const [destino, setDestino] = useState('');
  const [motivo, setMotivo] = useState('');
  const [codigo, setCodigo] = useState<{ codigo: string; expiraEm: string } | null>(null);

  if (!v) return <TituloPagina titulo="Vendedor não encontrado" voltar={{ para: '/admin/vendedores', texto: 'Vendedores' }} />;

  const loja = estado.lojas.find((l) => l.id === v.lojaId);
  const meta = estado.metas.individuais[v.id] ?? { mensal: null, diasPrevistos: null, diaria: null };
  const d = estado.desempenho.find((x) => x.vendedorId === v.id);
  const missoes = estado.missoes.filter((m) => m.status === 'ATIVA' && (m.lojas === 'TODAS' || m.lojas.includes(v.lojaId))).length;
  const campanhas = estado.campanhas.filter((c) => c.status === 'ATIVA' && (c.lojas === 'TODAS' || c.lojas.includes(v.lojaId))).length;
  const pendencias = [!meta.mensal && 'sem meta', !meta.diasPrevistos && 'sem dias de trabalho', v.vinculoErp === 'PENDENTE' && v.status === 'ATIVO' && 'nenhuma venda recebida do ERP', v.status === 'PENDENTE' && 'acesso não ativado'].filter(Boolean) as string[];

  async function rodar(fn: () => Promise<unknown>, ok: string) {
    const erro = await executar(fn);
    setFeedback(erro ?? ok);
    if (!erro) {
      setAcao(null);
      setMotivo('');
    }
  }

  return (
    <>
      <TituloPagina titulo={v.nome} voltar={{ para: '/admin/vendedores', texto: 'Vendedores' }} descricao={`${loja?.nome ?? '—'} · matrícula ${v.matricula} · na equipe desde ${mesCurto(v.admitidoEm.slice(0, 7))}`} />
      <div className="flex flex-wrap gap-2">
        <StatusVendedorSelo status={v.status} />
        {meta.mensal ? <Selo tom="ok">Meta cadastrada ✓</Selo> : <Selo tom="aviso">Sem meta</Selo>}
        {v.elegivel ? <Selo tom="ok">Elegível ao ranking</Selo> : <Selo tom="aviso">Fora do ranking: {v.motivoInelegivel ? ROTULO_MOTIVO_INELEGIVEL[v.motivoInelegivel] : '—'}</Selo>}
        <Selo tom={pendencias.length ? 'aviso' : 'ok'}>{pendencias.length ? `Pendências: ${pendencias.join(', ')}` : 'Pendências: nenhuma'}</Selo>
      </div>
      <Feedback texto={feedback} />
      {codigo && <CodigoAtivacao codigo={codigo.codigo} expiraEm={codigo.expiraEm} />}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi rotulo="Hoje" valor={reais(d?.hoje.faturamento ?? 0)} detalhe={d?.metaDiaria ? `meta do dia ${reais(d.metaDiaria)}` : 'sem meta do dia'} />
        <Kpi rotulo="Mês" valor={reais(d?.mes.faturamento ?? 0)} detalhe={meta.mensal ? `${pct(((d?.mes.faturamento ?? 0) / meta.mensal) * 100)} de ${reais(meta.mensal)}` : 'sem meta'} />
        <Kpi rotulo="Ranking loja" valor={d?.posicaoLoja ? `${d.posicaoLoja}º` : '—'} detalhe="vendas do mês" />
        <Kpi rotulo="Ranking geral" valor={d?.posicaoGeral ? `${d.posicaoGeral}º` : '—'} />
        <Kpi rotulo="XP" valor={inteiro(d?.xp ?? 0)} detalhe={d ? `nível ${d.nivel.nome}` : undefined} para="/admin/xp" />
        <Kpi rotulo="VendaCoins" valor={inteiro(d?.moedas ?? 0)} para="/admin/vendacoins" />
        <Kpi rotulo="Missões ativas" valor={missoes} para="/admin/missoes" />
        <Kpi rotulo="Campanhas" valor={campanhas} para="/admin/campanhas" />
      </div>

      <Bloco titulo="Ações">
        <div className="flex flex-wrap gap-2">
          {v.status === 'BLOQUEADO' && <Botao onClick={() => void rodar(() => desbloquearVendedor(v.id), 'Vendedor desbloqueado. Ele entra de novo com a senha dele.')}>Desbloquear</Botao>}
          {v.status === 'DESLIGADO' && <Botao onClick={() => void rodar(() => reativarVendedor(v.id), 'Vendedor reativado. Histórico preservado.')}>Reativar</Botao>}
          {v.status === 'ATIVO' && <Botao onClick={() => setAcao('bloquear')}>Bloquear</Botao>}
          {v.status !== 'DESLIGADO' && (
            <Botao tipo="perigo" onClick={() => setAcao('desligar')}>
              Desligar
            </Botao>
          )}
          {v.status !== 'DESLIGADO' && <Botao onClick={() => setAcao('transferir')}>Transferir de loja</Botao>}
          {v.status !== 'DESLIGADO' && (
            <Botao
              onClick={() =>
                void (async () => {
                  let r: { tokenAtivacao: string; expiraEm: string } | null = null;
                  const erro = await executar(async () => {
                    r = await reemitirAcesso(v.id);
                  });
                  if (erro) setFeedback(erro);
                  else {
                    const x = r as unknown as { tokenAtivacao: string; expiraEm: string };
                    setCodigo({ codigo: x.tokenAtivacao, expiraEm: x.expiraEm });
                    setFeedback('Novo código emitido. O anterior e as sessões abertas deixaram de valer.');
                  }
                })()
              }
            >
              Reemitir acesso
            </Botao>
          )}
          <Botao onClick={() => setAcao('excecao')}>{v.elegivel ? 'Tirar do ranking (exceção)' : 'Incluir no ranking'}</Botao>
        </div>

        {acao && (
          <form
            className="mt-4 grid max-w-xl gap-3 rounded-xl border border-slate-700 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (acao !== 'excecao' || v.elegivel) if (motivo.trim().length < 5) return;
              if (acao === 'desligar') void rodar(() => desligarVendedor(v.id, motivo.trim()), 'Vendedor desligado. Sessões encerradas; histórico preservado.');
              if (acao === 'bloquear') void rodar(() => bloquearVendedor(v.id, motivo.trim()), 'Vendedor bloqueado. Sessões encerradas na hora.');
              if (acao === 'transferir' && destino) void rodar(() => realocarVendedor(v.id, destino, motivo.trim()), `Transferido para ${estado.lojas.find((l) => l.id === destino)?.nome}.`);
              if (acao === 'excecao') void rodar(() => definirElegibilidade(v.id, !v.elegivel, v.elegivel ? motivo.trim() : null), v.elegivel ? 'Fora do ranking — exceção registrada na auditoria.' : 'De volta ao ranking.');
            }}
          >
            <p className="text-sm font-semibold text-white">{acao === 'desligar' ? 'Desligar vendedor' : acao === 'bloquear' ? 'Bloquear vendedor' : acao === 'transferir' ? 'Transferir de loja' : v.elegivel ? 'Tirar do ranking (exceção)' : 'Incluir no ranking'}</p>
            {acao === 'transferir' && (
              <Campo rotulo="Loja de destino">
                <select className={INPUT} value={destino} onChange={(e) => setDestino(e.target.value)} required>
                  <option value="">Escolha…</option>
                  {estado.lojas
                    .filter((l) => l.id !== v.lojaId && l.status === 'ATIVA')
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nome}
                      </option>
                    ))}
                </select>
              </Campo>
            )}
            {(acao !== 'excecao' || v.elegivel) && (
              <Campo rotulo="Motivo (obrigatório, vai para a auditoria)">
                <input className={INPUT} value={motivo} onChange={(e) => setMotivo(e.target.value)} minLength={5} required />
              </Campo>
            )}
            <div className="flex gap-2">
              <Botao type="submit" tipo={acao === 'desligar' ? 'perigo' : 'primario'}>
                Confirmar
              </Botao>
              <Botao tipo="fantasma" onClick={() => setAcao(null)}>
                Cancelar
              </Botao>
            </div>
          </form>
        )}
      </Bloco>
      {v.excecao && <p className="text-xs text-slate-400">Exceção de elegibilidade vigente: “{v.excecao}”.</p>}
    </>
  );
}

// ================================================================== lojas

export function Lojas() {
  const { estado, executar } = useAdmin();
  const [nova, setNova] = useState({ nome: '', codigo: '' });
  const [feedback, setFeedback] = useState<string | null>(null);
  return (
    <>
      <TituloPagina titulo="Lojas" descricao={`${estado.empresa.nome} · lojas participantes da Fase 1.`} />
      <Feedback texto={feedback} />
      <TabelaResponsiva
        legenda="Lojas"
        linhas={estado.lojas}
        chave={(l) => l.id}
        vazio="Nenhuma loja cadastrada."
        colunas={[
          { titulo: 'Loja', celula: (l) => <Link to={`/admin/lojas/${l.id}`} className="text-white hover:underline">{l.nome}</Link> },
          { titulo: 'Código ERP', celula: (l) => l.codigo },
          { titulo: 'Status', celula: (l) => <Selo tom={l.status === 'ATIVA' ? 'ok' : 'neutro'}>{l.status === 'ATIVA' ? '● Ativa' : 'Inativa'}</Selo> },
          { titulo: 'Vendedores', celula: (l) => estado.vendedores.filter((v) => v.lojaId === l.id && v.status === 'ATIVO').length },
          { titulo: 'Meta do mês', celula: (l) => (l.metaMes ? reais(l.metaMes) : '—') },
          {
            titulo: 'Dados',
            celula: (l) => {
              if (!l.ultimaSync) return <Selo tom="erro">🔴 sem dados do ERP</Selo>;
              const min = minutosDesde(l.ultimaSync, estado.agora);
              return <Selo tom={min > LIMITE_SYNC_MIN ? 'erro' : 'ok'}>{min > LIMITE_SYNC_MIN ? `🔴 ${Math.floor(min / 60)} h sem sync` : `🟢 ${hora(l.ultimaSync)}`}</Selo>;
            },
          },
        ]}
      />
      <Bloco titulo="Cadastrar loja">
        <form
          className="grid gap-2 sm:grid-cols-[1fr_auto_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            if (nova.nome.trim().length < 2 || !nova.codigo.trim()) return;
            void executar(() => criarLoja({ nome: nova.nome.trim(), codigoErp: nova.codigo.trim() })).then((erro) => {
              setFeedback(erro ?? 'Loja cadastrada. Vincule-a na integração de vendas.');
              if (!erro) setNova({ nome: '', codigo: '' });
            });
          }}
        >
          <label>
            <span className="sr-only">Nome</span>
            <input className={INPUT} placeholder="Nome da loja" value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} required />
          </label>
          <label>
            <span className="sr-only">Código ERP</span>
            <input className={INPUT} placeholder="Código no ERP" value={nova.codigo} onChange={(e) => setNova({ ...nova, codigo: e.target.value })} required />
          </label>
          <Botao type="submit" tipo="primario">
            Cadastrar
          </Botao>
        </form>
      </Bloco>
    </>
  );
}

export function LojaDetalhe() {
  const { id } = useParams();
  const { estado, executar } = useAdmin();
  const [feedback, setFeedback] = useState<string | null>(null);
  const l = estado.lojas.find((x) => x.id === id);
  if (!l) return <TituloPagina titulo="Loja não encontrada" voltar={{ para: '/admin/lojas', texto: 'Lojas' }} />;
  const vend = estado.vendedores.filter((v) => v.lojaId === l.id && v.status !== 'DESLIGADO');
  const realizado = estado.desempenho.filter((d) => vend.some((v) => v.id === d.vendedorId)).reduce((a, d) => a + d.mes.faturamento, 0);
  const cons = consistenciaMetasLoja(estado, l.id);
  const posLxl = estado.lojaXLoja.find((x) => x.lojaId === l.id)?.posicao ?? null;
  return (
    <>
      <TituloPagina
        titulo={l.nome}
        voltar={{ para: '/admin/lojas', texto: 'Lojas' }}
        descricao={`Código ERP ${l.codigo} · ${l.ultimaSync ? `último sync ${hora(l.ultimaSync)}` : 'ainda sem dados do ERP'}`}
        acoes={
          l.status === 'ATIVA' ? (
            <Botao tipo="perigo" onClick={() => void executar(() => inativarLoja(l.id)).then((e) => setFeedback(e ?? 'Loja inativada: sai do login e da sincronização. Histórico preservado.'))}>
              Inativar loja
            </Botao>
          ) : (
            <Botao onClick={() => void executar(() => reativarLoja(l.id)).then((e) => setFeedback(e ?? 'Loja reativada.'))}>Reativar loja</Botao>
          )
        }
      />
      <Feedback texto={feedback} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi rotulo="Meta da loja" valor={l.metaMes ? reais(l.metaMes) : '—'} para="/admin/metas" />
        <Kpi rotulo="Realizado no mês" valor={reais(realizado)} detalhe={l.metaMes ? `${pct((realizado / l.metaMes) * 100)} da meta` : 'sem meta da loja'} />
        <Kpi rotulo="Vendedores ativos" valor={vend.filter((v) => v.status === 'ATIVO').length} />
        <Kpi rotulo="Com meta" valor={`${vend.length - cons.semMeta.length} de ${vend.length}`} tom={cons.semMeta.length ? 'aviso' : 'ok'} />
        <Kpi rotulo="Campanhas ativas" valor={estado.campanhas.filter((c) => c.status === 'ATIVA' && (c.lojas === 'TODAS' || c.lojas.includes(l.id))).length} />
        <Kpi rotulo="Missões ativas" valor={estado.missoes.filter((m) => m.status === 'ATIVA' && (m.lojas === 'TODAS' || m.lojas.includes(l.id))).length} />
        <Kpi rotulo="Loja × Loja" valor={posLxl ? `${posLxl}º` : '—'} detalhe={estado.rankings.lojaXLoja.status === 'ATIVO' ? 'posição no mês' : 'regra não definida'} />
        <Kpi rotulo="Última atualização" valor={l.ultimaSync ? hora(l.ultimaSync) : '—'} tom={!l.ultimaSync || minutosDesde(l.ultimaSync, estado.agora) > LIMITE_SYNC_MIN ? 'erro' : 'ok'} para="/admin/saude" />
      </div>
      <Bloco titulo="Vendedores da loja">
        {vend.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhum vendedor nesta loja.</p>
        ) : (
          <ul className="divide-y divide-slate-800 text-sm">
            {vend.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-2 py-2">
                <Link to={`/admin/vendedores/${v.id}`} className="text-white hover:underline">
                  {v.nome}
                </Link>
                <span className="text-slate-400">{estado.metas.individuais[v.id]?.mensal ? reais(estado.metas.individuais[v.id].mensal!) : 'sem meta'}</span>
              </li>
            ))}
          </ul>
        )}
      </Bloco>
    </>
  );
}
