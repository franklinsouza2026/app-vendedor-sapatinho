// Campanhas (D3) — conceito completo: identidade, período, participantes
// (lojas), objetivo, regras e FRENTES. Cada frente aponta para uma competição,
// para a meta do período ou para uma missão governada, com o próprio prêmio.
// A campanha não recalcula nada sozinha: orquestra os motores existentes.
//
// Ao ENCERRAR (Admin ou fim do período), o resultado de cada frente é
// CONGELADO (imutável, histórico) e os prêmios digitais entram pelo ledger
// oficial, idempotentes. Prêmio empresarial é só registro.
import { Campanha, CampanhaFrente, Prisma, StatusCiclo } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../db';
import { registrarEventoAuditoria } from '../../identidade/auditoria.service';
import { timezoneDaEmpresa } from '../../tempo/empresa';
import { ErroHttp, invalido, naoEncontrado } from '../../utils/erro-http';
import { publicarEventoFeed } from '../../competicoes/feed.service';
import { concederBadge } from '../../gamificacao/badges.service';
import { reconciliarRecompensa } from '../reconciliacao/recompensa';
import { descreverPremio } from '../incentivos/premios.service';
import { classificacao } from '../competicoes/competicoes.service';
import { metasDoMesEmLote } from '../metas.service';
import { diaLocal, diasNoMes, listarDias } from '../../tempo/dia';
import { efetivoDaVenda } from '../vendas/agregado.service';

const frenteSchema = z.object({
  id: z.string().min(1).max(64),
  icone: z.string().min(1).max(8),
  titulo: z.string().trim().min(1).max(80),
  mecanismo: z.enum(['COMPETICAO', 'META_MES', 'MISSAO']),
  refId: z.string().uuid().nullable(),
  premioId: z.string().uuid().nullable(),
});

export const campanhaEntradaSchema = z.object({
  nome: z.string().trim().max(120),
  descricao: z.string().trim().max(1000),
  objetivo: z.string().trim().max(1000),
  inicio: z.string().datetime({ offset: true }),
  fim: z.string().datetime({ offset: true }),
  lojas: z.union([z.literal('TODAS'), z.array(z.string().uuid()).max(500)]),
  frentes: z.array(frenteSchema).max(12),
  regras: z.string().trim().max(3000),
});
export type CampanhaEntrada = z.infer<typeof campanhaEntradaSchema>;

type CampanhaComFrentes = Campanha & { frentes: CampanhaFrente[] };

export interface ResultadoFrente {
  frenteId: string;
  titulo: string;
  vencedor: string;
  premio: string;
  /** Posição congelada de cada participante (vendedor ou loja) — base de "minha posição". */
  posicoes: Record<string, number>;
  vencedores: string[];
}

export function statusPeloRelogio(c: Pick<Campanha, 'status' | 'inicio' | 'fim'>, agora: Date): StatusCiclo {
  if (c.status === 'PROGRAMADA' && c.inicio <= agora) return c.fim < agora ? 'ENCERRADA' : 'ATIVA';
  if (c.status === 'ATIVA' && c.fim < agora) return 'ENCERRADA';
  return c.status;
}

export function serializarCampanha(c: CampanhaComFrentes, agora = new Date()) {
  const resultado = (c.resultado as ResultadoFrente[] | null) ?? null;
  return {
    id: c.id,
    nome: c.nome,
    descricao: c.descricao,
    objetivo: c.objetivo,
    inicio: c.inicio.toISOString(),
    fim: c.fim.toISOString(),
    status: statusPeloRelogio(c, agora),
    lojas: c.todasLojas ? 'TODAS' : c.lojaIds,
    regras: c.regras,
    frentes: [...c.frentes].sort((a, b) => a.ordem - b.ordem).map((f) => ({ id: f.id, icone: f.icone, titulo: f.titulo, mecanismo: f.mecanismo, refId: f.competicaoId ?? f.missaoId ?? null, premioId: f.premioId })),
    resultado: resultado ? resultado.map((r) => ({ frenteId: r.frenteId, vencedor: r.vencedor, premio: r.premio, minhaPosicao: null })) : null,
    canceladaMotivo: c.canceladaMotivo,
  };
}

async function buscar(empresaId: string, id: string) {
  const c = await prisma.campanha.findFirst({ where: { id, empresaId }, include: { frentes: true } });
  if (!c) throw naoEncontrado('campanha');
  return c;
}

