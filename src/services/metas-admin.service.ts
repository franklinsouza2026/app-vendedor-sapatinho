// Gestão de metas pelo Admin (Fatia 9.7, P0). Até aqui `Meta` só nascia em
// `scripts/seed.ts` — não existia nenhuma rota de escrita, o que tornava o
// produto inoperável em produção (Home, Performance, motor de gamificação,
// alerta de ritmo e Reunião do Dia dependem todos de Meta).
//
// Nenhum conceito novo foi criado: reusa o model `Meta` já existente, com a
// chave natural `@@unique([vendedorId, tipo, periodo, referencia])` como
// proteção de duplicidade, e `referencia` sempre normalizada pro início do
// período (mesma convenção de `metas.service.ts`, que é quem lê).
import { PeriodoMeta, Prisma, TipoMeta } from '@prisma/client';
import { prisma } from '../db';
import { registrarEventoAuditoria } from '../identidade/auditoria.service';
import { IdentidadeError } from '../identidade/erros';
import { inicioDaSemana, inicioDoDia, inicioDoMes } from './metas.service';

/**
 * Normaliza a data pedida pro início do período — `referencia` é sempre o
 * primeiro instante do período (é assim que `metaDoPeriodo` consulta). Sem
 * isso, uma meta criada com "2026-09-17T14:30" nunca seria encontrada pela
 * leitura, que procura por "2026-09-17T00:00".
 */
export function normalizarReferencia(periodo: PeriodoMeta, data: Date): Date {
  if (periodo === 'DIA') return inicioDoDia(data);
  if (periodo === 'SEMANA') return inicioDaSemana(data);
  return inicioDoMes(data);
}

/** Primeiro instante APÓS o período — usado pra saber se o período já fechou. */
function fimDoPeriodo(periodo: PeriodoMeta, referencia: Date): Date {
  const fim = new Date(referencia);
  if (periodo === 'DIA') fim.setDate(fim.getDate() + 1);
  else if (periodo === 'SEMANA') fim.setDate(fim.getDate() + 7);
  else fim.setMonth(fim.getMonth() + 1);
  return fim;
}

/**
 * Política de histórico (Fatia 9.7): meta de período JÁ ENCERRADO é imutável.
 *
 * Por quê: `avaliarMetaDiaria` (motor.service.ts) já concedeu/reverteu XP e
 * VendaCoins com base no valor que valia naquele dia, e ele só roda pra "hoje"
 * — editar uma meta passada deixaria a gamificação concedida em silêncio
 * inconsistente com a meta registrada, sem nenhum caminho de recálculo. Mesmo
 * princípio de imutabilidade de histórico já adotado em realocação de loja
 * (Decisão 108) e em finalização de competição.
 *
 * Período corrente e futuro continuam editáveis: o motor reavalia a cada sync
 * do ERP e reverte/concede sozinho, de forma idempotente.
 */
function garantirPeriodoAberto(periodo: PeriodoMeta, referencia: Date, agora: Date) {
  if (fimDoPeriodo(periodo, referencia) <= agora) {
    throw new IdentidadeError(
      409,
      'meta_periodo_encerrado',
      'esta meta é de um período já encerrado e não pode mais ser alterada — o histórico de XP e moedas já foi calculado com ela'
    );
  }
}

/** Resolve o vendedor garantindo que ele é da empresa de quem está operando (nunca confia no client). */
async function garantirVendedorNaEmpresa(vendedorId: string, empresaId: string) {
  const vendedor = await prisma.vendedor.findUnique({
    where: { id: vendedorId },
    select: { id: true, empresaId: true, lojaId: true, nome: true, papel: true, status: true },
  });
  // Mesmo erro pra "não existe" e "é de outra empresa" — nunca confirma a um
  // Admin a existência de um vendedor fora do escopo dele (anti-IDOR, mesmo
  // padrão de `detalharVendedor`).
  if (!vendedor || vendedor.empresaId !== empresaId) {
    throw new IdentidadeError(404, 'vendedor_nao_encontrado', 'vendedor não encontrado');
  }
  // Meta comercial é de quem vende. A tela já filtra, mas a regra tem que valer
  // na API também — mesmo princípio aplicado ao ranking nesta fatia: nunca
  // esconder só no frontend.
  if (vendedor.papel !== 'VENDEDOR') {
    throw new IdentidadeError(409, 'papel_sem_meta_comercial', 'meta comercial só se aplica a vendedor');
  }
  return vendedor;
}

export interface MetaEntrada {
  vendedorId: string;
  tipo: TipoMeta;
  periodo: PeriodoMeta;
  referencia: Date;
  valorMeta: number;
}

