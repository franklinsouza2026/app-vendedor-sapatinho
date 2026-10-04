/**
 * XP e níveis. XP = progressão/status (nunca vira dinheiro). A curva e os
 * nomes de nível são os do backend atual (Bronze → Elite), sem renomear.
 */
import { useFase1 } from '../contexto';
import { BarraSimples, CabecalhoTela, Painel, TituloSecao } from '../componentes/ui';
import { dataCurta, inteiro } from '../formato';
import { Fase1Pagina } from './Fase1Pagina';

export function Progresso() {
  const { dados } = useFase1();
  const nivel = dados.nivel;
  const porOrigem = Object.entries(
    dados.xp.historico.reduce<Record<string, number>>((acc, e) => {
      const chave = e.origem.startsWith('Missão') ? 'Missões' : e.origem.includes('meta') || e.origem.includes('Meta') ? 'Metas' : e.origem.startsWith('Sequência') ? 'Consistência' : e.origem.startsWith('Melhora') ? 'Evolução' : 'Outros';
      acc[chave] = (acc[chave] ?? 0) + e.xp;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);

  return (
    <Fase1Pagina carregando="Carregando seu progresso...">
      <CabecalhoTela titulo="XP e nível" subtitulo="Sua progressão no Vendedor IA." voltar="/perfil" />

      <Painel destaque rotulo="Nível atual">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-300">Nível {nivel.nivel}</p>
        <p className="text-3xl font-extrabold text-white">⭐ {nivel.nome}</p>
        <p className="mt-2 text-lg font-semibold text-white">
          {inteiro(dados.xp.total)} {nivel.proximo && <span className="text-slate-400">/ {inteiro(nivel.proximo.xpMinimo)} XP</span>}
        </p>
        <div className="mt-2">
          <BarraSimples percentual={nivel.progresso} rotulo={`Progresso até ${nivel.proximo?.nome ?? 'o nível máximo'}`} cor="sky" />
        </div>
        <p className="mt-2 text-sm text-slate-200">
          {nivel.proximo ? (
            <>
              Faltam <strong className="text-white">{inteiro(nivel.faltaXp!)} XP</strong> para <strong className="text-white">{nivel.proximo.nome}</strong>.
            </>
          ) : (
            'Você está no nível máximo.'
          )}
        </p>
      </Painel>

      <section aria-labelledby="niveis">
        <TituloSecao>
          <span id="niveis">Trilha de níveis</span>
        </TituloSecao>
        <ol className="flex flex-col gap-1.5">
          {dados.nivel.niveis.map((n) => {
            const atual = n.nivel === nivel.nivel;
            const passou = n.nivel < nivel.nivel;
            return (
              <li key={n.nivel} aria-current={atual ? 'step' : undefined} className={`flex min-h-[44px] items-center justify-between rounded-xl px-3 ${atual ? 'bg-sky-500/15 ring-1 ring-sky-400/50' : 'bg-surface'}`}>
                <span className={`text-sm ${atual ? 'font-bold text-white' : passou ? 'text-slate-300' : 'text-slate-400'}`}>
                  <span aria-hidden="true">{passou ? '✓ ' : atual ? '⭐ ' : '○ '}</span>
                  {n.nivel}. {n.nome}
                  {atual && ' · você está aqui'}
                </span>
                <span className="text-xs text-slate-400">{inteiro(n.xpMinimo)} XP</span>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-labelledby="origem">
        <TituloSecao>
          <span id="origem">De onde veio seu XP recente</span>
        </TituloSecao>
        <Painel>
          <ul className="flex flex-col gap-2">
            {porOrigem.map(([origem, xp]) => (
              <li key={origem} className="flex items-center justify-between text-sm">
                <span className="text-slate-300">{origem}</span>
                <span className="font-semibold text-sky-200">+{inteiro(xp)} XP</span>
              </li>
            ))}
          </ul>
        </Painel>
      </section>

      <section aria-labelledby="hist-xp">
        <TituloSecao>
          <span id="hist-xp">Histórico</span>
        </TituloSecao>
        <ul className="flex flex-col gap-2">
          {dados.xp.historico.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface px-3 py-2.5">
              <span className="min-w-0">
                <span className="block truncate text-sm text-white">{e.origem}</span>
                <span className="text-xs text-slate-400">{dataCurta(e.quando)}</span>
              </span>
              <span className="shrink-0 font-semibold text-sky-200">+{e.xp} XP</span>
            </li>
          ))}
        </ul>
      </section>
    </Fase1Pagina>
  );
}
