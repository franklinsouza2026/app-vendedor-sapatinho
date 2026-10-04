/**
 * Provisionamento de EMPRESA (Fase 1, D8) — o mínimo para uma empresa nova
 * operar: régua de gamificação v1, catálogo de badges, primeira loja e o
 * primeiro ADMIN. Sem nenhum dado de demonstração (vendas, metas, pessoas
 * fictícias). Idempotente: rodar de novo não duplica nada.
 *
 * Usado pelo script de produção `scripts/provisionar-empresa.ts` e pelo
 * preparo do E2E isolado.
 */
import bcrypt from 'bcryptjs';
import { Prisma, PrismaClient } from '@prisma/client';
import { REGUA_V1 } from '../gamificacao/regras.service';
import { CATALOGO_BADGES_V1 } from '../gamificacao/badges.service';

export interface DadosProvisionamento {
  empresa: { id?: string; nome: string; timezone?: string };
  loja: { id?: string; nome: string; codigoErp: string };
  admin: { id?: string; nome: string; matriculaErp: string; senha: string };
}

type Cliente = PrismaClient | Prisma.TransactionClient;

/** Régua v1 e badges — base de gamificação de qualquer empresa. */
export async function garantirBaseGamificacao(prisma: Cliente, empresaId: string) {
  await prisma.regraGamificacaoVersao.upsert({
    where: { empresaId_versao: { empresaId, versao: 1 } },
    update: {},
    create: { empresaId, versao: 1, ativo: true, regrasXp: REGUA_V1.regrasXp, regrasMoeda: REGUA_V1.regrasMoeda, pesosScore: REGUA_V1.pesosScore, criadoPor: 'provisionamento' },
  });
  // Catálogo de badges é global (código único) — compartilhado entre empresas.
  for (const badge of CATALOGO_BADGES_V1) {
    await prisma.badge.upsert({ where: { codigo: badge.codigo }, update: {}, create: badge });
  }
}

export async function provisionarEmpresa(prisma: PrismaClient, dados: DadosProvisionamento) {
  if (dados.admin.senha.length < 12) throw new Error('a senha inicial do ADMIN precisa ter pelo menos 12 caracteres');
  const empresa = dados.empresa.id
    ? await prisma.empresa.upsert({ where: { id: dados.empresa.id }, update: {}, create: { id: dados.empresa.id, nome: dados.empresa.nome, timezone: dados.empresa.timezone ?? 'America/Sao_Paulo' } })
    : await prisma.empresa.create({ data: { nome: dados.empresa.nome, timezone: dados.empresa.timezone ?? 'America/Sao_Paulo' } });

  const loja = await prisma.loja.upsert({
    where: { empresaId_codigoErp: { empresaId: empresa.id, codigoErp: dados.loja.codigoErp } },
    update: {},
    create: { ...(dados.loja.id ? { id: dados.loja.id } : {}), empresaId: empresa.id, nome: dados.loja.nome, codigoErp: dados.loja.codigoErp },
  });

  const admin = await prisma.vendedor.upsert({
    where: { lojaId_matriculaErp: { lojaId: loja.id, matriculaErp: dados.admin.matriculaErp } },
    update: {},
    create: { ...(dados.admin.id ? { id: dados.admin.id } : {}), empresaId: empresa.id, lojaId: loja.id, matriculaErp: dados.admin.matriculaErp, nome: dados.admin.nome, papel: 'ADMIN', status: 'ACTIVE', senhaHash: await bcrypt.hash(dados.admin.senha, 12) },
  });

  await garantirBaseGamificacao(prisma, empresa.id);
  return { empresa, loja, admin };
}
