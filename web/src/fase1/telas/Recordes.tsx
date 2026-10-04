import { useFase1 } from '../contexto';
import type { Recorde } from '../dominio/tipos';
import { BarraSimples, CabecalhoTela, Painel, Vazio } from '../componentes/ui';
import { dataCurta, decimal, pct, plural, reais } from '../formato';
import { Fase1Pagina } from './Fase1Pagina';

function formatar(r: Recorde, v: number): string {
  switch (r.unidade) {
    case 'reais':
      return reais(v);
    case 'pa':
      return decimal(v, 2);
    case 'dias':
      return plural(v, 'dia');
    case 'posicao':
      return `${v}º lugar`;
    case 'percentual':
      return pct(v);
  }
}

export function Recordes() {
  const { dados } = useFase1();
  const hoje = dados.agora.slice(0, 10);
  return (
    <Fase1Pagina carregando="Carregando seus recordes...">
      <CabecalhoTela titulo="Meus recordes" subtitulo="Você contra você mesma." voltar="/perfil" />
      {dados.recordes.length === 0 ? (
        <Vazio icone="🚀" titulo="Seus recordes começam agora" texto="Cada dia e cada mês que você fecha vira uma marca para superar." />
      ) : (
        <ul className="flex flex-col gap-3">
          {dados.recordes.map((r) => {
            const novo = r.quando === hoje;
            const emDisputa = r.atual !== null && !novo && r.atual < r.valor;
            const faltaR = emDisputa ? r.valor - r.atual! : null;
            const perto = emDisputa && r.atual! / r.valor >= 0.8;
            return (
              <li key={r.tipo}>
                <Painel as="article" destaque={novo || perto} className={novo ? '!border-fuchsia-400/50' : ''}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-sm text-slate-400">{r.titulo}</h2>
                      <p className="text-2xl font-extrabold text-white">{formatar(r, r.valor)}</p>
                      <p className="text-xs text-slate-400">{novo ? 'hoje' : `em ${dataCurta(r.quando)}`}</p>
                    </div>
                    {novo && <span className="rounded-full bg-fuchsia-500/20 px-2 py-1 text-xs font-bold text-fuchsia-200">NOVO RECORDE!</span>}
                    {perto && !novo && <span className="rounded-full bg-accent/20 px-2 py-1 text-xs font-bold text-accentSoft">PERTO</span>}
                  </div>
                  {emDisputa && (
                    <div className="mt-3">
                      <BarraSimples percentual={(r.atual! / r.valor) * 100} rotulo={`Progresso para o recorde de ${r.titulo}`} />
                      <p className="mt-1 text-sm text-slate-300">
                        Agora: {formatar(r, r.atual!)} · faltam <strong className="text-white">{formatar(r, faltaR!)}</strong> para {r.tipo === 'MELHOR_MES' ? 'fazer seu melhor mês' : r.tipo === 'MELHOR_DIA' ? 'fazer seu melhor dia' : 'igualar'}.
                      </p>
                    </div>
                  )}
                </Painel>
              </li>
            );
          })}
        </ul>
      )}
    </Fase1Pagina>
  );
}
