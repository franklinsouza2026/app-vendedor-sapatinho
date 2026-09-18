# Arquitetura do Conselheiro — Etapa 2B

> **Status:** desenho da Etapa 2B.0 — **zero implementação**. Nenhum service, rota, schema, prompt ou seed foi alterado.
> **Baseline:** `004b126`.
> **Governado por:** [`CONSTITUICAO_DO_CONSELHEIRO_PESSOAL.md`](./CONSTITUICAO_DO_CONSELHEIRO_PESSOAL.md) · [`METODOLOGIA_MOTOR_DE_SINAIS.md`](./METODOLOGIA_MOTOR_DE_SINAIS.md)

---

## 1. O pipeline alvo

```
                    ┌─────────────────────────────────────────────┐
   DADOS            │ ERP · Metas · Ledger · Evidências ·          │
                    │ Streak · Academia · PDI · Check-in          │
                    └────────────────────┬────────────────────────┘
                                         ▼
   MOTORES          ┌─────────────────────────────────────────────┐
   DETERMINÍSTICOS  │ metas · baseline · gamificação · score de   │  ✅ EXISTE
                    │ competência · certificação · missões        │
                    └────────────────────┬────────────────────────┘
                                         ▼
   SINAIS           ┌─────────────────────────────────────────────┐
                    │ observações neutras, com intensidade,       │  ⚠️ PARCIAL
                    │ confiança, hipóteses e conclusões proibidas │
                    └────────────────────┬────────────────────────┘
                                         ▼
   PERTINÊNCIA      ┌─────────────────────────────────────────────┐
                    │ estado comportamental · cooldown ·          │  ❌ NÃO EXISTE
                    │ confiança · precedência do positivo         │
                    └────────────────────┬────────────────────────┘
                                         ▼
   CONTEXTO         ┌─────────────────────────────────────────────┐
                    │ só o que passou na pertinência +            │  ⚠️ EXISTE, MAS
                    │ conhecimento recuperado, rotulado           │     MANDA TUDO
                    └────────────────────┬────────────────────────┘
                                         ▼
   CONSELHEIRO      ┌─────────────────────────────────────────────┐
                    │ LLM · interpreta, pergunta, acolhe, ensina  │  ✅ EXISTE
                    └────────────────────┬────────────────────────┘
                                         ▼
   CONVERSA ──► AÇÃO OPCIONAL ──► ATIVIDADE ──► EVIDÊNCIA ──► COMPETÊNCIA ──► EVOLUÇÃO
                                                   ✅ ligado na Etapa 2A
```

**A camada que falta é a do meio.** Hoje o contexto é montado direto dos motores e **vai inteiro, sempre**. Não existe nada entre "o sistema sabe" e "o Conselheiro fala".

---

## 2. O que já existe — e é mais do que parece

Auditado no código, não presumido.

| Peça | Onde | Observação |
|---|---|---|
| **AI Gateway único** | `src/ai-platform/gateway.service.ts:110-140` | Todo especialista passa por ele; provider, credencial cifrada, custo e saúde resolvidos por empresa |
| **14 especialistas** na mesma infra | enum `EspecialistaIA`, `schema.prisma:516-540` | Adicionar um custa migration aditiva + um `else if` no mock. **Zero mudança no Gateway** |
| **Budget e rate limit** | `budget.service.ts`, `coach/limites.service.ts` | Ledger real (`AIUsage`), nunca contador mutável |
| **Motores determinísticos** | metas, baseline, gamificação, streak, score de competência, certificação, missões | Completos e testados |
| **Cadeia evidência→competência** | Etapa 2A | Funciona ponta a ponta, com E2E |
| **`competencyGaps` já no contexto do Conselheiro** | `coach/context.types.ts:42-48` | **Já é uma chave de recuperação temática pronta** |
| **Sinais positivos** (9 tipos) | `manager/positive-signals.service.ts` | Existem — só que para o **gerente** |
| **Conhecimento governado injetado em conversa** | Playbook do Treinador | **O padrão que o Conselheiro precisa já está em produção** — ver §3 |
| **Dois eixos de origem de conteúdo** | `OrigemConteudoPlaybook`, `OrigemEditorial` | Modelagem suficiente para distinguir oficial / boa prática / gerado por IA |
| **Escolas de tema não-comercial** | `universidade/schools.service.ts:9-18` | `organizacao` e `desenvolvimento-pessoal` **já existem no catálogo — vazias** |
| **Privacidade da conversa** | — | **Estruturalmente garantida.** Nenhuma rota, service ou tela de gerente/admin toca `CoachMessage`, `CoachConversation` ou `CoachCheckIn` (confirmado por 9 buscas independentes) |
| **Guardrails de IA** | prompt + arquitetura | Sem tool-use em nenhum provider; contexto só no canal `system`; IDOR-safe; injection testada |

