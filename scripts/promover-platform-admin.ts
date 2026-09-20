// Bootstrap da autoridade de plataforma (Etapa 2C.3B).
//
// PROMOVE UMA PESSOA QUE JÁ EXISTE. Não cria conta, não inventa identidade e
// não escolhe ninguém por conta própria — quem roda precisa dizer, de forma
// explícita, QUEM está recebendo a autoridade.
//
// POR QUE FORA DO PRODUTO: promover a plataforma não pode ser uma permissão de
// ADMIN, senão o ADMIN de uma empresa se promoveria sozinho e a separação
// GLOBAL/EMPRESA viraria decoração. Não existe rota HTTP que faça isto, de
// propósito — a operação exige acesso ao servidor, que é outro nível de
// controle.
//
// USO:
//   npm run promover:platform-admin -- --loja LOJA001 --matricula ADM001
//   npm run promover:platform-admin -- --loja LOJA001 --matricula ADM001 --revogar
//
// O que a promoção dá: governar `KnowledgeCard` GLOBAL. Nada além disso — não
// dá acesso a usuários, metas, ranking, gamificação nem, em hipótese alguma, às
// conversas privadas do Conselheiro.
import { prisma } from '../src/db';
import { registrarEventoAuditoria } from '../src/identidade/auditoria.service';

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const codigoLoja = argumento('loja');
  const matricula = argumento('matricula');
  const revogar = process.argv.includes('--revogar');

  if (!codigoLoja || !matricula) {
    console.error(
      '\nInforme QUEM recebe a autoridade — o script nunca escolhe sozinho.\n\n' +
        '  npm run promover:platform-admin -- --loja <codigoErpDaLoja> --matricula <matriculaErp>\n' +
        '  npm run promover:platform-admin -- --loja <codigoErpDaLoja> --matricula <matriculaErp> --revogar\n'
    );
    process.exitCode = 1;
    return;
  }

  const loja = await prisma.loja.findFirst({ where: { codigoErp: codigoLoja } });
  if (!loja) throw new Error(`Loja "${codigoLoja}" não encontrada.`);

  const pessoa = await prisma.vendedor.findUnique({
    where: { lojaId_matriculaErp: { lojaId: loja.id, matriculaErp: matricula } },
  });
  if (!pessoa) throw new Error(`Ninguém com matrícula "${matricula}" na loja "${codigoLoja}".`);

  // Conta bloqueada ou desligada não recebe autoridade nenhuma — o mesmo
  // princípio que `requireAuth` aplica a cada request.
  if (pessoa.status !== 'ACTIVE') {
    throw new Error(`A conta de ${pessoa.nome} está ${pessoa.status} — só conta ativa pode receber autoridade de plataforma.`);
  }

  const papelNovo = revogar ? 'ADMIN' : 'PLATFORM_ADMIN';
  if (pessoa.papel === papelNovo) {
    console.log(`\n${pessoa.nome} já está como ${papelNovo}. Nada a fazer.\n`);
    return;
  }
  if (revogar && pessoa.papel !== 'PLATFORM_ADMIN') {
    throw new Error(`${pessoa.nome} não é PLATFORM_ADMIN — nada a revogar.`);
  }

  await prisma.vendedor.update({ where: { id: pessoa.id }, data: { papel: papelNovo } });

  // Rastro no mesmo log de auditoria de todo ato administrativo. `targetId` é
  // FK para Vendedor e aqui o alvo É um vendedor, então pode ser usado.
  await registrarEventoAuditoria({
    empresaId: pessoa.empresaId,
    acao: revogar ? 'USER_RELOCATED' : 'USER_RELOCATED',
    targetId: pessoa.id,
    metadata: { tipo: 'platform_authority', de: pessoa.papel, para: papelNovo, origem: 'script-de-plataforma' },
  });

  console.log(
    `\n${pessoa.nome} (${matricula} @ ${codigoLoja}): ${pessoa.papel} → ${papelNovo}.\n` +
      (revogar
        ? 'Autoridade de plataforma revogada.\n'
        : 'Agora governa conhecimento GLOBAL. Não ganhou nenhum outro acesso — em especial, nada das conversas privadas do Conselheiro.\n')
  );
}

main()
  .catch((err) => {
    console.error(`\n${err instanceof Error ? err.message : err}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
