/**
 * Performance: metas (loja × individual + consistência), meta diária
 * (3 regras para comparar), calendário operacional, rankings, elegibilidade
 * e indicadores. Tudo que muda aqui muda o app da vendedora.
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useFase1 } from '../demo/Fase1Contexto';
import { AGORA_DEMO, type DistribuicaoDiaria, type Indicador, novoId } from '../demo/estado';
import { desempenhoDemo, EU } from '../demo/cenarios';
import { consistenciaMetasLoja, diasValidosDoMes, diasValidosRestantes, opcoesMetaDiaria } from '../dominio/admin';
import { UNIDADE_METRICA } from '../dominio/estimativas';
import type { Metrica } from '../dominio/tipos';
import { dataCurta, reais } from '../formato';
import { Abas } from '../componentes/ui';
import { AvisoSimulacao, Bloco, Botao, Campo, Feedback, INPUT, Selo, TabelaResponsiva, TituloPagina } from './ui';
import { ROTULO_MOTIVO_INELEGIVEL } from './Pessoas';

// ================================================================== metas

export function Metas() {
  const [aba, setAba] = useState<'mes' | 'diaria' | 'calendario'>('mes');
  return (
    <>
      <TituloPagina titulo="Metas e calendário" descricao="Meta da loja, meta individual, como a meta mensal vira meta do dia e quais dias contam." />
      <Abas<'mes' | 'diaria' | 'calendario'>
        rotulo="Áreas de metas"
        ativa={aba}
        onTrocar={setAba}
        abas={[
          { id: 'mes', rotulo: 'Metas do mês' },
          { id: 'diaria', rotulo: 'Meta diária' },
          { id: 'calendario', rotulo: 'Calendário operacional' },
        ]}
      />
      {aba === 'mes' && <MetasDoMes />}
      {aba === 'diaria' && <MetaDiaria />}
      {aba === 'calendario' && <Calendario />}
    </>
  );
}

function VerComoAna({ texto = 'Ver como a Ana recebe' }: { texto?: string }) {
  const { verComoVendedor } = useFase1();
  const navegar = useNavigate();
  return (
    <Botao
      onClick={() => {
        verComoVendedor();
        navegar('/fase1/inicio');
      }}
    >
      👁 {texto}
    </Botao>
  );
}

function MetasDoMes() {
  const { estado, alterar } = useFase1();
  const [rascunho, setRascunho] = useState<Record<string, string>>({});
  const [metaLoja, setMetaLoja] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<string | null>(null);

  function salvarLoja(lojaId: string) {
    const loja = estado.lojas.find((l) => l.id === lojaId)!;
    const doLoja = estado.vendedores.filter((v) => v.lojaId === lojaId && v.status !== 'DESLIGADO');
    const mudancas = doLoja.filter((v) => rascunho[v.id] !== undefined && Number(rascunho[v.id] || 0) !== (estado.metas.individuais[v.id]?.mensal ?? 0));
    const novaLoja = metaLoja[lojaId] !== undefined ? Number(metaLoja[lojaId]) : loja.metaMes;
    if (mudancas.length === 0 && novaLoja === loja.metaMes) return setFeedback('Nada mudou.');
    alterar(
      (st) => {
        for (const v of mudancas) {
          const valor = Number(rascunho[v.id]) || null;
          st.metas.individuais[v.id] = { mensal: valor, diariaManual: st.metas.individuais[v.id]?.diariaManual ?? (valor ? Math.round(valor / 15) : null) };
        }
        st.lojas.find((l) => l.id === lojaId)!.metaMes = novaLoja;
      },
      {
        acao: 'Alterou metas do mês',
        entidade: `Metas 10/2026 · ${loja.nome}`,
        antes: [...mudancas.map((v) => `${v.nome.split(' ')[0]}: ${estado.metas.individuais[v.id]?.mensal ? reais(estado.metas.individuais[v.id].mensal!) : 'sem meta'}`), novaLoja !== loja.metaMes ? `Loja: ${reais(loja.metaMes)}` : ''].filter(Boolean).join(' · '),
        depois: [...mudancas.map((v) => `${v.nome.split(' ')[0]}: ${Number(rascunho[v.id]) ? reais(Number(rascunho[v.id])) : 'sem meta'}`), novaLoja !== loja.metaMes ? `Loja: ${reais(novaLoja)}` : ''].filter(Boolean).join(' · '),
      }
    );
    setRascunho({});
    setMetaLoja({});
    setFeedback(`Metas de ${loja.nome} salvas. A vendedora já recebe o novo valor.`);
  }

  return (
    <>
      <Feedback texto={feedback} />
      {estado.lojas.map((l) => {
        const c = consistenciaMetasLoja(estado, l.id);
        const doLoja = estado.vendedores.filter((v) => v.lojaId === l.id && v.status !== 'DESLIGADO');
        const somaRascunho = doLoja.reduce((a, v) => a + (rascunho[v.id] !== undefined ? Number(rascunho[v.id]) || 0 : (estado.metas.individuais[v.id]?.mensal ?? 0)), 0);
        const metaLojaAtual = metaLoja[l.id] !== undefined ? Number(metaLoja[l.id]) || 0 : l.metaMes;
        const diferenca = somaRascunho - metaLojaAtual;
        return (
          <Bloco key={l.id} titulo={l.nome} acao={<Botao tipo="primario" onClick={() => salvarLoja(l.id)}>Salvar metas</Botao>}>
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <Campo rotulo="Meta da loja (mês)">
                <input type="number" step={1000} min={0} className={INPUT} value={metaLoja[l.id] ?? String(l.metaMes)} onChange={(e) => setMetaLoja({ ...metaLoja, [l.id]: e.target.value })} />
              </Campo>
              <div className={`self-end rounded-xl px-3 py-2 text-sm ${diferenca === 0 ? 'bg-emerald-500/10 text-emerald-200' : 'bg-amber-500/10 text-amber-200'}`} role="status">
                Soma individual: <strong>{reais(somaRascunho)}</strong>
                <br />
                {diferenca === 0 ? '✓ Consistente com a meta da loja' : `⚠️ Diferença de ${reais(Math.abs(diferenca))} (${diferenca > 0 ? 'acima' : 'abaixo'} da meta da loja)`}
              </div>
            </div>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {doLoja.map((v) => (
                <li key={v.id} className="flex min-w-0 items-center gap-2 rounded-xl bg-slate-800/70 px-3 py-2">
                  <label htmlFor={`meta-${v.id}`} className="min-w-0 flex-1 truncate text-sm text-slate-200">
                    {v.nome}
                    {v.id === EU && <span className="text-xs text-violet-300"> (persona)</span>}
                  </label>
                  <input
                    id={`meta-${v.id}`}
                    type="number"
                    step={500}
                    min={0}
                    placeholder="sem meta"
                    className="min-h-[40px] w-28 shrink-0 rounded-lg border border-slate-600 bg-base px-2 text-right text-white"
                    value={rascunho[v.id] ?? (estado.metas.individuais[v.id]?.mensal ? String(estado.metas.individuais[v.id].mensal) : '')}
                    onChange={(e) => setRascunho({ ...rascunho, [v.id]: e.target.value })}
                  />
                </li>
              ))}
            </ul>
            {c.semMeta.length > 0 && <p className="mt-2 text-xs text-amber-200">⚠️ Sem meta: {c.semMeta.map((v) => v.nome.split(' ')[0]).join(', ')}.</p>}
          </Bloco>
        );
      })}
      <div className="flex flex-wrap items-center gap-2">
        <VerComoAna />
        <span className="text-xs text-slate-400">Teste: mude a meta da Ana para R$ 32.000, salve e veja “Faltam” e “≈ vendas” mudarem na Home dela.</span>
      </div>
    </>
  );
}

const ROTULO_DISTRIBUICAO: Record<DistribuicaoDiaria, { titulo: string; explica: string }> = {
  MANUAL: { titulo: 'Definida pelo Admin', explica: 'A meta do dia é digitada (ou importada). Mais controle, mais trabalho.' },
  UNIFORME: { titulo: 'Distribuição uniforme', explica: 'Meta do mês ÷ dias válidos do mês. Simples e previsível; não reage ao ritmo.' },
  DIAS_VALIDOS: { titulo: 'Pelo que falta nos dias restantes', explica: '(Meta do mês − realizado até ontem) ÷ dias válidos restantes. Reage ao ritmo: se atrasa, sobe; se adianta, desce.' },
};

function MetaDiaria() {
  const { estado, alterar, dados } = useFase1();
  const [feedback, setFeedback] = useState<string | null>(null);
  const lojaId = estado.vendedores.find((v) => v.id === EU)?.lojaId ?? 'caruaru';
  const validos = diasValidosDoMes(estado.metas.referencia, estado, lojaId);
  const restantes = diasValidosRestantes(AGORA_DEMO, estado, lojaId);
  const doLoja = estado.vendedores.filter((v) => v.lojaId === lojaId && v.status !== 'DESLIGADO');
  const linhas = doLoja.map((v) => {
    const ateOntem = v.id === EU ? dados.mes.realizado.faturamento - dados.hoje.realizado.faturamento : Math.round(((desempenhoDemo(v.id)?.vendas ?? 0) * 16) / 17);
    return { v, op: opcoesMetaDiaria(estado, v.id, lojaId, AGORA_DEMO, ateOntem) };
  });

  return (
    <>
      <AvisoSimulacao>Regra NÃO congelada. Compare as três formas com os números reais da loja e decida. A escolhida já vale para o app da vendedora.</AvisoSimulacao>
      <fieldset className="grid gap-3 md:grid-cols-3">
        <legend className="sr-only">Regra da meta diária</legend>
        {(Object.keys(ROTULO_DISTRIBUICAO) as DistribuicaoDiaria[]).map((d) => {
          const sel = estado.metas.distribuicao === d;
          return (
            <label key={d} className={`flex cursor-pointer flex-col gap-1 rounded-2xl border p-4 ${sel ? 'border-accentSoft bg-accent/10' : 'border-slate-700/60 bg-surface'}`}>
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="distribuicao"
                  className="h-5 w-5 accent-amber-500"
                  checked={sel}
                  onChange={() => {
                    alterar((st) => {
                      st.metas.distribuicao = d;
                    }, { acao: 'Alterou regra da meta diária', entidade: 'Metas 10/2026', antes: ROTULO_DISTRIBUICAO[estado.metas.distribuicao].titulo, depois: ROTULO_DISTRIBUICAO[d].titulo });
                    setFeedback(`Regra “${ROTULO_DISTRIBUICAO[d].titulo}” aplicada.`);
                  }}
                />
                <span className="font-semibold text-white">{ROTULO_DISTRIBUICAO[d].titulo}</span>
              </span>
              <span className="text-xs text-slate-400">{ROTULO_DISTRIBUICAO[d].explica}</span>
            </label>
          );
        })}
      </fieldset>
      <Feedback texto={feedback} />
      <p className="text-sm text-slate-400">
        Outubro tem <strong className="text-white">{validos.length} dias válidos</strong> nesta loja (calendário operacional); restam <strong className="text-white">{restantes}</strong> depois de hoje.
      </p>
      <TabelaResponsiva
        legenda="Meta diária por regra"
        linhas={linhas}
        chave={(l) => l.v.id}
        colunas={[
          { titulo: 'Vendedor', celula: (l) => l.v.nome },
          { titulo: 'Definida pelo Admin', celula: (l) => (l.op.manual ? reais(l.op.manual) : '—') },
          { titulo: 'Uniforme', celula: (l) => (l.op.uniforme ? reais(l.op.uniforme) : '—') },
          { titulo: 'Pelo que falta', celula: (l) => (l.op.diasValidos !== null ? reais(l.op.diasValidos) : '—') },
        ]}
      />
      <div className="flex flex-wrap items-center gap-2">
        <VerComoAna texto="Ver a meta de hoje da Ana" />
      </div>
    </>
  );
}

function Calendario() {
  const { estado, alterar } = useFase1();
  const [nova, setNova] = useState({ data: '', nome: '', loja: 'TODAS' });
  const lojaNome = (id: string) => estado.lojas.find((l) => l.id === id)?.nome ?? id;
  return (
    <>
      <Bloco titulo="Funcionamento">
        <label className="flex min-h-[44px] items-center gap-3 text-sm text-slate-200">
          <input
            type="checkbox"
            className="h-5 w-5 accent-amber-500"
            checked={estado.calendario.abreDomingo}
            onChange={(e) =>
              alterar((st) => {
                st.calendario.abreDomingo = e.target.checked;
              }, { acao: 'Alterou funcionamento aos domingos', entidade: 'Calendário operacional', antes: estado.calendario.abreDomingo ? 'abre' : 'fechado', depois: e.target.checked ? 'abre' : 'fechado' })
            }
          />
          Lojas abrem aos domingos (domingo conta como dia válido de meta)
        </label>
        <p className="mt-1 text-xs text-slate-400">Escala individual de cada vendedor fica para depois, quando houver fonte confiável. Aqui é só o calendário da loja.</p>
      </Bloco>
      <Bloco titulo="Feriados e loja fechada">
        <ul className="mb-3 flex flex-col gap-2">
          {estado.calendario.feriados.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-800/70 px-3 py-2 text-sm">
              <span className="text-slate-200">
                <strong className="text-white">{dataCurta(f.data)}</strong> · {f.nome} · <span className="text-slate-400">{f.lojas === 'TODAS' ? 'todas as lojas' : f.lojas.map(lojaNome).join(', ')}</span>
              </span>
              <Botao
                tipo="fantasma"
                onClick={() =>
                  alterar((st) => {
                    st.calendario.feriados = st.calendario.feriados.filter((x) => x.id !== f.id);
                  }, { acao: 'Removeu feriado', entidade: 'Calendário operacional', antes: `${dataCurta(f.data)} ${f.nome}` })
                }
              >
                Remover
              </Botao>
            </li>
          ))}
        </ul>
        <form
          className="grid gap-2 sm:grid-cols-[auto_1fr_auto_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            if (!nova.data || nova.nome.trim().length < 3) return;
            alterar((st) => {
              st.calendario.feriados.push({ id: novoId('fer'), data: nova.data, nome: nova.nome.trim(), lojas: nova.loja === 'TODAS' ? 'TODAS' : [nova.loja] });
            }, { acao: 'Cadastrou feriado', entidade: 'Calendário operacional', depois: `${dataCurta(nova.data)} ${nova.nome} (${nova.loja === 'TODAS' ? 'todas' : lojaNome(nova.loja)})` });
            setNova({ data: '', nome: '', loja: 'TODAS' });
          }}
        >
          <label>
            <span className="sr-only">Data</span>
            <input type="date" className={INPUT} value={nova.data} onChange={(e) => setNova({ ...nova, data: e.target.value })} required />
          </label>
          <label>
            <span className="sr-only">Nome</span>
            <input className={INPUT} placeholder="Ex.: Feriado municipal" value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} required />
          </label>
          <label>
            <span className="sr-only">Lojas</span>
            <select className={INPUT} value={nova.loja} onChange={(e) => setNova({ ...nova, loja: e.target.value })}>
              <option value="TODAS">Todas as lojas</option>
              {estado.lojas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </select>
          </label>
          <Botao type="submit" tipo="primario">
            Adicionar
          </Botao>
        </form>
        <div className="mt-3">
          <AvisoSimulacao>Teste: cadastre um feriado em 22/10/2026 para Caruaru Shopping — o app da Ana mostra “A loja não abre hoje”. Um feriado entre 23 e 31/10 reduz os dias restantes e aumenta as “vendas por dia”.</AvisoSimulacao>
        </div>
      </Bloco>
      <Bloco titulo="Datas especiais">
        <ul className="text-sm text-slate-300">
          {estado.calendario.especiais.map((d) => (
            <li key={d.id}>
              {dataCurta(d.data)} · {d.nome}
            </li>
          ))}
        </ul>
      </Bloco>
    </>
  );
}

// ================================================================== rankings e elegibilidade

const FORMULAS: { id: 'PCT_META_COLETIVA' | 'MEDIA_SCORE' | 'EVOLUCAO_COLETIVA'; titulo: string; explica: string }[] = [
  { id: 'PCT_META_COLETIVA', titulo: '% da meta coletiva', explica: 'Soma das vendas ÷ meta da loja. Justo entre lojas de tamanhos diferentes.' },
  { id: 'MEDIA_SCORE', titulo: 'Média do Score Geral', explica: 'Média do score dos vendedores elegíveis. Valoriza equilíbrio.' },
  { id: 'EVOLUCAO_COLETIVA', titulo: 'Evolução coletiva', explica: 'Crescimento contra o próprio histórico da loja.' },
];

export function Rankings() {
  const [aba, setAba] = useState<'individual' | 'lojas' | 'elegibilidade'>('individual');
  return (
    <>
      <TituloPagina titulo="Rankings e elegibilidade" descricao="Quais rankings existem, qual métrica é a corrida principal e quem entra." />
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

function RankingIndividual() {
  const { estado, alterar } = useFase1();
  const metricas = Object.keys(UNIDADE_METRICA) as Metrica[];
  return (
    <>
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
                    onChange={() =>
                      alterar((st) => {
                        st.rankings.metricasAtivas = ativa ? st.rankings.metricasAtivas.filter((x) => x !== m) : [...st.rankings.metricasAtivas, m];
                      }, { acao: ativa ? 'Desativou ranking' : 'Ativou ranking', entidade: `Ranking ${UNIDADE_METRICA[m].rotulo}`, antes: ativa ? 'ativo' : 'inativo', depois: ativa ? 'inativo' : 'ativo' })
                    }
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
        <Campo rotulo="Métrica da “Sua posição” na Home" ajuda="Só Vendas (R$) converte a distância em “≈ N vendas”. Nas outras, a distância aparece na unidade da métrica.">
          <select
            className={INPUT}
            value={estado.rankings.metricaCorrida}
            onChange={(e) => {
              const m = e.target.value as Metrica;
              alterar((st) => {
                st.rankings.metricaCorrida = m;
                if (!st.rankings.metricasAtivas.includes(m)) st.rankings.metricasAtivas.push(m);
              }, { acao: 'Alterou métrica da corrida', entidade: 'Rankings', antes: UNIDADE_METRICA[estado.rankings.metricaCorrida].rotulo, depois: UNIDADE_METRICA[m].rotulo });
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
      <p className="text-xs text-slate-400">Fórmulas não são editáveis aqui — evitar “fórmula livre” é de propósito. O Score Geral segue a régua v1 do backend.</p>
    </>
  );
}

function RankingLojas() {
  const { estado, alterar, dados } = useFase1();
  const cfg = estado.rankings.lojaXLoja;
  const linhas = [...dados.rankings.lojas].sort((a, b) => b.pontos - a.pontos);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-300">Status:</span>
        {cfg.status === 'ATIVO' ? <Selo tom="ok">● Ativo</Selo> : <Selo tom="aviso">Aguardando regra</Selo>}
        <span className="text-sm text-slate-400">· Período: mês corrente</span>
      </div>
      <Bloco titulo="Regra de pontuação (escolha entre opções fechadas)">
        <fieldset className="grid gap-2 md:grid-cols-3">
          <legend className="sr-only">Fórmula Loja × Loja</legend>
          {FORMULAS.map((f) => (
            <label key={f.id} className={`flex cursor-pointer flex-col gap-1 rounded-xl border p-3 ${cfg.formula === f.id ? 'border-accentSoft bg-accent/10' : 'border-slate-700'}`}>
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="formula"
                  className="h-5 w-5 accent-amber-500"
                  checked={cfg.formula === f.id}
                  onChange={() =>
                    alterar((st) => {
                      st.rankings.lojaXLoja.formula = f.id;
                      st.rankings.lojaXLoja.status = 'ATIVO';
                    }, { acao: 'Definiu regra Loja × Loja', entidade: 'Ranking Loja × Loja', antes: cfg.formula ?? 'não definida', depois: f.titulo })
                  }
                />
                <span className="font-semibold text-white">{f.titulo}</span>
              </span>
              <span className="text-xs text-slate-400">{f.explica}</span>
            </label>
          ))}
        </fieldset>
        <div className="mt-3">
          <AvisoSimulacao>Os pontos exibidos continuam ilustrativos — o cálculo real de cada opção depende do backend. Escolher aqui registra a decisão e tira a pendência.</AvisoSimulacao>
        </div>
      </Bloco>
      <Bloco titulo="Lojas participantes e resultado parcial">
        <ul className="flex flex-col gap-2">
          {estado.lojas.map((l) => {
            const dentro = cfg.lojas.includes(l.id);
            const pos = linhas.findIndex((x) => x.lojaId === l.id);
            return (
              <li key={l.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-800/70 px-3 py-2 text-sm">
                <label className="flex items-center gap-2 text-slate-200">
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-amber-500"
                    checked={dentro}
                    onChange={() =>
                      alterar((st) => {
                        st.rankings.lojaXLoja.lojas = dentro ? st.rankings.lojaXLoja.lojas.filter((x) => x !== l.id) : [...st.rankings.lojaXLoja.lojas, l.id];
                      }, { acao: dentro ? 'Removeu loja do Loja × Loja' : 'Incluiu loja no Loja × Loja', entidade: `Loja ${l.nome}` })
                    }
                  />
                  {l.nome}
                </label>
                <span className="text-slate-400">{pos >= 0 ? `#${pos + 1} · ${linhas[pos].pontos} pts` : 'fora'}</span>
              </li>
            );
          })}
        </ul>
      </Bloco>
    </>
  );
}

function Elegibilidade() {
  const { estado } = useFase1();
  const lojaNome = (id: string) => estado.lojas.find((l) => l.id === id)?.nome ?? id;
  return (
    <>
      <p className="text-sm text-slate-400">Quem entra no ranking. Exceção manual exige motivo e fica na auditoria — faça pelo detalhe do vendedor.</p>
      <TabelaResponsiva
        legenda="Elegibilidade ao ranking"
        linhas={estado.vendedores}
        chave={(v) => v.id}
        colunas={[
          { titulo: 'Vendedor', celula: (v) => <Link to={`/fase1/admin/vendedores/${v.id}`} className="text-white hover:underline">{v.nome}</Link> },
          { titulo: 'Loja', celula: (v) => lojaNome(v.lojaId) },
          { titulo: 'Situação', celula: (v) => (v.elegivel && v.status === 'ATIVO' ? <Selo tom="ok">✓ Elegível</Selo> : <Selo tom="aviso">✕ Não elegível</Selo>) },
          { titulo: 'Motivo', celula: (v) => (v.motivoInelegivel ? ROTULO_MOTIVO_INELEGIVEL[v.motivoInelegivel] : v.status !== 'ATIVO' ? 'Acesso não ativo' : '—') },
          { titulo: 'Exceção', celula: (v) => v.excecao ?? '—' },
        ]}
      />
      <AvisoSimulacao>Regra a decidir: quanto tempo dura a adaptação do vendedor novo (7 dias com venda? 30 dias de casa?).</AvisoSimulacao>
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
  const { estado, alterar } = useFase1();
  return (
    <>
      <TituloPagina titulo="Indicadores" descricao="Regra: indicador sem dado confiável não aparece como real para o vendedor." />
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
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-amber-500"
                  checked={i.ativo && !semFonte}
                  disabled={semFonte}
                  onChange={() =>
                    alterar((st) => {
                      st.indicadores[k].ativo = !i.ativo;
                    }, { acao: i.ativo ? 'Ocultou indicador do vendedor' : 'Liberou indicador ao vendedor', entidade: `Indicador ${ROTULO_INDICADOR[k]}`, antes: i.ativo ? 'visível' : 'oculto', depois: i.ativo ? 'oculto' : 'visível' })
                  }
                />
                {semFonte ? 'Bloqueado (sem fonte)' : 'Visível para o vendedor'}
              </label>
            </li>
          );
        })}
      </ul>
      <AvisoSimulacao>Teste: oculte “Pares” e veja a estimativa de pares sumir da Corrida do mês da Ana; oculte “Ticket médio” e todas as estimativas em vendas somem (sem ticket, não há conversão).</AvisoSimulacao>
    </>
  );
}
