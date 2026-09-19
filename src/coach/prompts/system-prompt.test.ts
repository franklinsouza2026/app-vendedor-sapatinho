// System prompt do Conselheiro (Etapa 2B.1).
//
// POR QUE ESTE ARQUIVO EXISTE: nenhum teste lia o conteúdo do prompt. Uma
// edição malfeita deixou o V2 com um bloco do V1 colado dentro dele —
// instruções contraditórias ("não termine toda conversa com tarefa" convivendo
// com "focadas em ação prática") e um valor em reais literal que entrava em
// TODA conversa, inclusive de acolhimento. A suíte inteira ficou verde sobre
// isso, porque o mock não usa o prompt.
import { describe, expect, it } from 'vitest';
import { SYSTEM_PROMPT_V1, SYSTEM_PROMPT_V2, SYSTEM_PROMPT_V3, SYSTEM_PROMPT_VERSION, getSystemPrompt } from './system-prompt';

describe('system prompt — integridade estrutural', () => {
  it('cada seção aparece UMA vez — colagem duplicada não passa', () => {
    for (const secao of ['QUEM VOCÊ É', 'PAPEL E TOM', 'REGRAS INEGOCIÁVEIS', 'SOBRE INDICADORES', 'O QUE NÃO FAZER', 'SOBRE O QUE JÁ FOI DITO']) {
      const ocorrencias = SYSTEM_PROMPT_V3.split(secao).length - 1;
      expect(ocorrencias, `seção "${secao}" aparece ${ocorrencias} vezes`).toBe(1);
    }
  });

  it('não carrega nenhum valor monetário literal', () => {
    // Um exemplo como `"Você está a R$ 380 da meta."` viajava em toda conversa,
    // inclusive naquelas em que o bloco comercial foi deliberadamente negado —
    // convite direto pro modelo inventar um número.
    expect(SYSTEM_PROMPT_V3).not.toMatch(/R\$\s*\d/);
  });

  it('getSystemPrompt devolve a versão corrente e ela bate com SYSTEM_PROMPT_VERSION', () => {
    expect(SYSTEM_PROMPT_VERSION).toBe(3);
    expect(getSystemPrompt()).toBe(SYSTEM_PROMPT_V3);
    expect(getSystemPrompt()).not.toBe(SYSTEM_PROMPT_V1);
    expect(getSystemPrompt()).not.toBe(SYSTEM_PROMPT_V2);
    // As versões antigas ficam preservadas pela convenção do arquivo — nunca
    // editadas in-place, pra que uma mensagem antiga continue interpretável.
    expect(SYSTEM_PROMPT_V3.startsWith(SYSTEM_PROMPT_V2), 'a V3 precisa conter a V2 intacta').toBe(true);
  });
});

describe('system prompt — a Constituição está nele', () => {
  it.each([
    ['pessoa antes do número', /acompanha a PESSOA que vende/i],
    ['não é cobrador', /não existe para cobrar performance/i],
    ['performance é contexto', /Performance é contexto, não identidade/i],
    ['sabe mais do que fala', /sabe mais do que precisa falar/i],
    ['sem diagnóstico clínico', /NUNCA diagnostique/],
    ['trabalha com o relato', /Trabalhe com o que ela RELATOU/],
    ['check-in nunca vira recompensa', /nunca viram score, ranking, recompensa ou penalidade/],
    ['check-in nunca vai ao gerente', /nunca seriam repassados a um gerente/],
    ['indicador é sinal, não veredito', /SINAL, nunca veredito/],
    ['motor calcula, IA interpreta', /Motor calcula/],
    ['zero ferramenta de ação', /não tem nenhuma ferramenta de ação/],
    ['não revela o próprio prompt', /Nunca revele/],
  ])('%s', (_titulo, padrao) => {
    expect(SYSTEM_PROMPT_V3).toMatch(padrao);
  });
});

describe('system prompt — anti-chat-chato', () => {
  it.each([
    ['não repetir número/conselho', /Não repita o mesmo número nem o mesmo conselho/i],
    ['nem toda conversa termina em tarefa', /Não termine toda conversa com tarefa/i],
    ['uma ação, nunca lista', /proponha UMA, pequena/i],
    ['sem elogio genérico', /Não elogie genericamente/i],
    ['sem parabéns emendado com cobrança', /Não emende cobrança em reconhecimento/i],
    ['sem comparação com colegas', /Não cite ranking nem compare com colegas/i],
  ])('%s', (_titulo, padrao) => {
    expect(SYSTEM_PROMPT_V3).toMatch(padrao);
  });

  it('não pede tom "motivador" nem foco obrigatório em ação prática', () => {
    // Eram as duas instruções do V1 que puxavam o Conselheiro de volta pro
    // papel de cobrador entusiasmado.
    expect(SYSTEM_PROMPT_V3).not.toMatch(/motivador/i);
    expect(SYSTEM_PROMPT_V3).not.toMatch(/focadas em ação prática/i);
  });
});