export async function validarCampanha(empresaId: string, c: CampanhaEntrada) {
  const refsCompeticao = c.frentes.filter((f) => f.mecanismo === 'COMPETICAO').map((f) => f.refId).filter((x): x is string => Boolean(x));
  const refsMissao = c.frentes.filter((f) => f.mecanismo === 'MISSAO').map((f) => f.refId).filter((x): x is string => Boolean(x));
  const premios = c.frentes.map((f) => f.premioId).filter((x): x is string => Boolean(x));
  const lojasIds = c.lojas === 'TODAS' ? null : c.lojas;
  const [competicoes, missoes, premiosOk, lojasOk, elegiveis] = await Promise.all([
    prisma.competition.count({ where: { empresaId, id: { in: refsCompeticao }, status: { notIn: ['CANCELLED', 'ARCHIVED'] } } }),
    prisma.missionDefinition.count({ where: { empresaId, id: { in: refsMissao }, statusCiclo: { notIn: ['CANCELADA', 'ARQUIVADA'] } } }),
    prisma.premio.count({ where: { empresaId, id: { in: premios } } }),
    lojasIds ? prisma.loja.count({ where: { empresaId, id: { in: lojasIds } } }) : Promise.resolve(0),
    prisma.vendedor.count({ where: { empresaId, papel: 'VENDEDOR', status: 'ACTIVE', ...(lojasIds ? { lojaId: { in: lojasIds } } : {}) } }),
  ]);
  const semPremio = c.frentes.filter((f) => !f.premioId);
  const semRef = c.frentes.filter((f) => f.mecanismo !== 'META_MES' && !f.refId);
  return [
    { ok: c.nome.length >= 3, rotulo: 'Identidade', problema: 'Dê um nome à campanha.' },
    { ok: Date.parse(c.fim) > Date.parse(c.inicio), rotulo: 'Período', problema: 'O fim precisa ser depois do início.' },
    { ok: c.lojas === 'TODAS' || (c.lojas.length > 0 && lojasOk === c.lojas.length), rotulo: 'Participantes', problema: 'Escolha ao menos uma loja.' },
    { ok: c.objetivo.length > 0, rotulo: 'Objetivo', problema: 'Descreva o objetivo da campanha.' },
    { ok: c.frentes.length > 0 && semRef.length === 0 && competicoes === new Set(refsCompeticao).size && missoes === new Set(refsMissao).size, rotulo: 'Mecânica', problema: c.frentes.length === 0 ? 'Inclua ao menos uma frente.' : `Frente sem competição/missão válida: ${semRef.map((f) => f.titulo).join(', ') || 'verifique os vínculos'}.` },
    { ok: semPremio.length === 0 && premiosOk === new Set(premios).size, rotulo: 'Premiação', problema: semPremio.length ? `Frente sem prêmio: ${semPremio.map((f) => f.titulo).join(', ')}.` : 'Prêmio inexistente.' },
    { ok: c.regras.length > 0, rotulo: 'Regras', problema: 'Escreva as regras (o que vale, quem participa).' },
    { ok: elegiveis > 0, rotulo: 'Elegibilidade', problema: 'Nenhum vendedor elegível nas lojas escolhidas.' },
  ];
}

function dadosFrentes(c: CampanhaEntrada) {
  return c.frentes.map((f, i) => ({ ordem: i, icone: f.icone, titulo: f.titulo, mecanismo: f.mecanismo, competicaoId: f.mecanismo === 'COMPETICAO' ? f.refId : null, missaoId: f.mecanismo === 'MISSAO' ? f.refId : null, premioId: f.premioId }));
}

export async function listarCampanhas(empresaId: string, agora = new Date()) {
  await atualizarCampanhasPeloRelogio(empresaId, agora);
  return (await prisma.campanha.findMany({ where: { empresaId }, include: { frentes: true }, orderBy: { inicio: 'desc' } })).map((c) => serializarCampanha(c, agora));
}

export async function obterCampanha(empresaId: string, id: string, agora = new Date()) {
  await atualizarCampanhasPeloRelogio(empresaId, agora);
  return serializarCampanha(await buscar(empresaId, id), agora);
}

