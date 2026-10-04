/**
 * Gamificação (consulta + ajuste compensatório) e Comunicação (reconhecimento
 * e feed). Dados REAIS do ledger. Nenhum saldo é editável: correção é sempre
 * um lançamento novo (AJUSTE_MANUAL) com motivo, autor e data — auditado.
 */
import { FormEvent, useState } from 'react';
import { dataCurta, haQuanto, hora, inteiro } from '../formato';
import { configDoEstado, lancarAjuste, reconhecer, salvarConfig } from './api';
import { useAdmin } from './AdminDados';
import type { MotivoReconhecimento, TipoFeed } from './tiposAdmin';
import { Bloco, Botao, Campo, Feedback, INPUT, Selo, TabelaResponsiva, TituloPagina } from './ui';

const ROTULO_REGRA: Record<string, string> = {
  META_DIARIA_100: 'Meta diária 100%',
  META_DIARIA_110: 'Meta diária 110%',
  META_DIARIA_120: 'Meta diária 120%',
  META_DIARIA_150: 'Meta diária 150%',
  MELHORA_PA: 'Melhora no PA',
  MELHORA_TICKET: 'Melhora no ticket',
  STREAK_3: 'Sequência de 3 dias',
  STREAK_5: 'Sequência de 5 dias',
  STREAK_10: 'Sequência de 10 dias',
};

function useSaldos() {
  const { estado } = useAdmin();
  return estado.vendedores
    .filter((v) => v.status !== 'DESLIGADO')
    .map((v) => {
      const d = estado.desempenho.find((x) => x.vendedorId === v.id);
      return { v, xp: d?.xp ?? 0, moedas: d?.moedas ?? 0, nivel: d?.nivel ?? null };
    });
}

function SomenteConsulta() {
  return (
    <p className="rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-300">
      🔒 Saldo nunca é editado diretamente. Corrigir é lançar um ajuste compensatório no ledger, com motivo — fica no extrato do vendedor e na auditoria.
    </p>
  );
}

function novaChave() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

/** Ajuste compensatório: XP e/ou VendaCoins, positivo ou negativo, motivo obrigatório. */
function FormAjuste({ campo }: { campo: 'xp' | 'moedas' }) {
  const { estado, executar } = useAdmin();
  const ativos = estado.vendedores.filter((v) => v.status !== 'DESLIGADO');
  const [form, setForm] = useState({ vendedorId: ativos[0]?.id ?? '', valor: '', motivo: '' });
  const [chave, setChave] = useState(novaChave);
  const [feedback, setFeedback] = useState<string | null>(null);
  if (!ativos.length) return null;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const valor = Number(form.valor);
    if (!Number.isInteger(valor) || valor === 0) return setFeedback('Informe um número inteiro diferente de zero (negativo para debitar).');
    if (form.motivo.trim().length < 10) return setFeedback('Explique o motivo (mínimo 10 caracteres).');
    const erro = await executar(() => lancarAjuste({ vendedorId: form.vendedorId, xp: campo === 'xp' ? valor : 0, moedas: campo === 'moedas' ? valor : 0, motivo: form.motivo.trim(), chave }));
    setFeedback(erro ?? 'Ajuste lançado no ledger e registrado na auditoria.');
    if (!erro) {
      setForm({ ...form, valor: '', motivo: '' });
      setChave(novaChave());
    }
  }

  return (
    <Bloco titulo={`Lançar ajuste de ${campo === 'xp' ? 'XP' : 'VendaCoins'}`}>
      <form onSubmit={(e) => void enviar(e)} className="grid gap-3 sm:grid-cols-3">
        <Campo rotulo="Vendedor">
          <select className={INPUT} value={form.vendedorId} onChange={(e) => setForm({ ...form, vendedorId: e.target.value })}>
            {ativos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo={campo === 'xp' ? 'XP (+ ou −)' : 'VendaCoins (+ ou −)'} ajuda="Limite de 1.000 por lançamento.">
          <input type="number" step={1} min={-1000} max={1000} className={INPUT} value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} required />
        </Campo>
        <Campo rotulo="Motivo (obrigatório)">
          <input className={INPUT} value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} minLength={10} required />
        </Campo>
        <div className="sm:col-span-3">
          <Botao type="submit" tipo="primario">
            Lançar ajuste
          </Botao>
          <span className="ml-2 text-xs text-slate-400">{feedback}</span>
        </div>
      </form>
    </Bloco>
  );
}

