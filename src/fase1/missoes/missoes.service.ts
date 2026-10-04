// Missões governadas (D7) — Admin cria a partir de TEMPLATE, servidor decide
// tudo o mais: status pelo relógio, participantes pelas lojas, progresso pelas
// vendas, conclusão pelo alvo, recompensa pelo ledger oficial (reconciliada:
// cancelamento que derruba o progresso abaixo do alvo desfaz a recompensa).
//
// Reaproveita MissionDefinition/MissionAssignment (sem sistema paralelo):
// definição com `empresaId` = missão governada; `empresaId` null = catálogo
// global legado (fora do piloto).
import { MissionDefinition, Prisma, StatusCiclo } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../db';
import { registrarEventoAuditoria } from '../../identidade/auditoria.service';
import { timezoneDaEmpresa } from '../../tempo/empresa';
import { diaLocal } from '../../tempo/dia';
import { ErroHttp, invalido, naoEncontrado } from '../../utils/erro-http';
import { createLogger } from '../../utils/logger';
import { publicarEventoFeed, revogarEventoFeed } from '../../competicoes/feed.service';
import { concederBadge } from '../../gamificacao/badges.service';
import { registrarEventoEngajamento } from '../../engajamento/eventos.service';
import { ClienteDb, reconciliarRecompensa } from '../reconciliacao/recompensa';
import { ContextoVendedor, reconciliarVendedor, registrarGanchoMissoes } from '../reconciliacao/motor';
import { descreverPremio } from '../incentivos/premios.service';
import { calcularProgresso } from './avaliador';
import { LIMITES, TEMPLATES, TemplateId, TIPOS_EXIBICAO, UnidadeMissao } from './templates';

const log = createLogger('fase1:missoes');

export const missaoEntradaSchema = z.object({
  nome: z.string().trim().max(120),
  tipo: z.enum(TIPOS_EXIBICAO),
  template: z.enum(Object.keys(TEMPLATES) as [TemplateId, ...TemplateId[]]),
  descricao: z.string().trim().max(300),
  unidade: z.enum(['venda', 'par', 'dia', 'reais']),
  alvo: z.number().positive().max(LIMITES.alvoMax),
  xp: z.number().int().min(0).max(LIMITES.recompensaMax),
  moedas: z.number().int().min(0).max(LIMITES.recompensaMax),
  premioId: z.string().uuid().nullable(),
  lojas: z.union([z.literal('TODAS'), z.array(z.string().uuid()).max(500)]),
  inicio: z.string().datetime({ offset: true }),
  fim: z.string().datetime({ offset: true }),
  produtos: z.array(z.string().trim().min(1).max(64)).max(200),
  regras: z.string().trim().max(500),
  parametros: z.record(z.unknown()).default({}),
});
export type MissaoEntrada = z.infer<typeof missaoEntradaSchema>;

export interface ItemValidacao {
  ok: boolean;
  rotulo: string;
  problema?: string;
}

/** Fim efetivo: encerrar antes do prazo corta a janela de contagem. */
export function fimEfetivo(def: Pick<MissionDefinition, 'fim' | 'encerradaEm'>): Date {
  const fim = def.fim!;
  return def.encerradaEm && def.encerradaEm < fim ? def.encerradaEm : fim;
}

/** Status pelo relógio (sem escrita): PROGRAMADA vira ATIVA no início, ATIVA vira ENCERRADA no fim. */
export function statusPeloRelogio(def: Pick<MissionDefinition, 'statusCiclo' | 'inicio' | 'fim' | 'encerradaEm'>, agora: Date): StatusCiclo {
  const s = def.statusCiclo ?? 'RASCUNHO';
  if (s === 'PROGRAMADA' && def.inicio! <= agora) return fimEfetivo(def) < agora ? 'ENCERRADA' : 'ATIVA';
  if (s === 'ATIVA' && fimEfetivo(def) < agora) return 'ENCERRADA';
  return s;
}