/** Zero trust: nem rascunho guarda referência (competição, missão, prêmio, loja) de outra empresa. */
async function exigirReferenciasDaEmpresa(empresaId: string, c: CampanhaEntrada) {
  const comp = [...new Set(c.frentes.filter((f) => f.mecanismo === 'COMPETICAO' && f.refId).map((f) => f.refId!))];
  const miss = [...new Set(c.frentes.filter((f) => f.mecanismo === 'MISSAO' && f.refId).map((f) => f.refId!))];
  const prem = [...new Set(c.frentes.map((f) => f.premioId).filter((x): x is string => Boolean(x)))];
  const lojas = c.lojas === 'TODAS' ? [] : [...new Set(c.lojas)];
  const [nc, nm, np, nl] = await Promise.all([
    comp.length ? prisma.competition.count({ where: { empresaId, id: { in: comp } } }) : 0,
    miss.length ? prisma.missionDefinition.count({ where: { empresaId, id: { in: miss } } }) : 0,
    prem.length ? prisma.premio.count({ where: { empresaId, id: { in: prem } } }) : 0,
    lojas.length ? prisma.loja.count({ where: { empresaId, id: { in: lojas } } }) : 0,
  ]);
  if (nc !== comp.length || nm !== miss.length || np !== prem.length || nl !== lojas.length) throw new ErroHttp(400, 'referencia_invalida', 'A campanha aponta para competição, missão, prêmio ou loja que não existe nesta empresa.');
}

export async function salvarCampanha(empresaId: string, atorId: string, entrada: unknown, id?: string) {
  const c = campanhaEntradaSchema.parse(entrada);
  await exigirReferenciasDaEmpresa(empresaId, c);
  if (id) {
    const atual = await buscar(empresaId, id);
    if (atual.status !== 'RASCUNHO' && atual.status !== 'PROGRAMADA') throw new ErroHttp(409, 'regras_bloqueadas', 'Depois que começa, a regra da campanha não muda. Cancele e publique uma substituta.');
    if (atual.status === 'PROGRAMADA') {
      const v = await validarCampanha(empresaId, c);
      if (!v.every((x) => x.ok)) throw new ErroHttp(400, 'validacao', v.filter((x) => !x.ok).map((x) => x.problema).join(' '));
    }
    await prisma.$transaction([
      prisma.campanhaFrente.deleteMany({ where: { campanhaId: id } }),
      prisma.campanha.update({ where: { id }, data: { nome: c.nome, descricao: c.descricao, objetivo: c.objetivo, regras: c.regras, inicio: new Date(c.inicio), fim: new Date(c.fim), todasLojas: c.lojas === 'TODAS', lojaIds: c.lojas === 'TODAS' ? [] : c.lojas, frentes: { create: dadosFrentes(c) } } }),
    ]);
    await registrarEventoAuditoria({ empresaId, acao: 'CAMPAIGN_UPDATED', actorId: atorId, metadata: { campanhaId: id } });
    return obterCampanha(empresaId, id);
  }
  const criada = await prisma.campanha.create({
    data: { empresaId, nome: c.nome, descricao: c.descricao, objetivo: c.objetivo, regras: c.regras, inicio: new Date(c.inicio), fim: new Date(c.fim), todasLojas: c.lojas === 'TODAS', lojaIds: c.lojas === 'TODAS' ? [] : c.lojas, criadoPor: atorId, frentes: { create: dadosFrentes(c) } },
  });
  await registrarEventoAuditoria({ empresaId, acao: 'CAMPAIGN_CREATED', actorId: atorId, metadata: { campanhaId: criada.id, nome: criada.nome } });
  return obterCampanha(empresaId, criada.id);
}

export async function publicarCampanha(empresaId: string, atorId: string, id: string, agora = new Date()) {
  const atual = await buscar(empresaId, id);
  if (atual.status !== 'RASCUNHO') throw new ErroHttp(409, 'invalid_transition', 'Só rascunho pode ser publicado.');
  const entrada = campanhaEntradaSchema.parse({ ...serializarCampanha(atual, agora), lojas: atual.todasLojas ? 'TODAS' : atual.lojaIds });
  const v = await validarCampanha(empresaId, entrada);
  if (!v.every((x) => x.ok)) throw new ErroHttp(400, 'validacao', v.filter((x) => !x.ok).map((x) => x.problema).join(' '));
  const status: StatusCiclo = atual.inicio > agora ? 'PROGRAMADA' : 'ATIVA';
  const r = await prisma.campanha.updateMany({ where: { id, status: 'RASCUNHO' }, data: { status } });
  if (r.count !== 1) throw new ErroHttp(409, 'invalid_transition', 'A campanha mudou de estado — recarregue.');
  await registrarEventoAuditoria({ empresaId, acao: 'CAMPAIGN_PUBLISHED', actorId: atorId, metadata: { campanhaId: id, status } });
  return obterCampanha(empresaId, id, agora);
}

