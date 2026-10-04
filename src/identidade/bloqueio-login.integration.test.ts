// T5 — bloqueio por CONTA contra força bruta: 5 senhas erradas para a mesma
// (loja, matrícula) travam a conta por 15 min, mesmo com a senha certa depois;
// não afeta outra conta e não revela se a matrícula existe.
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { app } from '../app';
import { prisma } from '../db';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { limparFalhas, MAX_TENTATIVAS } from './bloqueio-login';

describe('bloqueio de login por conta (T5)', () => {
  it(`${MAX_TENTATIVAS} senhas erradas travam a conta: a senha certa passa a receber 429; outra conta segue entrando`, async () => {
    const { loja, vendedor } = await criarFixtureEmpresa();
    const matricula = `LOCK-${randomUUID().slice(0, 8)}`;
    await prisma.vendedor.update({ where: { id: vendedor.id }, data: { matriculaErp: matricula, status: 'ACTIVE', senhaHash: await bcrypt.hash('senha-certa-123', 4) } });
    const outra = await prisma.vendedor.create({ data: { empresaId: loja.empresaId, lojaId: loja.id, matriculaErp: `OK-${randomUUID().slice(0, 8)}`, nome: 'Outra', status: 'ACTIVE', senhaHash: await bcrypt.hash('senha-certa-123', 4) } });
    const login = (m: string, senha: string) => request(app).post('/auth/login').send({ lojaId: loja.id, matriculaErp: m, senha });

    try {
      for (let i = 0; i < MAX_TENTATIVAS; i++) expect((await login(matricula, 'errada')).status).toBe(401);
      const bloqueado = await login(matricula, 'senha-certa-123');
      expect(bloqueado.status).toBe(429);
      expect(bloqueado.body.token).toBeUndefined();
      expect((await login(outra.matriculaErp, 'senha-certa-123')).status).toBe(200);

      // matrícula inexistente se comporta igual (não revela existência)
      const fantasma = `NAO-EXISTE-${randomUUID().slice(0, 6)}`;
      for (let i = 0; i < MAX_TENTATIVAS; i++) expect((await login(fantasma, 'x')).status).toBe(401);
      expect((await login(fantasma, 'x')).status).toBe(429);
    } finally {
      await limparFalhas(loja.id, matricula);
    }
    // depois que a janela expira (simulado limpando), a senha certa volta a entrar
    expect((await login(matricula, 'senha-certa-123')).status).toBe(200);
  });
});
