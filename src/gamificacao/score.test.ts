import { describe, expect, it } from 'vitest';
import { calcularScoreGeral, normalizarConsistencia, normalizarDeltaBaseline, normalizarMeta } from './score';
import { PesosScore } from './regras.service';

const pesos: PesosScore = { meta: 0.4, evolucao: 0.2, pa: 0.15, ticket: 0.15, consistencia: 0.1 };

describe('normalizarMeta', () => {
  it('mapeia 0% para 0', () => expect(normalizarMeta(0)).toBe(0));
  it('mapeia negativo para 0', () => expect(normalizarMeta(-10)).toBe(0));
  it('mapeia 100% para 80', () => expect(normalizarMeta(100)).toBe(80));
  it('mapeia 50% para 40 (interpolação linear no primeiro trecho)', () => expect(normalizarMeta(50)).toBe(40));
  it('mapeia 110% para 90 (interpolação no segundo trecho)', () => expect(normalizarMeta(110)).toBe(90));
  it('mapeia 120% para 100 (teto)', () => expect(normalizarMeta(120)).toBe(100));
  it('mapeia acima de 120% para 100 (cap)', () => expect(normalizarMeta(200)).toBe(100));
});

describe('normalizarDeltaBaseline', () => {
  it('mapeia 0% de variação para 50 (estabilidade)', () => expect(normalizarDeltaBaseline(0)).toBe(50));
  it('mapeia -30% para 0', () => expect(normalizarDeltaBaseline(-30)).toBe(0));
  it('mapeia +30% para 100', () => expect(normalizarDeltaBaseline(30)).toBe(100));
  it('capa quedas piores que -30% em 0', () => expect(normalizarDeltaBaseline(-90)).toBe(0));
  it('capa melhoras maiores que +30% em 100', () => expect(normalizarDeltaBaseline(90)).toBe(100));
});

describe('normalizarConsistencia', () => {
  it('retorna null sem dado disponível', () => expect(normalizarConsistencia(0, 0)).toBeNull());
  it('calcula percentual normal', () => expect(normalizarConsistencia(3, 6)).toBe(50));
});

describe('calcularScoreGeral', () => {
  it('não fica provisório quando todos os componentes estão disponíveis', () => {
    const r = calcularScoreGeral(
      { metaPercentual: 100, evolucaoDeltaPct: 0, paDeltaPct: 0, ticketDeltaPct: 0, consistenciaPct: 50 },
      pesos
    );
    expect(r.provisorio).toBe(false);
    // meta=80*0.4 + evolucao=50*0.2 + pa=50*0.15 + ticket=50*0.15 + consistencia=50*0.1 = 32+10+7.5+7.5+5 = 62 -> *10 = 620
    expect(r.scoreGeral).toBe(620);
  });

  it('marca provisório e redistribui peso quando baseline está em formação', () => {
    const r = calcularScoreGeral(
      { metaPercentual: 100, evolucaoDeltaPct: null, paDeltaPct: null, ticketDeltaPct: null, consistenciaPct: null },
      pesos
    );
    expect(r.provisorio).toBe(true);
    // só meta disponível, peso 100% do score -> normalizarMeta(100)=80 -> score=80*10=800
    expect(r.scoreGeral).toBe(800);
  });

  it('não deixa vendedor com amostra insuficiente ter score artificialmente baixo', () => {
    // vendedor bateu meta mas não tem baseline nenhuma ainda: score deve refletir só a meta, não zerar os outros componentes
    const semBaseline = calcularScoreGeral(
      { metaPercentual: 150, evolucaoDeltaPct: null, paDeltaPct: null, ticketDeltaPct: null, consistenciaPct: null },
      pesos
    );
    const comBaselinePessima = calcularScoreGeral(
      { metaPercentual: 150, evolucaoDeltaPct: -30, paDeltaPct: -30, ticketDeltaPct: -30, consistenciaPct: 0 },
      pesos
    );
    expect(semBaseline.scoreGeral).toBeGreaterThan(comBaselinePessima.scoreGeral);
  });

  it('score máximo é 1000 quando tudo está no teto', () => {
    const r = calcularScoreGeral(
      { metaPercentual: 200, evolucaoDeltaPct: 100, paDeltaPct: 100, ticketDeltaPct: 100, consistenciaPct: 100 },
      pesos
    );
    expect(r.scoreGeral).toBe(1000);
  });
});
