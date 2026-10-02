/**
 * Pessoas: vendedores (lista, detalhe, cadastro, ações de ciclo de vida) e
 * lojas (lista e detalhe). Reaproveita os conceitos do Admin real
 * (/admin/usuarios, /admin/estrutura): status, realocação, reemissão de acesso.
 */
import { FormEvent, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useFase1 } from '../demo/Fase1Contexto';
import { AGORA_DEMO, type MotivoInelegivel, novoId, type StatusVendedor, type VendedorCad } from '../demo/estado';
import { desempenhoDemo, EU } from '../demo/cenarios';
import { minhaPosicao } from '../dominio/alvos';
import { consistenciaMetasLoja, LIMITE_SYNC_MIN, minutosDesde } from '../dominio/admin';
import { hora, inteiro, mesCurto, pct, reais } from '../formato';
import { AvisoSimulacao, Bloco, Botao, Campo, Feedback, INPUT, Kpi, LinkBotao, Selo, TabelaResponsiva, TituloPagina } from './ui';

const ROTULO_STATUS: Record<StatusVendedor, { texto: string; tom: 'ok' | 'aviso' | 'erro' | 'neutro' }> = {
  ATIVO: { texto: '● Ativo', tom: 'ok' },
  PENDENTE: { texto: '◌ Aguardando ativação', tom: 'aviso' },
  BLOQUEADO: { texto: '⏸ Bloqueado', tom: 'erro' },
  DESLIGADO: { texto: '✕ Desligado', tom: 'neutro' },
};

export const ROTULO_MOTIVO_INELEGIVEL: Record<MotivoInelegivel, string> = {
  NOVO: 'Vendedor novo (adaptação)',
  DESLIGADO: 'Desligado',
  TRANSFERIDO: 'Transferido no período',
  PERIODO_INSUFICIENTE: 'Período insuficiente',
  EXCECAO: 'Exceção manual',
};

export function StatusVendedorSelo({ status }: { status: StatusVendedor }) {
  const s = ROTULO_STATUS[status];
  return <Selo tom={s.tom}>{s.texto}</Selo>;
}

// ================================================================== lista

export function Vendedores() {
  const { estado } = useFase1();
  const [loja, setLoja] = useState('todas');
  const [status, setStatus] = useState('todos');
  const [busca, setBusca] = useState('');
  const termo = busca.trim().toLowerCase();
  const linhas = estado.vendedores.filter((v) => (loja === 'todas' || v.lojaId === loja) && (status === 'todos' || v.status === status) && (!termo || `${v.nome} ${v.matricula}`.toLowerCase().includes(termo)));
  const lojaNome = (id: string) => estado.lojas.find((l) => l.id === id)?.nome ?? id;

  return (
    <>
      <TituloPagina titulo="Vendedores" descricao="Cadastro, status, elegibilidade e meta de cada pessoa." acoes={<LinkBotao para="/fase1/admin/vendedores/novo" tipo="primario">+ Cadastrar vendedor</LinkBotao>} />
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
        vazio="Nenhum vendedor com esses filtros."
        colunas={[
          {
            titulo: 'Vendedor',
            celula: (v) => (
              <Link to={`/fase1/admin/vendedores/${v.id}`} className="text-white underline-offset-2 hover:underline">
                {v.nome}
                {v.id === EU && <span className="ml-1 text-xs font-normal text-violet-300">(persona da demo)</span>}
              </Link>
            ),
          },
          { titulo: 'Loja', celula: (v) => lojaNome(v.lojaId) },
          { titulo: 'Status', celula: (v) => <StatusVendedorSelo status={v.status} /> },
          { titulo: 'Meta do mês', celula: (v) => (estado.metas.individuais[v.id]?.mensal ? reais(estado.metas.individuais[v.id].mensal!) : <Selo tom="aviso">sem meta</Selo>) },
          { titulo: 'Ranking', celula: (v) => (v.elegivel ? <Selo tom="ok">elegível</Selo> : <Selo tom="aviso">{v.motivoInelegivel ? ROTULO_MOTIVO_INELEGIVEL[v.motivoInelegivel] : 'não elegível'}</Selo>) },
          { titulo: 'ERP', celula: (v) => (v.vinculoErp === 'VERIFICADO' ? <Selo tom="ok">✓ vinculado</Selo> : <Selo tom="aviso">vínculo pendente</Selo>) },
        ]}
      />
    </>
  );
}

