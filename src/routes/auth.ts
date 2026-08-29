import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db';
import { assinarToken, requireAuth } from '../middlewares/auth';
import { loginRateLimit } from '../middlewares/ratelimit';

export const authRouter = Router();

const loginSchema = z.object({
  codigoErpLoja: z.string().min(1),
  matriculaErp: z.string().min(1),
  senha: z.string().min(1),
});

authRouter.post('/auth/login', loginRateLimit, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'dados de login inválidos' });
  }

  const { codigoErpLoja, matriculaErp, senha } = parsed.data;

  const loja = await prisma.loja.findFirst({ where: { codigoErp: codigoErpLoja } });
  if (!loja) return res.status(401).json({ error: 'credenciais inválidas' });

  const vendedor = await prisma.vendedor.findUnique({
    where: { lojaId_matriculaErp: { lojaId: loja.id, matriculaErp } },
  });
  if (!vendedor || !vendedor.ativo) return res.status(401).json({ error: 'credenciais inválidas' });

  const senhaOk = await bcrypt.compare(senha, vendedor.senhaHash);
  if (!senhaOk) return res.status(401).json({ error: 'credenciais inválidas' });

  const token = assinarToken({
    vendedorId: vendedor.id,
    empresaId: vendedor.empresaId,
    lojaId: vendedor.lojaId,
    papel: vendedor.papel,
  });

  res.json({ token, vendedor: { id: vendedor.id, nome: vendedor.nome, papel: vendedor.papel } });
});

// Cadastro de vendedor — só admin/gerente cadastram, não há auto-registro.
const cadastroSchema = z.object({
  lojaId: z.string().uuid(),
  matriculaErp: z.string().min(1),
  nome: z.string().min(1),
  senha: z.string().min(8),
  papel: z.enum(['VENDEDOR', 'GERENTE', 'ADMIN']).default('VENDEDOR'),
});

authRouter.post('/vendedores', requireAuth('ADMIN', 'GERENTE'), async (req, res) => {
  const parsed = cadastroSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'dados de cadastro inválidos', detalhes: parsed.error.flatten() });
  }

  const { lojaId, matriculaErp, nome, senha, papel } = parsed.data;

  const loja = await prisma.loja.findUnique({ where: { id: lojaId } });
  if (!loja || loja.empresaId !== req.auth!.empresaId) {
    return res.status(403).json({ error: 'loja fora do escopo da empresa do usuário logado' });
  }

  const senhaHash = await bcrypt.hash(senha, 10);

  const vendedor = await prisma.vendedor.create({
    data: { empresaId: loja.empresaId, lojaId, matriculaErp, nome, senhaHash, papel },
  });

  res.status(201).json({ id: vendedor.id, nome: vendedor.nome, papel: vendedor.papel });
});
