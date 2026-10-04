/**
 * Ranking — minha loja, geral (todas as lojas) e loja × loja.
 *
 * Duas regras herdadas do produto atual e mantidas:
 *  - faturamento de colegas NUNCA aparece (Fatia 7.5A §30) — só a distância;
 *  - a distância fala a língua da métrica (pontos, p.p., PA...), e só Vendas
 *    converte em "N vendas" (no ticket médio atual).
 */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useFase1 } from '../contexto';
import type { Fase1Dados, LinhaRankingBruta, Metrica } from '../dominio/tipos';
import { UNIDADE_METRICA, vendasEstimadas, type PosicaoCalculada } from '../dominio/estimativas';
import { primeiroNome, rankingCalculado, rankingLojasCalculado } from '../dominio/alvos';
import { Abas, AvisoProvisorio, Avatar, CabecalhoTela, Medalha, Painel, Variacao, Vazio } from '../componentes/ui';
import { distanciaMetrica, inteiro, plural, valorMetrica } from '../formato';
import { Fase1Pagina } from './Fase1Pagina';

type Escopo = 'loja' | 'geral' | 'lojas';

export function Ranking() {
  const [params, setParams] = useSearchParams();
  const escopo = (['loja', 'geral', 'lojas'].includes(params.get('escopo') ?? '') ? params.get('escopo') : 'loja') as Escopo;
  const { dados } = useFase1();
  const [escolhida, setMetrica] = useState<Metrica>(dados.metricaCorrida);
  // Se o Admin desligar o indicador escolhido, cai para a primeira métrica ainda liberada.
  const metrica = dados.metricasRanking.includes(escolhida) ? escolhida : (dados.metricasRanking[0] ?? 'SCORE');

  return (
    <Fase1Pagina carregando="Carregando ranking...">
      <CabecalhoTela titulo="Ranking" subtitulo="Outubro · acumulado do mês" />
      <Abas<Escopo>
        rotulo="Tipo de ranking"
        ativa={escopo}
        onTrocar={(id) => setParams({ escopo: id }, { replace: true })}
        abas={[
          { id: 'loja', rotulo: 'Minha loja' },
          { id: 'geral', rotulo: 'Geral' },
          { id: 'lojas', rotulo: 'Loja × Loja' },
        ]}
      />
      {escopo === 'lojas' ? <LojaXLoja /> : <RankingPessoas escopo={escopo} metrica={metrica} onMetrica={setMetrica} />}
    </Fase1Pagina>
  );
}

function RankingPessoas({ escopo, metrica, onMetrica }: { escopo: 'loja' | 'geral'; metrica: Metrica; onMetrica: (m: Metrica) => void }) {
  const { dados } = useFase1();

  if (!dados.status.rankingDisponivel) {
    return <Vazio icone="⏳" titulo="Ranking indisponível no momento" texto="Os dados do ERP estão atrasados. O ranking volta sozinho no próximo sync — nenhuma venda se perde." />;
  }

  const linhas = rankingCalculado(dados, escopo, metrica);
  const eu = linhas.find((l) => l.linha.pessoaId === dados.vendedor.id) ?? null;
  const u = UNIDADE_METRICA[metrica];

  return (
    <>
      <div role="group" aria-label="Indicador do ranking" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {dados.metricasRanking.map((m) => (
          <button
            key={m}
            onClick={() => onMetrica(m)}
            aria-pressed={m === metrica}
            className={`min-h-[40px] shrink-0 whitespace-nowrap rounded-full px-3 text-sm font-medium ${m === metrica ? 'bg-accent text-white' : 'bg-surface text-slate-300 ring-1 ring-slate-700'}`}
          >
            {UNIDADE_METRICA[m].curto}
          </button>
        ))}
      </div>
      <p className="-mt-1 text-xs text-slate-400">{u.ajuda}</p>

      {eu ? (
        <SuaPosicao dados={dados} eu={eu} total={linhas.length} metrica={metrica} acima={linhas[eu.posicao - 2] ?? null} escopo={escopo} />
      ) : (
        !dados.elegibilidade.elegivel && <AvisoProvisorio>Você está fora do ranking neste período. {dados.elegibilidade.motivo}</AvisoProvisorio>
      )}

      <ListaRanking dados={dados} linhas={linhas} metrica={metrica} escopo={escopo} />
    </>
  );
}