---

## 3. O padrão que não precisa ser inventado

A pergunta *"o Conselheiro pode usar bibliotecas de conhecimento sem virar quinze bots?"* tem resposta empírica: **o Treinador já faz exatamente isso, em produção, com teste de regressão.**

```
  chave determinística        seleção            rotulagem              regra no prompt
  ────────────────────        ───────            ─────────              ───────────────
  mode: ModoTreinador   →  getSecoesRelevantes  →  [OFICIAL] título:   →  "sempre que usar
  (vem do frontend)        (mapa estático          conteúdo               DEMONSTRATIVO, deixe
                            categoria→modo)                               claro que não é
                                                                          política oficial"

  playbook.service.ts:101-116 → context-formatter.ts:94-103 → system-prompt.ts:13-16
```

Sem embedding. Sem RAG. Sem busca semântica. **Chave determinística + mapa estático + rótulo de origem + regra explícita.** É auditável, é testável, e o produto já provou que funciona (`treinador/conversation.integration.test.ts:103` assere que a resposta contém *"não é política oficial"*).

**Portanto:** dar conhecimento de desenvolvimento pessoal ao Conselheiro é **replicar um padrão existente**, não construir uma capacidade nova. Isso muda radicalmente o tamanho da Etapa 2B.1.

### O que falta para replicá-lo

| Peça | Estado | O que é |
|---|---|---|
| **(a) O acervo** | ❌ Não existe | Nenhuma linha de conteúdo sobre hábitos, foco, mentalidade, comunicação, inteligência emocional. `CategoriaPlaybook` tem 10 valores, **todos comerciais**. As 4 trilhas da Academia são todas de vendas |
| **(b) A taxonomia** | ⚠️ Meia | `Escola` e `Competency` são abertas e já têm `organizacao` / `desenvolvimento-pessoal` — **vazias** |
| **(c) O seletor tema→conteúdo** | ❌ Não existe | O Treinador recebe `mode` pronto do frontend. **O Conselheiro é chat aberto — o body só tem `content`** |
| **(d) A injeção rotulada** | ❌ Não existe | `CoachContext` não tem campo de conteúdo, e o system prompt do Coach não tem regra OFICIAL/DEMONSTRATIVO |

**Nenhuma das quatro exige RAG.** Todas exigem decisão editorial antes de código.

**Sobre (c):** o caminho mais barato já está montado. `competencyGaps` **já chega ao contexto do Conselheiro** — é uma chave temática determinística, derivada de evidência real, ordenada por prioridade. Um acervo indexado por competência (o mesmo `competencyIds` + `array_contains` que `ai-recommendation.service.ts:71-75` já usa) seria recuperável **sem inventar mecanismo nenhum**.

---

## 4. O que realmente falta

Ordenado por **quanto custa** × **quanto destrava**.

### Camada 1 — ligações (sem motor novo, sem schema novo)

