/**
 * Gamificação (consulta) e Comunicação (reconhecimento e feed).
 *
 * XP e VendaCoins são SOMENTE CONSULTA: nenhum saldo é editável. Qualquer
 * ajuste futuro será um lançamento compensatório no ledger, com motivo.
 */
import { FormEvent, useState } from 'react';
import { useFase1 } from '../demo/Fase1Contexto';
import { AGORA_DEMO, type MotivoReconhecimento, novoId, type TipoFeed } from '../demo/estado';
import { catalogoConquistas, desempenhoDemo, EU, REGUA_V1 } from '../demo/cenarios';
import { calcularNivel, NIVEIS_V1 } from '../dominio/niveis';
import { dataCurta, haQuanto, hora, inteiro } from '../formato';
import { AvisoSimulacao, Bloco, Botao, Campo, Feedback, INPUT, Selo, TabelaResponsiva, TituloPagina } from './ui';

const ROTULO_REGRA: Record<keyof typeof REGUA_V1, string> = {
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
  const { estado, dados } = useFase1();
  return estado.vendedores
    .filter((v) => v.status !== 'DESLIGADO')
    .map((v) => {
      const d = desempenhoDemo(v.id);
      const xp = v.id === EU ? dados.xp.total : d ? d.score * 2 : 0;
      const moedas = v.id === EU ? dados.moedas.saldo : d ? Math.round(d.score / 3) : 0;
      return { v, xp, moedas, nivel: calcularNivel(xp) };
    });
}

function SomenteConsulta() {
  return (
    <p className="rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-300">
      🔒 Somente consulta. Saldo nunca é editado diretamente — ajustes futuros serão lançamentos compensatórios no ledger, com motivo e auditoria.
    </p>
  );
}

