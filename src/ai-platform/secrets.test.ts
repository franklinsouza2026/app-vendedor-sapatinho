import { describe, expect, it } from 'vitest';
import { cifrarSegredo, decifrarSegredo } from './secrets';

describe('cifrarSegredo / decifrarSegredo', () => {
  it('cifra e decifra de volta o mesmo valor', () => {
    const original = 'sk-super-secret-test-value';
    const cifrado = cifrarSegredo(original);
    expect(decifrarSegredo(cifrado)).toBe(original);
  });

  it('nunca contém o texto original no ciphertext (nem em base64)', () => {
    const original = 'sk-super-secret-test-value';
    const cifrado = cifrarSegredo(original);
    expect(cifrado.ciphertextBase64).not.toContain(original);
    expect(Buffer.from(cifrado.ciphertextBase64, 'base64').toString('latin1')).not.toContain(original);
  });

  it('IV é diferente a cada chamada (nonce aleatório, nunca reaproveitado)', () => {
    const a = cifrarSegredo('mesmo-valor');
    const b = cifrarSegredo('mesmo-valor');
    expect(a.ivBase64).not.toBe(b.ivBase64);
    expect(a.ciphertextBase64).not.toBe(b.ciphertextBase64);
  });

  it('detecta adulteração via auth tag — decifrar com ciphertext alterado falha', () => {
    const cifrado = cifrarSegredo('valor-original');
    const adulterado = { ...cifrado, ciphertextBase64: Buffer.from('lixo-adulterado-aaaaaaaaaaaaaaaa').toString('base64') };
    expect(() => decifrarSegredo(adulterado)).toThrow();
  });

  it('detecta adulteração via auth tag trocado', () => {
    const a = cifrarSegredo('valor-a');
    const b = cifrarSegredo('valor-b');
    expect(() => decifrarSegredo({ ...a, authTagBase64: b.authTagBase64 })).toThrow();
  });
});