export async function validarMissao(empresaId: string, m: MissaoEntrada): Promise<ItemValidacao[]> {
  const template = TEMPLATES[m.template];
  const inicio = Date.parse(m.inicio);
  const fim = Date.parse(m.fim);
  const lojasIds = m.lojas === 'TODAS' ? null : m.lojas;
  const [elegiveis, produtosOk, premio, lojasOk] = await Promise.all([
    prisma.vendedor.count({ where: { empresaId, papel: 'VENDEDOR', status: 'ACTIVE', ...(lojasIds ? { lojaId: { in: lojasIds } } : {}) } }),
    m.produtos.length ? prisma.produto.count({ where: { empresaId, referencia: { in: m.produtos } } }) : Promise.resolve(0),
    m.premioId ? prisma.premio.findFirst({ where: { id: m.premioId, empresaId } }) : Promise.resolve(null),
    lojasIds ? prisma.loja.count({ where: { empresaId, id: { in: lojasIds } } }) : Promise.resolve(0),
  ]);
  const parametros = template.parametros.safeParse(m.parametros);
  return [
    { ok: m.nome.length >= 3, rotulo: 'Nome', problema: 'Dê um nome com pelo menos 3 letras.' },
    { ok: Number.isFinite(inicio) && Number.isFinite(fim) && fim > inicio, rotulo: 'Período', problema: 'O fim precisa ser depois do início.' },
    { ok: fim - inicio <= LIMITES.periodoMaxDias * 86_400_000, rotulo: 'Duração', problema: `A missão pode durar no máximo ${LIMITES.periodoMaxDias} dias.` },
    { ok: m.lojas === 'TODAS' || (m.lojas.length > 0 && lojasOk === m.lojas.length), rotulo: 'Participantes', problema: 'Escolha ao menos uma loja da empresa.' },
    { ok: m.descricao.length >= 5, rotulo: 'Objetivo para o vendedor', problema: 'Escreva o objetivo como o vendedor vai ler.' },
    { ok: m.alvo > 0, rotulo: 'Meta da missão', problema: 'A meta precisa ser maior que zero.' },
    { ok: Boolean(template.criterios[m.unidade as UnidadeMissao]), rotulo: 'Métrica', problema: `O template ${template.titulo} mede: ${Object.keys(template.criterios).join(' ou ')}.` },
    { ok: !template.exigeProdutos || (m.produtos.length > 0 && produtosOk === new Set(m.produtos).size), rotulo: 'Produtos', problema: 'Este tipo de missão precisa de ao menos um produto cadastrado.' },
    { ok: parametros.success, rotulo: 'Parâmetros do template', problema: m.template === 'CATEGORIA' ? 'Escolha a categoria.' : m.template === 'SUPERACAO' ? 'Informe o ticket mínimo do dia.' : 'Parâmetros inválidos para o template.' },
    { ok: m.xp > 0 || m.moedas > 0 || (m.premioId !== null && premio !== null), rotulo: 'Recompensa', problema: 'Defina XP, VendaCoins ou um prêmio.' },
    { ok: m.premioId === null || premio !== null, rotulo: 'Prêmio', problema: 'Prêmio inexistente.' },
    { ok: m.regras.length > 0, rotulo: 'Regra de contagem', problema: 'Explique o que conta para o progresso.' },
    { ok: elegiveis > 0, rotulo: 'Elegibilidade', problema: 'Nenhum vendedor ativo nas lojas escolhidas.' },
  ];
}

function dadosDaEntrada(m: MissaoEntrada) {
  const template = TEMPLATES[m.template];
  const criterio = template.criterios[m.unidade as UnidadeMissao];
  const parametros = template.parametros.safeParse(m.parametros);
  return {
    title: m.nome,
    description: m.descricao,
    criterionType: criterio ?? template.criterios[Object.keys(template.criterios)[0] as UnidadeMissao]!,
    template: m.template,
    tipoExibicao: m.tipo,
    unidade: m.unidade,
    alvo: m.alvo,
    parametros: (parametros.success ? parametros.data : m.parametros) as Prisma.InputJsonValue,
    inicio: new Date(m.inicio),
    fim: new Date(m.fim),
    todasLojas: m.lojas === 'TODAS',
    lojaIds: m.lojas === 'TODAS' ? [] : m.lojas,
    produtos: [...new Set(m.produtos)],
    xp: m.xp,
    moedas: m.moedas,
    premioId: m.premioId,
    regras: m.regras,
  };
}

