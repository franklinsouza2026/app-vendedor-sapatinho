// Check-in diário (seção 7 da fonte de verdade). Idempotente por
// [vendedorId, dia] — refazer o check-in no mesmo dia atualiza o registro do
// dia (não duplica); nunca reescreve dias anteriores.
import { MoodCheckIn } from '@prisma/client';
import { prisma } from '../db';
import { inicioDoDia } from '../services/metas.service';

export async function registrarCheckin(vendedorId: string, mood: MoodCheckIn, agora: Date = new Date()) {
  const vendedor = await prisma.vendedor.findUniqueOrThrow({ where: { id: vendedorId } });
  const dia = inicioDoDia(agora);

  return prisma.coachCheckIn.upsert({
    where: { vendedorId_dia: { vendedorId, dia } },
    create: { empresaId: vendedor.empresaId, lojaId: vendedor.lojaId, vendedorId, mood, dia },
    update: { mood },
  });
}

export async function getCheckinHoje(vendedorId: string, agora: Date = new Date()) {
  const dia = inicioDoDia(agora);
  return prisma.coachCheckIn.findUnique({ where: { vendedorId_dia: { vendedorId, dia } } });
}
