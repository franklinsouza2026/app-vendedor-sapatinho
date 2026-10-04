/**
 * Performance: metas do mês (loja × individual + dias de trabalho previstos),
 * como a meta do dia é derivada (D6), rankings (D9), elegibilidade e
 * indicadores. Tudo salvo pela API real; o app da vendedora recebe na hora.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { consistenciaMetasLoja } from '../dominio/admin';
import { UNIDADE_METRICA } from '../dominio/estimativas';
import type { Metrica } from '../dominio/tipos';
import { mesCurto, reais } from '../formato';
import { Abas } from '../componentes/ui';
import { configDoEstado, salvarConfig, salvarMetaLoja, salvarMetaVendedor } from './api';
import { useAdmin } from './AdminDados';
import type { Indicador } from './tiposAdmin';
import { Bloco, Botao, Campo, Feedback, INPUT, Selo, TabelaResponsiva, TituloPagina } from './ui';
import { ROTULO_MOTIVO_INELEGIVEL } from './Pessoas';

// ================================================================== metas

export function Metas() {
  const [aba, setAba] = useState<'mes' | 'diaria'>('mes');
  return (
    <>
      <TituloPagina titulo="Metas e dias de trabalho" descricao="Meta da loja, meta individual do mês e quantos dias cada vendedor trabalha — a meta do dia sai daí, sem cadastro diário." />
      <Abas<'mes' | 'diaria'>
        rotulo="Áreas de metas"
        ativa={aba}
        onTrocar={setAba}
        abas={[
          { id: 'mes', rotulo: 'Metas do mês' },
          { id: 'diaria', rotulo: 'Meta do dia' },
        ]}
      />
      {aba === 'mes' && <MetasDoMes />}
      {aba === 'diaria' && <MetaDiaria />}
    </>
  );
}

function MetasDoMes() {
  const { estado, executar } = useAdmin();
  const [rascunho, setRascunho] = useState<Record<string, { mensal?: string; dias?: string }>>({});
  const [metaLoja, setMetaLoja] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);

  const valor = (id: string, campo: 'mensal' | 'dias') => {
    const r = rascunho[id]?.[campo];
    if (r !== undefined) return r;
    const m = estado.metas.individuais[id];
    const atual = campo === 'mensal' ? m?.mensal : m?.diasPrevistos;
    return atual ? String(atual) : '';
  };

  async function salvarLoja(lojaId: string) {
    const loja = estado.lojas.find((l) => l.id === lojaId)!;
    const doLoja = estado.vendedores.filter((v) => v.lojaId === lojaId && v.status !== 'DESLIGADO');
    const mudancas = doLoja.filter((v) => rascunho[v.id]);
    const novaLoja = metaLoja[lojaId] !== undefined ? Number(metaLoja[lojaId]) || null : loja.metaMes;
    if (mudancas.length === 0 && novaLoja === loja.metaMes) return setFeedback('Nada mudou.');
    setSalvando(lojaId);
    const erro = await executar(async () => {
      for (const v of mudancas) await salvarMetaVendedor(estado.mes, v.id, { mensal: Number(valor(v.id, 'mensal')) || null, diasPrevistos: Number(valor(v.id, 'dias')) || null });
      if (novaLoja !== loja.metaMes) await salvarMetaLoja(estado.mes, lojaId, novaLoja);
    });
    setSalvando(null);
    if (erro) return setFeedback(erro);
    setRascunho({});
    setMetaLoja({});
    setFeedback(`Metas de ${loja.nome} salvas. A vendedora já recebe o novo valor (meta do dia recalculada).`);
  }

  return (
    <>
      <p className="rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-300">
        Mês de referência: <strong className="text-white">{mesCurto(estado.mes)}</strong>. Meta do dia = meta do mês ÷ dias de trabalho previstos. Domingo conta normalmente — quem decide quantos dias a pessoa trabalha é você. Alterar o mês em andamento recalcula a meta do dia de todo o mês (e os prêmios de meta acompanham).
      </p>
      <Feedback texto={feedback} />
      {estado.lojas
        .filter((l) => l.status === 'ATIVA')
        .map((l) => {
          const c = consistenciaMetasLoja(estado, l.id);
          const doLoja = estado.vendedores.filter((v) => v.lojaId === l.id && v.status !== 'DESLIGADO');
          const somaRascunho = doLoja.reduce((a, v) => a + (Number(valor(v.id, 'mensal')) || 0), 0);
          const metaLojaAtual = metaLoja[l.id] !== undefined ? Number(metaLoja[l.id]) || 0 : (l.metaMes ?? 0);
          const diferenca = somaRascunho - metaLojaAtual;
          return (
            <Bloco key={l.id} titulo={l.nome} acao={<Botao tipo="primario" disabled={salvando === l.id} onClick={() => void salvarLoja(l.id)}>{salvando === l.id ? 'Salvando…' : 'Salvar metas'}</Botao>}>
              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <Campo rotulo="Meta da loja (mês)" ajuda="Opcional — serve para conferir a soma das metas individuais.">
                  <input type="number" step={1000} min={0} className={INPUT} placeholder="sem meta da loja" value={metaLoja[l.id] ?? (l.metaMes ? String(l.metaMes) : '')} onChange={(e) => setMetaLoja({ ...metaLoja, [l.id]: e.target.value })} />
                </Campo>
                <div className={`self-end rounded-xl px-3 py-2 text-sm ${metaLojaAtual === 0 ? 'bg-slate-800 text-slate-300' : diferenca === 0 ? 'bg-emerald-500/10 text-emerald-200' : 'bg-amber-500/10 text-amber-200'}`} role="status">
                  Soma individual: <strong>{reais(somaRascunho)}</strong>
                  <br />
                  {metaLojaAtual === 0 ? 'Sem meta da loja para comparar' : diferenca === 0 ? '✓ Consistente com a meta da loja' : `⚠️ Diferença de ${reais(Math.abs(diferenca))} (${diferenca > 0 ? 'acima' : 'abaixo'} da meta da loja)`}
                </div>
              </div>
              {doLoja.length === 0 ? (
                <p className="mt-3 text-sm text-slate-400">Nenhum vendedor nesta loja.</p>
              ) : (
                <ul className="mt-3 grid gap-2 lg:grid-cols-2">
                  {doLoja.map((v) => (
                    <li key={v.id} className="flex min-w-0 flex-wrap items-center gap-2 rounded-xl bg-slate-800/70 px-3 py-2">
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{v.nome}</span>
                      <label className="flex items-center gap-1 text-xs text-slate-400">
                        R$
                        <input aria-label={`Meta do mês de ${v.nome}`} type="number" step={500} min={0} placeholder="sem meta" className="min-h-[40px] w-28 shrink-0 rounded-lg border border-slate-600 bg-base px-2 text-right text-white" value={valor(v.id, 'mensal')} onChange={(e) => setRascunho({ ...rascunho, [v.id]: { ...rascunho[v.id], mensal: e.target.value } })} />
                      </label>
                      <label className="flex items-center gap-1 text-xs text-slate-400">
                        <input aria-label={`Dias de trabalho de ${v.nome}`} type="number" min={1} max={31} placeholder="dias" className="min-h-[40px] w-16 shrink-0 rounded-lg border border-slate-600 bg-base px-2 text-right text-white" value={valor(v.id, 'dias')} onChange={(e) => setRascunho({ ...rascunho, [v.id]: { ...rascunho[v.id], dias: e.target.value } })} />
                        dias
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              {c.semMeta.length > 0 && <p className="mt-2 text-xs text-amber-200">⚠️ Sem meta: {c.semMeta.map((v) => v.nome.split(' ')[0]).join(', ')}.</p>}
              {c.semDias.length > 0 && <p className="mt-1 text-xs text-amber-200">⚠️ Sem dias previstos (sem meta do dia): {c.semDias.map((v) => v.nome.split(' ')[0]).join(', ')}.</p>}
            </Bloco>
          );
        })}
    </>
  );
}

function MetaDiaria() {
  const { estado } = useAdmin();
  const ativos = estado.vendedores.filter((v) => v.status !== 'DESLIGADO');
  const lojaNome = (id: string) => estado.lojas.find((l) => l.id === id)?.nome ?? id;
  return (
    <>
      <p className="text-sm text-slate-300">
        Regra única, no servidor: <strong className="text-white">meta do dia = meta do mês ÷ dias de trabalho previstos</strong>. Não há cadastro diário. Sem meta do mês ou sem dias previstos, o vendedor fica sem meta do dia (e aparece nas pendências).
      </p>
      <TabelaResponsiva
        legenda="Meta do dia por vendedor"
        linhas={ativos}
        chave={(v) => v.id}
        vazio="Nenhum vendedor ativo."
        colunas={[
          { titulo: 'Vendedor', celula: (v) => <Link to={`/admin/vendedores/${v.id}`} className="text-white hover:underline">{v.nome}</Link> },
          { titulo: 'Loja', celula: (v) => lojaNome(v.lojaId) },
          { titulo: 'Meta do mês', celula: (v) => (estado.metas.individuais[v.id]?.mensal ? reais(estado.metas.individuais[v.id].mensal!) : '—') },
          { titulo: 'Dias previstos', celula: (v) => estado.metas.individuais[v.id]?.diasPrevistos ?? '—', alinhar: 'direita' },
          { titulo: 'Meta do dia', celula: (v) => (estado.metas.individuais[v.id]?.diaria ? <strong className="text-white">{reais(estado.metas.individuais[v.id].diaria!)}</strong> : <Selo tom="aviso">sem meta do dia</Selo>) },
          { titulo: 'Hoje', celula: (v) => reais(estado.desempenho.find((d) => d.vendedorId === v.id)?.hoje.faturamento ?? 0) },
        ]}
      />
    </>
  );
}

// ================================================================== rankings e elegibilidade

const FORMULAS: { id: 'PCT_META_COLETIVA' | 'MEDIA_SCORE' | 'EVOLUCAO_COLETIVA'; titulo: string; explica: string }[] = [
  { id: 'PCT_META_COLETIVA', titulo: '% da meta coletiva', explica: 'Soma das vendas ÷ soma das metas dos vendedores da loja. Justo entre lojas de tamanhos diferentes.' },
  { id: 'MEDIA_SCORE', titulo: 'Média do Score Geral', explica: 'Média do score dos vendedores elegíveis. Valoriza equilíbrio.' },
  { id: 'EVOLUCAO_COLETIVA', titulo: 'Evolução coletiva', explica: '% da meta coletiva contra o mesmo período do mês anterior (em pontos percentuais).' },
];

export function Rankings() {
  const [aba, setAba] = useState<'individual' | 'lojas' | 'elegibilidade'>('individual');
  return (
    <>
      <TituloPagina titulo="Rankings e elegibilidade" descricao="Quais rankings existem, qual métrica é a corrida principal e quem entra. Desempate: vendas (R$) → mais acessos ao app no mês → maior ticket médio; se os três empatarem, o empate permanece." />
      <Abas<'individual' | 'lojas' | 'elegibilidade'>
        rotulo="Áreas de rankings"
        ativa={aba}
        onTrocar={setAba}
        abas={[
          { id: 'individual', rotulo: 'Individual' },
          { id: 'lojas', rotulo: 'Loja × Loja' },
          { id: 'elegibilidade', rotulo: 'Elegibilidade' },
        ]}
      />
      {aba === 'individual' && <RankingIndividual />}
      {aba === 'lojas' && <RankingLojas />}
      {aba === 'elegibilidade' && <Elegibilidade />}
    </>
  );
}

function useSalvarConfig() {
  const { estado, executar } = useAdmin();
  const [feedback, setFeedback] = useState<string | null>(null);
  async function salvar(mudar: (c: ReturnType<typeof configDoEstado>) => void, ok: string) {
    const c = configDoEstado(estado);
    mudar(c);
    const erro = await executar(() => salvarConfig(c));
    setFeedback(erro ?? ok);
  }
  return { salvar, feedback };
}

function RankingIndividual() {
  const { estado } = useAdmin();
  const { salvar, feedback } = useSalvarConfig();
  const metricas = Object.keys(UNIDADE_METRICA) as Metrica[];
  return (
    <>
      <Feedback texto={feedback} />
      <Bloco titulo="Métricas disponíveis para o vendedor (loja e geral)">
        <ul className="grid gap-2 sm:grid-cols-2">
          {metricas.map((m) => {
            const ativa = estado.rankings.metricasAtivas.includes(m);
            return (
              <li key={m}>
                <label className="flex min-h-[48px] items-start gap-3 rounded-xl bg-slate-800/70 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-5 w-5 accent-amber-500"
                    checked={ativa}
                    disabled={ativa && estado.rankings.metricaCorrida === m}
                    onChange={() => void salvar((c) => (c.metricasRanking = ativa ? c.metricasRanking.filter((x) => x !== m) : [...c.metricasRanking, m]), `Ranking ${UNIDADE_METRICA[m].rotulo} ${ativa ? 'desativado' : 'ativado'}.`)}
                  />
                  <span>
                    <span className="block font-medium text-white">{UNIDADE_METRICA[m].rotulo}</span>
                    <span className="block text-xs text-slate-400">{UNIDADE_METRICA[m].ajuda}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </Bloco>
      <Bloco titulo="Corrida principal (Home e Próximo Alvo)">
        <Campo rotulo="Métrica da “Sua posição” na Home" ajuda="Só Vendas (R$) converte a distância em vendas. Nas outras, a distância aparece na unidade da métrica.">
          <select
            className={INPUT}
            value={estado.rankings.metricaCorrida}
            onChange={(e) => {
              const m = e.target.value as Metrica;
              void salvar((c) => {
                c.metricaCorrida = m;
                if (!c.metricasRanking.includes(m)) c.metricasRanking.push(m);
              }, `Corrida principal: ${UNIDADE_METRICA[m].rotulo}.`);
            }}
          >
            {metricas.map((m) => (
              <option key={m} value={m}>
                {UNIDADE_METRICA[m].rotulo}
              </option>
            ))}
          </select>
        </Campo>
      </Bloco>
      <p className="text-xs text-slate-400">Fórmulas não são editáveis aqui — evitar “fórmula livre” é de propósito. O Score Geral segue a régua v{estado.gamificacao.regua.versao} do servidor.</p>
    </>
  );
}

function RankingLojas() {
  const { estado } = useAdmin();
  const { salvar, feedback } = useSalvarConfig();
  const cfg = estado.rankings.lojaXLoja;
  const linhas = estado.lojaXLoja;
  return (
    <>
      <Feedback texto={feedback} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-300">Status:</span>
        {cfg.status === 'ATIVO' ? <Selo tom="ok">● Ativo</Selo> : <Selo tom="aviso">Aguardando regra</Selo>}
        <span className="text-sm text-slate-400">· Período: mês corrente</span>
        {cfg.status === 'ATIVO' && (
          <Botao tipo="fantasma" onClick={() => void salvar((c) => (c.lojaXLoja = { ...c.lojaXLoja, ativo: false }), 'Loja × Loja desligado.')}>
            Desligar
          </Botao>
        )}
      </div>
      <Bloco titulo="Regra de pontuação (escolha entre opções fechadas)">
        <fieldset className="grid gap-2 md:grid-cols-3">
          <legend className="sr-only">Fórmula Loja × Loja</legend>
          {FORMULAS.map((f) => (
            <label key={f.id} className={`flex cursor-pointer flex-col gap-1 rounded-xl border p-3 ${cfg.formula === f.id && cfg.status === 'ATIVO' ? 'border-accentSoft bg-accent/10' : 'border-slate-700'}`}>
              <span className="flex items-center gap-2">
                <input type="radio" name="formula" className="h-5 w-5 accent-amber-500" checked={cfg.formula === f.id && cfg.status === 'ATIVO'} onChange={() => void salvar((c) => (c.lojaXLoja = { ...c.lojaXLoja, ativo: true, formula: f.id }), `Loja × Loja ativo: ${f.titulo}.`)} />
                <span className="font-semibold text-white">{f.titulo}</span>
              </span>
              <span className="text-xs text-slate-400">{f.explica}</span>
            </label>
          ))}
        </fieldset>
      </Bloco>
      <Bloco titulo="Lojas participantes e resultado parcial">
        <p className="mb-2 text-xs text-slate-400">Sem nenhuma marcada, todas as lojas ativas participam.</p>
        <ul className="flex flex-col gap-2">
          {estado.lojas
            .filter((l) => l.status === 'ATIVA')
            .map((l) => {
              const dentro = cfg.lojas.includes(l.id);
              const linha = linhas.find((x) => x.lojaId === l.id);
              return (
                <li key={l.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-800/70 px-3 py-2 text-sm">
                  <label className="flex items-center gap-2 text-slate-200">
                    <input type="checkbox" className="h-5 w-5 accent-amber-500" checked={dentro} onChange={() => void salvar((c) => (c.lojaXLoja = { ...c.lojaXLoja, lojas: dentro ? c.lojaXLoja.lojas.filter((x) => x !== l.id) : [...c.lojaXLoja.lojas, l.id] }), `${l.nome} ${dentro ? 'removida do' : 'incluída no'} Loja × Loja.`)} />
                    {l.nome}
                  </label>
                  <span className="text-slate-400">{linha ? `${linha.posicao}º · ${linha.pontos.toLocaleString('pt-BR')} pts` : cfg.status === 'ATIVO' ? 'sem dados ainda' : '—'}</span>
                </li>
              );
            })}
        </ul>
      </Bloco>
    </>
  );
}

function Elegibilidade() {
  const { estado } = useAdmin();
  const lojaNome = (id: string) => estado.lojas.find((l) => l.id === id)?.nome ?? id;
  return (
    <>
      <p className="text-sm text-slate-400">Quem entra no ranking: vendedor com acesso ativo e sem exceção. Exceção manual exige motivo e fica na auditoria — faça pelo detalhe do vendedor.</p>
      <TabelaResponsiva
        legenda="Elegibilidade ao ranking"
        linhas={estado.vendedores}
        chave={(v) => v.id}
        vazio="Nenhum vendedor cadastrado."
        colunas={[
          { titulo: 'Vendedor', celula: (v) => <Link to={`/admin/vendedores/${v.id}`} className="text-white hover:underline">{v.nome}</Link> },
          { titulo: 'Loja', celula: (v) => lojaNome(v.lojaId) },
          { titulo: 'Situação', celula: (v) => (v.elegivel && v.status === 'ATIVO' ? <Selo tom="ok">✓ Elegível</Selo> : <Selo tom="aviso">✕ Não elegível</Selo>) },
          { titulo: 'Motivo', celula: (v) => (v.motivoInelegivel ? ROTULO_MOTIVO_INELEGIVEL[v.motivoInelegivel] : v.status !== 'ATIVO' ? 'Acesso não ativo' : '—') },
          { titulo: 'Exceção', celula: (v) => v.excecao ?? '—' },
        ]}
      />
    </>
  );
}

// ================================================================== indicadores

const ROTULO_INDICADOR: Record<Indicador, string> = {
  VENDAS: 'Vendas (R$)',
  QTD_VENDAS: 'Quantidade de vendas',
  PARES: 'Pares',
  TICKET: 'Ticket médio',
  PA: 'PA',
  PERCENTUAL_META: '% da meta',
  SCORE: 'Score Geral',
  EVOLUCAO: 'Evolução',
  CONSISTENCIA: 'Consistência',
  CONVERSAO: 'Conversão',
};

const FONTE: Record<'CONFIAVEL' | 'PARCIAL' | 'SEM_FONTE', { texto: string; tom: 'ok' | 'aviso' | 'erro' }> = {
  CONFIAVEL: { texto: '✓ Fonte confiável', tom: 'ok' },
  PARCIAL: { texto: '◐ Fonte parcial', tom: 'aviso' },
  SEM_FONTE: { texto: '✕ Sem fonte', tom: 'erro' },
};

export function Indicadores() {
  const { estado } = useAdmin();
  const { salvar, feedback } = useSalvarConfig();
  return (
    <>
      <TituloPagina titulo="Indicadores" descricao="Regra: indicador sem dado confiável não aparece como real para o vendedor." />
      <Feedback texto={feedback} />
      <ul className="flex flex-col gap-2">
        {(Object.keys(estado.indicadores) as Indicador[]).map((k) => {
          const i = estado.indicadores[k];
          const semFonte = i.fonte === 'SEM_FONTE';
          return (
            <li key={k} className="flex flex-col gap-2 rounded-2xl border border-slate-700/60 bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-white">{ROTULO_INDICADOR[k]}</span>
                  <Selo tom={FONTE[i.fonte].tom}>{FONTE[i.fonte].texto}</Selo>
                </p>
                <p className="text-xs text-slate-400">{i.nota}</p>
              </div>
              <label className={`flex min-h-[44px] shrink-0 items-center gap-2 text-sm ${semFonte ? 'text-slate-500' : 'text-slate-200'}`} title={semFonte ? 'Sem fonte confiável: não pode ser mostrado ao vendedor.' : undefined}>
                <input type="checkbox" className="h-5 w-5 accent-amber-500" checked={i.ativo && !semFonte} disabled={semFonte} onChange={() => void salvar((c) => (c.indicadores[k] = !i.ativo), `${ROTULO_INDICADOR[k]} ${i.ativo ? 'oculto' : 'liberado'} para o vendedor.`)} />
                {semFonte ? 'Bloqueado (sem fonte)' : 'Visível para o vendedor'}
              </label>
            </li>
          );
        })}
      </ul>
    </>
  );
}