function SuaPosicao({ dados, eu, total, acima, metrica, escopo }: { dados: Fase1Dados; eu: PosicaoCalculada<LinhaRankingBruta>; total: number; acima: PosicaoCalculada<LinhaRankingBruta> | null; metrica: Metrica; escopo: 'loja' | 'geral' }) {
  const nomeAcima = acima ? primeiroNome(dados.pessoas.find((p) => p.id === acima.linha.pessoaId)!.nome) : null;
  const vendas = UNIDADE_METRICA[metrica].converteEmVendas && eu.distanciaAcima !== null ? vendasEstimadas(eu.distanciaAcima, dados.referencia.ticketMedio) : null;
  return (
    <Painel destaque rotulo="Sua posição">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-300">Sua posição {escopo === 'loja' ? 'na loja' : 'geral'}</p>
          <p className="text-4xl font-extrabold text-white">
            {eu.posicao} <span className="text-base font-medium text-slate-400">de {total} {escopo === 'loja' ? 'na loja' : 'no ranking geral'}</span>
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-white">{eu.linha.valor !== null ? valorMetrica(metrica, eu.linha.valor) : '—'}</p>
          <Variacao valor={eu.variacao} />
        </div>
      </div>
      {eu.posicao === 1 ? (
        <p className="mt-2 text-sm text-emerald-300">🏆 Você está em 1º em {UNIDADE_METRICA[metrica].curto}.</p>
      ) : (
        eu.distanciaAcima !== null && (
          <p className="mt-2 text-sm text-slate-200">
            Faltam <strong className="text-white">{distanciaMetrica(metrica, eu.distanciaAcima)}</strong> para alcançar {nomeAcima} ({eu.posicao - 1}º lugar)
            {vendas !== null && <> — {plural(vendas, 'venda')} no seu ticket médio atual</>}.
          </p>
        )
      )}
    </Painel>
  );
}

/** Em listas longas: pódio + vizinhança do vendedor, para não obrigar a rolar 30 nomes. */
function recorte<T extends { posicao: number }>(linhas: T[], minhaPos: number | null): (T | 'corte')[] {
  if (linhas.length <= 10 || minhaPos === null) return linhas;
  const manter = new Set([1, 2, 3, minhaPos - 2, minhaPos - 1, minhaPos, minhaPos + 1]);
  const saida: (T | 'corte')[] = [];
  linhas.forEach((l, i) => {
    if (manter.has(l.posicao)) {
      if (i > 0 && !manter.has(linhas[i - 1].posicao)) saida.push('corte');
      saida.push(l);
    }
  });
  if (!manter.has(linhas[linhas.length - 1].posicao)) saida.push('corte');
  return saida;
}