| # | Falta | Evidência | Esforço |
|---|---|---|---|
| L1 | **Check-in no contexto** | `CoachContext` não tem campo de humor; `context-builder` não consulta `coachCheckIn`. O check-in é coletado todo dia e é **dado órfão** | Baixo |
| L2 | **Sinais positivos para o vendedor** | `positive-signals.service.ts` detecta 9 tipos — só o gerente consome | Baixo |
| L3 | **`recentTrainings`** | Hardcoded `[]` em `context-builder.service.ts:78` com o comentário `// Academia é Fatia 6` — nunca preenchido, com a Academia existindo há ~8 fatias | Trivial |
| L4 | **Playbook no Conselheiro** | O Treinador tem; o Conselheiro não tem acesso a conteúdo nenhum | Baixo — o service já existe |

**L1+L2 juntos já mudam o produto:** o Conselheiro passaria a saber como a pessoa está e o que ela fez de bom. Hoje sabe nenhum dos dois.

### Camada 2 — capacidades novas (motor, sem decisão de negócio bloqueante)

| # | Falta | Por quê |
|---|---|---|
| C1 | **Estado comportamental** | Não existe nem como conceito. Sem ele, não há como calar performance em ACOLHER |
| C2 | **Motor de pertinência** | §5 |
| C3 | **Registro de menções** (anti-repetição) | Nada registra o que já foi dito. A memória é uma janela de 16 mensagens numa conversa que fica `ABERTA` indefinidamente — **repetir todo dia é o comportamento esperado hoje** |
| C4 | **Tendência pessoal** | Toda comparação é pontual vs. média de 14 dias. Sem isso, **"abaixo da meta mas melhorando" é indetectável** — o sinal mais valioso da Constituição §10 |
| C5 | **Recorde pessoal** | Só `maiorStreak` existe |
| C6 | **Classes de memória B/C/E/F** | `ProfessionalMemory` tem 4 colunas, todas derivadas de KPI, sem histórico e sem TTL |

### Camada 3 — depende de decisão humana ou de dado externo

| # | Falta | Bloqueado por |
|---|---|---|
| D1 | **Sinais comerciais calibrados** | ERP é mock; thresholds não calibráveis (Metodologia §1.1) |
| D2 | **Conversão** | Dado não existe (Metodologia §6.5) |
| D3 | **Semântica de PA/ticket** | `numAtendimentos` é venda, não atendimento — **Decisão Humana #1** |
| D4 | **Confiabilidade de consistência** | Sem escala/folga — Decisão Humana #4 |
| D5 | **Acervo de desenvolvimento pessoal** | Decisão editorial: que material, de quem, com que direitos |

---

## 5. O Motor de Pertinência

### O que ele responde

1. O que está acontecendo? 2. O que o vendedor quer nesta conversa? 3. Há algo importante a mencionar? 4. É o momento? 5. Já falei disso? 6. Há algo positivo a reconhecer? 7. Preciso acolher antes de orientar? 8. Há ação concreta útil? 9. Encaminho para outro módulo? 10. Ou só converso?

### As três opções, com trade-offs reais

#### A — Determinístico puro

Regras em código: estado derivado de check-in + palavras-chave, cooldown por tabela, precedência fixa.

✅ Auditável, testável, barato, previsível, reproduzível em teste.
❌ **Não entende linguagem.** "Tá osso hoje" e "por que minhas vendas caíram?" seriam classificados por heurística de palavra — e heurística de palavra em português informal erra muito. E erra **exatamente onde dói**: classificar desabafo como pedido de análise é o pior erro possível do produto.

#### B — LLM puro

Mandar tudo e instruir o modelo a escolher.

✅ Zero infraestrutura. É o que existe hoje.
❌ Não reproduz, não audita, não tem cooldown (o modelo não sabe o que disse ontem — a janela é de 16 mensagens), e **não garante nada**. O silêncio vira sorte, não decisão. É o motivo de o produto atual poder repetir "seu PA está baixo" indefinidamente.

#### C — Híbrido: LLM classifica intenção, código decide o que entra ✅ **recomendado**

