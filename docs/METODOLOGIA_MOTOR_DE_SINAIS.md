# Metodologia do Motor de Sinais Comerciais

> **Status:** metodologia da Etapa 2B.0 — **sem implementação**. Nenhum motor foi construído, nenhum schema alterado, nenhum threshold definido.
> **Baseline:** `004b126`.
> **Governado por:** [`CONSTITUICAO_DO_CONSELHEIRO_PESSOAL.md`](./CONSTITUICAO_DO_CONSELHEIRO_PESSOAL.md)

---

## 0. O que é um sinal

Um **sinal** é uma observação neutra sobre dado comercial. Ele não julga a pessoa e não conclui competência.

```
RESULTADO → SINAL → HIPÓTESE → INVESTIGAÇÃO → AÇÃO → EVIDÊNCIA → COMPETÊNCIA
            ↑                                                      ↑
       o motor produz isto                          só aqui a matriz se move
```

**Três proibições permanentes do motor:**

1. Não produz julgamento sobre a pessoa ("desmotivado", "descuidado", "resistente").
2. Não produz diagnóstico de competência. `KPI ruim ⇏ competência ruim`.
3. Não decide sozinho o que é dito. Produzir um sinal e mencioná-lo são decisões separadas (Constituição §8).

**Um sinal carrega sua própria incerteza.** Um sinal que não sabe o quanto é confiável é indistinguível de um palpite.

---

## 1. Antes de qualquer matriz: o estado real do dado

Esta seção precede as matrizes porque **muda o que elas significam**. Tudo abaixo foi verificado no código, não presumido.

### 1.1 O ERP é mock determinístico — nenhum indicador comercial é real

`ERP_MODE=mock` é o default e o valor em uso (`src/config.ts:24`). O adapter Linx (`src/integracoes/erp/linx/linx-client.ts:4-12`) é declaradamente não validado: endpoint presumido, `TODO` de mapeamento de campos, sem credenciais reais.

O mock (`mock-adapter.ts`) é determinístico por `(vendedor, dia)` e monotônico ao longo das 24h — bom para teste, mas **não simula devolução nem cancelamento** (`:24-25`).

**Consequência para esta metodologia:** toda calibração de intensidade e confiança feita contra o mock é calibração contra uma distribuição inventada. Os thresholds só podem ser fixados com dado real do Linx. Isto é um **gate**, não um detalhe.

### 1.2 `numAtendimentos` não é atendimento — é venda fechada

O campo vem do ERP (`erp-adapter.interface.ts:6`), e no mock `faturamento = ticketMedio × numAtendimentos` (`mock-adapter.ts:67`). O próprio motor de alertas usa `numAtendimentos > 0` como prova de que **houve venda** (`attention-engine.service.ts:56-58`, alerta `NO_SALES_RECENTLY`).

Portanto, hoje:

| Nome exibido | O que de fato é calculado |
|---|---|
| PA — "peças por atendimento" | peças por **venda** |
| Ticket médio | faturamento por **venda** |

**Isto tem três consequências pesadas:**

1. **Conversão é estruturalmente impossível** com o contrato atual — falta o denominador (clientes atendidos). Não é uma questão de implementar; é ausência de dado.
2. **O atendimento que não virou venda é invisível.** O vendedor que atende vinte clientes e fecha dois tem o mesmo PA de quem atendeu dois e fechou dois. O sinal de PA **não consegue distinguir** dificuldade de abordagem de dificuldade de composição — e essa é exatamente a distinção que um conselheiro precisaria fazer.
3. **O nome mente para o vendedor.** Se o Conselheiro disser "seu PA caiu", o vendedor entende "peças por atendimento" e pode buscar a causa no lugar errado.

> **DECISÃO HUMANA #1 — O Linx entrega atendimentos (clientes atendidos), separado de vendas?**
> Se sim: PA e ticket ganham o significado que o nome promete, e conversão passa a existir.
> Se não: PA e ticket devem ser renomeados na experiência do vendedor para o que realmente são, e conversão fica permanentemente fora.
> **Esta é a pergunta mais importante de toda a Etapa 2B.**

### 1.3 Falta de meta pune no ranking

Quase todo motor trata "sem meta cadastrada" como **neutro**: gamificação não avalia (`motor.service.ts:59-61`), streak não conta nem quebra (`streak.service.ts:56-58`), alerta pula o vendedor (`attention-engine.service.ts:96`), visão de equipe devolve `null`.

Uma exceção: **o Score Geral e o ranking `PERCENTUAL_META` tratam como zero** (`ranking.service.ts:67` + `score.ts:68`). Como meta pesa 40% do Score Geral, um vendedor **sem meta cadastrada leva 0 em 40% da nota** e afunda no ranking — sem sequer ser marcado `provisorio`.

Isso contradiz a doutrina "nunca punir por falta de dado" que o resto do produto segue. **Um motor de sinais que leia Score Geral herdaria essa punição.**

> **DECISÃO HUMANA #2 — falta de meta deve ser neutra também no Score Geral/ranking?**
> (Correção fora do escopo da 2B.0 — registrada aqui porque contamina qualquer sinal derivado de score.)

### 1.4 Duas fórmulas para a mesma métrica

| Caminho | Fórmula | Onde |
|---|---|---|
| Realizado | média **ponderada por vendas**, recalculada de `faturamento/numAtendimentos` | `metas.service.ts:57-58` |
| Baseline | média **aritmética simples** das colunas cruas `pa`/`ticketMedio` do ERP | `baseline.service.ts:46-48` |