export function serializarMissao(d: MissionDefinition, agora = new Date()) {
  return {
    id: d.id,
    nome: d.title,
    tipo: d.tipoExibicao,
    template: d.template,
    descricao: d.description,
    unidade: d.unidade,
    alvo: Number(d.alvo),
    xp: d.xp,
    moedas: d.moedas,
    premioId: d.premioId,
    lojas: d.todasLojas ? 'TODAS' : d.lojaIds,
    inicio: d.inicio!.toISOString(),
    fim: d.fim!.toISOString(),
    status: statusPeloRelogio(d, agora),
    produtos: d.produtos,
    regras: d.regras ?? '',
    parametros: (d.parametros ?? {}) as Record<string, unknown>,
    encerradaEm: d.encerradaEm,
    canceladaMotivo: d.canceladaMotivo,
  };
}

async function buscar(empresaId: string, id: string) {
  const d = await prisma.missionDefinition.findFirst({ where: { id, empresaId } });
  if (!d) throw naoEncontrado('missão');
  return d;
}

export async function listarMissoes(empresaId: string, agora = new Date()) {
  await atualizarStatusPeloRelogio(empresaId, agora);
  const defs = await prisma.missionDefinition.findMany({ where: { empresaId }, orderBy: { createdAt: 'desc' } });
  return defs.map((d) => serializarMissao(d, agora));
}

export async function obterMissao(empresaId: string, id: string, agora = new Date()) {
  await atualizarStatusPeloRelogio(empresaId, agora);
  return serializarMissao(await buscar(empresaId, id), agora);
}

export async function salvarRascunho(empresaId: string, atorId: string, entrada: unknown, id?: string) {
  const m = missaoEntradaSchema.parse(entrada);
  if (m.premioId) {
    const premio = await prisma.premio.findFirst({ where: { id: m.premioId, empresaId } });
    if (!premio) throw invalido('Prêmio inexistente.');
  }
  if (id) {
    const atual = await buscar(empresaId, id);
    if (atual.statusCiclo !== 'RASCUNHO' && atual.statusCiclo !== 'PROGRAMADA') throw new ErroHttp(409, 'regras_bloqueadas', 'Depois que começa, a regra da missão não muda. Cancele e publique uma substituta.');
    if (atual.statusCiclo === 'PROGRAMADA') {
      const validacao = await validarMissao(empresaId, m);
      if (!validacao.every((v) => v.ok)) throw new ErroHttp(400, 'validacao', validacao.filter((v) => !v.ok).map((v) => v.problema).join(' '));
    }
    const d = await prisma.missionDefinition.update({ where: { id }, data: dadosDaEntrada(m) });
    await registrarEventoAuditoria({ empresaId, acao: 'MISSION_UPDATED', actorId: atorId, metadata: { missaoId: id, status: d.statusCiclo } });
    return serializarMissao(d);
  }
  const d = await prisma.missionDefinition.create({
    data: { ...dadosDaEntrada(m), code: `gov-${randomUUID()}`, category: 'SALES', targetPapel: 'VENDEDOR', periodType: 'PERSONALIZADO', actionType: 'SALES', empresaId, statusCiclo: 'RASCUNHO', criadoPor: atorId },
  });
  await registrarEventoAuditoria({ empresaId, acao: 'MISSION_CREATED', actorId: atorId, metadata: { missaoId: d.id, nome: d.title, template: d.template } });
  return serializarMissao(d);
}

export async function publicarMissao(empresaId: string, atorId: string, id: string, agora = new Date()) {
  const d = await buscar(empresaId, id);
  if (d.statusCiclo !== 'RASCUNHO') throw new ErroHttp(409, 'invalid_transition', 'Só rascunho pode ser publicado.');
  const entrada = missaoEntradaSchema.parse({ ...serializarMissao(d), lojas: d.todasLojas ? 'TODAS' : d.lojaIds });
  const validacao = await validarMissao(empresaId, entrada);
  if (!validacao.every((v) => v.ok)) throw new ErroHttp(400, 'validacao', validacao.filter((v) => !v.ok).map((v) => v.problema).join(' '));
  const status: StatusCiclo = d.inicio! > agora ? 'PROGRAMADA' : 'ATIVA';
  const r = await prisma.missionDefinition.updateMany({ where: { id, statusCiclo: 'RASCUNHO' }, data: { statusCiclo: status } });
  if (r.count !== 1) throw new ErroHttp(409, 'invalid_transition', 'A missão mudou de estado — recarregue.');
  await registrarEventoAuditoria({ empresaId, acao: 'MISSION_PUBLISHED', actorId: atorId, metadata: { missaoId: id, status } });
  if (status === 'ATIVA') await recalcularMissaoParaTodos(id, agora);
  return obterMissao(empresaId, id, agora);
}

