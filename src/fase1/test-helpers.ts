// Fixtures da Fase 1 para testes de integração (banco de teste dedicado).
import { randomUUID } from 'node:crypto';
import { prisma } from '../db';
import { criarFixtureEmpresa } from '../gamificacao/test-helpers';
import { EventoErp, ItemVendaErp } from '../integracoes/erp';
import { instanteDoDia, primeiroDiaDoMes, TZ_PADRAO } from '../tempo/dia';

export async function criarCenarioFase1(opcoes: { metaMensal?: number; diasPrevistos?: number; mes?: string } = {}) {
  const base = await criarFixtureEmpresa();
  const integracao = await prisma.integracao.create({ data: { empresaId: base.empresa.id, provedor: 'CONTROLADO', status: 'ATIVA', atualizadoPor: base.vendedor.id } });
  await prisma.integracaoLoja.create({ data: { integracaoId: integracao.id, lojaId: base.loja.id, codigoExterno: base.loja.codigoErp } });
  if (opcoes.mes && opcoes.metaMensal !== undefined) await definirMetaMensal(base.vendedor.id, opcoes.mes, opcoes.metaMensal);
  if (opcoes.mes && opcoes.diasPrevistos !== undefined) await definirDias(base.vendedor.id, opcoes.mes, opcoes.diasPrevistos);
  return { ...base, integracao };
}

export async function criarVendedorExtra(empresaId: string, lojaId: string, nome = 'Outro Vendedor') {
  return prisma.vendedor.create({ data: { empresaId, lojaId, matriculaErp: `V-${randomUUID()}`, nome, senhaHash: 'x' } });
}

export async function definirMetaMensal(vendedorId: string, mes: string, valor: number) {
  const v = await prisma.vendedor.findUniqueOrThrow({ where: { id: vendedorId } });
  const referencia = instanteDoDia(primeiroDiaDoMes(mes), TZ_PADRAO);
  return prisma.meta.upsert({
    where: { vendedorId_tipo_periodo_referencia: { vendedorId, tipo: 'FATURAMENTO', periodo: 'MES', referencia } },
    create: { empresaId: v.empresaId, lojaId: v.lojaId, vendedorId, tipo: 'FATURAMENTO', periodo: 'MES', referencia, valorMeta: valor },
    update: { valorMeta: valor },
  });
}

export async function definirDias(vendedorId: string, mes: string, dias: number) {
  const v = await prisma.vendedor.findUniqueOrThrow({ where: { id: vendedorId } });
  return prisma.diasTrabalhoMes.upsert({ where: { vendedorId_mes: { vendedorId, mes } }, create: { empresaId: v.empresaId, vendedorId, mes, dias, atualizadoPor: 'teste' }, update: { dias } });
}

export function item(valor: number, extra: Partial<ItemVendaErp> = {}): ItemVendaErp {
  return { referencia: 'REF-1', descricao: 'Scarpin', categoria: 'Salto', quantidade: 1, pares: 1, valor, ...extra };
}

/** Instante ISO a partir de dia local + hora local (fuso de Brasília). */
export function emLocal(dia: string, hora: string) {
  return new Date(`${dia}T${hora}:00-03:00`).toISOString();
}

export function venda(lojaExterna: string, vendedorExterno: string, ocorridoEm: string, itens: ItemVendaErp[], idExterno = `V-${randomUUID()}`): EventoErp {
  return { tipo: 'VENDA', idExterno, lojaExterna, vendedorExterno, ocorridoEm, valor: Math.round(itens.reduce((a, i) => a + i.valor, 0) * 100) / 100, itens };
}

export function cancelamento(vendaIdExterno: string, ocorridoEm: string, idExterno = `C-${randomUUID()}`): EventoErp {
  return { tipo: 'CANCELAMENTO', idExterno, vendaIdExterno, ocorridoEm };
}

export function devolucao(vendaIdExterno: string, ocorridoEm: string, itens: ItemVendaErp[], idExterno = `D-${randomUUID()}`): EventoErp {
  return { tipo: 'DEVOLUCAO', idExterno, vendaIdExterno, ocorridoEm, itens };
}
