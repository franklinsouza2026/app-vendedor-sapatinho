// Helpers só pra testes de integração do módulo de gamificação — cria
// fixtures isoladas (UUID novo por chamada) pra rodar contra o Postgres real
// de dev sem interferir entre testes.
import { randomUUID } from 'node:crypto';
import { prisma } from '../db';
import { REGUA_V1 } from './regras.service';
import { CATALOGO_BADGES_V1 } from './badges.service';
import { Papel } from '@prisma/client';
import { assinarToken } from '../middlewares/auth';

/** Badge é catálogo global (não por empresa) — garante que existe antes de testes que concedem badge. */
export async function garantirCatalogoBadges() {
  for (const badge of CATALOGO_BADGES_V1) {
    await prisma.badge.upsert({ where: { codigo: badge.codigo }, update: {}, create: badge });
  }
}

export async function criarFixtureEmpresa() {
  await garantirCatalogoBadges();

  const empresa = await prisma.empresa.create({ data: { nome: `Empresa Teste ${randomUUID()}` } });
  const loja = await prisma.loja.create({
    data: { empresaId: empresa.id, nome: 'Loja Teste', codigoErp: `TESTE-${randomUUID()}` },
  });
  const vendedor = await prisma.vendedor.create({
    data: {
      empresaId: empresa.id,
      lojaId: loja.id,
      matriculaErp: `V-${randomUUID()}`,
      nome: 'Vendedor Teste',
      senhaHash: 'hash-nao-usado-nesse-teste',
    },
  });
  await prisma.regraGamificacaoVersao.create({
    data: {
      empresaId: empresa.id,
      versao: 1,
      ativo: true,
      regrasXp: REGUA_V1.regrasXp,
      regrasMoeda: REGUA_V1.regrasMoeda,
      pesosScore: REGUA_V1.pesosScore,
      criadoPor: 'test-helper',
    },
  });

  return { empresa, loja, vendedor };
}

export async function criarMeta(vendedorId: string, valorMeta: number, referencia: Date) {
  const vendedor = await prisma.vendedor.findUniqueOrThrow({ where: { id: vendedorId } });
  return prisma.meta.create({
    data: {
      empresaId: vendedor.empresaId,
      lojaId: vendedor.lojaId,
      vendedorId,
      tipo: 'FATURAMENTO',
      periodo: 'DIA',
      referencia,
      valorMeta,
    },
  });
}

export async function criarIndicador(
  vendedorId: string,
  dataHora: Date,
  dados: { faturamento: number; ticketMedio?: number; pa?: number; numAtendimentos?: number }
) {
  const vendedor = await prisma.vendedor.findUniqueOrThrow({ where: { id: vendedorId } });
  return prisma.indicadorRealizado.upsert({
    where: { vendedorId_dataHora: { vendedorId, dataHora } },
    create: {
      empresaId: vendedor.empresaId,
      lojaId: vendedor.lojaId,
      vendedorId,
      dataHora,
      faturamento: dados.faturamento,
      ticketMedio: dados.ticketMedio ?? 100,
      pa: dados.pa ?? 2,
      numAtendimentos: dados.numAtendimentos ?? Math.max(1, Math.round(dados.faturamento / (dados.ticketMedio ?? 100))),
      fonteJobId: 'test-helper',
    },
    update: {
      faturamento: dados.faturamento,
      ticketMedio: dados.ticketMedio ?? 100,
      pa: dados.pa ?? 2,
      numAtendimentos: dados.numAtendimentos ?? Math.max(1, Math.round(dados.faturamento / (dados.ticketMedio ?? 100))),
    },
  });
}

/**
 * Token de teste com o papel ALINHADO ao banco (Etapa 2C.3C).
 *
 * `requireAuth` passou a revalidar o papel contra o banco a cada request: o
 * token prova identidade e sessão, mas quem decide o que ele pode fazer é o
 * estado atual. Isso expôs uma fragilidade dos testes — vários assinavam
 * `ADMIN` sobre uma fixture que no banco era `VENDEDOR`, e passavam só porque
 * ninguém conferia.
 *
 * Este helper promove a pessoa de verdade antes de assinar. Além de fazer os
 * testes rodarem, faz com que eles reflitam uma situação possível: um ADMIN de
 * teste agora é um ADMIN no banco.
 */
export async function tokenPara(claims: { vendedorId: string; empresaId: string; lojaId: string; papel: Papel }) {
  await prisma.vendedor.update({ where: { id: claims.vendedorId }, data: { papel: claims.papel } });
  return assinarToken(claims);
}