// ================================================================== cadastro

export function NovoVendedor() {
  const { estado, alterar } = useFase1();
  const navegar = useNavigate();
  const [form, setForm] = useState({ nome: '', matricula: '', lojaId: estado.lojas[0].id, meta: '' });
  const [erro, setErro] = useState<string | null>(null);

  function salvar(e: FormEvent) {
    e.preventDefault();
    if (form.nome.trim().split(' ').length < 2) return setErro('Informe nome e sobrenome.');
    if (!/^[A-Z0-9-]{3,}$/i.test(form.matricula)) return setErro('Matrícula inválida (mínimo 3 letras/números).');
    if (estado.vendedores.some((v) => v.matricula.toLowerCase() === form.matricula.toLowerCase())) return setErro('Já existe vendedor com essa matrícula.');
    const id = novoId('v');
    const meta = Number(form.meta) || null;
    alterar(
      (st) => {
        st.vendedores.push({ id, nome: form.nome.trim(), lojaId: form.lojaId, matricula: form.matricula.toUpperCase(), status: 'PENDENTE', admitidoEm: AGORA_DEMO.slice(0, 10), vinculoErp: 'PENDENTE', elegivel: false, motivoInelegivel: 'NOVO', excecao: null });
        st.metas.individuais[id] = { mensal: meta, diariaManual: null };
      },
      { acao: 'Cadastrou vendedor', entidade: `Vendedor ${form.nome.trim()}`, depois: `${form.matricula.toUpperCase()} · ${estado.lojas.find((l) => l.id === form.lojaId)?.nome}` }
    );
    navegar(`/fase1/admin/vendedores/${id}`);
  }

  return (
    <>
      <TituloPagina titulo="Cadastrar vendedor" voltar={{ para: '/fase1/admin/vendedores', texto: 'Vendedores' }} descricao="O acesso é emitido como “aguardando ativação”. O vendedor entra fora do ranking (período de adaptação) até a regra liberar." />
      <form onSubmit={salvar} className="grid max-w-xl gap-3">
        <Campo rotulo="Nome completo">
          <input className={INPUT} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
        </Campo>
        <Campo rotulo="Matrícula no ERP" ajuda="Usada no login e no vínculo com as vendas do ERP.">
          <input className={INPUT} value={form.matricula} onChange={(e) => setForm({ ...form, matricula: e.target.value })} required />
        </Campo>
        <Campo rotulo="Loja">
          <select className={INPUT} value={form.lojaId} onChange={(e) => setForm({ ...form, lojaId: e.target.value })}>
            {estado.lojas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Meta do mês (opcional)" ajuda="Sem meta, o vendedor aparece como pendência.">
          <input type="number" min={0} step={100} className={INPUT} value={form.meta} onChange={(e) => setForm({ ...form, meta: e.target.value })} />
        </Campo>
        {erro && (
          <p role="alert" className="text-sm text-rose-300">
            {erro}
          </p>
        )}
        <div>
          <Botao type="submit" tipo="primario">
            Cadastrar e emitir acesso
          </Botao>
        </div>
      </form>
    </>
  );
}

// ================================================================== detalhe

export function VendedorDetalhe() {
  const { id } = useParams();
  const { estado, alterar, dados, verComoVendedor } = useFase1();
  const navegar = useNavigate();
  const v = estado.vendedores.find((x) => x.id === id);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [acao, setAcao] = useState<null | 'transferir' | 'desligar' | 'excecao'>(null);
  const [destino, setDestino] = useState('');
  const [motivo, setMotivo] = useState('');

  if (!v) return <TituloPagina titulo="Vendedor não encontrado" voltar={{ para: '/fase1/admin/vendedores', texto: 'Vendedores' }} />;

  const loja = estado.lojas.find((l) => l.id === v.lojaId)!;
  const meta = estado.metas.individuais[v.id]?.mensal ?? null;
  const ehEu = v.id === EU;
  const perf = desempenhoDemo(v.id);
  const mes = ehEu ? dados.mes.realizado.faturamento : (perf?.vendas ?? 0);
  const hoje = ehEu ? dados.hoje.realizado.faturamento : perf ? Math.round(perf.vendas / 17) : 0;
  const posLoja = ehEu ? minhaPosicao(dados, 'loja', 'VENDAS') : null;
  const posGeral = ehEu ? minhaPosicao(dados, 'geral', 'VENDAS') : null;
  const xp = ehEu ? dados.xp.total : perf ? perf.score * 2 : 0;
  const moedas = ehEu ? dados.moedas.saldo : perf ? Math.round(perf.score / 3) : 0;
  const missoes = estado.missoes.filter((m) => m.status === 'ATIVA' && (m.lojas === 'TODAS' || m.lojas.includes(v.lojaId))).length;
  const campanhas = estado.campanhas.filter((c) => c.status === 'ATIVA' && (c.lojas === 'TODAS' || c.lojas.includes(v.lojaId))).length;
  const pendencias = [!meta && 'sem meta', v.vinculoErp === 'PENDENTE' && 'vínculo ERP pendente', v.status === 'PENDENTE' && 'acesso não ativado'].filter(Boolean) as string[];

  function mudarStatus(novo: StatusVendedor, rotulo: string, extra?: Partial<VendedorCad>) {
    alterar(
      (st) => {
        const x = st.vendedores.find((y) => y.id === v!.id)!;
        Object.assign(x, { status: novo, ...extra });
      },
      { acao: rotulo, entidade: `Vendedor ${v!.nome}`, antes: v!.status, depois: novo, motivo: motivo || null }
    );
    setFeedback(`${rotulo}.`);
    setAcao(null);
    setMotivo('');
  }

  return (
    <>
      <TituloPagina
        titulo={v.nome}
        voltar={{ para: '/fase1/admin/vendedores', texto: 'Vendedores' }}
        descricao={`${loja.nome} · matrícula ${v.matricula} · na equipe desde ${mesCurto(v.admitidoEm.slice(0, 7))}`}
        acoes={
          ehEu ? (
            <Botao
              tipo="primario"
              onClick={() => {
                verComoVendedor();
                navegar('/fase1/inicio');
              }}
            >
              👁 Ver como {v.nome.split(' ')[0]}
            </Botao>
          ) : undefined
        }
      />
      <div className="flex flex-wrap gap-2">
        <StatusVendedorSelo status={v.status} />
        {meta ? <Selo tom="ok">Meta cadastrada ✓</Selo> : <Selo tom="aviso">Sem meta</Selo>}
        {v.elegivel ? <Selo tom="ok">Elegível ao ranking</Selo> : <Selo tom="aviso">Fora do ranking: {v.motivoInelegivel ? ROTULO_MOTIVO_INELEGIVEL[v.motivoInelegivel] : '—'}</Selo>}
        <Selo tom={pendencias.length ? 'aviso' : 'ok'}>{pendencias.length ? `Pendências: ${pendencias.join(', ')}` : 'Pendências: nenhuma'}</Selo>
      </div>
      <Feedback texto={feedback} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi rotulo="Hoje" valor={reais(hoje)} detalhe={ehEu ? `meta ${dados.hoje.meta ? reais(dados.hoje.meta) : '—'}` : 'estimado'} />
        <Kpi rotulo="Mês" valor={reais(mes)} detalhe={meta ? `${pct((mes / meta) * 100)} de ${reais(meta)}` : 'sem meta'} />
        <Kpi rotulo="Ranking loja" valor={posLoja ? `#${posLoja.posicao}` : '—'} detalhe={ehEu ? 'vendas do mês' : 'disponível para a persona'} />
        <Kpi rotulo="Ranking geral" valor={posGeral ? `#${posGeral.posicao}` : '—'} />
        <Kpi rotulo="XP" valor={inteiro(xp)} para="/fase1/admin/xp" />
        <Kpi rotulo="VendaCoins" valor={inteiro(moedas)} para="/fase1/admin/vendacoins" />
        <Kpi rotulo="Missões ativas" valor={missoes} para="/fase1/admin/missoes" />
        <Kpi rotulo="Campanhas" valor={campanhas} para="/fase1/admin/campanhas" />
      </div>
      {!ehEu && <AvisoSimulacao>Hoje/XP/VendaCoins deste vendedor são estimados para a demo. Só a persona (Ana) tem a jornada completa.</AvisoSimulacao>}

      <Bloco titulo="Ações">
        <div className="flex flex-wrap gap-2">
          {v.status !== 'ATIVO' && v.status !== 'DESLIGADO' && <Botao onClick={() => mudarStatus('ATIVO', 'Ativou vendedor')}>Ativar</Botao>}
          {v.status === 'ATIVO' && <Botao onClick={() => mudarStatus('BLOQUEADO', 'Bloqueou vendedor')}>Bloquear</Botao>}
          {v.status !== 'DESLIGADO' && (
            <Botao tipo="perigo" onClick={() => setAcao('desligar')}>
              Desligar
            </Botao>
          )}
          {v.status !== 'DESLIGADO' && <Botao onClick={() => setAcao('transferir')}>Transferir de loja</Botao>}
          <Botao
            onClick={() => {
              alterar(() => {}, { acao: 'Reemitiu acesso', entidade: `Vendedor ${v.nome}`, depois: 'Novo código de ativação gerado' });
              setFeedback('Novo código de ativação gerado (simulado). O anterior deixou de valer.');
            }}
          >
            Reemitir acesso
          </Botao>
          {v.vinculoErp === 'PENDENTE' && (
            <Botao
              onClick={() => {
                alterar((st) => {
                  st.vendedores.find((y) => y.id === v.id)!.vinculoErp = 'VERIFICADO';
                }, { acao: 'Verificou vínculo ERP', entidade: `Vendedor ${v.nome}`, antes: 'PENDENTE', depois: 'VERIFICADO' });
                setFeedback('Vínculo com o ERP verificado.');
              }}
            >
              Verificar vínculo ERP
            </Botao>
          )}
          <Botao onClick={() => setAcao('excecao')}>{v.elegivel ? 'Tirar do ranking (exceção)' : 'Incluir no ranking (exceção)'}</Botao>
        </div>

        {acao && (
          <form
            className="mt-4 grid max-w-xl gap-3 rounded-xl border border-slate-700 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (motivo.trim().length < 5) return;
              if (acao === 'desligar') mudarStatus('DESLIGADO', 'Desligou vendedor', { elegivel: false, motivoInelegivel: 'DESLIGADO' });
              if (acao === 'transferir' && destino) {
                const destinoNome = estado.lojas.find((l) => l.id === destino)?.nome;
                alterar((st) => {
                  const x = st.vendedores.find((y) => y.id === v.id)!;
                  x.lojaId = destino;
                  x.elegivel = false;
                  x.motivoInelegivel = 'TRANSFERIDO';
                }, { acao: 'Transferiu vendedor', entidade: `Vendedor ${v.nome}`, antes: loja.nome, depois: destinoNome, motivo });
                setFeedback(`Transferido para ${destinoNome}. Fica fora do ranking até o próximo período.`);
                setAcao(null);
                setMotivo('');
              }
              if (acao === 'excecao') {
                alterar((st) => {
                  const x = st.vendedores.find((y) => y.id === v.id)!;
                  x.elegivel = !v.elegivel;
                  x.motivoInelegivel = v.elegivel ? 'EXCECAO' : null;
                  x.excecao = motivo;
                }, { acao: v.elegivel ? 'Removeu do ranking por exceção' : 'Incluiu no ranking por exceção', entidade: `Vendedor ${v.nome}`, antes: v.elegivel ? 'elegível' : 'não elegível', depois: v.elegivel ? 'não elegível' : 'elegível', motivo });
                setFeedback('Exceção registrada na auditoria.');
                setAcao(null);
                setMotivo('');
              }
            }}
          >
            <p className="text-sm font-semibold text-white">{acao === 'desligar' ? 'Desligar vendedor' : acao === 'transferir' ? 'Transferir de loja' : 'Exceção de elegibilidade'}</p>
            {acao === 'transferir' && (
              <Campo rotulo="Loja de destino">
                <select className={INPUT} value={destino} onChange={(e) => setDestino(e.target.value)} required>
                  <option value="">Escolha…</option>
                  {estado.lojas
                    .filter((l) => l.id !== v.lojaId)
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nome}
                      </option>
                    ))}
                </select>
              </Campo>
            )}
            <Campo rotulo="Motivo (obrigatório, vai para a auditoria)">
              <input className={INPUT} value={motivo} onChange={(e) => setMotivo(e.target.value)} minLength={5} required />
            </Campo>
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
      {v.excecao && <p className="text-xs text-slate-400">Última exceção de elegibilidade: “{v.excecao}”.</p>}
    </>
  );
}

