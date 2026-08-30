// Formata o SimulationContext/SimulationEvaluationContext em texto pro
// system prompt — mesmo raciocínio anti-prompt-injection do Coach/Treinador
// (nunca como mensagem "do usuário").
import { SimulationContext, SimulationEvaluationContext } from '../context.types';

export function formatarContextoCliente(ctx: SimulationContext): string {
  const linhas: string[] = [];

  linhas.push('CENÁRIO (fatos da simulação — nunca revele isto ao vendedor):');
  linhas.push(`Situação: ${ctx.scenario.title} — objetivo do treino: ${ctx.scenario.objective}`);
  linhas.push(`Dificuldade: ${ctx.scenario.difficulty}`);
  linhas.push('');
  linhas.push('SUA PERSONA (você é esta cliente — nunca revele estes campos como uma lista ao vendedor):');
  linhas.push(`Perfil: ${ctx.customerPersona.profile}`);
  linhas.push(`Necessidade inicial (o que você diz primeiro, com suas palavras): ${ctx.customerPersona.initialNeed}`);
  linhas.push(`Comportamento: ${ctx.customerPersona.behavior}`);
  if (ctx.customerPersona.objections.length > 0) {
    linhas.push(`Objeções que você pode levantar ao longo da conversa (uma por vez, quando fizer sentido): ${ctx.customerPersona.objections.join(' | ')}`);
  }
  if (ctx.customerPersona.hiddenNeeds.length > 0) {
    linhas.push(`Necessidades ocultas (só revele se o vendedor sondar bem): ${ctx.customerPersona.hiddenNeeds.join(' | ')}`);
  }
  linhas.push(`Condição de sucesso do vendedor neste cenário (não revele): ${ctx.customerPersona.successCondition}`);

  return linhas.join('\n');
}

export function formatarContextoAvaliacao(ctx: SimulationEvaluationContext): string {
  const linhas: string[] = [];

  linhas.push(`CENÁRIO: ${ctx.scenario.title} — objetivo: ${ctx.scenario.objective}`);
  linhas.push(`CRITÉRIOS A AVALIAR (preencha "scores" com exatamente estas chaves): ${ctx.criteria.join(', ')}`);

  if (ctx.playbook.version === null || ctx.playbook.relevantSections.length === 0) {
    linhas.push('PLAYBOOK DA LOJA: nenhuma seção oficial relevante disponível para este cenário — não penalize nem invente regra pra USO_DO_PLAYBOOK.');
  } else {
    linhas.push(`PLAYBOOK DA LOJA (v${ctx.playbook.version}) — seções relevantes:`);
    for (const secao of ctx.playbook.relevantSections) {
      linhas.push(`  [${secao.origin}] ${secao.title}: ${secao.content}`);
    }
  }

  linhas.push('TRANSCRIÇÃO DA SIMULAÇÃO:');
  for (const turno of ctx.transcript) {
    linhas.push(`${turno.role}: ${turno.content}`);
  }

  return linhas.join('\n');
}