export async function encerrarMissao(empresaId: string, atorId: string, id: string, agora = new Date()) {
  const d = await buscar(empresaId, id);
  if (statusPeloRelogio(d, agora) !== 'ATIVA') throw new ErroHttp(409, 'invalid_transition', 'Só missão ativa pode ser encerrada.');
  await prisma.missionDefinition.update({ where: { id }, data: { statusCiclo: 'ENCERRADA', encerradaEm: agora } });
  await registrarEventoAuditoria({ empresaId, acao: 'MISSION_FINISHED', actorId: atorId, metadata: { missaoId: id } });
  await recalcularMissaoParaTodos(id, agora);
  return obterMissao(empresaId, id, agora);
}

export async function cancelarMissao(empresaId: string, atorId: string, id: string, motivo: string, agora = new Date()) {
  if (motivo.trim().length < 5) throw invalido('Motivo do cancelamento é obrigatório (mínimo 5 caracteres).');
  const d = await buscar(empresaId, id);
  const status = statusPeloRelogio(d, agora);
  if (status !== 'ATIVA' && status !== 'PROGRAMADA') throw new ErroHttp(409, 'invalid_transition', 'Só missão ativa ou programada pode ser cancelada.');
  await prisma.$transaction([
    prisma.missionDefinition.update({ where: { id }, data: { statusCiclo: 'CANCELADA', canceladaMotivo: motivo.trim(), encerradaEm: agora } }),
    prisma.missionAssignment.updateMany({ where: { missionDefinitionId: id, status: { in: ['ASSIGNED', 'IN_PROGRESS'] } }, data: { status: 'CANCELLED' } }),
  ]);
  await registrarEventoAuditoria({ empresaId, acao: 'MISSION_CANCELLED', actorId: atorId, metadata: { missaoId: id, motivo: motivo.trim() } });
  return obterMissao(empresaId, id, agora);
}

export async function arquivarMissao(empresaId: string, atorId: string, id: string, agora = new Date()) {
  const d = await buscar(empresaId, id);
  if (statusPeloRelogio(d, agora) !== 'ENCERRADA') throw new ErroHttp(409, 'invalid_transition', 'Só missão encerrada pode ser arquivada.');
  await prisma.missionDefinition.update({ where: { id }, data: { statusCiclo: 'ARQUIVADA' } });
  await registrarEventoAuditoria({ empresaId, acao: 'MISSION_ARCHIVED', actorId: atorId, metadata: { missaoId: id } });
  return obterMissao(empresaId, id, agora);
}

export async function duplicarMissao(empresaId: string, atorId: string, id: string) {
  const d = await buscar(empresaId, id);
  const copia = await prisma.missionDefinition.create({
    data: {
      code: `gov-${randomUUID()}`, title: `${d.title} (cópia)`, description: d.description, category: 'SALES', criterionType: d.criterionType, targetPapel: 'VENDEDOR', periodType: 'PERSONALIZADO', actionType: 'SALES',
      empresaId, template: d.template, tipoExibicao: d.tipoExibicao, unidade: d.unidade, alvo: d.alvo, parametros: d.parametros ?? undefined, inicio: d.inicio, fim: d.fim, statusCiclo: 'RASCUNHO',
      todasLojas: d.todasLojas, lojaIds: d.lojaIds, produtos: d.produtos, xp: d.xp, moedas: d.moedas, premioId: d.premioId, regras: d.regras, criadoPor: atorId,
    },
  });
  await registrarEventoAuditoria({ empresaId, acao: 'MISSION_CREATED', actorId: atorId, metadata: { missaoId: copia.id, duplicadaDe: id } });
  return serializarMissao(copia);
}

/** Persiste as transições pelo relógio (PROGRAMADA→ATIVA→ENCERRADA). Idempotente. */
export async function atualizarStatusPeloRelogio(empresaId: string | null, agora = new Date()) {
  const candidatas = await prisma.missionDefinition.findMany({ where: { ...(empresaId ? { empresaId } : { empresaId: { not: null } }), statusCiclo: { in: ['PROGRAMADA', 'ATIVA'] } } });
  for (const d of candidatas) {
    const novo = statusPeloRelogio(d, agora);
    if (novo !== d.statusCiclo) {
      const r = await prisma.missionDefinition.updateMany({ where: { id: d.id, statusCiclo: d.statusCiclo }, data: { statusCiclo: novo } });
      if (r.count === 1 && novo === 'ATIVA') await recalcularMissaoParaTodos(d.id, agora);
    }
  }
}

