import { describe, expect, it } from 'vitest';
import { hashCpf, mascararCpf, normalizarCpf, validarCpf } from './cpf';

describe('normalizarCpf', () => {
  it('remove formatação, deixando só os dígitos', () => {
    expect(normalizarCpf('123.456.789-09')).toBe('12345678909');
    expect(normalizarCpf('12345678909')).toBe('12345678909');
    expect(normalizarCpf('123 456 789 09')).toBe('12345678909');
  });
});

describe('validarCpf', () => {
  it('aceita um CPF estruturalmente válido (dígitos verificadores corretos)', () => {
    // CPFs de teste com dígito verificador real calculado (não são de pessoas reais).
    expect(validarCpf('11144477735')).toBe(true);
    expect(validarCpf('52998224725')).toBe(true);
  });

  it('rejeita CPF com dígito verificador incorreto', () => {
    expect(validarCpf('11144477736')).toBe(false);
    expect(validarCpf('52998224700')).toBe(false);
  });

  it('rejeita todos os CPFs com dígitos repetidos (passam no cálculo, nunca são reais)', () => {
    for (let d = 0; d <= 9; d++) {
      expect(validarCpf(String(d).repeat(11))).toBe(false);
    }
  });

  it('rejeita entrada com tamanho errado', () => {
    expect(validarCpf('123456789')).toBe(false);
    expect(validarCpf('123456789091')).toBe(false);
    expect(validarCpf('')).toBe(false);
  });
});

describe('mascararCpf', () => {
  it('mostra só os 2 últimos dígitos, nunca o CPF completo', () => {
    expect(mascararCpf('11144477735')).toBe('***.***.***-35');
  });
});

describe('hashCpf', () => {
  it('é determinístico — o mesmo CPF sempre gera o mesmo hash', () => {
    expect(hashCpf('11144477735')).toBe(hashCpf('11144477735'));
  });

  it('CPFs diferentes geram hashes diferentes', () => {
    expect(hashCpf('11144477735')).not.toBe(hashCpf('52998224725'));
  });

  it('nunca retorna o CPF em claro dentro do hash', () => {
    expect(hashCpf('11144477735')).not.toContain('11144477735');
  });
});