// ================================================================== lojas

export function Lojas() {
  const { estado } = useFase1();
  return (
    <>
      <TituloPagina titulo="Lojas" descricao="Empresa Sapatinho de Luxo · lojas participantes da Fase 1." />
      <TabelaResponsiva
        legenda="Lojas"
        linhas={estado.lojas}
        chave={(l) => l.id}
        colunas={[
          { titulo: 'Loja', celula: (l) => <Link to={`/fase1/admin/lojas/${l.id}`} className="text-white hover:underline">{l.nome}</Link> },
          { titulo: 'Código', celula: (l) => l.codigo },
          { titulo: 'Status', celula: (l) => <Selo tom={l.status === 'ATIVA' ? 'ok' : 'neutro'}>{l.status === 'ATIVA' ? '● Ativa' : 'Inativa'}</Selo> },
          { titulo: 'Vendedores', celula: (l) => estado.vendedores.filter((v) => v.lojaId === l.id && v.status === 'ATIVO').length },
          { titulo: 'Meta do mês', celula: (l) => reais(l.metaMes) },
          {
            titulo: 'Dados',
            celula: (l) => {
              const min = minutosDesde(l.ultimaSync, AGORA_DEMO);
              return <Selo tom={min > LIMITE_SYNC_MIN ? 'erro' : 'ok'}>{min > LIMITE_SYNC_MIN ? `🔴 ${Math.floor(min / 60)} h sem sync` : `🟢 ${hora(l.ultimaSync)}`}</Selo>;
            },
          },
        ]}
      />
    </>
  );
}

