// Fixtures E2E com identidade ESTÁVEL (Fatia 9.7, P1).
//
// PROBLEMA QUE ISTO RESOLVE: os specs criavam vendedor/loja com sufixo
// aleatório (`MISSAO-E2E-${randomUUID()}`) e nunca removiam. Cada execução da
// suíte deixava lixo novo no banco — o ambiente de dev acumulou 31 "Gerente
// E2E", 21 "Vendedor E2E" e 31 "Loja E2E", deixando a Estrutura da Empresa e o
// ranking ilegíveis pra homologação, e o banco de teste chegou a 35 mil
// vendedores (a ponto de estourar timeout de teste).
//
// ESTRATÉGIA: em vez de criar-e-depois-apagar (frágil: uma falha no meio do
// teste vaza o dado, e apagar Vendedor esbarra em ~20 FKs), cada fixture tem um
// ID FIXO e é obtida por UPSERT. Rodar a suíte 100 vezes reusa exatamente as
// mesmas linhas — crescimento residual passa a ser estruturalmente impossível,
// não uma questão de lembrar de limpar.
//
// Consequências boas de graça:
//  - idempotente após falha (não existe estado "meio criado" a reconciliar);
//  - specs paralelos não se atropelam (cada um tem o seu ID fixo);
//  - nenhum teste apaga dado de seed ou humano — ninguém apaga nada;
//  - a homologação vê um punhado de contas E2E nomeadas, não milhares.
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

/**
 * Marcador de fixture E2E. Deliberadamente distinto de tudo que o seed cria
 * (`VEND001`, `GER001`, `ADM001`, `LOJA001`) — serve pra identificar com
 * segurança o que é de teste e o que é dado legítimo.
 */
export const PREFIXO_E2E = 'E2E-';

export const SENHA_E2E = 'e2e-senha-123';

/** Matrículas fixas, uma por necessidade de spec. Nunca geradas aleatoriamente. */
export const MATRICULAS_E2E = {
  vendedorMissoes: `${PREFIXO_E2E}VEND-MISSOES`,
  gerenteUniversidade: `${PREFIXO_E2E}GER-UNIV`,
  vendedorOutraLoja: `${PREFIXO_E2E}VEND-OUTRA-LOJA`,
} as const;

/**
 * Código de loja auxiliar. O prefixo `ZZZ` é intencional e NÃO é enfeite: a
 * tela de login ordena lojas por nome e pré-seleciona a primeira, então uma
 * loja de teste cujo nome ordene antes de "Loja Piloto" vira a loja padrão do
 * formulário e quebra TODOS os logins da suíte (achado real da Fatia 9.6).
 */
export const LOJA_AUXILIAR_E2E = {
  nome: 'ZZZ Loja Auxiliar E2E',
  codigoErp: `${PREFIXO_E2E}LOJA-AUX`,
} as const;

/** Loja auxiliar estável (upsert por `codigoErp`, que é único por empresa). */
export async function garantirLojaAuxiliarE2E(prisma: PrismaClient, empresaId: string) {
  return prisma.loja.upsert({
    where: { empresaId_codigoErp: { empresaId, codigoErp: LOJA_AUXILIAR_E2E.codigoErp } },
    update: { ativa: true },
    create: { empresaId, nome: LOJA_AUXILIAR_E2E.nome, codigoErp: LOJA_AUXILIAR_E2E.codigoErp, ativa: true },
  });
}

/**
 * Vendedor/gerente de fixture estável. A senha é reescrita a cada upsert de
 * propósito: se um teste anterior alterou a senha (ou reemitiu o acesso, que
 * zera `senhaHash`), a conta volta a um estado conhecido em vez de quebrar a
 * suíte seguinte com um erro difícil de diagnosticar.
 */
export async function garantirPessoaE2E(
  prisma: PrismaClient,
  dados: { matriculaErp: string; nome: string; empresaId: string; lojaId: string; papel?: 'VENDEDOR' | 'GERENTE' }
) {
  const senhaHash = await bcrypt.hash(SENHA_E2E, 10);
  const base = {
    empresaId: dados.empresaId,
    lojaId: dados.lojaId,
    nome: dados.nome,
    papel: dados.papel ?? ('VENDEDOR' as const),
    senhaHash,
    status: 'ACTIVE' as const,
  };

  return prisma.vendedor.upsert({
    where: { lojaId_matriculaErp: { lojaId: dados.lojaId, matriculaErp: dados.matriculaErp } },
    update: base,
    create: { ...base, matriculaErp: dados.matriculaErp },
  });
}

