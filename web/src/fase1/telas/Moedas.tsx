/**
 * VendaCoins — moeda de recompensa do ecossistema. Diferente de XP (status).
 * Sem conversão financeira e sem valor em R$: isso é decisão de política,
 * não de tela. O ledger real não é tocado.
 */
import { useFase1 } from '../contexto';
import { AvisoProvisorio, CabecalhoTela, Painel, TituloSecao, Vazio } from '../componentes/ui';
import { dataCurta, inteiro } from '../formato';
import { Fase1Pagina } from './Fase1Pagina';

const VITRINE = [
  { icone: '☕', titulo: 'Café com a equipe' },
  { icone: '🕐', titulo: 'Saída 1h mais cedo' },
  { icone: '🎁', titulo: 'Brinde da coleção' },
];

export function Moedas() {
  const { dados } = useFase1();
  const ganhosMes = dados.moedas.historico.filter((e) => e.valor > 0 && e.quando.startsWith(dados.agora.slice(0, 7))).reduce((a, e) => a + e.valor, 0);
  return (
    <Fase1Pagina carregando="Carregando suas VendaCoins...">
      <CabecalhoTela titulo="VendaCoins" subtitulo="Sua moeda de recompensa." voltar="/perfil" />
      <Painel destaque rotulo="Saldo">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-300">Saldo</p>
        <p className="text-5xl font-extrabold text-amber-200">
          <span aria-hidden="true">🪙 </span>
          {inteiro(dados.moedas.saldo)}
        </p>
        <p className="mt-1 text-sm text-slate-300">+{inteiro(ganhosMes)} ganhas em outubro</p>
        <p className="mt-3 rounded-xl bg-slate-800/80 px-3 py-2 text-xs text-slate-300">
          <strong className="text-white">XP</strong> mostra seu nível e não se gasta. <strong className="text-white">VendaCoins</strong> são recompensas que poderão ser trocadas por benefícios.
        </p>
      </Painel>

      <section aria-labelledby="hist-moedas">
        <TituloSecao>
          <span id="hist-moedas">Extrato</span>
        </TituloSecao>
        {dados.moedas.historico.length === 0 ? (
          <Vazio icone="🪙" titulo="Nenhuma movimentação ainda" texto="Bata metas e conclua missões para ganhar VendaCoins." />
        ) : (
          <ul className="flex flex-col gap-2">
            {dados.moedas.historico.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface px-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-sm text-white">{e.origem}</span>
                  <span className="text-xs text-slate-400">{dataCurta(e.quando)}</span>
                </span>
                <span className={`shrink-0 font-semibold ${e.valor >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                  {e.valor >= 0 ? '+' : '−'}
                  {Math.abs(e.valor)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="vitrine">
        <TituloSecao>
          <span id="vitrine">Em breve: recompensas</span>
        </TituloSecao>
        <ul className="grid grid-cols-3 gap-2">
          {VITRINE.map((v) => (
            <li key={v.titulo} className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-slate-700 p-3 text-center opacity-80">
              <span aria-hidden="true" className="text-2xl">
                {v.icone}
              </span>
              <span className="text-xs text-slate-300">{v.titulo}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3">
          <AvisoProvisorio>Vitrine ilustrativa. Catálogo, preços em VendaCoins e regras de resgate ainda não existem — nenhuma conversão em dinheiro está prevista.</AvisoProvisorio>
        </div>
      </section>
    </Fase1Pagina>
  );
}