O `deltaPercentual` — base de quase todo sinal — **compara os dois caminhos**. Eles só coincidem se o ERP for internamente coerente (no mock é, por construção; com dado real, não há garantia).

> **DECISÃO HUMANA #3 — unificar a fórmula antes de derivar sinal de delta.**

### 1.5 O sistema não sabe o que é folga

Não existe escala, expediente, feriado ou férias em lugar nenhum do schema (confirmado por varredura). O próprio código admite (`streak.service.ts:4-7`; `web/src/utils/calculo.ts:11-16`).

Efeito prático: **um dia de folga com meta cadastrada quebra o streak.** E dia sem meta é neutro por acidente, não por desenho.

Qualquer sinal de consistência herda isso. **Um conselheiro que parabeniza ou cobra consistência sem saber quem estava de folga erra de um jeito que a pessoa percebe imediatamente** — e a partir daí não confia mais no sistema.

> **DECISÃO HUMANA #4 — o Linx (ou outra fonte) entrega escala/jornada?** Sem isso, sinais de consistência carregam confiança reduzida por natureza.

### 1.6 Não existe tendência

Toda comparação é **pontual**: hoje contra a média dos últimos 14 dias. Não há série temporal, inclinação, média móvel nem detecção de "melhorando/piorando".

As duas únicas comparações de duas janelas são `CONSISTENCY_DROP` (14d vs. 14d, só consistência) e `PERSONAL_IMPROVEMENT` de competição (dois pontos de Score Geral).

**Consequência direta:** o produto **não consegue hoje perceber "abaixo da meta, mas melhorando"** — que a Constituição (§10) define como um dos sinais mais valiosos a celebrar. Essa capacidade precisa ser construída; não é reaproveitamento.

### 1.7 Não existe recorde pessoal

O único máximo histórico armazenado é `StreakVendedor.maiorStreak`. Não há recorde de faturamento-dia, de PA, de ticket, nem "melhor dia".

### 1.8 Sinais positivos existem — mas são do gerente

`src/manager/positive-signals.service.ts` detecta 9 tipos de coisa boa (meta batida, badge, certificação, missão, PDI, trilha, melhora de PA/ticket vs. baseline, streak ≥3). **Escopo: a loja inteira, para o gerente.**

O Conselheiro **não consome nada disso**. Existe motor de celebração no produto; ele simplesmente não está ligado à pessoa celebrada.

Essa é a melhor notícia desta auditoria: o P5 da Constituição ("celebrar é de primeira classe") **não precisa de motor novo — precisa de ligação**.

---

## 2. Anatomia de um sinal

Proposta conceitual, **não schema fechado**:

```
{
  tipo:            identificador estável (ex.: PA_ABAIXO_BASELINE_PESSOAL)
  polaridade:      POSITIVO | NEUTRO | ATENCAO
  intensidade:     quão distante do esperado           → DECISÃO HUMANA (faixas)
  confianca:       quão confiável é a observação       → derivada, ver §3
  contexto:        período, fonte, amostra, frescor do sync
  possiveisHipoteses: [hipóteses NÃO exclusivas, nunca causa única]
  conclusoesProibidas: [o que este sinal jamais permite afirmar]
  podeSerMencionado:  decisão de pertinência           → ver §5
  validade:        até quando o sinal faz sentido
  evidenceNeeded:  o que confirmaria/refutaria a hipótese
}
```

**Campos que merecem destaque:**

- **`polaridade` antes de tudo.** O motor avalia positivos **primeiro** (Constituição §10). Um motor que começa pelo problema encontra problema.
- **`conclusoesProibidas` viaja junto com o sinal.** Não é documentação — é carga útil. Impede que um consumidor futuro (ou um prompt) use o sinal além do que ele suporta.
- **`possiveisHipoteses` no plural, sempre.** Um sinal com hipótese única já é diagnóstico disfarçado.
- **`confianca` derivada, nunca inventada** (§3).
- **`podeSerMencionado` não pertence ao motor de sinais** — é do motor de pertinência. Fica aqui apenas como ponto de acoplamento.

---

## 3. Confiança — derivada, não arbitrada

A confiança de um sinal cai quando:

| Fator | Verificável hoje? |
|---|---|
| Amostra do baseline insuficiente (<5 dias) | Sim — `baseline.service.ts:10`, `amostraSuficiente` |
| Baseline ausente | Sim — devolve `null` |
| `numAtendimentos = 0` no período (PA/ticket viram 0, não `null`) | Sim — checagem já feita manualmente em 2 lugares |
| Sync antigo ou ausente | Sim — `ultimaSincronizacao()` |
| Período curto demais | Sim |
| **Fonte é mock, não ERP real** | Sim — `ERP_MODE` |
| Possível folga/escala no período | **Não** — ver §1.5 |
| Devolução/cancelamento no período | **Não** — mock não simula; ERP real pode |

**Regra:** sinal abaixo do limiar de confiança **existe, mas nasce silencioso**. Não é descartado — apenas não é mencionável até ganhar sustentação. Isso preserva a distinção entre *"não sei"* e *"não é nada"*, que é o que separa honestidade de omissão.

> **DECISÃO HUMANA #5 — as faixas de confiança e o corte de mencionabilidade.**

---

## 4. Classes de evidência

A Etapa 2A estabeleceu que competência se move por evidência. Esta é a classificação proposta — **sem pesos**, que são decisão humana da 2B.1+.

