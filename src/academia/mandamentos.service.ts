// 13 Mandamentos das Vendas Sapatinho de Luxo (Fatia 7.5C, seção 23/24/42).
// REGRA ABSOLUTA: nenhum conteúdo é inventado aqui, nem por código nem por
// IA — as 13 linhas existem sempre (seed estrutural), mas `conteudoOficial`
// só é preenchido quando o Admin cadastra o texto real. O gate de
// publicação (seção 42) impede marcar a formação como PUBLISHED enquanto a
// estrutura estiver incompleta.
import { prisma } from '../db';
import { registrarEventoAuditoria } from '../identidade/auditoria.service';
import { IdentidadeError } from '../identidade/erros';

async function resolverEmpresaUnica(): Promise<string> {
  const empresa = await prisma.empresa.findFirstOrThrow({ orderBy: { createdAt: 'asc' } });
  return empresa.id;
}

/** Garante as 13 linhas (numero 1-13) — idempotente, nunca sobrescreve conteúdo já cadastrado. */
export async function seedEstruturaMandamentos() {
  for (let numero = 1; numero <= 13; numero++) {
    await prisma.mandamentoOficial.upsert({
      where: { numero },
      update: {},
      create: { numero, titulo: `Mandamento ${numero} — pendente de conteúdo oficial`, status: 'DRAFT' },
    });
  }
  return prisma.mandamentoOficial.count();
}

export async function listarMandamentosAdmin() {
  return prisma.mandamentoOficial.findMany({ orderBy: { numero: 'asc' } });
}

/** Visão do vendedor — só mandamentos PUBLISHED, nunca um rascunho vazio. */
export async function listarMandamentosPublicados() {
  return prisma.mandamentoOficial.findMany({
    where: { status: 'PUBLISHED' },
    orderBy: { numero: 'asc' },
    select: { numero: true, titulo: true, conteudoOficial: true, explicacaoOpcional: true, exemploOpcional: true, versao: true },
  });
}

/**
 * Guard da Training Intelligence Platform (Fatia 7.5D, seção 22/55): só os
 * mandamentos com conteúdo oficial de fato cadastrado (independente de já
 * estar PUBLISHED ou ainda em revisão) podem alimentar um agente de IA —
 * nunca os 13 fixos vazios. Se vier vazio, o chamador NUNCA deve completar a
 * lacuna nem chamar o provider de IA sobre o tema.
 */
export async function listarMandamentosComConteudoAprovado() {
  const mandamentos = await prisma.mandamentoOficial.findMany({ orderBy: { numero: 'asc' } });
  return mandamentos
    .filter((m) => !!m.conteudoOficial && m.conteudoOficial.trim().length > 0)
    .map((m) => ({ numero: m.numero, titulo: m.titulo, conteudoOficial: m.conteudoOficial as string }));
}

export async function atualizarMandamento(
  numero: number,
  dados: { titulo?: string; conteudoOficial?: string; explicacaoOpcional?: string; exemploOpcional?: string },
  actorId: string
) {
  const atual = await prisma.mandamentoOficial.findUnique({ where: { numero } });
  if (!atual) throw new IdentidadeError(404, 'mandamento_nao_encontrado', `mandamento ${numero} não encontrado — rode o seed estrutural`);

  // Editar conteúdo já publicado gera nova versão (mesmo princípio de
  // versionamento das aulas) e volta pra DRAFT — precisa ser republicado
  // conscientemente, nunca fica "publicado" com texto que mudou sem revisão.
  const mudaConteudo = dados.conteudoOficial !== undefined;
  const voltaParaDraft = mudaConteudo && atual.status === 'PUBLISHED';

  const mandamento = await prisma.mandamentoOficial.update({
    where: { numero },
    data: {
      ...dados,
      ...(voltaParaDraft ? { versao: { increment: 1 }, status: 'DRAFT', publishedAt: null } : {}),
    },
  });

  await registrarEventoAuditoria({ empresaId: await resolverEmpresaUnica(), acao: 'MANDAMENTOS_CONTENT_UPDATED', actorId, metadata: { numero, voltaParaDraft } });
  return mandamento;
}

export interface StatusCompletudeMandamentos {
  completo: boolean;
  faltando: number[];
}

/** Gate de publicação (seção 42) — nunca heurística semântica frágil, só estrutura. */
export async function checarCompletudeMandamentos(): Promise<StatusCompletudeMandamentos> {
  const mandamentos = await prisma.mandamentoOficial.findMany({ orderBy: { numero: 'asc' } });
  const faltando: number[] = [];

  for (let numero = 1; numero <= 13; numero++) {
    const m = mandamentos.find((x) => x.numero === numero);
    if (!m || !m.conteudoOficial || m.conteudoOficial.trim().length === 0) faltando.push(numero);
  }

  return { completo: faltando.length === 0, faltando };
}

export async function publicarMandamento(numero: number, actorId: string) {
  const mandamento = await prisma.mandamentoOficial.findUnique({ where: { numero } });
  if (!mandamento) throw new IdentidadeError(404, 'mandamento_nao_encontrado', `mandamento ${numero} não encontrado`);
  if (!mandamento.conteudoOficial || mandamento.conteudoOficial.trim().length === 0) {
    throw new IdentidadeError(400, 'conteudo_ausente', `mandamento ${numero} não tem conteúdo oficial cadastrado ainda`);
  }

  const resultado = await prisma.mandamentoOficial.updateMany({
    where: { numero, status: { in: ['DRAFT', 'REVIEW_PENDING', 'APPROVED'] } },
    data: { status: 'PUBLISHED', publishedAt: new Date(), approvedBy: actorId },
  });
  if (resultado.count !== 1) throw new IdentidadeError(409, 'transicao_invalida', 'mandamento não está em um estado válido pra publicar');

  await registrarEventoAuditoria({ empresaId: await resolverEmpresaUnica(), acao: 'MANDAMENTOS_PUBLISHED', actorId, metadata: { numero } });
  return prisma.mandamentoOficial.findUniqueOrThrow({ where: { numero } });
}