export async function encerrarCampanha(empresaId: string, atorId: string | undefined, id: string, agora = new Date()) {
  const c = await buscar(empresaId, id);
  const status = statusPeloRelogio(c, agora);
  if (status !== 'ATIVA' && !(status === 'ENCERRADA' && c.status !== 'ENCERRADA')) throw new ErroHttp(409, 'invalid_transition', 'Só campanha ativa pode ser encerrada.');
  const resultado = await calcularResultado(c, agora < c.fim ? agora : c.fim);
  // Transição condicional: duas chamadas (Admin + job) congelam UM resultado.
  const r = await prisma.campanha.updateMany({ where: { id, status: { in: ['ATIVA', 'PROGRAMADA'] } }, data: { status: 'ENCERRADA', encerradaEm: agora, resultado: resultado as unknown as Prisma.InputJsonValue } });
  if (r.count !== 1) return obterCampanha(empresaId, id, agora);
  await concederPremiosDaCampanha(c, resultado, agora);
  await registrarEventoAuditoria({ empresaId, acao: 'CAMPAIGN_FINISHED', actorId: atorId, metadata: { campanhaId: id, vencedores: resultado.map((x) => ({ frente: x.titulo, vencedores: x.vencedores.length })) } });
  await publicarEventoFeed({ empresaId, eventType: 'CAMPAIGN_FINISHED', sourceType: 'CAMPANHA', sourceId: id, visibility: 'COMPANY', templateData: { campanhaNome: c.nome } });
  return obterCampanha(empresaId, id, agora);
}

export async function cancelarCampanha(empresaId: string, atorId: string, id: string, motivo: string, agora = new Date()) {
  if (motivo.trim().length < 5) throw invalido('Motivo do cancelamento é obrigatório (mínimo 5 caracteres).');
  const c = await buscar(empresaId, id);
  const status = statusPeloRelogio(c, agora);
  if (status !== 'ATIVA' && status !== 'PROGRAMADA') throw new ErroHttp(409, 'invalid_transition', 'Só campanha ativa ou programada pode ser cancelada.');
  await prisma.campanha.update({ where: { id }, data: { status: 'CANCELADA', canceladaMotivo: motivo.trim() } });
  await registrarEventoAuditoria({ empresaId, acao: 'CAMPAIGN_CANCELLED', actorId: atorId, metadata: { campanhaId: id, motivo: motivo.trim() } });
  return obterCampanha(empresaId, id, agora);
}

export async function arquivarCampanha(empresaId: string, atorId: string, id: string, agora = new Date()) {
  const c = await buscar(empresaId, id);
  if (c.status !== 'ENCERRADA') throw new ErroHttp(409, 'invalid_transition', 'Só campanha encerrada pode ser arquivada.');
  await prisma.campanha.update({ where: { id }, data: { status: 'ARQUIVADA' } });
  await registrarEventoAuditoria({ empresaId, acao: 'CAMPAIGN_ARCHIVED', actorId: atorId, metadata: { campanhaId: id } });
  return obterCampanha(empresaId, id, agora);
}

export async function duplicarCampanha(empresaId: string, atorId: string, id: string) {
  const c = await buscar(empresaId, id);
  const copia = await prisma.campanha.create({
    data: {
      empresaId, nome: `${c.nome} (cópia)`, descricao: c.descricao, objetivo: c.objetivo, regras: c.regras, inicio: c.inicio, fim: c.fim, todasLojas: c.todasLojas, lojaIds: c.lojaIds, criadoPor: atorId,
      frentes: { create: c.frentes.map((f) => ({ ordem: f.ordem, icone: f.icone, titulo: f.titulo, mecanismo: f.mecanismo, competicaoId: f.competicaoId, missaoId: f.missaoId, premioId: f.premioId })) },
    },
  });
  await registrarEventoAuditoria({ empresaId, acao: 'CAMPAIGN_CREATED', actorId: atorId, metadata: { campanhaId: copia.id, duplicadaDe: id } });
  return obterCampanha(empresaId, copia.id);
}