| Classe | Exemplo | O que mede | Força esperada |
|---|---|---|---|
| **A. Direta** | Simulador avaliando quebra de objeção | Habilidade em execução | Potencialmente alta |
| **B. Conhecimento** | Quiz sobre fechamento | Sabe a teoria | Média |
| **C. Comportamental de desenvolvimento** | Conclusão consistente de atividades | Compromisso com evolução | Baixa/média |
| **D. KPI comercial** | Meta, PA, ticket, consistência | **Resultado**, não habilidade | **Sinal contextual — não é evidência** |

**A distinção que sustenta todo o resto:** A/B/C medem **habilidade**; D mede **resultado**. Resultado é habilidade + mix + fluxo + sazonalidade + escala + sorte.

Nesta metodologia, **KPI é principalmente sinal contextual**. Não recebe peso, não entra em `CompetencyEvidence`, não altera score de competência. A fórmula existente permanece intocada.

> **DECISÃO HUMANA #6 — KPI algum dia vira evidência de classe própria, com peso menor?**
> A posição desta metodologia é **não**: o caminho correto é KPI → sinal → investigação → atividade → evidência A/B/C. Mas a decisão é do proprietário.

---

## 5. Pertinência — quando o sinal vira fala

Detalhado na Constituição §8. Resumo operacional:

Um sinal só é mencionável se: **(1)** é relevante ao que o vendedor trouxe · **(2)** o estado comportamental permite (ACOLHER cala performance) · **(3)** passou do cooldown desde a última menção · **(4)** tem confiança suficiente · **(5)** não há positivo que deva vir antes · **(6)** ajuda a pessoa, em vez de demonstrar vigilância.

**Teto rígido: um sinal de atenção por conversa.**

---

## 6. Matrizes por indicador

Nas matrizes, **⚠️ DECISÃO HUMANA** marca todo ponto onde um número precisaria ser arbitrado. Nenhum foi arbitrado aqui.

---

### 6.1 META — atingimento

| | |
|---|---|
| **Definição atual** | `realizado.faturamento / valorMeta × 100`, por DIA/SEMANA/MÊS |
| **Fonte** | `Meta` (cadastro humano) + `IndicadorRealizado` (ERP) |
| **Granularidade** | Metas de dia, semana e mês são **cadastradas separadamente** — a do mês não é a soma das diárias |
| **Confiabilidade** | **Alta quando existe.** É o indicador mais direto. Ressalvas: só `TipoMeta.FATURAMENTO` é lido por algum motor (metas de PA e ticket são cadastráveis e **nunca consumidas**); sem meta, o ranking pune (§1.3) |
| **Baseline** | Não se aplica — meta é alvo absoluto, definido por humano |

**O que sabemos objetivamente:** quanto foi vendido e qual era o alvo, no período.

**O que pode indicar:** ritmo do dia; alvo mal calibrado; período atípico.

**O que NÃO permite concluir:** que a pessoa se esforçou mais ou menos; que tem ou não competência; que a meta era justa. **Meta é decisão de gestão, não medida de mérito.**

**Fatores externos:** fluxo de loja, ruptura de estoque, escala/folga, clima, data comercial, campanha, mix disponível, tamanho da loja, meta calibrada para outro cenário.

**Quando merece atenção:** quando o vendedor pergunta sobre resultado; quando há gap consistente ao longo de vários períodos (não um dia); quando a meta está próxima e um empurrão é útil.

**Quando permanece em silêncio:** estado ACOLHER; **um único dia ruim** (ruído, não sinal); meta inexistente; sync velho; já mencionado sem mudança.

**Perguntas possíveis:** *"Como foi o movimento hoje?"* · *"Teve alguma coisa fora do normal?"* · *"O que costuma funcionar pra você quando o dia começa devagar?"*

**Ações possíveis:** nenhuma (contexto do dia); revisitar o foco do dia; levar ao gerente se a meta parece descalibrada — **isso é conversa de gestão, e o Conselheiro deve dizer isso em vez de tratar como falha pessoal**.

**Módulos relacionados:** Performance, Missões (`DAILY_GOAL`), Reunião do Dia (via gerente).

**Evidência confirmatória:** nenhuma. Meta não confirma nem refuta competência — só abre conversa.

**Celebração:** meta batida (já detectada: `GOAL_REACHED`, tiers 100/110/120/150); **primeira meta batida depois de uma sequência ruim** — potencialmente o momento mais importante do produto, e hoje não detectado.

**Riscos:** é o KPI mais fácil de transformar em cobrança diária. Mencionar meta todo dia é o caminho mais curto para o vendedor parar de abrir o app.

⚠️ **DECISÃO HUMANA:** quantos períodos de gap antes de virar sinal? A que distância da meta um "empurrão" é bem-vindo em vez de pressão?

---

### 6.2 PA (peças por venda — ver §1.2)

| | |
|---|---|
| **Definição atual** | Média ponderada por vendas: `Σ(pa_dia × vendas_dia) / Σ vendas` |
| **Fonte** | Coluna `pa` do ERP (e recálculo divergente no baseline — §1.4) |
| **Confiabilidade** | **Média, com ressalva semântica grave.** O denominador é venda, não atendimento (§1.2) |
| **Baseline** | Sim — `PA`, 14 dias, amostra mínima 5 |

**O que sabemos objetivamente:** quantas peças, em média, saíram por venda fechada, comparado à própria média recente.

**O que pode indicar:** oportunidade em venda complementar/composição; mudança de mix; perfil de cliente diferente.

