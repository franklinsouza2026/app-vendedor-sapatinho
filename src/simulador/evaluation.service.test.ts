// O provider NUNCA decide a nota final sozinho — normalizarAvaliacao é quem
// calcula scoreFinal deterministicamente e quem decide se o formato retornado
// é confiável o bastante pra persistir (retorna null caso contrário, nunca
// uma nota inventada). Ver session.service.ts (finalizarEAvaliar).
import { describe, expect, it } from 'vitest';
import { normalizarAvaliacao } from './evaluation.service';
import { CriterioAvaliacao } from './rubrica';

const CRITERIOS: CriterioAvaliacao[] = ['ABORDAGEM', 'SONDAGEM', 'FECHAMENTO'];

describe('normalizarAvaliacao', () => {
  it('calcula scoreFinal como a média arredondada dos scores por critério (nunca confia num scoreFinal vindo do provider)', () => {
    const bruto = JSON.stringify({
      scores: { ABORDAGEM: 80, SONDAGEM: 60, FECHAMENTO: 100, scoreFinal: 1 }, // scoreFinal=1 no bruto deve ser ignorado
      strengths: ['Boa recepção'],
      improvements: ['Sondar mais'],
      missedOpportunities: [],
      betterExample: 'Exemplo melhor',
      summary: 'Resumo',
    });

    const resultado = normalizarAvaliacao(bruto, CRITERIOS);

    expect(resultado).not.toBeNull();
    expect(resultado!.scoreFinal).toBe(80); // (80+60+100)/3 = 80
    expect(resultado!.scores).toEqual({ ABORDAGEM: 80, SONDAGEM: 60, FECHAMENTO: 100 });
    expect(resultado!.strengths).toEqual(['Boa recepção']);
  });

  it('faz clamp de scores fora do intervalo 0-100', () => {
    const bruto = JSON.stringify({ scores: { ABORDAGEM: 150, SONDAGEM: -20, FECHAMENTO: 50 } });
    const resultado = normalizarAvaliacao(bruto, CRITERIOS);
    expect(resultado!.scores).toEqual({ ABORDAGEM: 100, SONDAGEM: 0, FECHAMENTO: 50 });
  });

  it('retorna null quando o JSON é inválido — nunca lança exceção crua', () => {
    expect(normalizarAvaliacao('isto não é JSON', CRITERIOS)).toBeNull();
  });

  it('retorna null quando falta um critério esperado no objeto scores', () => {
    const bruto = JSON.stringify({ scores: { ABORDAGEM: 80, SONDAGEM: 60 } }); // falta FECHAMENTO
    expect(normalizarAvaliacao(bruto, CRITERIOS)).toBeNull();
  });

  it('retorna null quando um score não é um número finito', () => {
    const bruto = JSON.stringify({ scores: { ABORDAGEM: 'ótimo', SONDAGEM: 60, FECHAMENTO: 50 } });
    expect(normalizarAvaliacao(bruto, CRITERIOS)).toBeNull();
  });

  it('retorna null quando scores não é um objeto', () => {
    expect(normalizarAvaliacao(JSON.stringify({ scores: 'tudo ótimo' }), CRITERIOS)).toBeNull();
  });

  it('retorna null quando não há critérios esperados (config incompleta)', () => {
    expect(normalizarAvaliacao(JSON.stringify({ scores: { ABORDAGEM: 80 } }), [])).toBeNull();
  });

  it('ignora campos de texto extras que não sejam string, sem lançar erro', () => {
    const bruto = JSON.stringify({ scores: { ABORDAGEM: 80, SONDAGEM: 60, FECHAMENTO: 50 }, strengths: 'não é array', betterExample: 42 });
    const resultado = normalizarAvaliacao(bruto, CRITERIOS);
    expect(resultado!.strengths).toEqual([]);
    expect(resultado!.betterExample).toBe('');
  });
});