/**
 * Conta quantas entidades marcadas como E2E existem. Usado pelo teste-guarda
 * que prova que rodar a suíte de novo não faz o resíduo crescer.
 */
export async function contarFixturesE2E(prisma: PrismaClient) {
  const [vendedores, lojas] = await Promise.all([
    prisma.vendedor.count({ where: { matriculaErp: { startsWith: PREFIXO_E2E } } }),
    prisma.loja.count({ where: { codigoErp: { startsWith: PREFIXO_E2E } } }),
  ]);
  return { vendedores, lojas };
}

/**
 * Remove COMPLETAMENTE uma pessoa de fixture e tudo que pende dela.
 *
 * Existe porque `prisma.vendedor.delete` sozinho falha com violação de FK
 * assim que a conta faz qualquer coisa no produto (logar já gera uso de IA,
 * missão atribuída, progresso...). A lista abaixo foi extraída do DMMF do
 * Prisma — são as 18 tabelas que referenciam `vendedorId`/`userId` — e a ordem
 * é filha→pai. Se uma tabela nova passar a referenciar Vendedor, a exclusão
 * falha alto aqui em vez de deixar lixo silencioso no banco.
 *
 * Só deve ser usada com fixtures marcadas (`PREFIXO_E2E`) — nunca com conta de
 * seed ou humana.
 */
export async function removerPessoaE2E(prisma: PrismaClient, matriculaErp: string) {
  // Trava de ambiente: esta função faz hard delete, inclusive de `auditEvent`
  // (append-only no resto do produto). O Playwright NÃO define NODE_ENV, então
  // checar só isso não protegeria nada — a barreira real é o host do banco.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('recusado: removerPessoaE2E nunca roda com NODE_ENV=production');
  }
  const url = process.env.DATABASE_URL ?? '';
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error('recusado: removerPessoaE2E só roda contra banco local');
  }
  if (!matriculaErp.startsWith(PREFIXO_E2E)) {
    throw new Error(`recusado: "${matriculaErp}" não é uma fixture E2E (precisa começar com ${PREFIXO_E2E})`);
  }

  const pessoa = await prisma.vendedor.findFirst({ where: { matriculaErp } });
  if (!pessoa) return;
  const vendedorId = pessoa.id;

  // Netos primeiro (referenciam as filhas, não o vendedor diretamente).
  await prisma.trainerMessage.deleteMany({ where: { conversation: { vendedorId } } });
  await prisma.coachMessage.deleteMany({ where: { conversation: { vendedorId } } });
  await prisma.simulationMessage.deleteMany({ where: { sessao: { vendedorId } } });
  await prisma.simulationEvaluation.deleteMany({ where: { sessao: { vendedorId } } });

  await prisma.meta.deleteMany({ where: { vendedorId } });
  await prisma.indicadorRealizado.deleteMany({ where: { vendedorId } });
  await prisma.xpTransacao.deleteMany({ where: { vendedorId } });
  await prisma.moedaTransacao.deleteMany({ where: { vendedorId } });
  await prisma.streakVendedor.deleteMany({ where: { vendedorId } });
  await prisma.badgeConcessao.deleteMany({ where: { vendedorId } });
  await prisma.rankingSnapshot.deleteMany({ where: { vendedorId } });
  await prisma.coachCheckIn.deleteMany({ where: { vendedorId } });
  await prisma.coachConversation.deleteMany({ where: { vendedorId } });
  await prisma.professionalMemory.deleteMany({ where: { vendedorId } });
  await prisma.aIUsage.deleteMany({ where: { vendedorId } });
  await prisma.trainerConversation.deleteMany({ where: { vendedorId } });
  await prisma.simulationSession.deleteMany({ where: { vendedorId } });
  await prisma.academyProgress.deleteMany({ where: { vendedorId } });
  await prisma.missionAssignment.deleteMany({ where: { vendedorId } });
  await prisma.challengeAssignment.deleteMany({ where: { vendedorId } });
  await prisma.activationToken.deleteMany({ where: { vendedorId } });
  await prisma.externalIdentity.deleteMany({ where: { vendedorId } });
  await prisma.auditEvent.deleteMany({ where: { OR: [{ actorId: vendedorId }, { targetId: vendedorId }] } });

  await prisma.vendedor.delete({ where: { id: vendedorId } });
}