function ListaRanking({ dados, linhas, metrica, escopo }: { dados: Fase1Dados; linhas: PosicaoCalculada<LinhaRankingBruta>[]; metrica: Metrica; escopo: 'loja' | 'geral' }) {
  const [tudo, setTudo] = useState(false);
  const minha = linhas.find((l) => l.linha.pessoaId === dados.vendedor.id)?.posicao ?? null;
  const visiveis = tudo ? linhas : recorte(linhas, minha);
  const ocultaValor = metrica === 'VENDAS';

  return (
    <Painel className="!p-0" rotulo="Classificação">
      <ol className="divide-y divide-slate-700/60">
        {visiveis.map((l, i) => {
          if (l === 'corte') {
            return (
              <li key={`corte-${i}`} aria-hidden="true" className="px-4 py-1 text-center text-xs text-slate-400">
                ⋯
              </li>
            );
          }
          const pessoa = dados.pessoas.find((p) => p.id === l.linha.pessoaId)!;
          const souEu = pessoa.id === dados.vendedor.id;
          const loja = dados.lojas.find((x) => x.id === pessoa.lojaId)!;
          return (
            <li key={pessoa.id} aria-current={souEu ? 'true' : undefined} className={`flex min-h-[56px] items-center gap-3 px-3 py-2 ${souEu ? 'bg-accent/15' : ''}`}>
              <Medalha posicao={l.posicao} />
              <Avatar nome={pessoa.nome} destaque={souEu} tamanho="sm" />
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm ${souEu ? 'font-bold text-accentSoft' : 'font-medium text-white'}`}>
                  {souEu ? 'Você' : pessoa.nome}
                </p>
                <p className="flex items-center gap-2 text-xs text-slate-400">
                  {escopo === 'geral' && <span className="truncate">{loja.nome}</span>}
                  <Variacao valor={l.variacao} />
                </p>
              </div>
              <span className="shrink-0 text-right text-sm font-semibold text-slate-200">
                {(ocultaValor && !souEu) || l.linha.valor === null ? (
                  <span>
                    <span aria-hidden="true">R$ •••</span>
                    <span className="sr-only">valor oculto</span>
                  </span>
                ) : (
                  valorMetrica(metrica, l.linha.valor)
                )}
              </span>
            </li>
          );
        })}
      </ol>
      {linhas.length > 10 && (
        <button onClick={() => setTudo((v) => !v)} className="min-h-[44px] w-full border-t border-slate-700/60 text-sm font-medium text-accentSoft">
          {tudo ? 'Mostrar resumo' : `Ver todos os ${linhas.length}`}
        </button>
      )}
      {ocultaValor && <p className="border-t border-slate-700/60 px-4 py-2 text-xs text-slate-400">Por privacidade, o faturamento das colegas fica oculto. A distância até a posição acima é sempre exibida.</p>}
    </Painel>
  );
}

function LojaXLoja() {
  const { dados } = useFase1();
  if (!dados.status.rankingDisponivel) {
    return <Vazio icone="⏳" titulo="Ranking entre lojas indisponível" texto="Volta no próximo sync do ERP." />;
  }
  const linhas = rankingLojasCalculado(dados);
  const minha = linhas.find((l) => l.linha.lojaId === dados.vendedor.lojaId)!;
  const lider = linhas[0];
  const segunda = linhas[1];
  const lojaNome = (id: string) => dados.lojas.find((l) => l.id === id)!.nome;

  return (
    <>
      <Painel destaque rotulo="Sua loja">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-300">{lojaNome(minha.linha.lojaId)}</p>
        <p className="text-4xl font-extrabold text-white">
          {minha.posicao} <span className="text-base font-medium text-slate-400">de {linhas.length} lojas</span>
        </p>
        {minha.posicao === 1 ? (
          <p className="mt-2 text-sm text-emerald-300">🏆 Sua loja lidera com {plural(minha.linha.pontos - segunda.linha.pontos, 'ponto')} de vantagem.</p>
        ) : (
          <p className="mt-2 text-sm text-slate-200">
            Faltam <strong className="text-white">{plural(minha.distanciaAcima ?? 0, 'ponto')}</strong> para sua loja {minha.posicao === 2 ? 'assumir a liderança' : `alcançar ${lojaNome(linhas[minha.posicao - 2].linha.lojaId)}`}.
          </p>
        )}
        <p className="mt-1 text-xs text-slate-400">Líder: {lojaNome(lider.linha.lojaId)} · {inteiro(lider.linha.pontos)} pts</p>
      </Painel>

      <Painel className="!p-0" rotulo="Classificação das lojas">
        <ol className="divide-y divide-slate-700/60">
          {linhas.map((l) => {
            const minhaLoja = l.linha.lojaId === dados.vendedor.lojaId;
            return (
              <li key={l.linha.lojaId} aria-current={minhaLoja ? 'true' : undefined} className={`flex min-h-[60px] items-center gap-3 px-3 py-2 ${minhaLoja ? 'bg-accent/15' : ''}`}>
                <Medalha posicao={l.posicao} />
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm ${minhaLoja ? 'font-bold text-accentSoft' : 'font-medium text-white'}`}>
                    {lojaNome(l.linha.lojaId)}
                    {minhaLoja && <span className="font-normal text-slate-300"> · sua loja</span>}
                  </p>
                  <Variacao valor={l.variacao} />
                </div>
                <span className="text-sm font-bold text-white">{inteiro(l.linha.pontos)} pts</span>
              </li>
            );
          })}
        </ol>
      </Painel>
      <AvisoProvisorio>Pontos ilustrativos. A fórmula do score entre lojas (média? soma? % da meta coletiva?) será decidida na etapa de backend.</AvisoProvisorio>
    </>
  );
}
