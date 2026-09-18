// Limpeza do resíduo de fixtures E2E acumulado antes da Fatia 9.7 (P1).
//
// Contexto: até a Fatia 9.6 os specs criavam vendedor/loja com sufixo aleatório
// e nunca removiam. A causa foi corrigida estruturalmente (identidade fixa +
// upsert, ver `web/e2e/fixtures.ts`), mas o lixo já criado continua no banco de
// dev deixando a Estrutura da Empresa e o ranking ilegíveis pra homologação.
//
// DISCIPLINA DE SEGURANÇA — este script:
//  - só remove o que casa com padrões INEQUÍVOCOS de fixture antiga;
//  - NUNCA toca em conta de seed (VEND001/VEND002/GER001/ADM001) nem na Loja
//    Piloto — elas são verificadas e preservadas explicitamente;
//  - roda em modo simulação por padrão; só apaga com `--confirmar`;
//  - nunca apaga em cascata: se o registro tem histórico pendurado, ele é
//    DESLIGADO (offboard) em vez de removido — sai do ranking, do sync do Mock
//    ERP e das visões de equipe, mas nenhuma linha de venda/meta/gamificação é
//    destruída.
//
// Uso:
//   npx tsx scripts/limpar-fixtures-e2e.ts             # simula, não apaga nada
//   npx tsx scripts/limpar-fixtures-e2e.ts --confirmar # apaga de verdade
import { prisma } from '../src/db';

// Padrões que SÓ fixtures antigas usavam. Conferidos contra os specs das
// Fatias 7.5E/9/9.6 antes de escrever esta lista.
// Padrões que SÓ fixtures antigas usavam, cada um conferido contra o histórico
// real do git. `V-OUTRA-` é o único sem 'E2E' no prefixo (era assim que o spec
// da 7.5E o gerava), então ele exige TAMBÉM o nome exato da fixture — sozinho
// poderia casar com uma matrícula real de ERP.
const PADROES_MATRICULA = ['MISSAO-E2E-', 'GER-E2E-', 'E2E-ATIVA'];
const FIXTURE_POR_NOME = [{ prefixoMatricula: 'V-OUTRA-', nome: 'Vendedor de Outra Loja' }];
const PADROES_CODIGO_LOJA = ['OUTRA-E2E-'];
const NOMES_LOJA_FIXTURE = ['Outra Loja E2E'];

// Nunca tocar — verificado antes e depois.
const MATRICULAS_PROTEGIDAS = ['VEND001', 'VEND002', 'GER001', 'ADM001'];
const CODIGO_LOJA_PROTEGIDA = 'LOJA001';

/**
 * Trava de ambiente: este script apaga/desliga dado em massa. Rodá-lo com o
 * `.env` de produção carregado seria catastrófico, e o prefixo protege o seed
 * mas não uma pessoa real que por acaso case com um padrão.
 */
function garantirAmbienteSeguro() {
  if (process.env.NODE_ENV === 'production') {
    console.error('🔴 ABORTADO: este script nunca roda com NODE_ENV=production.');
    process.exit(1);
  }
  // Valida o NOME DO BANCO, não só o host: um Postgres de produção na mesma VPS
  // (ou via túnel SSH) também responde em `localhost`, então host sozinho é um
  // falso-negativo perigoso.
  const url = process.env.DATABASE_URL ?? '';
  const nomeDoBanco = url.split('/').pop()?.split('?')[0] ?? '';
  const ehBancoDescartavel = /_test$/.test(nomeDoBanco) || nomeDoBanco === 'app_vendedor_sapatinho';
  const ehHostLocal = /localhost|127\.0\.0\.1/.test(url);
  if (!ehHostLocal || !ehBancoDescartavel) {
    console.error(`🔴 ABORTADO: "${nomeDoBanco}" em host não-local ou nome inesperado — este script só roda em dev/test.`);
    process.exit(1);
  }
}

