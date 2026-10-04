// Ingestão de eventos do ERP (D1/D4) — normaliza o que vem pelo contrato do
// ERP Adapter e grava os FATOS (Venda, VendaItem, VendaAjuste) de forma
// idempotente. Não decide recompensa nem posição: devolve quais (vendedor,
// dia) foram afetados para o motor de reconciliação recalcular os derivados.
//
// Idempotência: `idExterno` é único por empresa (venda e ajuste). O mesmo
// evento entregue N vezes — sync repetido, janela sobreposta, reenvio do ERP,
// duas execuções concorrentes — produz UM efeito. Cancelamento/devolução são
// aplicados na MESMA transação em que o ajuste é registrado: ou os dois
// acontecem, ou nenhum (nunca um ajuste "gasto" sem efeito).
import { Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { createLogger } from '../../utils/logger';
import { diaLocal, paraDate } from '../../tempo/dia';
import { timezoneDaEmpresa } from '../../tempo/empresa';
import { EventoErp, eventoErpSchema } from '../../integracoes/erp/erp-adapter.interface';
import { recalcularAgregadoDia } from './agregado.service';

const log = createLogger('fase1:ingestao');

export type MotivoIgnorado = 'EVENTO_INVALIDO' | 'LOJA_NAO_VINCULADA' | 'VENDEDOR_NAO_VINCULADO' | 'VENDA_DESCONHECIDA' | 'VENDA_JA_CANCELADA';

export interface ResultadoIngestao {
  recebidos: number;
  vendasNovas: number;
  ajustesNovos: number;
  duplicados: number;
  ignorados: number;
  motivosIgnorados: Partial<Record<MotivoIgnorado, number>>;
  /** vendedorId → dias locais cujo agregado mudou. */
  afetados: Map<string, Set<string>>;
  ultimaVendaEm: Date | null;
}

function ehDuplicado(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

function ordemDeProcessamento(e: EventoErp) {
  // Vendas antes de ajustes: um lote que traz a venda e o cancelamento dela
  // nunca perde o cancelamento por ordem de chegada.
  return (e.tipo === 'VENDA' ? 0 : 1) * 1e15 + Date.parse(e.ocorridoEm);
}

export async function ingerirEventos(params: { empresaId: string; integracaoId: string | null; eventos: unknown[] }): Promise<ResultadoIngestao> {
  const { empresaId, integracaoId } = params;
  const tz = await timezoneDaEmpresa(empresaId);
  const resultado: ResultadoIngestao = { recebidos: params.eventos.length, vendasNovas: 0, ajustesNovos: 0, duplicados: 0, ignorados: 0, motivosIgnorados: {}, afetados: new Map(), ultimaVendaEm: null };
  const ignorar = (motivo: MotivoIgnorado) => {
    resultado.ignorados++;
    resultado.motivosIgnorados[motivo] = (resultado.motivosIgnorados[motivo] ?? 0) + 1;
  };
  const afetar = (vendedorId: string, dia: string) => {
    if (!resultado.afetados.has(vendedorId)) resultado.afetados.set(vendedorId, new Set());
    resultado.afetados.get(vendedorId)!.add(dia);
  };

  // Validação do contrato: nada fora do formato entra.
  const validos: EventoErp[] = [];
  for (const bruto of params.eventos) {
    const parsed = eventoErpSchema.safeParse(bruto);
    if (parsed.success) validos.push(parsed.data);
    else ignorar('EVENTO_INVALIDO');
  }
  validos.sort((a, b) => ordemDeProcessamento(a) - ordemDeProcessamento(b));

  // Lojas: vínculo explícito da integração; sem vínculo, o código ERP da loja
  // DENTRO da empresa (nunca de outra empresa).
  const lojasEmpresa = await prisma.loja.findMany({ where: { empresaId }, select: { id: true, codigoErp: true } });
  const vinculos = integracaoId ? await prisma.integracaoLoja.findMany({ where: { integracaoId }, select: { lojaId: true, codigoExterno: true } }) : [];
  const idsLojasEmpresa = new Set(lojasEmpresa.map((l) => l.id));
  const lojaPorCodigo = new Map<string, string>();
  for (const l of lojasEmpresa) lojaPorCodigo.set(l.codigoErp, l.id);
  for (const v of vinculos) if (idsLojasEmpresa.has(v.lojaId)) lojaPorCodigo.set(v.codigoExterno, v.lojaId);

  const cacheVendedor = new Map<string, string | null>();
  async function resolverVendedor(lojaId: string, externo: string): Promise<string | null> {
    const chave = `${lojaId}:${externo}`;
    if (cacheVendedor.has(chave)) return cacheVendedor.get(chave)!;
    let encontrado = await prisma.vendedor.findUnique({ where: { lojaId_matriculaErp: { lojaId, matriculaErp: externo } }, select: { id: true, empresaId: true } });
    if (!encontrado) {
      // Vínculo explícito (ExternalIdentity) ou matrícula única na empresa
      // (vendedor transferido vendendo pela loja antiga no histórico).
      const porIdentidade = await prisma.externalIdentity.findFirst({ where: { empresaId, externalSellerId: externo }, select: { vendedorId: true } });
      if (porIdentidade) encontrado = { id: porIdentidade.vendedorId, empresaId };
      else {
        const porMatricula = await prisma.vendedor.findMany({ where: { empresaId, matriculaErp: externo }, select: { id: true, empresaId: true }, take: 2 });
        if (porMatricula.length === 1) encontrado = porMatricula[0];
      }
    }
    const id = encontrado && encontrado.empresaId === empresaId ? encontrado.id : null;
    cacheVendedor.set(chave, id);
    return id;
  }

  for (const evento of validos) {
    if (evento.tipo === 'VENDA') {
      const lojaId = lojaPorCodigo.get(evento.lojaExterna);
      if (!lojaId) {
        ignorar('LOJA_NAO_VINCULADA');
        continue;
      }
      const vendedorId = await resolverVendedor(lojaId, evento.vendedorExterno);
      if (!vendedorId) {
        ignorar('VENDEDOR_NAO_VINCULADO');
        continue;
      }
      const ocorridoEm = new Date(evento.ocorridoEm);
      const dia = diaLocal(ocorridoEm, tz);
      try {
        await prisma.venda.create({
          data: {
            empresaId,
            lojaId,
            vendedorId,
            integracaoId,
            idExterno: evento.idExterno,
            ocorridoEm,
            dia: paraDate(dia),
            valor: evento.valor,
            pecas: evento.itens.reduce((a, i) => a + i.quantidade, 0),
            pares: evento.itens.reduce((a, i) => a + i.pares, 0),
            itens: { create: evento.itens.map((i) => ({ referencia: i.referencia, descricao: i.descricao, categoria: i.categoria ?? null, quantidade: i.quantidade, pares: i.pares, valor: i.valor })) },
          },
        });
        resultado.vendasNovas++;
        afetar(vendedorId, dia);
        if (!resultado.ultimaVendaEm || ocorridoEm > resultado.ultimaVendaEm) resultado.ultimaVendaEm = ocorridoEm;
      } catch (err) {
        if (!ehDuplicado(err)) throw err;
        resultado.duplicados++;
      }
      continue;
    }

    const venda = await prisma.venda.findUnique({ where: { empresaId_idExterno: { empresaId, idExterno: evento.vendaIdExterno } }, include: { itens: true } });
    if (!venda) {
      ignorar('VENDA_DESCONHECIDA');
      continue;
    }
    if (venda.status === 'CANCELADA') {
      // Já cancelada: um novo cancelamento/devolução não tem o que desfazer.
      const jaExiste = await prisma.vendaAjuste.findUnique({ where: { empresaId_idExterno: { empresaId, idExterno: evento.idExterno } } });
      if (jaExiste) resultado.duplicados++;
      else ignorar('VENDA_JA_CANCELADA');
      continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        if (evento.tipo === 'CANCELAMENTO') {
          const devolvido = venda.itens.reduce((a, i) => a + Number(i.valorDevolvido), 0);
          await tx.vendaAjuste.create({
            data: { empresaId, vendaId: venda.id, tipo: 'CANCELAMENTO', idExterno: evento.idExterno, ocorridoEm: new Date(evento.ocorridoEm), valor: Math.max(0, Number(venda.valor) - devolvido), pecas: venda.pecas, pares: venda.pares },
          });
          await tx.venda.update({ where: { id: venda.id }, data: { status: 'CANCELADA', canceladaEm: new Date(evento.ocorridoEm) } });
          return;
        }
        // DEVOLUÇÃO: desconta item a item, nunca além do que foi vendido.
        let valor = 0;
        let pecas = 0;
        let pares = 0;
        const restante = new Map(venda.itens.map((i) => [i.id, { q: i.quantidade - i.quantidadeDevolvida, p: i.pares - i.paresDevolvidos, v: Number(i.valor) - Number(i.valorDevolvido) }]));
        for (const devolvido of evento.itens) {
          let qtd = devolvido.quantidade;
          let paresDev = devolvido.pares;
          let valorDev = devolvido.valor;
          for (const item of venda.itens.filter((i) => i.referencia === devolvido.referencia)) {
            const r = restante.get(item.id)!;
            if (qtd <= 0 || r.q <= 0) continue;
            const q = Math.min(qtd, r.q);
            const p = Math.min(paresDev, r.p);
            const v = Math.min(valorDev, r.v);
            await tx.vendaItem.update({ where: { id: item.id }, data: { quantidadeDevolvida: { increment: q }, paresDevolvidos: { increment: p }, valorDevolvido: { increment: v } } });
            restante.set(item.id, { q: r.q - q, p: r.p - p, v: r.v - v });
            qtd -= q;
            paresDev -= p;
            valorDev -= v;
            valor += v;
            pecas += q;
            pares += p;
          }
        }
        await tx.vendaAjuste.create({
          data: { empresaId, vendaId: venda.id, tipo: 'DEVOLUCAO', idExterno: evento.idExterno, ocorridoEm: new Date(evento.ocorridoEm), valor: Math.round(valor * 100) / 100, pecas, pares, itens: evento.itens as unknown as Prisma.InputJsonValue },
        });
      });
      resultado.ajustesNovos++;
      afetar(venda.vendedorId, venda.dia.toISOString().slice(0, 10));
    } catch (err) {
      if (!ehDuplicado(err)) throw err;
      resultado.duplicados++;
    }
  }

  for (const [vendedorId, dias] of resultado.afetados) {
    for (const dia of dias) await recalcularAgregadoDia(vendedorId, dia, tz);
  }

  log.info({ empresaId, integracaoId, recebidos: resultado.recebidos, vendasNovas: resultado.vendasNovas, ajustesNovos: resultado.ajustesNovos, duplicados: resultado.duplicados, ignorados: resultado.motivosIgnorados }, 'eventos do ERP ingeridos');
  return resultado;
}