**O que NÃO permite concluir:**
- Que o vendedor não sabe fazer venda complementar (**competência exige evidência — classe A/B/C**).
- Que ele não tentou.
- **Nada sobre abordagem ou conversão** — o atendimento sem venda é invisível neste número (§1.2).

**Fatores externos:** mix e ruptura de estoque, sazonalidade (sandália ≠ bota), tíquete alto de peça única (PA baixo com ticket alto pode ser **ótimo**), campanha promocional, perfil de cliente do dia.

**Quando merece atenção:** queda sustentada vs. o próprio baseline, com amostra suficiente; **e quando o vendedor pergunta por que está vendendo menos**.

**Quando permanece em silêncio:** ACOLHER; amostra insuficiente; `numAtendimentos = 0` (PA vira 0 e parece queda drástica — falso); ticket subindo junto (pode ser troca de mix, não piora); já mencionado sem mudança.

**Perguntas possíveis:** *"Você tem conseguido oferecer uma segunda peça?"* · *"O que costuma acontecer quando você tenta?"* · *"Tem faltado alguma coisa na loja pra compor?"*

**Ações possíveis:** aula de venda complementar (Academia); Simulador de composição; Treinador para uma pergunta de oferta; missão `PA_IMPROVEMENT`.

**Módulos relacionados:** Academia (`VC_AUMENTAR_PA`), Simulador, Treinador, Universidade (competência `VENDA_COMPLEMENTAR`).

**Evidência confirmatória:** simulação avaliada em composição (classe A); quiz de venda complementar (B); observação do gerente (A). **Só isso move a competência — nunca o PA.**

**Celebração:** melhora vs. baseline (já detectada para o gerente, `positive-signals.service.ts:62-83`); recuperação após queda; primeira aplicação relatada de algo treinado.

**Riscos:** é o KPI mais fácil de confundir com competência — o nome "PA" já soa como habilidade. E o significado real do número não é o que o nome diz.

⚠️ **DECISÃO HUMANA:** quantos dias de queda? Qual desvio? (Existe `LIMIAR_MELHORA_PCT = 5` na gamificação e `−15%` nos alertas — **não presumir que servem aqui**; foram calibrados para conceder recompensa e para alertar gerente, não para conversar com pessoa.)

---

### 6.3 TICKET MÉDIO (por venda — ver §1.2)

| | |
|---|---|
| **Definição atual** | `faturamento / numAtendimentos` no período |
| **Fonte** | ERP (com a mesma divergência de fórmula do §1.4) |
| **Confiabilidade** | **Média.** Fortemente determinado por mix de produto, que o vendedor controla só em parte |
| **Baseline** | Sim — `TICKET_MEDIO`, 14 dias, amostra mínima 5 |

**O que sabemos objetivamente:** valor médio por venda vs. a própria média recente.

**O que pode indicar:** oportunidade em agregar valor, demonstrar benefício, apresentar linha superior; ou simplesmente mix diferente.

**O que NÃO permite concluir:** que o vendedor "não sabe vender caro"; que empurrar produto caro é o certo — **ticket alto por venda inadequada é péssimo negócio e o número não distingue**.

**Fatores externos:** mix e curva de preço disponível, ruptura na faixa alta, promoção/desconto, perfil econômico do cliente, sazonalidade, política de preço.

**Quando merece atenção:** queda sustentada vs. baseline com amostra suficiente; quando o vendedor pergunta sobre faturamento.

**Quando permanece em silêncio:** ACOLHER; amostra insuficiente; `numAtendimentos = 0`; **PA subindo junto** (vender mais peças baratas pode ser exatamente o certo); já mencionado.

**Perguntas possíveis:** *"Você tem conseguido mostrar as opções acima antes de fechar?"* · *"Como o cliente costuma reagir quando você apresenta?"* · *"A loja está com a linha completa?"*

**Ações possíveis:** aula de argumentação/valor; Simulador de demonstração; missão `TICKET_IMPROVEMENT`.

**Módulos relacionados:** Academia (`VC_DEMONSTRAR_VALOR`), Simulador, Universidade (`ARGUMENTACAO`).

**Evidência confirmatória:** simulação avaliada em argumentação (A); quiz (B); observação do gerente (A).

**Celebração:** melhora vs. baseline (já detectada para o gerente); ticket e PA subindo juntos — **sinal genuinamente forte**, hoje não detectado.

**Riscos:** virar incentivo a empurrar produto caro. **Ticket nunca deve ser tratado como meta pessoal implícita.**

⚠️ **DECISÃO HUMANA:** desvio e duração; se ticket e PA devem ser avaliados **em conjunto** (recomendado: sim — isoladamente, um compensa o outro e ambos enganam).

---

### 6.4 CONSISTÊNCIA (streak / % de dias com meta batida)

| | |
|---|---|
| **Definição atual** | `StreakVendedor.streakAtual` (dias consecutivos batendo meta diária) e `%` de checagens positivas em 14 dias |
| **Fonte** | `StreakChecagem`, gravada no fechamento do dia (00:10), sempre sobre **ontem** |
| **Confiabilidade** | **Média-baixa hoje** — depende de meta cadastrada e **não conhece folga** (§1.5) |
| **Baseline** | Não se aplica; é contagem |

**O que sabemos objetivamente:** em quantos dias fechados com meta cadastrada o vendedor atingiu 100%.

**O que pode indicar:** regularidade; disciplina; ou apenas meta bem/mal calibrada.