/** Transições pelo relógio: PROGRAMADA→ATIVA, e ATIVA que passou do fim é ENCERRADA (com resultado congelado). */
export async function atualizarCampanhasPeloRelogio(empresaId: string | null, agora = new Date()) {
  const candidatas = await prisma.campanha.findMany({ where: { ...(empresaId ? { empresaId } : {}), status: { in: ['PROGRAMADA', 'ATIVA'] } } });
  for (const c of candidatas) {
    const novo = statusPeloRelogio(c, agora);
    if (novo === 'ENCERRADA') await encerrarCampanha(c.empresaId, undefined, c.id, agora);
    else if (novo !== c.status) await prisma.campanha.updateMany({ where: { id: c.id, status: c.status }, data: { status: novo } });
  }
}

// ------------------------------------------------------------------ resultado

async function vendedoresDaCampanha(c: Campanha) {
  return prisma.vendedor.findMany({ where: { empresaId: c.empresaId, papel: 'VENDEDOR', status: 'ACTIVE', elegivelRanking: true, ...(c.todasLojas ? {} : { lojaId: { in: c.lojaIds } }) }, select: { id: true, nome: true, lojaId: true } });
}

/** % da meta no período da campanha (meta proporcional por mês) — usado pela frente META_MES. */
async function percentuaisDoPeriodo(c: Campanha, vendedorIds: string[], ate: Date) {
  const tz = await timezoneDaEmpresa(c.empresaId);
  const dias = listarDias(diaLocal(c.inicio, tz), diaLocal(ate, tz));
  const porMes = new Map<string, number>();
  for (const d of dias) porMes.set(d.slice(0, 7), (porMes.get(d.slice(0, 7)) ?? 0) + 1);
  const metaPor = new Map<string, number>(vendedorIds.map((id) => [id, 0]));
  for (const [mes, n] of porMes) {
    const metas = await metasDoMesEmLote(vendedorIds, mes, tz);
    for (const [id, m] of metas) if (m.mensal) metaPor.set(id, metaPor.get(id)! + m.mensal * (n / diasNoMes(mes)));
  }
  const vendas = await prisma.venda.findMany({ where: { vendedorId: { in: vendedorIds }, ocorridoEm: { gte: c.inicio, lte: ate } }, include: { itens: true } });
  const fat = new Map<string, number>(vendedorIds.map((id) => [id, 0]));
  for (const v of vendas) fat.set(v.vendedorId, fat.get(v.vendedorId)! + efetivoDaVenda(v).faturamento);
  return new Map(vendedorIds.map((id) => [id, metaPor.get(id)! > 0 ? (fat.get(id)! / metaPor.get(id)!) * 100 : null]));
}

async function calcularResultado(c: CampanhaComFrentes, ate: Date): Promise<ResultadoFrente[]> {
  const vendedores = await vendedoresDaCampanha(c);
  const premios = await prisma.premio.findMany({ where: { id: { in: c.frentes.map((f) => f.premioId).filter((x): x is string => Boolean(x)) } } });
  const resultado: ResultadoFrente[] = [];
  for (const f of [...c.frentes].sort((a, b) => a.ordem - b.ordem)) {
    const premio = premios.find((p) => p.id === f.premioId);
    const textoPremio = premio ? descreverPremio(premio) : 'Sem prêmio';
    if (f.mecanismo === 'COMPETICAO' && f.competicaoId) {
      const comp = await prisma.competition.findUnique({ where: { id: f.competicaoId } });
      const grupos = comp ? await classificacao(comp, ate) : [];
      const posicoes: Record<string, number> = {};
      const vencedores: string[] = [];
      const nomes: string[] = [];
      for (const g of grupos) for (const l of g.linhas) {
        posicoes[l.id] = l.posicao;
        if (l.posicao === 1) {
          vencedores.push(l.id);
          nomes.push(l.nome);
        }
      }
      resultado.push({ frenteId: f.id, titulo: f.titulo, vencedor: nomes.join(', ') || '—', premio: textoPremio, posicoes, vencedores });
    } else if (f.mecanismo === 'META_MES') {
      const pcts = await percentuaisDoPeriodo(c, vendedores.map((v) => v.id), ate);
      const vencedores = vendedores.filter((v) => (pcts.get(v.id) ?? 0) >= 100).map((v) => v.id);
      resultado.push({ frenteId: f.id, titulo: f.titulo, vencedor: vencedores.length ? `${vencedores.length} ${vencedores.length === 1 ? 'vendedor bateu' : 'vendedores bateram'} a meta` : 'Ninguém bateu a meta', premio: textoPremio, posicoes: {}, vencedores });
    } else if (f.mecanismo === 'MISSAO' && f.missaoId) {
      const concluidas = await prisma.missionAssignment.findMany({ where: { missionDefinitionId: f.missaoId, status: 'COMPLETED' }, select: { vendedorId: true } });
      const vencedores = concluidas.map((a) => a.vendedorId).filter((id) => vendedores.some((v) => v.id === id));
      resultado.push({ frenteId: f.id, titulo: f.titulo, vencedor: vencedores.length ? `${vencedores.length} ${vencedores.length === 1 ? 'vendedor concluiu' : 'vendedores concluíram'} a missão` : 'Ninguém concluiu a missão', premio: textoPremio, posicoes: {}, vencedores });
    }
  }
  return resultado;
}