async function participantes(def: MissionDefinition) {
  return prisma.vendedor.findMany({ where: { empresaId: def.empresaId!, papel: 'VENDEDOR', status: 'ACTIVE', ...(def.todasLojas ? {} : { lojaId: { in: def.lojaIds } }) }, select: { id: true } });
}

/** Garante a atribuição de todos os participantes e reconcilia cada um (publicação/encerramento). */
async function recalcularMissaoParaTodos(definicaoId: string, agora: Date) {
  const def = await prisma.missionDefinition.findUniqueOrThrow({ where: { id: definicaoId } });
  const tz = await timezoneDaEmpresa(def.empresaId!);
  for (const v of await participantes(def)) {
    try {
      await reconciliarVendedor(v.id, [diaLocal(agora, tz)], { agora });
    } catch (err) {
      log.error({ err, vendedorId: v.id, definicaoId }, 'falha ao reconciliar missão para o vendedor');
    }
  }
}

/**
 * Gancho do motor de reconciliação: para o vendedor, avalia todas as missões
 * governadas vigentes (ou encerradas há até 60 dias — devolução tardia ainda
 * corrige) das quais ele participa, e põe progresso, status, recompensa e feed
 * no estado devido.
 */
export async function reconciliarMissoesDoVendedor(db: ClienteDb, ctx: ContextoVendedor) {
  const limiteEncerradas = new Date(ctx.agora.getTime() - 60 * 86_400_000);
  const defs = await prisma.missionDefinition.findMany({
    where: {
      empresaId: ctx.empresaId,
      statusCiclo: { in: ['ATIVA', 'ENCERRADA', 'PROGRAMADA', 'ARQUIVADA'] },
      inicio: { lte: ctx.agora },
      fim: { gte: limiteEncerradas },
      OR: [{ todasLojas: true }, { lojaIds: { has: ctx.lojaId } }],
    },
  });
  if (!defs.length) return;
  const premios = await prisma.premio.findMany({ where: { id: { in: defs.map((d) => d.premioId).filter((x): x is string => Boolean(x)) } } });

  for (const def of defs) {
    const fim = fimEfetivo(def);
    let assignment = await db.missionAssignment.findUnique({ where: { vendedorId_missionDefinitionId_startsAt: { vendedorId: ctx.vendedorId, missionDefinitionId: def.id, startsAt: def.inicio! } } });
    if (!assignment) {
      assignment = await db.missionAssignment.create({ data: { missionDefinitionId: def.id, empresaId: ctx.empresaId, lojaId: ctx.lojaId, vendedorId: ctx.vendedorId, startsAt: def.inicio!, expiresAt: def.fim!, progressoAlvo: def.alvo ?? 0, source: 'ADMIN', sourceReference: def.id } });
    }
    if (assignment.status === 'CANCELLED') continue;

    const progresso = await calcularProgresso(ctx.vendedorId, { criterio: def.criterionType, produtos: def.produtos, parametros: (def.parametros ?? {}) as Record<string, unknown>, inicio: def.inicio!, fim, tz: ctx.tz }, ctx.agora);
    const alvo = Number(def.alvo);
    const concluida = progresso >= alvo;
    const encerrada = fim < ctx.agora;
    const status = concluida ? 'COMPLETED' : encerrada ? 'EXPIRED' : progresso > 0 ? 'IN_PROGRESS' : 'ASSIGNED';
    const primeiraConclusao = concluida && assignment.status !== 'COMPLETED';
    await db.missionAssignment.update({ where: { id: assignment.id }, data: { progressoAtual: progresso, progressoAlvo: alvo, status, completedAt: concluida ? (assignment.completedAt ?? ctx.agora) : null } });

    const premio = premios.find((p) => p.id === def.premioId);
    const digital = premio?.tipo === 'DIGITAL' ? premio : null;
    await reconciliarRecompensa(
      db,
      { empresaId: ctx.empresaId, lojaId: ctx.lojaId, vendedorId: ctx.vendedorId, tipoEvento: 'MISSAO', referenciaTipo: 'MISSAO_GOVERNADA', referenciaId: assignment.id, prefixoChave: `missao-${assignment.id}`, regraVersao: ctx.regra.versao, ocorridoEm: ctx.agora },
      concluida,
      { xp: def.xp + (digital?.xp ?? 0), moedas: def.moedas + (digital?.moedas ?? 0) }
    );
    if (digital?.badgeCodigo) {
      const chave = `badge-missao-${assignment.id}`;
      const existente = await db.badgeConcessao.findUnique({ where: { idempotencyKey: chave } });
      if (concluida && !existente) await concederBadge(ctx.empresaId, ctx.lojaId, ctx.vendedorId, digital.badgeCodigo, chave);
      else if (concluida && existente?.revogadoEm) await db.badgeConcessao.update({ where: { id: existente.id }, data: { revogadoEm: null } });
      else if (!concluida && existente && !existente.revogadoEm) await db.badgeConcessao.update({ where: { id: existente.id }, data: { revogadoEm: new Date() } });
    }
    if (concluida) {
      await publicarEventoFeed({ empresaId: ctx.empresaId, eventType: 'MISSION_COMPLETED', sourceType: 'MISSAO_GOVERNADA', sourceId: assignment.id, visibility: 'STORE', lojaId: ctx.lojaId, subjectId: ctx.vendedorId, templateData: { missionTitle: def.title } });
      if (primeiraConclusao) await registrarEventoEngajamento({ vendedorId: ctx.vendedorId, tipo: 'MISSAO_CONCLUIDA', referenciaTipo: 'MISSAO_GOVERNADA', referenciaId: assignment.id, agora: ctx.agora });
    } else {
      await revogarEventoFeed('MISSION_COMPLETED', 'MISSAO_GOVERNADA', assignment.id);
    }
  }
}