**O que NÃO permite concluir:**
- Que a pessoa é "inconsistente" — **isto é julgamento de caráter e está proibido** (Constituição §13).
- Que faltou esforço: **um dia de folga com meta cadastrada quebra o streak** e o sistema não sabe.
- Que houve piora: mudança de meta altera o streak sem nada ter mudado no comportamento.

**Fatores externos:** escala e folga (invisíveis), férias, atestado, recalibração de meta, sazonalidade, mudança de loja.

**Quando merece atenção:** queda sustentada de consistência com amostra suficiente em ambas as janelas; e, principalmente, **quando é positiva** (ver celebração).

**Quando permanece em silêncio:** ACOLHER; **sempre que houver suspeita de folga no período** — e como o sistema não sabe distinguir, isso significa **confiança estruturalmente reduzida para todo sinal negativo de consistência**; poucas checagens no período.

**Perguntas possíveis:** *"Como têm sido suas semanas?"* · *"Teve algum dia fora da rotina?"* (— e **ouvir a resposta**: é ela que traz o dado de escala que o sistema não tem).

**Ações possíveis:** trabalhar rotina e preparação (desenvolvimento pessoal); missão `STREAK_3`. Quase nunca "estude mais".

**Módulos relacionados:** Gamificação (streak, badge `STREAK_7`), Missões, futura biblioteca de hábitos/disciplina.

**Evidência confirmatória:** nenhuma evidência de competência. Consistência é comportamento, não habilidade.

**Celebração:** **este é o KPI mais celebrável do produto.** Streak em andamento, recorde pessoal de streak (`maiorStreak` já existe), retomada após quebra, consistência alta mesmo sem bater meta todo dia.

**Riscos:** streak é a mecânica que mais facilmente vira **ansiedade**. Uma sequência longa cria medo de perder. Se um streak se quebra, o Conselheiro **não deve lamentar** — no máximo reconhecer o que foi construído. E nunca cobrar retomada.

⚠️ **DECISÃO HUMANA:** o que fazer com folga enquanto não houver escala? Opções: (a) confiança sempre reduzida em sinal negativo de consistência; (b) só usar consistência para celebrar, nunca para apontar — **esta metodologia recomenda (b) até existir escala**.

---

### 6.5 CONVERSÃO — **fora da V1**

**Não existe dado.** Verificado: nenhum model, campo, enum ou mapeamento de visitante, tráfego, atendimento-sem-venda ou taxa — nem no schema, nem nos services, nem no adapter Linx, nem no mock. A interface do ERP tem exatamente 5 campos: `matriculaErp, faturamento, ticketMedio, pa, numAtendimentos`.

A única menção no repositório é aspiracional, na Fonte de Verdade (`:327`): *"conversão apenas quando a fonte fornecer denominador confiável"* — condição que **nunca foi satisfeita**.

Pior: `numAtendimentos` **é** o número de vendas (§1.2), então o denominador de conversão não existe nem por aproximação.

**Decisão: CONVERSÃO NÃO ENTRA NA V1.** Revisitar apenas se a **Decisão Humana #1** confirmar que o Linx entrega clientes atendidos.

Registro de por que isso importa: conversão é, conceitualmente, o indicador **mais próximo de habilidade de atendimento** entre todos os KPIs — o que mais mereceria virar sinal. É justamente o que não temos.

---

## 7. Baseline pessoal vs. meta absoluta

### Quatro réguas diferentes

| Régua | Existe hoje? | O que mede | Risco |
|---|---|---|---|
| **Meta da empresa** | Sim | Alvo definido por gestão | Diz mais sobre calibração que sobre a pessoa |
| **Média da loja** | **Não** — existe agregado da loja, nunca comparado ao vendedor | Contexto coletivo | Comparação não pedida vira pressão |
| **Média da rede** | **Não** como comparativo (só ranking absoluto) | Posição relativa | Compara lojas de portes diferentes sem normalizar |
| **Baseline pessoal** | Sim — 14 dias, amostra ≥5, para PA/ticket/faturamento | A pessoa contra ela mesma | Amostra curta engana |
| **Tendência pessoal** | **NÃO EXISTE** | Direção do movimento | — |
| **Evolução pessoal** | Parcial (só dentro de competição) | Progresso ao longo do tempo | — |

### A régua que o Conselheiro deve usar

**Baseline e evolução pessoais.** Isto não é preferência: é o **princípio inegociável 8** da Fonte de Verdade — *"o vendedor deve competir principalmente contra a própria evolução; rankings absolutos são complementares."*

### Separar RESULTADO ABSOLUTO de EVOLUÇÃO

São duas leituras independentes do mesmo período:

|  | Evoluindo | Estável/caindo |
|---|---|---|
| **Acima da meta** | Celebrar sem ressalva | Cuidado: **regressão técnica com resultado bom** — ver §8, caso H |
| **Abaixo da meta** | **Celebrar a evolução.** É o quadrante mais importante do produto | Aqui, e só aqui, um sinal de atenção se justifica |

**O quadrante inferior-esquerdo é a razão desta seção existir.** Um vendedor abaixo da meta que melhorou três semanas seguidas está fazendo exatamente o que se pede dele. Um sistema que só olha resultado absoluto **o trata como problema** — e o ensina que esforço não conta.

**Isto não é implementável hoje:** exige tendência (§1.6), que não existe. É a capacidade mais valiosa que falta, e a que mais justifica a Etapa 2B.1.

⚠️ **DECISÃO HUMANA:** o que caracteriza "melhorando" — quantos períodos, qual inclinação, sobre qual janela?

---

## 8. Catálogo de sinais positivos