export async function criarMeta(entrada: MetaEntrada, empresaId: string, actorId: string, agora: Date = new Date()) {
  const vendedor = await garantirVendedorNaEmpresa(entrada.vendedorId, empresaId);
  const referencia = normalizarReferencia(entrada.periodo, entrada.referencia);
  garantirPeriodoAberto(entrada.periodo, referencia, agora);

  let meta;
  try {
    meta = await prisma.meta.create({
      data: {
        // empresaId e lojaId vêm SEMPRE do vendedor resolvido no banco, nunca
        // do corpo da requisição — impede forjar meta em outra loja/empresa.
        empresaId: vendedor.empresaId,
        lojaId: vendedor.lojaId,
        vendedorId: vendedor.id,
        tipo: entrada.tipo,
        periodo: entrada.periodo,
        referencia,
        valorMeta: new Prisma.Decimal(entrada.valorMeta),
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new IdentidadeError(409, 'meta_duplicada', 'já existe uma meta deste tipo para este vendedor neste período');
    }
    throw err;
  }

  await registrarEventoAuditoria({
    empresaId,
    acao: 'GOAL_CREATED',
    actorId,
    targetId: vendedor.id,
    metadata: { tipo: meta.tipo, periodo: meta.periodo, referencia: referencia.toISOString(), valorMeta: entrada.valorMeta },
  });

  return meta;
}

export async function atualizarMeta(metaId: string, valorMeta: number, empresaId: string, actorId: string, agora: Date = new Date()) {
  const meta = await prisma.meta.findUnique({ where: { id: metaId } });
  if (!meta || meta.empresaId !== empresaId) {
    throw new IdentidadeError(404, 'meta_nao_encontrada', 'meta não encontrada');
  }
  garantirPeriodoAberto(meta.periodo, meta.referencia, agora);

  const atualizada = await prisma.meta.update({
    where: { id: metaId },
    data: { valorMeta: new Prisma.Decimal(valorMeta) },
  });

  await registrarEventoAuditoria({
    empresaId,
    acao: 'GOAL_UPDATED',
    actorId,
    targetId: meta.vendedorId,
    metadata: { metaId, valorAnterior: Number(meta.valorMeta), valorNovo: valorMeta },
  });

  return atualizada;
}

/**
 * Remove uma meta ainda não encerrada. Não é hard delete de histórico: o guard
 * de período aberto garante que só some meta que ainda não fechou ciclo de
 * gamificação. Existe porque um Admin que cadastrou a meta no vendedor errado
 * precisa de um caminho de correção — sem isso a única saída seria SQL direto.
 */
export async function removerMeta(metaId: string, empresaId: string, actorId: string, agora: Date = new Date()) {
  const meta = await prisma.meta.findUnique({ where: { id: metaId } });
  if (!meta || meta.empresaId !== empresaId) {
    throw new IdentidadeError(404, 'meta_nao_encontrada', 'meta não encontrada');
  }
  garantirPeriodoAberto(meta.periodo, meta.referencia, agora);

  await prisma.meta.delete({ where: { id: metaId } });

  await registrarEventoAuditoria({
    empresaId,
    acao: 'GOAL_DELETED',
    actorId,
    targetId: meta.vendedorId,
    metadata: { tipo: meta.tipo, periodo: meta.periodo, referencia: meta.referencia.toISOString(), valorMeta: Number(meta.valorMeta) },
  });
}

export interface FiltroListagemMetas {
  empresaId: string;
  lojaId?: string;
  vendedorId?: string;
  periodo?: PeriodoMeta;
}

/**
 * Lista metas da empresa com o nome do vendedor já resolvido (1 query de meta
 * + 1 de vendedor, nunca N+1) e marca quais ainda são editáveis, pra a UI não
 * precisar reimplementar a regra de período encerrado.
 */
export async function listarMetas(filtro: FiltroListagemMetas, agora: Date = new Date()) {
  const metas = await prisma.meta.findMany({
    where: {
      empresaId: filtro.empresaId,
      ...(filtro.lojaId ? { lojaId: filtro.lojaId } : {}),
      ...(filtro.vendedorId ? { vendedorId: filtro.vendedorId } : {}),
      ...(filtro.periodo ? { periodo: filtro.periodo } : {}),
    },
    orderBy: [{ referencia: 'desc' }, { createdAt: 'desc' }],
    take: 200,
  });

  const vendedorIds = [...new Set(metas.map((m) => m.vendedorId))];
  const vendedores = await prisma.vendedor.findMany({
    where: { id: { in: vendedorIds } },
    select: { id: true, nome: true, matriculaErp: true },
  });
  const porId = new Map(vendedores.map((v) => [v.id, v]));

  return metas.map((m) => ({
    id: m.id,
    vendedorId: m.vendedorId,
    vendedorNome: porId.get(m.vendedorId)?.nome ?? '—',
    matriculaErp: porId.get(m.vendedorId)?.matriculaErp ?? '—',
    lojaId: m.lojaId,
    tipo: m.tipo,
    periodo: m.periodo,
    referencia: m.referencia,
    valorMeta: Number(m.valorMeta),
    editavel: fimDoPeriodo(m.periodo, m.referencia) > agora,
  }));
}
