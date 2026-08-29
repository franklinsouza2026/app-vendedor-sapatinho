import { PeriodoMeta, TipoMeta } from '@prisma/client';
import { prisma } from '../db';

// PREMISSA A VALIDAR contra o contrato real do Linx (ver TODO em linx-client.ts):
// cada `indicador_realizado` representa o "acumulado do dia até aquela hora"
// (padrão comum em ERPs de varejo), não um incremento isolado daquela hora.
// Por isso o realizado do dia é o snapshot mais recente do dia, e o realizado
// da semana/mês é a soma dos "fechamentos" (snapshot mais recente de cada dia).

function inicioDoDia(data: Date): Date {
  const d = new Date(data);
  d.setHours(0, 0, 0, 0);
  return d;
}

function inicioDaSemana(data: Date): Date {
  const d = inicioDoDia(data);
  const diaSemana = d.getDay(); // 0 = domingo
  d.setDate(d.getDate() - diaSemana);
  return d;
}

function inicioDoMes(data: Date): Date {
  const d = inicioDoDia(data);
  d.setDate(1);
  return d;
}

async function realizadoNoPeriodo(vendedorId: string, desde: Date, ate: Date) {
  const snapshots = await prisma.indicadorRealizado.findMany({
    where: { vendedorId, dataHora: { gte: desde, lte: ate } },
    orderBy: { dataHora: 'asc' },
  });

  // agrupa por dia e pega o último snapshot de cada dia (fechamento do dia)
  const fechamentoPorDia = new Map<string, (typeof snapshots)[number]>();
  for (const s of snapshots) {
    const chave = inicioDoDia(s.dataHora).toISOString();
    fechamentoPorDia.set(chave, s); // como está em ordem asc, o último grava por cima
  }

  let faturamento = 0;
  let numAtendimentos = 0;
  let somaPaPonderada = 0;

  for (const s of fechamentoPorDia.values()) {
    faturamento += Number(s.faturamento);
    numAtendimentos += s.numAtendimentos;
    somaPaPonderada += Number(s.pa) * s.numAtendimentos;
  }

  const ticketMedio = numAtendimentos > 0 ? faturamento / numAtendimentos : 0;
  const pa = numAtendimentos > 0 ? somaPaPonderada / numAtendimentos : 0;

  return { faturamento, ticketMedio, pa, numAtendimentos };
}

async function metaDoPeriodo(vendedorId: string, tipo: TipoMeta, periodo: PeriodoMeta, referencia: Date) {
  const meta = await prisma.meta.findUnique({
    where: { vendedorId_tipo_periodo_referencia: { vendedorId, tipo, periodo, referencia } },
  });
  return meta ? Number(meta.valorMeta) : null;
}

export interface ProgressoPeriodo {
  periodo: 'DIA' | 'SEMANA' | 'MES';
  metaFaturamento: number | null;
  realizado: { faturamento: number; ticketMedio: number; pa: number; numAtendimentos: number };
  faltaParaMeta: number | null;
}

export async function getProgressoVendedor(vendedorId: string, agora: Date = new Date()): Promise<ProgressoPeriodo[]> {
  const janelas: { periodo: PeriodoMeta; desde: Date; referencia: Date }[] = [
    { periodo: 'DIA', desde: inicioDoDia(agora), referencia: inicioDoDia(agora) },
    { periodo: 'SEMANA', desde: inicioDaSemana(agora), referencia: inicioDaSemana(agora) },
    { periodo: 'MES', desde: inicioDoMes(agora), referencia: inicioDoMes(agora) },
  ];

  const resultado: ProgressoPeriodo[] = [];

  for (const janela of janelas) {
    const [realizado, metaFaturamento] = await Promise.all([
      realizadoNoPeriodo(vendedorId, janela.desde, agora),
      metaDoPeriodo(vendedorId, 'FATURAMENTO', janela.periodo, janela.referencia),
    ]);

    resultado.push({
      periodo: janela.periodo,
      metaFaturamento,
      realizado,
      faltaParaMeta: metaFaturamento !== null ? Math.max(0, metaFaturamento - realizado.faturamento) : null,
    });
  }

  return resultado;
}