Cumprindo o P5 da Constituição: **o motor avalia positivos primeiro.**

### Já detectados (para o gerente) — precisam apenas ser ligados ao vendedor

Todos em `src/manager/positive-signals.service.ts`:

| Sinal | Origem |
|---|---|
| Meta alcançada | `FeedEvent GOAL_REACHED` |
| Badge conquistado | `BADGE_EARNED` |
| Certificação emitida | `CERTIFICATION_ISSUED` |
| Missão concluída | `MISSION_COMPLETED` |
| PDI concluído | `PDI_COMPLETED` |
| Trilha concluída | `TRACK_COMPLETED` |
| Melhora de PA vs. baseline | `deltaPercentual` + amostra ≥5 |
| Melhora de ticket vs. baseline | idem |
| Streak em destaque | `streakAtual ≥ 3` |

**Nenhum motor novo é necessário para estes nove.** É ligação, não construção — o mesmo padrão da Etapa 2A.

### Não detectados hoje — precisam ser construídos

| Sinal | Por que falta | Depende de |
|---|---|---|
| **Abaixo da meta, mas melhorando** | Não há tendência | §1.6 |
| **Recuperação após período difícil** | Não há série temporal | §1.6 |
| **Recorde pessoal** (faturamento-dia, PA, ticket) | Só `maiorStreak` existe | Histórico de máximos |
| **PA e ticket subindo juntos** | Sinais avaliados isoladamente | Avaliação combinada |
| **Competência que subiu** | A matriz existe; ninguém observa a variação | Comparar matriz no tempo |
| **Nota de simulação melhor que a anterior** | Não comparado | Histórico de sessões |
| **Primeira meta após sequência ruim** | Não detectado | Tendência |
| **Consistência alta sem bater meta todo dia** | Não expresso | Leitura própria |

**"Como fazer o sistema perceber algo bom antes de procurar algo ruim?"** — a resposta metodológica é em três camadas:

1. **Ordem de avaliação:** positivos primeiro, sempre, na arquitetura do motor.
2. **Precedência na pertinência:** havendo positivo e negativo elegíveis, o positivo passa (Constituição §8, critério 5).
3. **Assimetria deliberada de threshold:** o corte para celebrar deve ser **mais permissivo** que o corte para apontar. Não por otimismo — porque o custo do erro é assimétrico: celebrar sem motivo é levemente constrangedor; cobrar sem motivo destrói a confiança na ferramenta.

⚠️ **DECISÃO HUMANA:** a assimetria é aceita? Qual a distância entre os dois cortes?

---

## 9. Anti-repetição

**Não existe nenhuma estrutura hoje** que registre o que já foi dito ao vendedor. A memória do Conselheiro é uma janela de 16 mensagens (`AI_CONVERSATION_WINDOW`) dentro de uma conversa que permanece `ABERTA` indefinidamente. Repetir "seu PA está baixo" todo dia é, hoje, o comportamento **esperado** do sistema.

O que precisaria ser registrado (**sem criar model nesta etapa**):

| Pergunta | Por quê |
|---|---|
| Sinal já mencionado? | Base do cooldown |
| Quando? | Define a janela |
| O vendedor respondeu? | Silêncio ≠ concordância |
| Foi sugerida ação? | |
| A ação foi executada? | **Verificável** — a evidência já existe (aula, simulação, quiz) |
| Houve mudança no indicador? | Justifica reabrir |
| Vale mencionar de novo? | Decisão final |

**Regras propostas:**

1. **Cooldown por tipo de sinal**, não global.
2. **Ação executada reabre o assunto** — mas como **celebração ou retorno**, nunca como cobrança: *"você fez a simulação de objeções — como foi?"*
3. **Sugestão recusada não é repetida.** Recusa é informação legítima, não obstáculo. Repetir depois de "não" transforma conselho em insistência.
4. **Sinal que não mudou não vira novidade.** Se nada mudou desde a última menção, o silêncio é a resposta correta.
5. **Sem mudança e sem ação após N menções: parar.** Ou a hipótese está errada, ou não é o momento da pessoa. Insistir é o que produz o chat chato.

⚠️ **DECISÃO HUMANA:** duração do cooldown por sinal; quantas menções antes de desistir.

---

## 10. Check-in e pertinência

**Estado atual, verificado:** `CoachCheckIn` existe (`prisma/schema.prisma:407-421`), aceita quatro valores (`VERY_GOOD | GOOD | NEUTRAL | NOT_GOOD`), é idempotente por dia e é lido **apenas** por `GET /coach/check-in/hoje` para a tela.

**Ele não entra no contexto do Conselheiro.** Não há campo de check-in em `CoachContext` (`src/coach/context.types.ts`), e `context-builder.service.ts` não o consulta.

> **Correção de premissa:** a Etapa 2A conectou os **gaps de competência** ao contexto — não o check-in. O Conselheiro hoje sabe quanto falta para a meta e **não sabe** que a pessoa declarou estar mal.

### Como o check-in deve influenciar pertinência

**Não é diagnóstico.** É um relato datado, voluntário, de quatro valores — e deve ser tratado como preferência de condução da conversa, nunca como estado psicológico.

| Check-in | Inclinação de estado | Performance |
|---|---|---|
| `NOT_GOOD` | **ACOLHER** primeiro | Silenciosa por padrão |
| `NEUTRAL` | Segue o que o vendedor trouxer | Normal |
| `GOOD` | Espaço para DESENVOLVER / TREINAR | Normal |
| `VERY_GOOD` + meta próxima | **AGIR / desafiar** cabe naturalmente | Bem-vinda |

