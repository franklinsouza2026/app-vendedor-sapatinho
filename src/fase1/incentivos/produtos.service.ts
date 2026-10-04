// Produtos (D2) — catálogo da empresa usado por Produto da Semana / Ponta de
// Estoque / Categoria. A referência casa com `VendaItem.referencia` que chega
// pelo ERP Adapter: é isso que faz o progresso da missão ser REAL. Na etapa
// Linx, o catálogo poderá ser alimentado pelo ERP; até lá o Admin cadastra.
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db';
import { registrarEventoAuditoria } from '../../identidade/auditoria.service';
import { conflito, naoEncontrado } from '../../utils/erro-http';

export const produtoSchema = z.object({
  referencia: z.string().trim().min(1).max(64),
  nome: z.string().trim().min(2).max(120),
  categoria: z.string().trim().min(1).max(60),
  preco: z.number().min(0).max(1_000_000),
  foto: z.string().trim().max(500).nullable().optional(),
});

export function serializarProduto(p: Prisma.ProdutoGetPayload<object>) {
  return { id: p.id, referencia: p.referencia, nome: p.nome, categoria: p.categoria, preco: Number(p.preco), foto: p.foto, ativo: p.ativo };
}

export async function listarProdutos(empresaId: string) {
  return (await prisma.produto.findMany({ where: { empresaId }, orderBy: [{ categoria: 'asc' }, { nome: 'asc' }] })).map(serializarProduto);
}

export async function criarProduto(empresaId: string, atorId: string, entrada: unknown) {
  const dados = produtoSchema.parse(entrada);
  try {
    const p = await prisma.produto.create({ data: { ...dados, foto: dados.foto ?? null, empresaId, criadoPor: atorId } });
    await registrarEventoAuditoria({ empresaId, acao: 'PRODUCT_CREATED', actorId: atorId, metadata: { produtoId: p.id, referencia: p.referencia, nome: p.nome } });
    return serializarProduto(p);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw conflito('Referência já cadastrada.');
    throw err;
  }
}

export async function atualizarProduto(empresaId: string, atorId: string, id: string, entrada: unknown) {
  const dados = produtoSchema.partial().extend({ ativo: z.boolean().optional() }).omit({ referencia: true }).parse(entrada);
  const r = await prisma.produto.updateMany({ where: { id, empresaId }, data: dados });
  if (r.count !== 1) throw naoEncontrado('produto');
  await registrarEventoAuditoria({ empresaId, acao: 'PRODUCT_UPDATED', actorId: atorId, metadata: { produtoId: id, campos: Object.keys(dados) } });
  return serializarProduto(await prisma.produto.findUniqueOrThrow({ where: { id } }));
}