```
mensagem do vendedor
        │
        ▼
  ┌─────────────────────┐
  │ CLASSIFICAÇÃO       │  LLM, chamada barata e estruturada:
  │ (LLM)               │  { intencao, estadoSugerido, temas[] }
  └──────────┬──────────┘  ← nunca vê KPI, nunca decide o que é dito
             ▼
  ┌─────────────────────┐
  │ PERTINÊNCIA         │  CÓDIGO, determinístico:
  │ (determinístico)    │  estado + cooldown + confiança +
  └──────────┬──────────┘  precedência do positivo + teto de 1 negativo
             ▼
  ┌─────────────────────┐
  │ CONTEXTO FILTRADO   │  só o que passou
  └──────────┬──────────┘
             ▼
  ┌─────────────────────┐
  │ CONSELHEIRO (LLM)   │  interpreta, pergunta, acolhe, ensina
  └─────────────────────┘
```

**Por que esta é a resposta certa:** a classificação de intenção é exatamente o que um LLM faz bem e o código faz mal. A decisão de mencionar é exatamente o que o código faz bem (cooldown, confiança, precedência são regras) e o LLM faz mal (não lembra, não garante).

**Ponto decisivo:** o classificador **nunca vê KPI**. Ele só lê a mensagem. Então ele não pode "decidir falar do PA" — ele só diz *"isto parece desabafo"*. Quem cala o PA é o código. **O silêncio vira garantia, não instrução de prompt.**

**Custos honestos:** uma chamada de IA a mais por mensagem (mitigável — classificação é curta e cabe em modelo barato); latência adicional; e um novo ponto de falha, que deve degradar para um padrão seguro — **na dúvida, ACOLHER e calar performance**, que é o erro menos danoso.

### Onde ele deve morar

**Serviço próprio** (`src/pertinencia/` ou `src/sinais/`), não dentro de `src/coach/`.

Razões: o Treinador e o Simulador terão a mesma necessidade; sinais e pertinência são conceitos de produto, não de um especialista; e testar pertinência isoladamente é o que torna o cooldown verificável. O precedente existe — `src/ai-platform/` foi extraído de `src/coach/` exatamente assim, na Fatia 5.

---

## 6. Determinístico vs. LLM — a fronteira

| **Determinístico (código)** | **LLM** |
|---|---|
| Cálculo de KPI | Interpretação da mensagem |
| Tendência, baseline, gap | Classificação de intenção |
| Score de competência | Escolha da pergunta certa |
| Existência e intensidade de sinal | Tom e acolhimento |
| **Confiança do sinal** | Explicação |
| **Cooldown / já mencionado** | Conexão entre contexto e conselho |
| **Estado comportamental final** | Redação |
| **O que entra no contexto** | |
| Disponibilidade de recurso e autorização | |
| Recuperação de conhecimento (chave determinística) | |

**Regra inegociável:** *o motor calcula; a IA interpreta.* O LLM **nunca** produz KPI, score, meta, ranking ou competência. Já vigente e testado (`coach/prompts/system-prompt.ts:17`; nenhuma saída de provider é escrita em tabela de KPI).

**Extensão desta etapa:** o LLM também **não decide sozinho o que é dito**. Hoje decide — recebe tudo e escolhe. É a mudança arquitetural central da 2B.

---

## 7. Riscos que a 2B.1 precisa carregar

### R1 — Sanitização ausente no Conselheiro
O Treinador sanitiza texto livre do vendedor (`treinador/prompts/context-formatter.ts:17-19`, achado de segurança da Fatia 5). O Conselheiro **não sanitiza** — hoje é seguro porque o texto do vendedor **nunca entra no system prompt**, só no canal `messages`.

**Mas a 2B quebra exatamente essa premissa:** classificação de intenção e recuperação temática tendem a levar texto do vendedor para perto do system prompt. **No instante em que isso acontecer, a sanitização passa a ser obrigatória.** Registrado agora para não ser descoberto depois.

