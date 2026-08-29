import { describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import { assinarToken } from './auth';
import { env } from '../config';

describe('assinarToken', () => {
  it('gera um token com os claims de loja e papel, verificável com o mesmo segredo', () => {
    const token = assinarToken({
      vendedorId: 'vendedor-1',
      empresaId: 'empresa-1',
      lojaId: 'loja-1',
      papel: 'VENDEDOR',
    });

    const claims = jwt.verify(token, env.JWT_SECRET, { issuer: env.JWT_ISSUER }) as jwt.JwtPayload;

    expect(claims.vendedorId).toBe('vendedor-1');
    expect(claims.lojaId).toBe('loja-1');
    expect(claims.papel).toBe('VENDEDOR');
  });

  it('rejeita token verificado com issuer diferente', () => {
    const token = assinarToken({
      vendedorId: 'vendedor-1',
      empresaId: 'empresa-1',
      lojaId: 'loja-1',
      papel: 'VENDEDOR',
    });

    expect(() => jwt.verify(token, env.JWT_SECRET, { issuer: 'outro-app' })).toThrow();
  });
});