**Três garantias inegociáveis:**

1. **Inclinação, não regra.** Check-in ruim não proíbe falar de performance se o vendedor perguntar diretamente. O que a pessoa pede vence o que o sistema inferiu.
2. **Não vira score, ranking, recompensa, penalidade nem dado de gerente** (Constituição §12). Já afirmado no system prompt (`system-prompt.ts:22`) — mas precisa ser garantia estrutural, não instrução de prompt.
3. **Não vira traço.** Três check-ins `NOT_GOOD` seguidos **não** autorizam nenhuma conclusão sobre a pessoa. Podem, no máximo, tornar o acolhimento mais natural — jamais virar observação sobre padrão emocional.

⚠️ **DECISÃO HUMANA:** o check-in deve influenciar a conversa do dia inteiro, ou só a primeira conversa após o registro?

---

## 11. Exemplos metodológicos de conversa

**Não são prompts.** São casos de calibração: mostram o que o sistema sabe, o que escolhe dizer, o que escolhe calar, e por quê. Servem para validar a metodologia com o proprietário antes de virar código — e depois, como base de teste.

Formato: **SABE** · **DIZ** · **CALA** · **ESTADO** · **POR QUÊ**.

---

### A) Vendedor desanimado + KPI ruim

**SABE:** PA e meta abaixo; check-in `NOT_GOOD`. Vendedor: *"hoje tá difícil, não consigo emplacar nada"*.
**DIZ:** acolhe. Pergunta como foi o dia, se quer falar sobre isso.
**CALA:** PA, meta, gap, gamificação — **tudo**.
**ESTADO:** ACOLHER.
**POR QUÊ:** este é o caso que define o produto. Responder com número aqui ensina a pessoa que desabafar tem custo — e ela nunca mais abre o app num dia ruim. O sinal continua ativo; só não é a hora.

---

### B) Vendedor animado + KPI ruim

**SABE:** o mesmo KPI ruim; check-in `VERY_GOOD`. Vendedor: *"hoje tô com tudo!"*
**DIZ:** acompanha a energia. Pode perguntar o que ele quer fazer com o dia. Se ele abrir espaço, **um** ponto: *"quer um foco pro dia? uma coisa que dá pra mexer é a segunda peça"*.
**CALA:** o gap acumulado, o histórico ruim, a comparação.
**ESTADO:** AGIR.
**POR QUÊ:** energia alta é a janela em que desafio funciona. Mas trazer o passado ruim agora **apaga a energia** — o único capital disponível. Um ponto, à frente, não atrás.

---

### C) Vendedor pergunta diretamente por performance

**SABE:** PA abaixo do baseline, ticket estável, meta a 68%.
**DIZ:** o número e a **hipótese, como hipótese**: *"o que mudou foi a média de peças por venda. Pode ser composição, pode ser o tipo de cliente da semana. Você sentiu diferença em alguma coisa?"*
**CALA:** julgamento; comparação com colegas; lista de tudo que está abaixo.
**ESTADO:** REFLETIR.
**POR QUÊ:** ele perguntou — performance é o assunto. Mas KPI é sinal, não veredito (§0): a resposta **termina em pergunta**, porque a causa está com ele, não no dado.

---

### D) Vendedor quer apenas conversar

**SABE:** tudo. Vendedor: *"e aí, tudo certo?"*
**DIZ:** conversa. Sem pauta.
**CALA:** tudo, até ele trazer algo.
**ESTADO:** ACOLHER / REFLETIR.
**POR QUÊ:** um sistema que responde "tudo certo?" com um relatório é o sistema que ninguém abre duas vezes.

---

### E) Vendedor evoluiu numa competência

**SABE:** score de `QUEBRA_DE_OBJECOES` subiu por evidência real (simulação + quiz).
**DIZ:** reconhece com o fato: *"sua nota em objeções subiu — a simulação da semana passada puxou. Deu pra sentir na loja?"*
**CALA:** as outras competências ainda baixas.
**ESTADO:** CELEBRAR.
**POR QUÊ:** celebração ancorada em evidência, não elogio genérico. E **não emenda cobrança** — *"parabéns, mas seu PA…"* anula as duas metades (Constituição §10).

---

### F) Vendedor bateu recorde pessoal

**SABE:** melhor faturamento-dia da série (**hoje não detectável** — §1.7).
**DIZ:** nomeia o feito: *"melhor dia seu desde que a gente acompanha. O que foi diferente hoje?"*
**CALA:** meta do mês, gaps, próxima tarefa.
**ESTADO:** CELEBRAR.
**POR QUÊ:** a pergunta faz o vendedor **nomear a própria causa** — o que vira conhecimento dele, não conselho do sistema.

---

### G) Abaixo da meta, mas melhorando — **o caso mais importante**

**SABE:** meta em 78%, mas subindo há três semanas (**hoje não detectável** — §1.6).
**DIZ:** *"você está 22% abaixo da meta — e subiu três semanas seguidas. A direção está certa."*
**CALA:** o tom de alerta. Não trata como problema.
**ESTADO:** CELEBRAR (+ AGIR leve).
**POR QUÊ:** é o quadrante do §7. Um sistema que só lê resultado absoluto trata esta pessoa como problema — e **ensina que esforço não conta**. É o caso que mais justifica construir tendência.

---

### H) Acima da meta, mas regrediu tecnicamente

