// Dados de DEMONSTRAÇÃO do engajamento (acesso diário) para homologação local.
//
// - Só roda contra banco em localhost/127.0.0.1 e fora de produção.
// - Grava histórico de acesso dos ÚLTIMOS dias (NUNCA hoje — o check-in de
//   hoje acontece de verdade, pelo app, para homologar a recompensa).
// - Linhas marcadas com origem = 'SEED_DEMO'; NÃO cria XP/VendaCoins
//   retroativos (histórico de acesso apenas).
// - Liga a recompensa diária da empresa (+5 XP, +2 VendaCoins) se ainda não
//   houver configuração — o Admin muda pela tela.
//
// Uso:  npx tsx scripts/seed-engajamento-demo.ts            (cria)
//       npx tsx scripts/seed-engajamento-demo.ts --limpar   (remove o SEED_DEMO)
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/db';
import { diaLocal, paraDate, somarDias } from '../src/engajamento/dia';
import { proibirEmProducao } from './guarda-banco';

proibirEmProducao('seed-engajamento-demo.ts (dados de demonstração)');

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  if (process.env.NODE_ENV === 'production' || !/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
    throw new Error('seed de demonstração só roda em banco local de desenvolvimento');
  }

  if (process.argv.includes('--limpar')) {
    const r = await prisma.acessoDiario.deleteMany({ where: { origem: 'SEED_DEMO' } });
    const e = await prisma.eventoEngajamento.deleteMany({ where: { chave: { startsWith: 'SEED_DEMO:' } } });
    console.log(`removidos ${r.count} acessos e ${e.count} eventos de demonstração`);
    return;
  }

  const empresas = await prisma.empresa.findMany({ select: { id: true, nome: true, timezone: true } });
  for (const empresa of empresas) {
    await prisma.configRecompensaAcesso.upsert({ where: { empresaId: empresa.id }, update: {}, create: { empresaId: empresa.id, ativo: true, xp: 5, moedas: 2, atualizadoPor: 'seed-engajamento-demo' } });
    const hoje = diaLocal(new Date(), empresa.timezone);
    const vendedores = await prisma.vendedor.findMany({ where: { empresaId: empresa.id, papel: 'VENDEDOR', status: 'ACTIVE' }, orderBy: { nome: 'asc' } });

    // Padrões diferentes de uso para o painel ficar legível: todos os dias,
    // dia sim/dia não, só às vezes, nunca.
    const padroes: ((i: number) => boolean)[] = [() => true, (i) => i % 2 === 1, (i) => i % 4 === 2, () => false];
    let criados = 0;
    for (const [n, v] of vendedores.entries()) {
      const usa = padroes[n % padroes.length];
      for (let i = 1; i <= 14; i++) {
        if (!usa(i)) continue;
        const dia = somarDias(hoje, -i);
        if (paraDate(dia) < new Date(v.createdAt.toISOString().slice(0, 10))) continue; // antes da admissão
        const hora = new Date(`${dia}T${String(11 + (n % 8)).padStart(2, '0')}:${String((n * 7) % 60).padStart(2, '0')}:00.000Z`);
        await prisma.acessoDiario.upsert({
          where: { vendedorId_dia: { vendedorId: v.id, dia: paraDate(dia) } },
          update: {},
          create: { id: randomUUID(), empresaId: empresa.id, lojaId: v.lojaId, vendedorId: v.id, dia: paraDate(dia), primeiroAcessoEm: hora, ultimoAcessoEm: hora, quantidadeAcessos: 1 + (i % 3), origem: 'SEED_DEMO' },
        });
        criados++;
      }
      if (n % padroes.length === 0) {
        await prisma.eventoEngajamento.createMany({
          data: [
            { empresaId: empresa.id, lojaId: v.lojaId, vendedorId: v.id, tipo: 'MISSAO_CONCLUIDA', referenciaTipo: 'SEED_DEMO', referenciaId: '1', dia: paraDate(somarDias(hoje, -1)), chave: `SEED_DEMO:${v.id}:m1` },
            { empresaId: empresa.id, lojaId: v.lojaId, vendedorId: v.id, tipo: 'AULA_CONCLUIDA', referenciaTipo: 'SEED_DEMO', referenciaId: '2', dia: paraDate(somarDias(hoje, -2)), chave: `SEED_DEMO:${v.id}:a1` },
          ],
          skipDuplicates: true,
        });
      }
    }
    console.log(`${empresa.nome}: recompensa diária configurada; ${criados} dias de acesso de demonstração para ${vendedores.length} vendedores (hoje fica livre para o check-in real).`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
