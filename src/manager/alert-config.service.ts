// Configuração de thresholds por tipo de alerta (Fatia 9, seção 66-70) —
// Admin pode ajustar, sempre versionado. Ausência de linha = usa o default
// neutro/conservador de `THRESHOLDS_PADRAO`, nunca uma fórmula livre.
import { TipoAlertaGerencial } from '@prisma/client';
import { prisma } from '../db';
import { registrarEventoAuditoria } from '../identidade/auditoria.service';
import { THRESHOLDS_PADRAO } from './constantes';

export interface ConfigAlertaEfetiva {
  tipo: TipoAlertaGerencial;
  ativo: boolean;
  parametros: Record<string, number>;
  versao: number;
}

/** Busca as configs de TODOS os tipos de uma vez (1 query) — usada pelo
 * Attention Engine, que precisa checar todos os tipos a cada carregamento. */
export async function getConfigsDaEmpresa(empresaId: string): Promise<Record<TipoAlertaGerencial, ConfigAlertaEfetiva>> {
  const configs = await prisma.managerAlertConfig.findMany({ where: { empresaId } });
  const porTipo = new Map(configs.map((c) => [c.tipo, c]));

  const resultado = {} as Record<TipoAlertaGerencial, ConfigAlertaEfetiva>;
  for (const tipo of Object.keys(THRESHOLDS_PADRAO) as TipoAlertaGerencial[]) {
    const c = porTipo.get(tipo);
    resultado[tipo] = c
      ? { tipo, ativo: c.ativo, parametros: c.parametros as Record<string, number>, versao: c.versao }
      : { tipo, ativo: true, parametros: THRESHOLDS_PADRAO[tipo], versao: 0 };
  }
  return resultado;
}

export async function listarConfigsParaAdmin(empresaId: string): Promise<ConfigAlertaEfetiva[]> {
  const todas = await getConfigsDaEmpresa(empresaId);
  return Object.values(todas);
}

/** Admin altera 1 tipo. Nunca aceita uma chave de parâmetro fora do
 * conjunto conhecido — evita virar uma "fórmula livre" (seção 68). */
export async function atualizarConfigAlerta(empresaId: string, tipo: TipoAlertaGerencial, parametros: Record<string, number>, ativo: boolean, actorId: string): Promise<ConfigAlertaEfetiva> {
  const chavesPermitidas = new Set(Object.keys(THRESHOLDS_PADRAO[tipo] ?? {}));
  for (const chave of Object.keys(parametros)) {
    if (!chavesPermitidas.has(chave)) {
      throw new Error(`parâmetro '${chave}' não é reconhecido para o alerta '${tipo}'`);
    }
  }

  const atual = await prisma.managerAlertConfig.findUnique({ where: { empresaId_tipo: { empresaId, tipo } } });
  const versao = (atual?.versao ?? 0) + 1;

  const salvo = await prisma.managerAlertConfig.upsert({
    where: { empresaId_tipo: { empresaId, tipo } },
    create: { empresaId, tipo, parametros, ativo, versao, updatedBy: actorId },
    update: { parametros, ativo, versao, updatedBy: actorId },
  });

  await registrarEventoAuditoria({ empresaId, acao: 'MANAGER_ALERT_CONFIG_UPDATED', actorId, metadata: { tipo, parametros, ativo, versao } });

  return { tipo, ativo: salvo.ativo, parametros: salvo.parametros as Record<string, number>, versao: salvo.versao };
}
