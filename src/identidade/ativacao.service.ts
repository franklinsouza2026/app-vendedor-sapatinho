// Fluxo de ativação de conta (Fatia 7.5A, seções 10/11/39/40). O Admin
// pré-autoriza o vendedor (nome/CPF/loja/matrícula) SEM senha; o vendedor
// ativa a própria credencial apresentando CPF + token de ativação. Nunca há
// autocadastro aberto: só quem já foi pré-autorizado pelo Admin consegue
// ativar uma conta.
import { randomBytes, createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../db';
import { env } from '../config';
import { assinarToken } from '../middlewares/auth';
import { hashCpf, normalizarCpf, validarCpf } from './cpf';
import { registrarEventoAuditoria } from './auditoria.service';
import { IdentidadeError } from './erros';

function hashToken(tokenBruto: string): string {
  return createHash('sha256').update(tokenBruto).digest('hex');
}

export async function preAutorizarVendedor(params: {
  empresaId: string;
  lojaId: string;
  matriculaErp: string;
  nome: string;
  cpf: string;
  papel?: 'VENDEDOR' | 'GERENTE' | 'ADMIN';
  actorId: string;
}) {
  const cpfNormalizado = normalizarCpf(params.cpf);
  if (!validarCpf(cpfNormalizado)) {
    throw new IdentidadeError(400, 'cpf_invalido', 'CPF inválido');
  }

  let vendedor;
  try {
    vendedor = await prisma.vendedor.create({
      data: {
        empresaId: params.empresaId,
        lojaId: params.lojaId,
        matriculaErp: params.matriculaErp,
        nome: params.nome,
        senhaHash: null,
        papel: params.papel ?? 'VENDEDOR',
        status: 'PENDING_ACTIVATION',
        cpfHash: hashCpf(cpfNormalizado),
        cpfUltimosDigitos: cpfNormalizado.slice(9, 11),
      },
    });
  } catch (err) {
    if (isViolacaoUnicidade(err, ['lojaId', 'matriculaErp'])) {
      throw new IdentidadeError(409, 'matricula_duplicada', 'já existe um vendedor com esta matrícula nesta loja');
    }
    if (isViolacaoUnicidade(err, ['empresaId', 'cpfHash'])) {
      throw new IdentidadeError(409, 'cpf_duplicado', 'já existe um vendedor com este CPF nesta empresa');
    }
    throw err;
  }

  const tokenBruto = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + env.ACTIVATION_TOKEN_TTL_HOURS * 3600_000);

  await prisma.activationToken.create({
    data: { vendedorId: vendedor.id, tokenHash: hashToken(tokenBruto), expiresAt },
  });

  await registrarEventoAuditoria({
    empresaId: params.empresaId,
    acao: 'USER_PREAUTHORIZED',
    actorId: params.actorId,
    targetId: vendedor.id,
    metadata: { lojaId: params.lojaId, papel: vendedor.papel },
  });

  // Token bruto retornado UMA vez só — nunca fica salvo em claro (só o hash
  // acima) e não deve ser logado por quem chamar esta função. Não há
  // infraestrutura de e-mail/SMS neste produto ainda: o Admin precisa
  // repassar este valor ao vendedor por um canal próprio (ver limitação
  // documentada na fonte de verdade).
  return { vendedor, tokenAtivacao: tokenBruto, expiraEm: expiresAt };
}

/** Compara por lista de campos (`meta.target`), não pelo nome da constraint —
 * o nome real gerado pelo Postgres pode não bater com o que o Prisma Migrate
 * teria escolhido, já que esta migração foi gerada via `migrate diff`. */
function isViolacaoUnicidade(err: unknown, campos: string[]): boolean {
  if (!(typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2002')) return false;
  const target = (err as { meta?: { target?: unknown } }).meta?.target;
  const alvo = Array.isArray(target) ? target : typeof target === 'string' ? [target] : [];
  return campos.every((c) => alvo.includes(c));
}

export async function ativarConta(params: { codigoErpLoja: string; cpf: string; token: string; senha: string }) {
  const erroGenerico = () => new IdentidadeError(400, 'ativacao_invalida', 'dados de ativação inválidos ou token expirado');

  const loja = await prisma.loja.findFirst({ where: { codigoErp: params.codigoErpLoja } });
  if (!loja) throw erroGenerico();

  const cpfNormalizado = normalizarCpf(params.cpf);
  if (!validarCpf(cpfNormalizado)) throw erroGenerico();

  const vendedor = await prisma.vendedor.findFirst({
    where: { lojaId: loja.id, cpfHash: hashCpf(cpfNormalizado), status: 'PENDING_ACTIVATION' },
  });
  // Mesma mensagem genérica pra "CPF não encontrado" e "já ativado" — nunca
  // confirmar pra um chamador anônimo se um CPF existe nesta loja (seção 62).
  if (!vendedor) throw erroGenerico();

  const tokenHash = hashToken(params.token);
  const tokenRow = await prisma.activationToken.findFirst({
    where: { vendedorId: vendedor.id, tokenHash, status: 'PENDING', expiresAt: { gt: new Date() } },
  });
  if (!tokenRow) throw erroGenerico();

  // Transição condicional atômica (não ler-então-escrever) — protege contra
  // 2 requests concorrentes tentando ativar com o mesmo token (replay),
  // mesmo padrão já usado nas máquinas de estado das Fatias 4-7.
  const consumo = await prisma.activationToken.updateMany({
    where: { id: tokenRow.id, status: 'PENDING' },
    data: { status: 'USED', usedAt: new Date() },
  });
  if (consumo.count !== 1) throw erroGenerico();

  const senhaHash = await bcrypt.hash(params.senha, 10);
  await prisma.vendedor.update({ where: { id: vendedor.id }, data: { senhaHash, status: 'ACTIVE' } });

  await registrarEventoAuditoria({
    empresaId: vendedor.empresaId,
    acao: 'USER_ACTIVATED',
    targetId: vendedor.id,
  });

  const token = assinarToken({
    vendedorId: vendedor.id,
    empresaId: vendedor.empresaId,
    lojaId: vendedor.lojaId,
    papel: vendedor.papel,
  });

  return { token, vendedor: { id: vendedor.id, nome: vendedor.nome, papel: vendedor.papel } };
}

export async function alterarSenha(vendedorId: string, senhaAtual: string, novaSenha: string) {
  const vendedor = await prisma.vendedor.findUnique({ where: { id: vendedorId } });
  if (!vendedor || !vendedor.senhaHash) throw new IdentidadeError(401, 'senha_atual_incorreta', 'senha atual incorreta');

  const senhaOk = await bcrypt.compare(senhaAtual, vendedor.senhaHash);
  if (!senhaOk) throw new IdentidadeError(401, 'senha_atual_incorreta', 'senha atual incorreta');

  const senhaHash = await bcrypt.hash(novaSenha, 10);
  await prisma.vendedor.update({ where: { id: vendedorId }, data: { senhaHash } });

  await registrarEventoAuditoria({
    empresaId: vendedor.empresaId,
    acao: 'PASSWORD_CHANGED',
    actorId: vendedorId,
    targetId: vendedorId,
  });
}
