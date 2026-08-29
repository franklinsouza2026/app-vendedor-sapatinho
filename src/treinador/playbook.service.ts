// Playbook da empresa (seções 8-11 da Fatia 5). Tenant-scoped: toda consulta
// exige empresaId — nunca busca por playbookId isolado sem confirmar a
// empresa dona (proteção contra IDOR/vazamento entre tenants, seção 31).
//
// Gestão administrativa (criar/editar seção, publicar) fica só como funções
// de serviço nesta fatia — sem endpoint HTTP administrativo (seção 11: "se
// aumentar muito o escopo, deixar pra fatia futura"). Hoje o único jeito de
// popular/publicar um playbook é via seed/script, chamando estas funções
// diretamente. RBAC/auditoria completos ficam pra quando existir a tela.
import { CategoriaPlaybook, ModoTreinador, OrigemConteudoPlaybook, Prisma } from '@prisma/client';
import { prisma } from '../db';
import { PlaybookSectionContexto } from './context.types';

export interface SecaoParaCriar {
  categoria: CategoriaPlaybook;
  titulo: string;
  conteudo: string;
  origem: OrigemConteudoPlaybook;
  ordem?: number;
}

// Mesmo padrão de corrida do índice único parcial (Fatia 4): 2 publicações
// concorrentes da mesma empresa não podem deixar 2 playbooks PUBLISHED.
function isViolacaoPlaybookPublicadoDuplicado(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

export async function criarPlaybookDraft(empresaId: string, nome: string, secoes: SecaoParaCriar[]) {
  const ultimo = await prisma.playbook.findFirst({ where: { empresaId }, orderBy: { versao: 'desc' } });
  const proximaVersao = (ultimo?.versao ?? 0) + 1;

  return prisma.playbook.create({
    data: {
      empresaId,
      nome,
      versao: proximaVersao,
      status: 'DRAFT',
      secoes: { create: secoes.map((s, i) => ({ ...s, ordem: s.ordem ?? i })) },
    },
    include: { secoes: true },
  });
}

export async function publicarPlaybook(playbookId: string, empresaId: string, publicadoPor: string) {
  const playbook = await prisma.playbook.findUnique({ where: { id: playbookId } });
  if (!playbook || playbook.empresaId !== empresaId) {
    throw new Error('playbook não encontrado para esta empresa');
  }

  // Arquiva a versão PUBLISHED atual (se houver) antes de publicar a nova —
  // preserva o histórico (nunca apaga), só muda o status.
  await prisma.playbook.updateMany({
    where: { empresaId, status: 'PUBLISHED' },
    data: { status: 'ARCHIVED' },
  });

  try {
    return await prisma.playbook.update({
      where: { id: playbookId },
      data: { status: 'PUBLISHED', publicadoEm: new Date(), publicadoPor },
    });
  } catch (err) {
    if (!isViolacaoPlaybookPublicadoDuplicado(err)) throw err;
    return prisma.playbook.findFirstOrThrow({ where: { empresaId, status: 'PUBLISHED' } });
  }
}

export async function getPlaybookAtivo(empresaId: string) {
  return prisma.playbook.findFirst({
    where: { empresaId, status: 'PUBLISHED' },
    include: { secoes: { where: { ativo: true }, orderBy: { ordem: 'asc' } } },
  });
}

// Mapa determinístico modo -> categorias relevantes (seção 13 da Fatia 5).
// Deliberadamente simples/auditável — nada de busca semântica/RAG nesta
// fatia (baixo custo, previsível, fácil de explicar num code review).
const CATEGORIAS_POR_MODO: Record<ModoTreinador, CategoriaPlaybook[]> = {
  GERAL: ['PRINCIPIOS', 'CONDUTA'],
  ABORDAGEM: ['ABORDAGEM', 'PRINCIPIOS'],
  SONDAGEM: ['SONDAGEM', 'PRINCIPIOS'],
  DEMONSTRACAO: ['DEMONSTRACAO', 'ARGUMENTACAO'],
  OBJECAO: ['OBJECOES', 'PRINCIPIOS'],
  FECHAMENTO: ['FECHAMENTO', 'PRINCIPIOS'],
  VENDA_COMPLEMENTAR: ['VENDA_COMPLEMENTAR', 'DEMONSTRACAO'],
  PA: ['VENDA_COMPLEMENTAR', 'DEMONSTRACAO'],
  TICKET: ['DEMONSTRACAO', 'FECHAMENTO'],
  POS_VENDA: ['POS_VENDA', 'CONDUTA'],
};

// Recuperação determinística: só as seções da(s) categoria(s) do modo atual —
// nunca o playbook inteiro (seção 13: custo/previsibilidade).
export async function getSecoesRelevantes(
  empresaId: string,
  mode: ModoTreinador
): Promise<{ id: string | null; version: number | null; sections: PlaybookSectionContexto[] }> {
  const playbook = await getPlaybookAtivo(empresaId);
  if (!playbook) return { id: null, version: null, sections: [] };

  const categorias = CATEGORIAS_POR_MODO[mode];
  const secoes = playbook.secoes.filter((s) => categorias.includes(s.categoria));

  return {
    id: playbook.id,
    version: playbook.versao,
    sections: secoes.map((s) => ({ category: s.categoria, title: s.titulo, content: s.conteudo, origin: s.origem })),
  };
}