registrarGanchoMissoes((db, ctx) => reconciliarMissoesDoVendedor(db, ctx));

/** Missões que o vendedor vê no app (formato `Missao` homologado). */
export async function missoesDoVendedor(vendedorId: string, empresaId: string, lojaId: string, agora = new Date()) {
  const defs = await prisma.missionDefinition.findMany({
    where: { empresaId, statusCiclo: { in: ['ATIVA', 'PROGRAMADA'] }, inicio: { lte: agora }, OR: [{ todasLojas: true }, { lojaIds: { has: lojaId } }] },
    orderBy: { fim: 'asc' },
  });
  const vigentes = defs.filter((d) => statusPeloRelogio(d, agora) === 'ATIVA');
  if (!vigentes.length) return [];
  const [assignments, produtos, premios] = await Promise.all([
    prisma.missionAssignment.findMany({ where: { vendedorId, missionDefinitionId: { in: vigentes.map((d) => d.id) } } }),
    prisma.produto.findMany({ where: { empresaId, referencia: { in: [...new Set(vigentes.flatMap((d) => d.produtos))] } } }),
    prisma.premio.findMany({ where: { id: { in: vigentes.map((d) => d.premioId).filter((x): x is string => Boolean(x)) } } }),
  ]);
  return vigentes
    .map((d) => {
      const a = assignments.find((x) => x.missionDefinitionId === d.id);
      if (a?.status === 'CANCELLED') return null;
      const premio = premios.find((p) => p.id === d.premioId);
      return {
        id: d.id,
        tipo: d.tipoExibicao ?? 'SEMANAL',
        titulo: d.title,
        descricao: d.description,
        unidade: d.unidade ?? 'venda',
        progresso: Math.min(Number(a?.progressoAtual ?? 0), Number(d.alvo)),
        alvo: Number(d.alvo),
        recompensa: { xp: d.xp + (premio?.tipo === 'DIGITAL' ? premio.xp : 0), moedas: d.moedas + (premio?.tipo === 'DIGITAL' ? premio.moedas : 0) },
        terminaEm: fimEfetivo(d).toISOString(),
        produtos: d.produtos.length ? d.produtos.map((ref) => ({ referencia: ref, nome: produtos.find((p) => p.referencia === ref)?.nome ?? 'Produto não cadastrado', foto: produtos.find((p) => p.referencia === ref)?.foto ?? undefined })) : undefined,
        concluidaEm: a?.status === 'COMPLETED' && a.completedAt ? a.completedAt.toISOString() : undefined,
        premio: premio ? (premio.tipo === 'EMPRESARIAL' ? premio.nome : descreverPremio(premio)) : undefined,
        regra: d.regras || undefined,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}