export function XpAdmin() {
  const { estado } = useAdmin();
  const saldos = useSaldos();
  const regua = estado.gamificacao.regua;
  return (
    <>
      <TituloPagina titulo="XP" descricao={`Experiência e progressão. Régua v${regua.versao} vigente no servidor.`} />
      <SomenteConsulta />
      <Bloco titulo={`Regras ativas (régua v${regua.versao})`}>
        <ul className="grid gap-2 sm:grid-cols-3">
          {Object.keys(ROTULO_REGRA).map((k) => (
            <li key={k} className="flex items-center justify-between rounded-xl bg-slate-800/70 px-3 py-2 text-sm">
              <span className="text-slate-200">{ROTULO_REGRA[k]}</span>
              <span className="font-semibold text-sky-200">+{regua.xp[k] ?? 0} XP</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-400">Missões, competições e campanhas definem o próprio XP. Check-in diário: ver “Recompensa de acesso diário”. Venda cancelada estorna o XP da meta que deixou de ser batida.</p>
      </Bloco>
      <FormAjuste campo="xp" />
      <Bloco titulo="Lançamentos recentes — toda a equipe">
        {estado.gamificacao.movimentacoesXp.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhum lançamento ainda.</p>
        ) : (
          <ul className="divide-y divide-slate-800 text-sm">
            {estado.gamificacao.movimentacoesXp.map((e) => (
              <li key={e.id} className="flex justify-between gap-2 py-2">
                <span className="text-slate-200">
                  {e.vendedor.split(' ')[0]} · {e.origem} <span className="text-xs text-slate-400">· {dataCurta(e.quando)}</span>
                </span>
                <span className={`font-semibold ${(e.xp ?? 0) >= 0 ? 'text-sky-200' : 'text-rose-300'}`}>
                  {(e.xp ?? 0) >= 0 ? '+' : '−'}
                  {Math.abs(e.xp ?? 0)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Bloco>
      <TabelaResponsiva
        legenda="XP por vendedor"
        linhas={saldos}
        chave={(s) => s.v.id}
        vazio="Nenhum vendedor."
        colunas={[
          { titulo: 'Vendedor', celula: (s) => s.v.nome },
          { titulo: 'XP', celula: (s) => inteiro(s.xp), alinhar: 'direita' },
          { titulo: 'Nível', celula: (s) => (s.nivel ? `${s.nivel.nivel} · ${s.nivel.nome}` : '—') },
          { titulo: 'Próximo', celula: (s) => (s.nivel?.proximo ? `faltam ${inteiro(s.nivel.faltaXp ?? 0)} XP` : 'máximo') },
        ]}
      />
    </>
  );
}

export function VendaCoinsAdmin() {
  const { estado } = useAdmin();
  const saldos = useSaldos();
  const regua = estado.gamificacao.regua;
  return (
    <>
      <TituloPagina titulo="VendaCoins" descricao="Moeda de recompensa do ecossistema. Sem conversão em dinheiro, sem valor monetário." />
      <SomenteConsulta />
      <Bloco titulo={`Regras de crédito (régua v${regua.versao})`}>
        <ul className="grid gap-2 sm:grid-cols-3">
          {Object.keys(ROTULO_REGRA).map((k) => (
            <li key={k} className="flex items-center justify-between rounded-xl bg-slate-800/70 px-3 py-2 text-sm">
              <span className="text-slate-200">{ROTULO_REGRA[k]}</span>
              <span className="font-semibold text-amber-200">+{regua.moedas[k] ?? 0} 🪙</span>
            </li>
          ))}
        </ul>
      </Bloco>
      <FormAjuste campo="moedas" />
      <Bloco titulo="Movimentações recentes — toda a equipe">
        {estado.gamificacao.movimentacoesMoedas.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhuma movimentação ainda.</p>
        ) : (
          <ul className="divide-y divide-slate-800 text-sm">
            {estado.gamificacao.movimentacoesMoedas.map((e) => (
              <li key={e.id} className="flex justify-between gap-2 py-2">
                <span className="text-slate-200">
                  {e.vendedor.split(' ')[0]} · {e.origem} <span className="text-xs text-slate-400">· {dataCurta(e.quando)}</span>
                </span>
                <span className={`font-semibold ${(e.valor ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {(e.valor ?? 0) >= 0 ? '+' : '−'}
                  {Math.abs(e.valor ?? 0)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Bloco>
      <TabelaResponsiva
        legenda="Saldo por vendedor"
        linhas={saldos}
        chave={(s) => s.v.id}
        vazio="Nenhum vendedor."
        colunas={[
          { titulo: 'Vendedor', celula: (s) => s.v.nome },
          { titulo: 'Saldo', celula: (s) => `${inteiro(s.moedas)} 🪙`, alinhar: 'direita' },
        ]}
      />
    </>
  );
}

export function ConquistasAdmin() {
  const { estado } = useAdmin();
  const saldos = useSaldos();
  const distribuicao = estado.gamificacao.niveis.map((n) => ({ n, qtd: saldos.filter((s) => s.nivel?.nivel === n.nivel).length }));
  const max = Math.max(1, ...distribuicao.map((d) => d.qtd));
  return (
    <>
      <TituloPagina titulo="Níveis e conquistas" descricao="Consulta da curva de níveis e do catálogo de badges do servidor. Sem editor — mudanças de regra passam pela régua versionada." />
      <Bloco titulo="Distribuição dos vendedores por nível">
        <ul className="flex flex-col gap-2">
          {distribuicao.map(({ n, qtd }) => (
            <li key={n.nivel} className="grid grid-cols-[120px_1fr_40px] items-center gap-2 text-sm">
              <span className="text-slate-200">
                {n.nivel}. {n.nome}
                <span className="block text-xs text-slate-400">≥ {inteiro(n.xpMinimo)} XP</span>
              </span>
              <span className="h-3 rounded-full bg-slate-700" aria-hidden="true">
                <span className="block h-3 rounded-full bg-sky-400" style={{ width: `${(qtd / max) * 100}%` }} />
              </span>
              <span className="text-right font-semibold text-white">{qtd}</span>
            </li>
          ))}
        </ul>
      </Bloco>
      <TabelaResponsiva
        legenda="Catálogo de conquistas"
        linhas={estado.gamificacao.conquistas}
        chave={(c) => c.codigo}
        vazio="Catálogo vazio."
        colunas={[
          { titulo: 'Conquista', celula: (c) => c.titulo },
          { titulo: 'Regra', celula: (c) => c.descricao },
          { titulo: 'Conquistaram', celula: (c) => <Selo tom={c.conquistaram ? 'ok' : 'neutro'}>{c.conquistaram}</Selo> },
        ]}
      />
    </>
  );
}

// ================================================================== reconhecimentos

const MOTIVOS: { id: MotivoReconhecimento; rotulo: string }[] = [
  { id: 'RESULTADO', rotulo: 'Resultado' },
  { id: 'EVOLUCAO', rotulo: 'Evolução' },
  { id: 'INICIATIVA', rotulo: 'Iniciativa' },
  { id: 'EQUIPE', rotulo: 'Espírito de equipe' },
  { id: 'SUPERACAO', rotulo: 'Superação' },
  { id: 'OUTRO', rotulo: 'Outro (descreva)' },
];

export function ReconhecimentosAdmin() {
  const { estado, executar } = useAdmin();
  const ativos = estado.vendedores.filter((v) => v.status === 'ATIVO');
  const [form, setForm] = useState({ vendedorId: ativos[0]?.id ?? '', motivo: 'RESULTADO' as MotivoReconhecimento, titulo: '', mensagem: '' });
  const [feedback, setFeedback] = useState<string | null>(null);
  const nome = (id: string) => estado.vendedores.find((v) => v.id === id)?.nome ?? id;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (form.titulo.trim().length < 3 || form.mensagem.trim().length < 10) return;
    const erro = await executar(() => reconhecer({ vendedorId: form.vendedorId, motivo: form.motivo, titulo: form.titulo.trim(), mensagem: form.mensagem.trim() }));
    setFeedback(erro ?? `Reconhecimento enviado para ${nome(form.vendedorId).split(' ')[0]}. Aparece no app e no feed da loja.`);
    if (!erro) setForm({ ...form, titulo: '', mensagem: '' });
  }

  return (
    <>
      <TituloPagina titulo="Reconhecimentos" descricao="Na Fase 1, quem reconhece é o Admin. Reconhecimento não dá XP automático." />
      <Feedback texto={feedback} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Bloco titulo="Reconhecer vendedor">
          {ativos.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhum vendedor ativo para reconhecer.</p>
          ) : (
            <form onSubmit={(e) => void enviar(e)} className="grid gap-3">
              <Campo rotulo="Vendedor">
                <select className={INPUT} value={form.vendedorId} onChange={(e) => setForm({ ...form, vendedorId: e.target.value })}>
                  {ativos.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.nome}
                    </option>
                  ))}
                </select>
              </Campo>
              <fieldset>
                <legend className="mb-1 text-sm font-medium text-slate-200">Motivo</legend>
                <div className="flex flex-wrap gap-2">
                  {MOTIVOS.map((m) => (
                    <label key={m.id} className={`flex min-h-[40px] cursor-pointer items-center gap-2 rounded-full px-3 text-sm ${form.motivo === m.id ? 'bg-amber-500/20 text-amber-100 ring-1 ring-amber-300/50' : 'text-slate-300 ring-1 ring-slate-700'}`}>
                      <input type="radio" name="motivo" className="sr-only" checked={form.motivo === m.id} onChange={() => setForm({ ...form, motivo: m.id })} />
                      {m.rotulo}
                    </label>
                  ))}
                </div>
              </fieldset>
              <Campo rotulo="Título">
                <input className={INPUT} value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} minLength={3} required placeholder="Ex.: Atendimento que vira fidelidade" />
              </Campo>
              <Campo rotulo="Mensagem" ajuda="Mínimo 10 caracteres. Específica vale mais que genérica.">
                <textarea rows={3} className={`${INPUT} py-2`} value={form.mensagem} onChange={(e) => setForm({ ...form, mensagem: e.target.value })} minLength={10} required />
              </Campo>
              <div>
                <Botao type="submit" tipo="primario">
                  Enviar reconhecimento
                </Botao>
              </div>
            </form>
          )}
        </Bloco>
        <Bloco titulo="Enviados">
          {estado.reconhecimentos.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhum reconhecimento enviado ainda.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {estado.reconhecimentos.map((r) => (
                <li key={r.id} className="rounded-xl bg-slate-800/70 p-3 text-sm">
                  <p className="font-semibold text-white">💛 {r.titulo}</p>
                  <p className="text-xs text-slate-400">
                    {nome(r.vendedorId)} · {MOTIVOS.find((m) => m.id === r.motivo)?.rotulo} · {dataCurta(r.quando)} {hora(r.quando)} · por {r.autor}
                  </p>
                  <p className="mt-1 text-slate-300">{r.mensagem}</p>
                </li>
              ))}
            </ul>
          )}
        </Bloco>
      </div>
    </>
  );
}

// ================================================================== feed

const TIPOS_FEED: { id: TipoFeed; rotulo: string; exemplo: string }[] = [
  { id: 'POSICAO', rotulo: 'Mudança de posição', exemplo: 'Você subiu para o 2º lugar na loja.' },
  { id: 'META', rotulo: 'Meta batida', exemplo: 'Rafaela bateu a meta do dia.' },
  { id: 'RECORDE', rotulo: 'Recorde pessoal', exemplo: 'Maria quebrou o recorde pessoal: melhor dia de vendas.' },
  { id: 'MISSAO', rotulo: 'Missões', exemplo: 'João completou a missão “Scarpin da semana”.' },
  { id: 'CONQUISTA', rotulo: 'Conquistas', exemplo: 'Ana conquistou o badge “Primeira Meta”.' },
  { id: 'LOJA', rotulo: 'Loja × Loja', exemplo: 'Caruaru assumiu a liderança.' },
  { id: 'COMPETICAO', rotulo: 'Competições e campanhas', exemplo: 'Começou a competição “Sprint da Semana”.' },
  { id: 'RECONHECIMENTO', rotulo: 'Reconhecimentos', exemplo: 'Ana recebeu um reconhecimento.' },
];

export function FeedAdmin() {
  const { estado, executar } = useAdmin();
  const [feedback, setFeedback] = useState<string | null>(null);
  async function alternar(t: TipoFeed) {
    const c = configDoEstado(estado);
    c.feedTipos[t] = !estado.feedTipos[t];
    const erro = await executar(() => salvarConfig(c));
    setFeedback(erro ?? 'Preferência do feed salva.');
  }
  return (
    <>
      <TituloPagina titulo="Feed" descricao="Eventos gerados pelo sistema. Sem postagem livre, curtida, comentário ou chat — o Admin só governa quais tipos aparecem." />
      <Feedback texto={feedback} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Bloco titulo="Tipos de evento visíveis">
          <ul className="flex flex-col gap-2">
            {TIPOS_FEED.map((t) => (
              <li key={t.id}>
                <label className="flex min-h-[48px] items-start gap-3 rounded-xl bg-slate-800/70 px-3 py-2 text-sm">
                  <input type="checkbox" className="mt-0.5 h-5 w-5 accent-amber-500" checked={estado.feedTipos[t.id]} onChange={() => void alternar(t.id)} />
                  <span>
                    <span className="block font-medium text-white">{t.rotulo}</span>
                    <span className="block text-xs text-slate-400">Ex.: {t.exemplo}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </Bloco>
        <Bloco titulo="Últimos eventos da empresa">
          {estado.feedRecente.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhum evento ainda. Eles aparecem conforme as vendas, metas e reconhecimentos acontecem.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {estado.feedRecente.map((e) => (
                <li key={e.id} className="flex items-start gap-2 rounded-xl bg-slate-800/70 px-3 py-2 text-sm">
                  <span className="flex-1 text-slate-200">{e.texto}</span>
                  <span className="shrink-0 text-xs text-slate-400">{haQuanto(e.quando, estado.agora)}</span>
                </li>
              ))}
            </ul>
          )}
        </Bloco>
      </div>
    </>
  );
}