export function LojaDetalhe() {
  const { id } = useParams();
  const { estado, dados } = useFase1();
  const l = estado.lojas.find((x) => x.id === id);
  if (!l) return <TituloPagina titulo="Loja não encontrada" voltar={{ para: '/fase1/admin/lojas', texto: 'Lojas' }} />;
  const vend = estado.vendedores.filter((v) => v.lojaId === l.id && v.status !== 'DESLIGADO');
  const realizado = vend.reduce((a, v) => a + (v.id === EU ? dados.mes.realizado.faturamento : (desempenhoDemo(v.id)?.vendas ?? 0)), 0);
  const cons = consistenciaMetasLoja(estado, l.id);
  const lxl = [...dados.rankings.lojas].sort((a, b) => b.pontos - a.pontos);
  const posLxl = lxl.findIndex((x) => x.lojaId === l.id) + 1;
  return (
    <>
      <TituloPagina titulo={l.nome} voltar={{ para: '/fase1/admin/lojas', texto: 'Lojas' }} descricao={`Código ${l.codigo} · último sync ${hora(l.ultimaSync)}`} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi rotulo="Meta da loja" valor={reais(l.metaMes)} para="/fase1/admin/metas" />
        <Kpi rotulo="Realizado no mês" valor={reais(realizado)} detalhe={`${pct((realizado / l.metaMes) * 100)} da meta`} />
        <Kpi rotulo="Vendedores ativos" valor={vend.filter((v) => v.status === 'ATIVO').length} />
        <Kpi rotulo="Com meta" valor={`${vend.length - cons.semMeta.length} de ${vend.length}`} tom={cons.semMeta.length ? 'aviso' : 'ok'} />
        <Kpi rotulo="Campanhas ativas" valor={estado.campanhas.filter((c) => c.status === 'ATIVA' && (c.lojas === 'TODAS' || c.lojas.includes(l.id))).length} />
        <Kpi rotulo="Missões ativas" valor={estado.missoes.filter((m) => m.status === 'ATIVA' && (m.lojas === 'TODAS' || m.lojas.includes(l.id))).length} />
        <Kpi rotulo="Loja × Loja" valor={posLxl ? `#${posLxl}` : '—'} detalhe="pontos ilustrativos" />
        <Kpi rotulo="Última atualização" valor={hora(l.ultimaSync)} tom={minutosDesde(l.ultimaSync, AGORA_DEMO) > LIMITE_SYNC_MIN ? 'erro' : 'ok'} para="/fase1/admin/saude" />
      </div>
      <Bloco titulo="Vendedores da loja">
        <ul className="divide-y divide-slate-800 text-sm">
          {vend.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-2 py-2">
              <Link to={`/fase1/admin/vendedores/${v.id}`} className="text-white hover:underline">
                {v.nome}
              </Link>
              <span className="text-slate-400">{estado.metas.individuais[v.id]?.mensal ? reais(estado.metas.individuais[v.id].mensal!) : 'sem meta'}</span>
            </li>
          ))}
        </ul>
      </Bloco>
    </>
  );
}