async function main() {
  garantirAmbienteSeguro();
  const confirmar = process.argv.includes('--confirmar');
  console.log(confirmar ? '⚠️  MODO REAL — vai apagar\n' : '🔍 MODO SIMULAÇÃO — nada será apagado (use --confirmar)\n');

  const protegidosAntes = await prisma.vendedor.count({ where: { matriculaErp: { in: MATRICULAS_PROTEGIDAS } } });

  const vendedores = await prisma.vendedor.findMany({
    where: {
      OR: [
        ...PADROES_MATRICULA.map((p) => ({ matriculaErp: { startsWith: p } })),
        // Dupla condição: matrícula E nome precisam bater.
        ...FIXTURE_POR_NOME.map((f) => ({ matriculaErp: { startsWith: f.prefixoMatricula }, nome: f.nome })),
      ],
    },
    select: { id: true, nome: true, matriculaErp: true, status: true },
  });

  const lojas = await prisma.loja.findMany({
    where: {
      OR: [...PADROES_CODIGO_LOJA.map((p) => ({ codigoErp: { startsWith: p } })), ...NOMES_LOJA_FIXTURE.map((n) => ({ nome: n }))],
    },
    select: { id: true, nome: true, codigoErp: true },
  });

  // Trava de segurança: se algum protegido caiu no filtro, aborta tudo.
  const protegidoNoFiltro = vendedores.find((v) => MATRICULAS_PROTEGIDAS.includes(v.matriculaErp));
  if (protegidoNoFiltro) {
    console.error(`🔴 ABORTADO: conta protegida ${protegidoNoFiltro.matriculaErp} casou com o filtro.`);
    process.exit(1);
  }
  if (lojas.some((l) => l.codigoErp === CODIGO_LOJA_PROTEGIDA)) {
    console.error('🔴 ABORTADO: a Loja Piloto casou com o filtro.');
    process.exit(1);
  }

  console.log(`Vendedores de fixture encontrados: ${vendedores.length}`);
  console.log(`Lojas de fixture encontradas:      ${lojas.length}\n`);

  let removidos = 0;
  let pulados = 0;

  let desligados = 0;

  for (const v of vendedores) {
    if (!confirmar) {
      removidos++;
      continue;
    }
    try {
      // Sem cascata manual de propósito: se houver histórico pendurado, o
      // Postgres recusa o delete — e aí NÃO forçamos.
      await prisma.vendedor.delete({ where: { id: v.id } });
      removidos++;
    } catch {
      // Princípio da fatia: com histórico relacionado, prefira offboard a hard
      // delete. Desligada, a conta sai do ranking, do sync do Mock ERP e das
      // visões de equipe (todos filtram por ACTIVE), sem destruir nenhuma
      // linha de venda/meta/gamificação já registrada.
      if (v.status === 'OFFBOARDED') {
        pulados++;
        continue;
      }
      await prisma.vendedor.update({ where: { id: v.id }, data: { status: 'OFFBOARDED' } });
      desligados++;
    }
  }

  let lojasRemovidas = 0;
  let lojasPuladas = 0;
  let lojasInativadas = 0;
  for (const l of lojas) {
    const aindaTemGente = await prisma.vendedor.count({ where: { lojaId: l.id } });
    if (aindaTemGente > 0) {
      // Mesmo princípio das pessoas: com histórico pendurado, INATIVA em vez de
      // apagar. Loja inativa some do login e dos seletores de loja do Admin, e
      // sai do sync do ERP — a homologação fica legível sem destruir nada.
      lojasPuladas++;
      if (confirmar) {
        await prisma.loja.update({ where: { id: l.id }, data: { ativa: false } });
        lojasInativadas++;
      }
      continue;
    }
    if (!confirmar) {
      lojasRemovidas++;
      continue;
    }
    try {
      await prisma.loja.delete({ where: { id: l.id } });
      lojasRemovidas++;
    } catch {
      lojasPuladas++;
      console.log(`  ↷ loja pulada (tem histórico): ${l.nome}`);
    }
  }

  const protegidosDepois = await prisma.vendedor.count({ where: { matriculaErp: { in: MATRICULAS_PROTEGIDAS } } });
  if (protegidosDepois !== protegidosAntes) {
    console.error(`🔴 ALERTA: contas protegidas mudaram de ${protegidosAntes} pra ${protegidosDepois}.`);
    process.exit(1);
  }

  console.log(`\n${confirmar ? 'Removidos' : 'Seriam removidos'}: ${removidos} vendedor(es), ${lojasRemovidas} loja(s)`);
  if (desligados) console.log(`Desligados (tinham histórico — offboard em vez de delete): ${desligados} vendedor(es)`);
  if (lojasInativadas) console.log(`Lojas inativadas (tinham histórico — nunca apagadas): ${lojasInativadas}`);
  if (pulados) console.log(`Já estavam desligados: ${pulados} vendedor(es)`);
  console.log(`Contas de seed intactas: ${protegidosDepois}/${MATRICULAS_PROTEGIDAS.length}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
