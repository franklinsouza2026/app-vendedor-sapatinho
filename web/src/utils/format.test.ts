import { describe, expect, it } from 'vitest';
import { formatarMoeda, labelEvento, labelRanking, saudacao } from './format';

describe('formatarMoeda', () => {
  it('formata em Real brasileiro', () => {
    expect(formatarMoeda(1850)).toBe('R$ 1.850,00');
  });
});

describe('saudacao', () => {
  it('bom dia antes do meio-dia', () => {
    expect(saudacao(new Date('2026-08-29T09:00:00'))).toBe('Bom dia');
  });
  it('boa tarde entre 12 e 18h', () => {
    expect(saudacao(new Date('2026-08-29T14:00:00'))).toBe('Boa tarde');
  });
  it('boa noite após 18h', () => {
    expect(saudacao(new Date('2026-08-29T20:00:00'))).toBe('Boa noite');
  });
});

describe('labelEvento — nunca mostra enum técnico cru', () => {
  it('traduz eventos conhecidos', () => {
    expect(labelEvento('META_DIARIA_100')).toBe('Meta diária atingida');
    expect(labelEvento('REVERSAO')).toBe('Ajuste por cancelamento/reversão');
  });

  it('cai de volta pro código bruto se for um evento desconhecido (nunca quebra)', () => {
    expect(labelEvento('EVENTO_NOVO_FUTURO')).toBe('EVENTO_NOVO_FUTURO');
  });
});

describe('labelRanking', () => {
  it('traduz tipos conhecidos', () => {
    expect(labelRanking('SCORE_GERAL')).toBe('Score Geral');
    expect(labelRanking('PERCENTUAL_META')).toBe('% da Meta');
  });
});