export function XpAdmin() {
  const { dados } = useFase1();
  const saldos = useSaldos();
  return (
    <>
      <TituloPagina titulo="XP" descricao="Experiência e progressão. Régua v1 do backend (src/gamificacao/regras.service.ts)." />
      <SomenteConsulta />
      <Bloco titulo="Regras ativas (régua v1)">
        <ul className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(REGUA_V1) as (keyof typeof REGUA_V1)[]).map((k) => (
            <li key={k} className="flex items-center justify-between rounded-xl bg-slate-800/70 px-3 py-2 text-sm">
              <span className="text-slate-200">{ROTULO_REGRA[k]}</span>
              <span className="font-semibold text-sky-200">+{REGUA_V1[k].xp} XP</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-400">Missões e competições definem o próprio XP. Check-in diário (abrir o app) existe no backend mas não é exibido como incentivo na Fase 1.</p>
      </Bloco>
      <Bloco titulo="Lançamentos recentes — Ana (persona)">
        <ul className="divide-y divide-slate-800 text-sm">
          {dados.xp.historico.map((e) => (
            <li key={e.id} className="flex justify-between gap-2 py-2">
              <span className="text-slate-200">
                {e.origem} <span className="text-xs text-slate-400">· {dataCurta(e.quando)}</span>
              </span>
              <span className="font-semibold text-sky-200">+{e.xp}</span>
            </li>
          ))}
        </ul>
      </Bloco>
      <TabelaResponsiva
        legenda="XP por vendedor"
        linhas={saldos}
        chave={(s) => s.v.id}
        colunas={[
          { titulo: 'Vendedor', celula: (s) => s.v.nome },
          { titulo: 'XP', celula: (s) => inteiro(s.xp), alinhar: 'direita' },
          { titulo: 'Nível', celula: (s) => `${s.nivel.nivel} · ${s.nivel.nome}` },
          { titulo: 'Próximo', celula: (s) => (s.nivel.proximo ? `faltam ${inteiro(s.nivel.faltaXp!)} XP` : 'máximo') },
        ]}
      />
    </>
  );
}

export function VendaCoinsAdmin() {
  const { dados } = useFase1();
  const saldos = useSaldos();
  return (
    <>
      <TituloPagina titulo="VendaCoins" descricao="Moeda de recompensa do ecossistema. Sem conversão em dinheiro, sem valor monetário." />
      <SomenteConsulta />
      <Bloco titulo="Regras de crédito (régua v1)">
        <ul className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(REGUA_V1) as (keyof typeof REGUA_V1)[]).map((k) => (
            <li key={k} className="flex items-center justify-between rounded-xl bg-slate-800/70 px-3 py-2 text-sm">
              <span className="text-slate-200">{ROTULO_REGRA[k]}</span>
              <span className="font-semibold text-amber-200">+{REGUA_V1[k].moedas} 🪙</span>
            </li>
          ))}
        </ul>
      </Bloco>
      <Bloco titulo="Movimentações — Ana (persona)">
        <ul className="divide-y divide-slate-800 text-sm">
          {dados.moedas.historico.map((e) => (
            <li key={e.id} className="flex justify-between gap-2 py-2">
              <span className="text-slate-200">
                {e.origem} <span className="text-xs text-slate-400">· {dataCurta(e.quando)}</span>
              </span>
              <span className={`font-semibold ${e.valor >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                {e.valor >= 0 ? '+' : '−'}
                {Math.abs(e.valor)}
              </span>
            </li>
          ))}
        </ul>
      </Bloco>
      <TabelaResponsiva
        legenda="Saldo por vendedor"
        linhas={saldos}
        chave={(s) => s.v.id}
        colunas={[
          { titulo: 'Vendedor', celula: (s) => s.v.nome },
          { titulo: 'Saldo', celula: (s) => `${inteiro(s.moedas)} 🪙`, alinhar: 'direita' },
        ]}
      />
      <AvisoSimulacao>Saldos dos demais vendedores são estimados para a demo.</AvisoSimulacao>
    </>
  );
}

export function ConquistasAdmin() {
  const saldos = useSaldos();
  const catalogo = catalogoConquistas();
  const distribuicao = NIVEIS_V1.map((n) => ({ n, qtd: saldos.filter((s) => s.nivel.nivel === n.nivel).length }));
  const max = Math.max(1, ...distribuicao.map((d) => d.qtd));
  return (
    <>
      <TituloPagina titulo="Níveis e conquistas" descricao="Consulta da curva de níveis (v1) e do catálogo de badges. Sem editor — mudanças de regra passam pelo backend versionado." />
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
        linhas={catalogo}
        chave={(c) => c.codigo}
        colunas={[
          { titulo: 'Conquista', celula: (c) => `${c.icone} ${c.titulo}` },
          { titulo: 'Regra', celula: (c) => c.descricao },
          { titulo: 'Origem', celula: (c) => (c.origem === 'CATALOGO' ? <Selo tom="ok">Catálogo atual</Selo> : <Selo tom="info">Proposta Fase 1</Selo>) },
          { titulo: 'Status', celula: () => <Selo tom="ok">ativa</Selo> },
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
  const { estado, alterar } = useFase1();
  const [form, setForm] = useState({ vendedorId: EU, motivo: 'RESULTADO' as MotivoReconhecimento, titulo: '', mensagem: '' });
  const [feedback, setFeedback] = useState<string | null>(null);
  const nome = (id: string) => estado.vendedores.find((v) => v.id === id)?.nome ?? id;

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (form.titulo.trim().length < 3 || form.mensagem.trim().length < 10) return;
    alterar((st) => {
      st.reconhecimentos.unshift({ id: novoId('r'), vendedorId: form.vendedorId, motivo: form.motivo, titulo: form.titulo.trim(), mensagem: form.mensagem.trim(), quando: AGORA_DEMO, autor: 'Administração Sapatinho de Luxo' });
    }, { acao: 'Reconheceu vendedor', entidade: `Vendedor ${nome(form.vendedorId)}`, depois: `${MOTIVOS.find((m) => m.id === form.motivo)?.rotulo}: ${form.titulo.trim()}` });
    setFeedback(`Reconhecimento enviado para ${nome(form.vendedorId).split(' ')[0]}. Aparece no app dela e no feed.`);
    setForm({ ...form, titulo: '', mensagem: '' });
  }

  return (
    <>
      <TituloPagina titulo="Reconhecimentos" descricao="Na Fase 1, quem reconhece é o Admin (o Gerente fica para depois). Reconhecimento não dá XP automático." />
      <Feedback texto={feedback} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Bloco titulo="Reconhecer vendedor">
          <form onSubmit={enviar} className="grid gap-3">
            <Campo rotulo="Vendedor">
              <select className={INPUT} value={form.vendedorId} onChange={(e) => setForm({ ...form, vendedorId: e.target.value })}>
                {estado.vendedores
                  .filter((v) => v.status === 'ATIVO')
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.nome}
                      {v.id === EU ? ' (persona)' : ''}
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
        </Bloco>
        <Bloco titulo="Enviados">
          <ul className="flex flex-col gap-2">
            {estado.reconhecimentos.map((r) => (
              <li key={r.id} className="rounded-xl bg-slate-800/70 p-3 text-sm">
                <p className="font-semibold text-white">💛 {r.titulo}</p>
                <p className="text-xs text-slate-400">
                  {nome(r.vendedorId)} · {MOTIVOS.find((m) => m.id === r.motivo)?.rotulo} · {dataCurta(r.quando)} {hora(r.quando)}
                </p>
                <p className="mt-1 text-slate-300">{r.mensagem}</p>
              </li>
            ))}
          </ul>
        </Bloco>
      </div>
    </>
  );
}

// ================================================================== feed

const TIPOS_FEED: { id: TipoFeed; rotulo: string; exemplo: string }[] = [
  { id: 'POSICAO', rotulo: 'Mudança de posição', exemplo: 'Você subiu para #2 na loja.' },
  { id: 'META', rotulo: 'Meta batida', exemplo: 'Rafaela bateu 100% da meta de hoje.' },
  { id: 'RECORDE', rotulo: 'Recorde pessoal', exemplo: 'Maria quebrou o recorde de PA.' },
  { id: 'MISSAO', rotulo: 'Missões', exemplo: 'Nova missão no ar: Scarpin da semana.' },
  { id: 'CONQUISTA', rotulo: 'Conquistas e sequências', exemplo: 'João chegou a 5 dias seguidos de meta.' },
  { id: 'LOJA', rotulo: 'Loja × Loja', exemplo: 'Caruaru assumiu a liderança.' },
  { id: 'COMPETICAO', rotulo: 'Competições e campanhas', exemplo: 'Começou o Sprint da Semana.' },
  { id: 'RECONHECIMENTO', rotulo: 'Reconhecimentos', exemplo: 'Ana recebeu um reconhecimento.' },
];

export function FeedAdmin() {
  const { estado, alterar, dados } = useFase1();
  return (
    <>
      <TituloPagina titulo="Feed" descricao="Eventos gerados pelo sistema. Sem postagem livre, curtida, comentário ou chat — o Admin só governa quais tipos aparecem." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Bloco titulo="Tipos de evento visíveis">
          <ul className="flex flex-col gap-2">
            {TIPOS_FEED.map((t) => (
              <li key={t.id}>
                <label className="flex min-h-[48px] items-start gap-3 rounded-xl bg-slate-800/70 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-5 w-5 accent-amber-500"
                    checked={estado.feedTipos[t.id]}
                    onChange={() =>
                      alterar((st) => {
                        st.feedTipos[t.id] = !st.feedTipos[t.id];
                      }, { acao: estado.feedTipos[t.id] ? 'Ocultou tipo do feed' : 'Liberou tipo no feed', entidade: `Feed: ${t.rotulo}` })
                    }
                  />
                  <span>
                    <span className="block font-medium text-white">{t.rotulo}</span>
                    <span className="block text-xs text-slate-400">Ex.: {t.exemplo}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </Bloco>
        <Bloco titulo="Como está o feed da Ana agora">
          {dados.feed.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhum evento visível.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {dados.feed.map((e) => (
                <li key={e.id} className="flex items-start gap-2 rounded-xl bg-slate-800/70 px-3 py-2 text-sm">
                  <span aria-hidden="true">{e.icone}</span>
                  <span className="flex-1 text-slate-200">{e.texto}</span>
                  <span className="shrink-0 text-xs text-slate-400">{haQuanto(e.quando, dados.agora)}</span>
                </li>
              ))}
            </ul>
          )}
        </Bloco>
      </div>
    </>
  );
}
