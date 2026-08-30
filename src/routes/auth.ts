import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db';
import { assinarToken, requireAuth } from '../middlewares/auth';
import { loginRateLimit } from '../middlewares/ratelimit';
import { asyncHandler } from '../middlewares/async-handler';
import { alterarSenha, ativarConta } from '../identidade/ativacao.service';
import { IdentidadeError } from '../identidade/erros';

export const authRouter = Router();

// Endpoint pequeno pro formulário de login mobile: o vendedor não deveria
// precisar saber o "código ERP" da própria loja pra logar — o front busca o
// nome amigável aqui e envia o codigoErp internamente. É público (roda antes
// do login, sem JWT) mas SÓ retorna lojas da empresa deste deployment — cada
// instância do app pertence a exatamente 1 empresa (Decisão 1 do vault:
// multi-loja lógico, não multi-tenant de infra). Sem esse filtro, listaria
// lojas (e codigoErp, usado como parte do login) de outras empresas-cliente
// caso este banco algum dia hospede mais de uma.
authRouter.get('/lojas', async (_req, res) => {
  const empresa = await prisma.empresa.findFirst({ orderBy: { createdAt: 'asc' } });
  const lojas = empresa
    ? await prisma.loja.findMany({
        where: { empresaId: empresa.id },
        select: { id: true, nome: true, codigoErp: true },
        orderBy: { nome: 'asc' },
      })
    : [];
  res.json({ lojas });
});

authRouter.get('/auth/me', requireAuth(), async (req, res) => {
  const vendedor = await prisma.vendedor.findUnique({
    where: { id: req.auth!.vendedorId },
    include: { loja: { include: { empresa: true } } },
  });

  // findUnique (não findUniqueOrThrow) de propósito: um token pode ficar válido
  // até 12h — se o vendedor foi removido/desativado nesse meio-tempo, isso
  // precisa virar 401 tratado, nunca uma exceção não capturada derrubando o
  // processo (não há wrapper de erro assíncrono no Express desta API).
  // requireAuth() já rejeita status != ACTIVE antes de chegar aqui (Fatia
  // 7.5A) — o check abaixo é defesa em profundidade, não a única barreira.
  if (!vendedor || vendedor.status !== 'ACTIVE') {
    return res.status(401).json({ error: 'sessão inválida' });
  }

  res.json({
    vendedor: {
      id: vendedor.id,
      nome: vendedor.nome,
      papel: vendedor.papel,
      cpfMascarado: vendedor.cpfUltimosDigitos ? `***.***.***-${vendedor.cpfUltimosDigitos}` : null,
    },
    loja: { id: vendedor.loja.id, nome: vendedor.loja.nome },
    empresa: { nome: vendedor.loja.empresa.nome },
  });
});

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
  // Mesma resposta genérica pra "não existe", "PENDING_ACTIVATION" (ainda sem
  // senha própria — precisa ativar primeiro, ver POST /auth/ativacao),
  // "BLOCKED" e "OFFBOARDED": nunca dar ao atacante um jeito de distinguir
  // esses casos por diferença de resposta (seção 61/62 da fonte de verdade).
  if (!vendedor || vendedor.status !== 'ACTIVE' || !vendedor.senhaHash) {
    return res.status(401).json({ error: 'credenciais inválidas' });
  }

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

// Ativação de conta pré-autorizada (Fatia 7.5A, seção 10/11) — o vendedor
// nunca escolhe a própria empresa/loja aqui, só confirma que é a pessoa que
// o Admin já vinculou (CPF + token de ativação de uso único). Rate-limited
// com o mesmo limitador do login: mesmo risco de força bruta contra um
// CPF/token de baixa entropia.
const ativacaoSchema = z.object({
  codigoErpLoja: z.string().min(1),
  cpf: z.string().min(1),
  token: z.string().min(1),
  senha: z.string().min(8),
});

authRouter.post(
  '/auth/ativacao',
  loginRateLimit,
  asyncHandler(async (req, res) => {
    const parsed = ativacaoSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados de ativação inválidos' });

    try {
      const resultado = await ativarConta(parsed.data);
      res.json(resultado);
    } catch (err) {
      if (err instanceof IdentidadeError) return res.status(err.status).json({ error: err.message, type: err.type });
      throw err;
    }
  })
);

const alterarSenhaSchema = z.object({
  senhaAtual: z.string().min(1),
  novaSenha: z.string().min(8),
});

authRouter.post(
  '/auth/senha',
  requireAuth(),
  loginRateLimit,
  asyncHandler(async (req, res) => {
    const parsed = alterarSenhaSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'dados inválidos' });

    try {
      await alterarSenha(req.auth!.vendedorId, parsed.data.senhaAtual, parsed.data.novaSenha);
      res.status(204).end();
    } catch (err) {
      if (err instanceof IdentidadeError) return res.status(err.status).json({ error: err.message, type: err.type });
      throw err;
    }
  })
);

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
