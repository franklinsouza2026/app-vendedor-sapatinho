// Ranking em pista (Fatia 9.6, seção 54-61) — representação visual nova,
// motor/dado 100% preservado (recebe exatamente o mesmo `RankingLinha[]` já
// calculado pelo backend, nunca recalcula nada aqui). Puramente decorativo:
// a lista de texto abaixo (já existente em `Ranking.tsx`) continua sendo a
// fonte acessível principal — screen reader e navegação por teclado nunca
// dependem da posição gráfica dos "veículos" na pista (seção 57).
import { RankingLinha } from '../types';

const MAX_NA_PISTA = 8;
const LARGURA = 320;
const ALTURA_POR_POSICAO = 62;

function pontoDaCurva(indice: number, total: number): { x: number; y: number } {
  // Serpentina simples: X oscila em seno conforme a posição desce a pista —
  // 1º lugar sempre no topo, último sempre embaixo.
  const y = 30 + indice * ALTURA_POR_POSICAO;
  const x = LARGURA / 2 + Math.sin(indice * 0.9) * (LARGURA / 2 - 50);
  void total;
  return { x, y };
}

// "Veículo" original e estilizado (Fatia 9.6, seção 59-60) — forma
// geométrica própria (nunca um carro real nem marca automotiva), pensado
// como um veículo futurista/gamificado simples: um casco arredondado com
// duas "asas" laterais. Preparado como componente próprio pra permitir
// customização futura (cor/skin) sem mexer no restante da pista.
function VeiculoIcon({ cor }: { cor: string }) {
  return (
    <svg width="34" height="20" viewBox="0 0 34 20" aria-hidden="true">
      <path d="M4 14 L10 6 Q17 2 24 6 L30 14 Q17 18 4 14 Z" fill={cor} stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
      <circle cx="11" cy="15" r="2.4" fill="#0f172a" />
      <circle cx="23" cy="15" r="2.4" fill="#0f172a" />
    </svg>
  );
}

function corPorPosicao(posicao: number): string {
  if (posicao === 1) return '#facc15'; // ouro
  if (posicao === 2) return '#cbd5e1'; // prata
  if (posicao === 3) return '#fb923c'; // bronze
  return '#38bdf8';
}

export function RankingPista({ ranking, vendedorId }: { ranking: RankingLinha[]; vendedorId: string | undefined }) {
  const exibidos = ranking.slice(0, MAX_NA_PISTA);
  const altura = 30 + exibidos.length * ALTURA_POR_POSICAO + 30;
  const pontos = exibidos.map((_, i) => pontoDaCurva(i, exibidos.length));

  return (
    <div className="overflow-hidden rounded-2xl bg-surface p-3 shadow-lg" aria-hidden="true">
      <svg width="100%" viewBox={`0 0 ${LARGURA} ${altura}`} className="block">
        <path d={`M ${pontos.map((p) => `${p.x} ${p.y}`).join(' L ')}`} fill="none" stroke="rgba(148,163,184,0.35)" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
        <path
          d={`M ${pontos.map((p) => `${p.x} ${p.y}`).join(' L ')}`}
          fill="none"
          stroke="rgba(15,23,42,0.6)"
          strokeWidth="18"
          strokeDasharray="4 10"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {exibidos.map((linha, i) => {
          const souEu = linha.vendedorId === vendedorId;
          const ponto = pontos[i];
          const inicial = linha.nomeVendedor.charAt(0).toUpperCase();
          return (
            <g key={linha.vendedorId} transform={`translate(${ponto.x}, ${ponto.y})`}>
              <g transform="translate(-17, -22)">
                <VeiculoIcon cor={corPorPosicao(linha.posicao)} />
              </g>
              <circle r="11" fill={souEu ? '#6366f1' : '#1e293b'} stroke="#fff" strokeWidth="1.5" />
              <text textAnchor="middle" dy="4" fontSize="11" fill="#fff" fontWeight="600">
                {inicial}
              </text>
              <text textAnchor="middle" y="24" fontSize="9" fill="#cbd5e1">
                {linha.posicao}º
              </text>
              <text textAnchor={ponto.x > LARGURA / 2 ? 'end' : 'start'} x={ponto.x > LARGURA / 2 ? -22 : 22} y="4" fontSize="10" fill={souEu ? '#a5b4fc' : '#e2e8f0'}>
                {linha.nomeVendedor.split(' ')[0]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