**SABE:** meta em 115%; score de competência caiu por evidência (simulação pior que a anterior).
**DIZ:** reconhece o resultado primeiro. Depois, **sem alarme**: *"na última simulação a nota de fechamento veio abaixo da sua. Quer dar uma olhada, ou está tranquilo?"*
**CALA:** qualquer sugestão de que o resultado bom seja sorte.
**ESTADO:** CELEBRAR → DESENVOLVER.
**POR QUÊ:** resultado e habilidade são eixos diferentes (§4). Alguém pode estar vendendo bem por fluxo de loja e perdendo técnica — é exatamente o que um conselheiro deveria notar e um dashboard nunca nota. Mas trazer isso como problema, com a meta batida, soa a implicância: vira **convite**, com saída fácil.

---

### I) Vendedor terminou um treinamento

**SABE:** aula concluída, evidência gerada, competência subiu um pouco.
**DIZ:** reconhece e conecta ao real: *"fechou a aula de venda complementar. Dá pra testar amanhã — na próxima venda, tenta oferecer uma segunda peça antes de fechar."*
**CALA:** as outras seis aulas pendentes.
**ESTADO:** CELEBRAR → AGIR.
**POR QUÊ:** conhecimento sem aplicação não vira competência (§4, classe B vs. A). E **uma** ação: listar o que falta transforma conquista em dívida.

---

### J) Fez o Simulador e melhorou

**SABE:** nota 78 contra 61 da anterior (**comparação hoje não feita** — §8).
**DIZ:** *"78 nessa simulação, contra 61 na anterior. A diferença foi na sondagem."*
**CALA:** que ainda está abaixo do alvo, se estiver.
**ESTADO:** CELEBRAR.
**POR QUÊ:** progresso medido contra si mesmo — princípio inegociável 8. E o **detalhe específico** ("foi na sondagem") é o que separa reconhecimento de elogio.

---

### K) Vendedor recusa a sugestão

**SABE:** sugeriu simulação; ele diz *"não, isso não é meu problema"*.
**DIZ:** aceita sem insistir. Pergunta o que ele acha que é.
**CALA:** a sugestão recusada — **e não a repete depois** (§9, regra 3).
**ESTADO:** REFLETIR.
**POR QUÊ:** recusa é informação, não obstáculo. Ele pode estar certo — o sistema tem um sinal, ele tem o atendimento inteiro. Insistir transforma conselho em cobrança, e é aí que o produto vira o chat chato.

---

### L) Já ouviu a mesma recomendação ontem

**SABE:** mesmo sinal, mesma sugestão ontem, nada mudou (**hoje não registrado** — §9).
**DIZ:** outra coisa. Se o assunto voltar, muda o ângulo: *"a gente falou de venda complementar ontem — chegou a tentar? o que aconteceu?"*
**CALA:** a recomendação repetida.
**ESTADO:** qualquer um, menos repetir.
**POR QUÊ:** repetir prova que o sistema não lembra. **Hoje isto é o comportamento esperado** — a memória é uma janela de 16 mensagens. É o que a Etapa 2B.2 corrige.

---

### O que estes doze casos mostram, juntos

| Padrão | Casos |
|---|---|
| Mesmo KPI, decisões opostas conforme o momento | A vs. C |
| Check-in inclina, não determina | A vs. B |
| Celebração nunca emenda cobrança | E, G, I, J |
| Resultado e habilidade são eixos independentes | G, H |
| Uma ação por vez, ou nenhuma | B, I |
| Recusa e repetição são informação | K, L |
| **Metade depende de capacidade que não existe** | F, G, H, J, L |

Os seis casos marcados dependem de **tendência, recorde e registro de menções** — as três capacidades ausentes que mais mudam a experiência. Isso é, por si só, o argumento da Etapa 2B.1.

---

## 12. Resumo das decisões humanas

Nenhuma foi tomada aqui. Todas bloqueiam parte da Etapa 2B.1.

| # | Decisão | Bloqueia | Gravidade |
|---|---|---|---|
| **1** | **O Linx entrega atendimentos separados de vendas?** | Significado de PA/ticket; existência de conversão | **Crítica** |
| 2 | Falta de meta deve ser neutra no Score Geral? | Qualquer sinal derivado de score | Alta |
| 3 | Unificar as duas fórmulas de PA/ticket | Todo sinal de delta vs. baseline | Alta |
| 4 | Existe fonte de escala/folga? | Confiabilidade de consistência | Alta |
| 5 | Faixas de confiança e corte de mencionabilidade | Todo sinal | Média |
| 6 | KPI pode virar evidência com peso próprio? (recomendação: não) | Modelo de competência | Média |
| 7 | Assimetria de threshold celebrar vs. apontar | Catálogo de positivos | Média |
| 8 | Cooldown por sinal e limite de menções | Anti-repetição | Média |
| 9 | O que caracteriza "melhorando" | Sinal de evolução | Média |
| 10 | Duração da influência do check-in | Pertinência | Baixa |

**Nenhum threshold numérico foi arbitrado neste documento.** Onde a tentação existiu, a decisão foi registrada em vez de inventada — disciplina estabelecida em sessões anteriores e mantida aqui.

Um aviso específico: existem limiares no código (`LIMIAR_MELHORA_PCT = 5` na gamificação, `−15%` nos alertas gerenciais, `15%`/`streak ≥ 3` nos sinais positivos). **Eles não devem ser reaproveitados por inércia.** Foram calibrados para conceder recompensa e para alertar gerente — não para decidir o que um conselheiro diz a uma pessoa.