async function concederPremiosDaCampanha(c: CampanhaComFrentes, resultado: ResultadoFrente[], agora: Date) {
  const regra = await prisma.regraGamificacaoVersao.findFirst({ where: { empresaId: c.empresaId, ativo: true }, orderBy: { versao: 'desc' } });
  for (const r of resultado) {
    const frente = c.frentes.find((f) => f.id === r.frenteId)!;
    const premio = frente.premioId ? await prisma.premio.findUnique({ where: { id: frente.premioId } }) : null;
    if (!premio || premio.tipo !== 'DIGITAL') continue;
    // Vencedor de frente de competição Loja × Loja = vendedores ativos daquela loja.
    const comp = frente.competicaoId ? await prisma.competition.findUnique({ where: { id: frente.competicaoId }, select: { participantType: true } }) : null;
    const beneficiados = comp?.participantType === 'STORE' ? await prisma.vendedor.findMany({ where: { lojaId: { in: r.vencedores }, papel: 'VENDEDOR', status: 'ACTIVE' }, select: { id: true, lojaId: true } }) : await prisma.vendedor.findMany({ where: { id: { in: r.vencedores } }, select: { id: true, lojaId: true } });
    for (const b of beneficiados) {
      await prisma.$transaction(async (db) =>
        reconciliarRecompensa(db, { empresaId: c.empresaId, lojaId: b.lojaId, vendedorId: b.id, tipoEvento: 'COMPETICAO', referenciaTipo: 'CAMPANHA_PREMIO', referenciaId: `${c.id}:${r.frenteId}`, prefixoChave: `campanha-${c.id}-${r.frenteId}-${b.id}`, regraVersao: regra?.versao ?? 1, ocorridoEm: agora }, true, { xp: premio.xp, moedas: premio.moedas })
      );
      if (premio.badgeCodigo) await concederBadge(c.empresaId, b.lojaId, b.id, premio.badgeCodigo, `badge-campanha-${c.id}-${r.frenteId}-${b.id}`);
    }
  }
  if (resultado.some((r) => r.vencedores.length)) await registrarEventoAuditoria({ empresaId: c.empresaId, acao: 'CAMPAIGN_REWARD_GRANTED', metadata: { campanhaId: c.id } });
}

// ------------------------------------------------------------------ visão do vendedor

