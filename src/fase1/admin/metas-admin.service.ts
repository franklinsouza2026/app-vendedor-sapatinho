// Metas do mês pelo Admin (D6/D10) — meta mensal, dias previstos de trabalho
// por vendedor e meta da loja. Sem terminal, sem SQL. Mês encerrado é
// histórico: não muda. Alterar o mês em andamento recalcula a meta diária
// derivada e reconcilia os prêmios de meta do mês (regra determinística,
// auditada; a tela avisa antes).
import { z } from 'zod';
import { prisma } from '../../db';
import { registrarEventoAuditoria } from '../../identidade/auditoria.service';
import { timezoneDaEmpresa } from '../../tempo/empresa';
import { diaLocal, diasNoMes, instanteDoDia, listarDias, mesLocal, primeiroDiaDoMes, validarMes } from '../../tempo/dia';
import { invalido, naoEncontrado } from '../../utils/erro-http';
import { reconciliarVendedor } from '../reconciliacao/motor';
import { createLogger } from '../../utils/logger';

const log = createLogger('fase1:metas-admin');

export const metaVendedorSchema = z.object({
  mensal: z.number().min(0).max(100_000_000).nullable(),
  diasPrevistos: z.number().int().min(1).max(31).nullable(),
});

async function garantirMesAberto(empresaId: string, mes: string) {
  if (!validarMes(mes)) throw invalido('Mês inválido (use AAAA-MM).');
  const tz = await timezoneDaEmpresa(empresaId);
  if (mes < mesLocal(new Date(), tz)) throw invalido('Mês encerrado é histórico — a meta não pode mais ser alterada.');
  return tz;
}

export async function definirMetaDoVendedor(empresaId: string, atorId: string, vendedorId: string, mes: string, entrada: unknown) {
  const dados = metaVendedorSchema.parse(entrada);
  const tz = await garantirMesAberto(empresaId, mes);
  if (dados.diasPrevistos !== null && dados.diasPrevistos > diasNoMes(mes)) throw invalido(`${mes} tem só ${diasNoMes(mes)} dias.`);
  const vendedor = await prisma.vendedor.findFirst({ where: { id: vendedorId, empresaId } });
  if (!vendedor) throw naoEncontrado('vendedor');
  const referencia = instanteDoDia(primeiroDiaDoMes(mes), tz);
  const chave = { vendedorId_tipo_periodo_referencia: { vendedorId, tipo: 'FATURAMENTO' as const, periodo: 'MES' as const, referencia } };
  const antes = {
    mensal: Number((await prisma.meta.findUnique({ where: chave }))?.valorMeta ?? 0) || null,
    diasPrevistos: (await prisma.diasTrabalhoMes.findUnique({ where: { vendedorId_mes: { vendedorId, mes } } }))?.dias ?? null,
  };

  await prisma.$transaction(async (tx) => {
    if (dados.mensal === null || dados.mensal === 0) await tx.meta.deleteMany({ where: { vendedorId, tipo: 'FATURAMENTO', periodo: 'MES', referencia } });
    else await tx.meta.upsert({ where: chave, create: { empresaId, lojaId: vendedor.lojaId, vendedorId, tipo: 'FATURAMENTO', periodo: 'MES', referencia, valorMeta: dados.mensal }, update: { valorMeta: dados.mensal } });
    if (dados.diasPrevistos === null) await tx.diasTrabalhoMes.deleteMany({ where: { vendedorId, mes } });
    else await tx.diasTrabalhoMes.upsert({ where: { vendedorId_mes: { vendedorId, mes } }, create: { empresaId, vendedorId, mes, dias: dados.diasPrevistos, atualizadoPor: atorId }, update: { dias: dados.diasPrevistos, atualizadoPor: atorId } });
  });
  if (antes.mensal !== (dados.mensal || null)) await registrarEventoAuditoria({ empresaId, acao: 'MONTHLY_GOAL_SET', actorId: atorId, targetId: vendedorId, metadata: { mes, antes: antes.mensal, depois: dados.mensal || null } });
  if (antes.diasPrevistos !== dados.diasPrevistos) await registrarEventoAuditoria({ empresaId, acao: 'WORKDAYS_SET', actorId: atorId, targetId: vendedorId, metadata: { mes, antes: antes.diasPrevistos, depois: dados.diasPrevistos } });

  // Mês em andamento: os derivados (meta do dia, prêmios de meta) passam a seguir a nova base.
  const hoje = diaLocal(new Date(), tz);
  if (mes === hoje.slice(0, 7)) {
    try {
      await reconciliarVendedor(vendedorId, listarDias(primeiroDiaDoMes(mes), hoje));
    } catch (err) {
      log.error({ err, vendedorId }, 'falha ao reconciliar após mudança de meta');
    }
  }
  return { vendedorId, mes, ...dados };
}

export async function definirMetaDaLoja(empresaId: string, atorId: string, lojaId: string, mes: string, valor: number | null) {
  await garantirMesAberto(empresaId, mes);
  const loja = await prisma.loja.findFirst({ where: { id: lojaId, empresaId } });
  if (!loja) throw naoEncontrado('loja');
  if (valor !== null && (valor < 0 || valor > 1_000_000_000)) throw invalido('Valor de meta inválido.');
  const antes = await prisma.metaLoja.findUnique({ where: { lojaId_mes: { lojaId, mes } } });
  if (valor === null || valor === 0) await prisma.metaLoja.deleteMany({ where: { lojaId, mes } });
  else await prisma.metaLoja.upsert({ where: { lojaId_mes: { lojaId, mes } }, create: { empresaId, lojaId, mes, valor, atualizadoPor: atorId }, update: { valor, atualizadoPor: atorId } });
  await registrarEventoAuditoria({ empresaId, acao: 'STORE_GOAL_SET', actorId: atorId, metadata: { lojaId, mes, antes: antes ? Number(antes.valor) : null, depois: valor } });
  return { lojaId, mes, valor };
}
