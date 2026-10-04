import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db';
import { assinarToken, requireAuth } from '../middlewares/auth';
import { loginRateLimit } from '../middlewares/ratelimit';
import { asyncHandler } from '../middlewares/async-handler';
import { alterarSenha, ativarConta } from '../identidade/ativacao.service';
import { IdentidadeError } from '../identidade/erros';
import { resolverLojaDeLogin } from '../identidade/loja-login';
import { estaBloqueado, limparFalhas, MAX_TENTATIVAS, registrarFalha } from '../identidade/bloqueio-login';
import { registrarEventoAuditoria } from '../identidade/auditoria.service';

export const authRouter = Router();

// Endpoint pequeno pro formulário de login mobile: o vendedor não deveria
// precisar saber o "código ERP" da própria loja pra logar — o front busca o
// nome amigável aqui e envia o codigoErp internamente. É público (roda antes
// do login, sem JWT) mas SÓ retorna lojas da empresa deste deployment — cada
// instância do app pertence a exatamente 1 empresa (Decisão 1 do vault:
// multi-loja lógico, não multi-tenant de infra). Sem esse filtro, listaria
// lojas (e codigoErp, usado como parte do login) de outras empresas-cliente
// caso este banco algum dia hospede mais de uma.
authRouter.get('/lojas', async (req, res) => {
  // Multiempresa (Fase 1, D8): com UMA empresa no banco, lista as lojas dela;
  // com várias, o app precisa dizer qual (`?empresa=<id>`, configurado no
  // build do app da empresa) — nunca lista lojas de todas as empresas.
  const pedida = typeof req.query.empresa === 'string' && /^[0-9a-f-]{36}$/i.test(req.query.empresa) ? req.query.empresa : null;
  const empresas = pedida ? await prisma.empresa.findMany({ where: { id: pedida }, take: 1 }) : await prisma.empresa.findMany({ take: 2, orderBy: { createdAt: 'asc' } });
  const empresa = empresas.length === 1 ? empresas[0] : null;
  const lojas = empresa
    ? await prisma.loja.findMany({
        // Loja inativa (Fatia 9.7) não aparece no formulário de login — ninguém
        // deve conseguir entrar por uma loja que a empresa desativou.
        where: { empresaId: empresa.id, ativa: true },
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

const loginSchema = z
  .object({
    lojaId: z.string().uuid().optional(),
    codigoErpLoja: z.string().min(1).optional(),
    matriculaErp: z.string().min(1).max(64),
    senha: z.string().min(1).max(200),
  })
  .refine((d) => d.lojaId || d.codigoErpLoja, { message: 'loja obrigatória' });

authRouter.post('/auth/login', loginRateLimit, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'dados de login inválidos' });
  }

  const { matriculaErp, senha } = parsed.data;

  // `ativa` também aqui, não só no dropdown de /lojas (Fatia 9.7). Loja por
  // UUID ou por código ERP INEQUÍVOCO (nunca escolhe entre empresas).
  // Erro genérico — nunca revela que a loja existe mas está inativa.
  const loja = await resolverLojaDeLogin(parsed.data);
  if (!loja) return res.status(401).json({ error: 'credenciais inválidas' });

  // Bloqueio por conta (5 erros em 15 min), independente do IP.
  if (await estaBloqueado(loja.id, matriculaErp)) {
    return res.status(429).json({ error: 'muitas tentativas — aguarde 15 minutos e tente de novo', type: 'login_bloqueado' });
  }

  const vendedor = await prisma.vendedor.findUnique({
    where: { lojaId_matriculaErp: { lojaId: loja.id, matriculaErp } },
  });
  // Mesma resposta genérica pra "não existe", "PENDING_ACTIVATION" (ainda sem
  // senha própria — precisa ativar primeiro, ver POST /auth/ativacao),
  // "BLOCKED" e "OFFBOARDED": nunca dar ao atacante um jeito de distinguir
  // esses casos por diferença de resposta (seção 61/62 da fonte de verdade).
  if (!vendedor || vendedor.status !== 'ACTIVE' || !vendedor.senhaHash) {
    await registrarFalha(loja.id, matriculaErp);
    return res.status(401).json({ error: 'credenciais inválidas' });
  }

  const senhaOk = await bcrypt.compare(senha, vendedor.senhaHash);
  if (!senhaOk) {
    const falhas = await registrarFalha(loja.id, matriculaErp);
    if (falhas === MAX_TENTATIVAS) await registrarEventoAuditoria({ empresaId: vendedor.empresaId, acao: 'LOGIN_LOCKED', targetId: vendedor.id });
    return res.status(401).json({ error: 'credenciais inválidas' });
  }
  await limparFalhas(loja.id, matriculaErp);

  const token = assinarToken({
    vendedorId: vendedor.id,
    empresaId: vendedor.empresaId,
    lojaId: vendedor.lojaId,
    papel: vendedor.papel,
    sv: vendedor.sessaoVersao,
  });

  res.json({ token, vendedor: { id: vendedor.id, nome: vendedor.nome, papel: vendedor.papel } });
});

// Ativação de conta pré-autorizada (Fatia 7.5A, seção 10/11) — o vendedor
// nunca escolhe a própria empresa/loja aqui, só confirma que é a pessoa que
// o Admin já vinculou (CPF + token de ativação de uso único). Rate-limited
// com o mesmo limitador do login: mesmo risco de força bruta contra um
// CPF/token de baixa entropia.
const ativacaoSchema = z.object({
  lojaId: z.string().uuid().optional(),
  codigoErpLoja: z.string().min(1).optional(),
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