/** Formato `Campanha` homologado, do ponto de vista do vendedor. */
export async function campanhasDoVendedor(empresaId: string, vendedorId: string, lojaId: string, contexto: { competicoes: { id: string; tipo: string | null; participantes: { id: string; posicao?: number }[]; meuId: string }[]; missoes: { id: string; progresso: number; alvo: number }[] }, agora = new Date()) {
  await atualizarCampanhasPeloRelogio(empresaId, agora);
  const lista = await prisma.campanha.findMany({ where: { empresaId, status: { in: ['ATIVA', 'ENCERRADA'] }, OR: [{ todasLojas: true }, { lojaIds: { has: lojaId } }] }, include: { frentes: true }, orderBy: { inicio: 'desc' }, take: 12 });
  const premios = await prisma.premio.findMany({ where: { id: { in: lista.flatMap((c) => c.frentes.map((f) => f.premioId)).filter((x): x is string => Boolean(x)) } } });
  const competicoesNomes = new Map((await prisma.competition.findMany({ where: { id: { in: lista.flatMap((c) => c.frentes.map((f) => f.competicaoId)).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } })).map((x) => [x.id, x.name]));
  const missoesNomes = new Map((await prisma.missionDefinition.findMany({ where: { id: { in: lista.flatMap((c) => c.frentes.map((f) => f.missaoId)).filter((x): x is string => Boolean(x)) } }, select: { id: true, title: true } })).map((x) => [x.id, x.title]));

  const ativas = lista.filter((c) => statusPeloRelogio(c, agora) === 'ATIVA');
  const pcts = ativas.length ? await percentuaisDoPeriodo(ativas[0], [vendedorId], agora) : new Map<string, number | null>();
  const saida = [];
  for (const c of lista) {
    const status = statusPeloRelogio(c, agora);
    const frentesOrd = [...c.frentes].sort((a, b) => a.ordem - b.ordem);
    const premioTexto = (id: string | null) => {
      const p = premios.find((x) => x.id === id);
      return p ? descreverPremio(p) : 'Prêmio a definir';
    };
    if (status === 'ATIVA') {
      const pct = c.id === ativas[0]?.id ? pcts.get(vendedorId) : (await percentuaisDoPeriodo(c, [vendedorId], agora)).get(vendedorId);
      saida.push({
        id: c.id, nome: c.nome, descricao: c.descricao, iniciaEm: c.inicio.toISOString(), terminaEm: c.fim.toISOString(), status: 'ATIVA' as const, regras: c.regras,
        frentes: frentesOrd.map((f) => {
          let situacao = '—';
          if (f.mecanismo === 'META_MES') situacao = pct === null || pct === undefined ? 'Sem meta cadastrada' : `Você está em ${Math.round(pct * 10) / 10}% da meta`;
          else if (f.mecanismo === 'MISSAO') {
            const m = contexto.missoes.find((x) => x.id === f.missaoId);
            situacao = m ? `${m.progresso} de ${m.alvo}` : 'Missão vinculada';
          } else {
            const comp = contexto.competicoes.find((x) => x.id === f.competicaoId);
            const linha = comp?.participantes.find((p) => p.id === comp.meuId);
            situacao = !comp || !linha?.posicao ? 'Você não participa' : `${comp.tipo === 'LOJA' ? 'Sua loja está' : 'Você está'} em ${linha.posicao}º lugar`;
          }
          return { id: f.id, icone: f.icone, titulo: f.titulo, descricao: f.competicaoId ? (competicoesNomes.get(f.competicaoId) ?? '—') : f.missaoId ? (missoesNomes.get(f.missaoId) ?? '—') : 'Bater 100% da meta do mês', premio: premioTexto(f.premioId), situacao, competicaoId: f.competicaoId ?? undefined };
        }),
      });
    } else if (status === 'ENCERRADA' && c.resultado) {
      const resultado = c.resultado as unknown as ResultadoFrente[];
      const [xp, moedas] = await Promise.all([
        prisma.xpTransacao.aggregate({ where: { vendedorId, referenciaTipo: 'CAMPANHA_PREMIO', referenciaId: { startsWith: `${c.id}:` } }, _sum: { quantidade: true } }),
        prisma.moedaTransacao.aggregate({ where: { vendedorId, referenciaTipo: 'CAMPANHA_PREMIO', referenciaId: { startsWith: `${c.id}:` } }, _sum: { valor: true } }),
      ]);
      saida.push({
        id: c.id, nome: c.nome, descricao: c.descricao, iniciaEm: c.inicio.toISOString(), terminaEm: c.fim.toISOString(), status: 'ENCERRADA' as const, regras: c.regras, frentes: [],
        resultado: resultado.map((r) => ({ titulo: r.titulo, vencedor: r.vencedor, premio: r.premio, minhaPosicao: r.posicoes[vendedorId] ?? r.posicoes[lojaId] ?? null })),
        meusGanhos: { xp: xp._sum.quantidade ?? 0, moedas: moedas._sum.valor ?? 0 },
      });
    }
  }
  return saida;
}