### R2 — `CHECKIN_DIARIO: 5` plantado e desligado
`src/gamificacao/regras.service.ts:69` define 5 XP para check-in diário. **Nenhum consumidor** — `registrarCheckin` não chama o motor de gamificação. Hoje a promessa do prompt (*"dados emocionais nunca viram score, recompensa ou penalidade"*) está cumprida.

Se alguém ligar esse evento, o check-in vira recompensa e **contradiz a Constituição §12 e o próprio system prompt**. Além do dano de princípio: pagar XP por declarar humor corrompe o dado — a pessoa passa a clicar pelo ponto, não pelo que sente.

> **Recomendação:** remover a régua ou marcá-la explicitamente como proibida.

### R3 — Memória escrita como efeito colateral de leitura
`getMemoria()` faz upsert em `ProfessionalMemory` a cada chamada, e está no caminho quente de **todo** request do Conselheiro **e** do Treinador. Sem histórico, sem TTL: o "ponto fraco de ontem" é sobrescrito sem rastro.

Para as classes de memória B/C/E/F da Constituição §13, isso precisa mudar — mas é decisão de schema, fora da 2B.0.

### R4 — Sem proveniência de conhecimento no Conselheiro
O Treinador grava `playbookVersionId` em cada mensagem (`treinador/conversation.service.ts:245`). O Conselheiro não grava equivalente — nem versão de prompt. Se ele passar a usar conteúdo, **não haverá como auditar o que foi dito com base em quê**.

### R5 — Assimetria de tenancy
Playbook é por empresa; Academia/Escolas/Competências são catálogo global ("1 empresa por deployment"). Uma biblioteca de desenvolvimento pessoal precisa escolher um dos dois modelos — **não há precedente misto**.

### R6 — Nenhum indicador comercial é real
`ERP_MODE=mock`. Calibrar sinal contra o mock é calibrar contra distribuição inventada (Metodologia §1.1).

---

## 8. Proposta de sequenciamento

Cada etapa entrega valor sozinha e **nenhuma depende de decisão humana pendente**, exceto onde marcado.

### 2B.1 — A pessoa entra no contexto
**Não depende de nada.** L1 + L2 + L3 + C1 (estado comportamental mínimo, derivado do check-in) + a regra de silêncio de performance em ACOLHER.

Entrega: o Conselheiro passa a saber como a pessoa está e o que ela fez de bom — e cala os números quando ela chega mal. **É a menor mudança com o maior efeito sobre a experiência**, e implementa os princípios P1, P2, P3 e P5 da Constituição de uma vez.

### 2B.2 — Pertinência e anti-repetição
C2 + C3, no modelo híbrido (§5C). Entrega: silêncio vira garantia; o Conselheiro para de repetir.

### 2B.3 — Evolução e celebração
C4 + C5. Entrega: *"abaixo da meta, mas melhorando"* — o quadrante mais importante da Metodologia §7.

### 2B.4 — Sinais comerciais calibrados
D1. **Depende das Decisões Humanas #1 a #5 e de dado real do Linx.**

### 2B.5 — Conhecimento de desenvolvimento pessoal
(a)+(b)+(c)+(d) do §3. **Depende de decisão editorial (D5)**: que material, de quem, com que direitos — a mesma disciplina dos 13 Mandamentos, que só entraram no produto porque havia material real da empresa.

---

## 9. O que esta etapa NÃO decidiu

- Nenhum threshold numérico.
- Nenhum peso de evidência.
- Nenhum schema.
- Nenhum novo especialista de IA.
- Nenhuma régua KPI→Competência — **continua proibida sem metodologia aprovada**.
- Nenhuma escolha de acervo de desenvolvimento pessoal.

As dez decisões humanas estão listadas na Metodologia §11. A #1 — *o Linx entrega atendimentos separados de vendas?* — é a que mais muda o desenho, e não pode ser respondida por leitura de código.
