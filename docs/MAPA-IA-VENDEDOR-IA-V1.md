# Mapa de IA — Vendedor IA V1

Desenho. **Nenhuma chamada de IA real foi feita nesta etapa.** Baseline `25691ac`.

Lente adotada: `ai-feature-map` — cada função de IA é descrita por tipo de automação,
custo marginal, dependência, **risco e fallback**. A coluna que mais importa é a última:
uma função de IA sem fallback declarado é uma função que derruba o produto.

---

## 1. Os quatro princípios que governam IA neste produto

1. **Motor calcula, IA interpreta.** Nenhum número que vale dinheiro, nota ou
   autorização sai de um modelo.
2. **IA produz, humano governa.** Nenhum conteúdo gerado por IA fica visível ao
   usuário final sem um humano ter publicado.
3. **Um conselheiro, N conhecimentos.** Skill é biblioteca recuperável, não agente
   novo. A pessoa nunca escolhe com qual bot falar.
4. **Silêncio é resposta válida.** `NO_KNOWLEDGE` é sucesso; falso positivo é pior
   que falso negativo.

---

## 2. IA que existe hoje — 14 especialistas, 6 pontos de chamada

Todos passam por `gerarViaGateway` (exceto o "testar conexão", ver §6).

### 2.1 IA que conversa com a pessoa

| Função | Usuário | Tipo | Chamadas | Custo | Depende de | Risco + Fallback |
|---|---|---|---|---|---|---|
| **Conselheiro** | todos | Generativa | 1 por turno | médio | gateway, contexto autorizado, knowledge | **alto** (é a relação) · *fallback:* erro explícito ao usuário; o resto do app segue |
| **Classificador de intenção** | — (interno) | Híbrida | 0 ou 1 por turno | baixo | só o texto | baixo · *fallback:* `pertinenciaDeFallback` → silêncio comercial. **Degrada, não quebra** |
| **Classificador de resposta a sugestão** | — (interno) | Híbrida | 0 ou 1 por turno | baixo | só o texto | baixo · *fallback:* `INDETERMINADO`, não altera estado |
| **Personagem do Simulador** | todos | Generativa | 1 por turno | **alto** | cenário, persona, playbook | médio · *fallback:* sessão `FAILED`, sem nota falsa |
| **Avaliador do Simulador** | todos | Generativa | 1 por sessão | médio | rubrica fechada | médio · *fallback:* `EVALUATION_PENDING`, retriável. **Nunca nota inventada** |
| **Assistente de Gestão** | líderes | Generativa | 1 sob demanda | baixo | KPIs já calculados | baixo · *fallback:* 503 no card; painel inteiro segue determinístico |
| **Treinador (conversa)** | todos | Generativa | 1 por turno | médio | playbook | médio · *sai da UX na V1* |

### 2.2 IA que trabalha para o Admin — offline, nunca no caminho do usuário

| Agente | Produz | Chamadas | Nasce como | Human gate |
|---|---|---|---|---|
| Research | síntese de fontes | 1 por job | dado interno | — |
| Curator | curadoria crítica | 1 | dado interno | — |
| Instructional Designer | rascunho de aula | 1 | `status: DRAFT` | **sim** |
| Quiz Agent | questões | 1 (condicional) | **`active: false`** | **sim** |
| Simulation Designer | cenário | 1 (condicional) | `TrainingScenarioDraft` | **sim** |
| Governance | parecer | 1 | `TrainingGovernanceFinding` | nunca altera conteúdo |
| Content Update | recomendação de atualização | 1 a 2 | parecer | **sim** |
| Seller/Manager Training Agent | ordem sugerida de trilha | 1 sob demanda | reordenação | IDs revalidados no backend |

**Job completo:** 4 a 6 chamadas, até 12 com retry. **Sem rate limit diário** — só o
cap de 10 jobs/dia por admin e o budget mensal.

---

## 3. Onde IA **não** entra — e a prova

Lista explícita (§47). Cada item está implementado deterministicamente **hoje**:

| Função | Onde |
|---|---|
| Nota final do Simulador | `evaluation.service.ts:52` — média dos critérios, no backend |
| Gabarito e score do quiz | `quiz.service.ts:132-151` — lido do banco |
| Aprovação 7/10 | `score >= passingScore`, servidor |
| Cálculo de meta e realizado | `metas.service.ts` |
| XP e VendaCoins | ledger imutável idempotente |
| Ranking e Score Geral | snapshot determinístico |
| Baseline, streak, níveis, badges | motores próprios |
| Critério de missão | evidência real, switch exaustivo |
| Score e gap de competência | `score-engine.service.ts` — "IA nunca participa do cálculo" |
| Revisão espaçada | algoritmo fixo |
| Gate de pertinência | `gate.service.ts` |
| **Knowledge Router** | função pura — e há **teste que proíbe** `prisma.`, `gerarViaGateway`, `Date.now`, `Math.random` |
| Guard dos 13 Mandamentos | regex + `mandamentos.service` |
| RBAC, tenant, escopo, status | código |
| Idempotência e reversão | ledger |

**Esta lista não é aspiracional — é o estado atual.** A V1 não adiciona IA a nenhum
destes, e qualquer proposta futura que o faça deve ser tratada como regressão.

---

## 4. Matriz de IA por função — desenho V1

Legenda: **SEM IA** · **OPCIONAL** (degrada bem) · **NECESSÁRIA** (a função não existe sem)

| Módulo | Função | IA? | Especialista | Human gate | Custo | Fallback |
|---|---|---|---|---|---|---|
| **Conselheiro** | conversar | NECESSÁRIA | Conselheiro (1 só) | — | médio | erro explícito |
| | classificar intenção | OPCIONAL | classificador | — | baixo | silêncio comercial |
| | recuperar conhecimento | **SEM IA** | Router puro | — | zero | — |
| **Simulador** | interpretar personagem | NECESSÁRIA | personagem | — | **alto** | sessão falha |
| | avaliar ao final | NECESSÁRIA | avaliador | — | médio | `EVALUATION_PENDING` |
| | **calcular a nota** | **SEM IA** | — | — | zero | — |
| | criar cenário | OPCIONAL | Simulation Designer | **sim** | baixo (offline) | Admin escreve à mão |
| **Universidade** | criar curso/aula | OPCIONAL | Instructional Designer | **sim** | baixo (offline) | Admin escreve |
| | criar questões | OPCIONAL | Quiz Agent | **sim** (`active:false`) | baixo (offline) | Admin escreve |
| | transformar Playbook em curso | OPCIONAL | Instructional Designer | **sim** | baixo | Admin escreve |
| | **corrigir prova** | **SEM IA** | — | — | zero | — |
| | recomendar próximo passo | OPCIONAL | Training Agent | IDs revalidados | baixo | ordem determinística |
| **Missões** | sugerir missão do catálogo | OPCIONAL | *a decidir* | **sim** | baixo | recomendação determinística já existe |
| | **avaliar conclusão** | **SEM IA** | — | — | zero | — |
| | **definir recompensa** | **SEM IA** | — | — | zero | — |
| **Gestão** | resumir a operação | OPCIONAL | Assistente de Gestão | — | baixo | painel determinístico |
| | preparar 1:1 | OPCIONAL | Assistente de Gestão | — | baixo | roteiro fixo de 7 perguntas (já existe) |
| | **detectar desvio** | **SEM IA** | Attention Engine | — | zero | — |
| **Admin** | governar conteúdo | **SEM IA** | — | — | zero | — |
| **Performance** | tudo | **SEM IA** | — | — | zero | — |
| **Gamificação** | tudo | **SEM IA** | — | — | zero | — |

**Contagem do desenho:** 5 funções `NECESSÁRIA`, 10 `OPCIONAL`, e **o restante do
produto sem IA nenhuma**. Isso é a resposta ao §48: usar IA onde o valor é alto e a
alternativa manual é cara; regra onde regra resolve.

---

## 5. Agentes — o que reaproveitar, o que criar, o que rejeitar

### 5.1 Reaproveitados sem mudança (7)

Research · Curator · Instructional Designer · Quiz Agent · Simulation Designer ·
Governance · Content Update. Todos já produzem rascunho com gate humano.

### 5.2 Reaproveitados com ampliação de contexto (4)

| Agente | Ampliação | Por que não é agente novo |
|---|---|---|
| **Conselheiro** | contexto por papel (vendedor/gerente/supervisor/coordenador) | O núcleo é o mesmo: pessoa primeiro, pertinência, conhecimento. O que muda é **qual contexto é autorizado**, e isso é dado, não agente |
| **Personagem do Simulador** | personas de gerente e supervisor virtuais | O prompt de personagem já é genérico; o que muda é o cenário |
| **Avaliador do Simulador** | rubricas de liderança | A rubrica já é parametrizada por cenário |
| **Assistente de Gestão** | escopo de supervisor e coordenador | Ele já lê KPIs agregados; muda o recorte |

### 5.3 Agentes novos realmente necessários

**Zero.**

Passei os candidatos pelo teste do §40 — *qual problema resolve · especialista
existente resolve · prompt resolve · regra determinística resolve · KnowledgeCard
resolve · workflow resolve*:

| Candidato | Veredito |
|---|---|
| "Conselheiro do Gerente" | **rejeitado** — é o Conselheiro com outro contexto |
| "Conselheiro do Supervisor/Coordenador" | **rejeitado** — idem |
| "Agente de Missões" | **rejeitado** — a recomendação determinística já existe e é auditável; para *criar rascunho de missão*, o Instructional Designer serve |
| "Agente de liderança" | **rejeitado** — é KnowledgeCard de liderança, não agente |
| "Agente de hábitos/produtividade" | **rejeitado** — é exatamente o que os KnowledgeCards da 2C já fazem |
| "Admin Copilot" | **rejeitado para V1** — os 7 agentes offline já cobrem criação de conteúdo. Um copiloto com ferramentas seria um segundo caminho para as mesmas ações, com risco de escrever no lugar do CMS governado |
| "Agente de análise de estrutura" | **rejeitado** — relatório determinístico resolve |

**O produto não precisa de nenhum agente novo para a V1.** Precisa de contexto,
conhecimento e superfície de governança.

### 5.4 O que some da experiência

O **Treinador conversacional** sai do hub. A engenharia dele (playbook, modos,
contexto, prompt gerencial) é redistribuída — ver `MAPA-REAPROVEITAMENTO`. A conversa
livre de treino é **decisão aberta (D-06)**: vira modo do Conselheiro, cenário do
Simulador, ou aposenta.

---

## 6. Observabilidade e custo

O AI Control Plane existente já cobre quase tudo (§49):

| Necessidade | Existe? |
|---|---|
| Chamadas, tokens, custo, latência, status por chamada | **sim** — ledger `AIUsage` |
| Provider, modelo, especialista | **sim** |
| Budget mensal por empresa | **sim** |
| Rate limit diário por pessoa | **sim** — 20/dia, por especialista |
| Saúde do provider | **sim** |
| Credencial cifrada AES-256-GCM | **sim** |
| Kill-switch por empresa | **sim** |
| Tabela de preço | **parcial** — só Anthropic é preço real; OpenAI e Gemini são placeholder explícito |

**Três lacunas do desenho atual, registradas:**

1. **O "testar conexão" do Admin não passa pelo gateway.** Chama o provider direto,
   então não respeita o kill-switch nem verifica budget. O próprio código admite que
   "consome budget de verdade".
2. **Agentes offline e Assistente de Gestão não têm rate limit diário.** O freio é o
   budget mensal e o cap de 10 jobs/dia por admin.
3. **Nenhum provider real configurado.** A 2C.6 segue parada por isso.

### Custo conceitual por módulo

Sem inventar preço: o único preço real na tabela é o da Anthropic, e o único número
medido é o da bateria da 2C.6 (~63 chamadas ≈ US$ 0,24 com sonnet-5).

| Módulo | Custo por unidade de uso | Classificação |
|---|---|---|
| Performance, Metas, Ranking, Gamificação, Missões (execução) | zero chamadas | **ZERO** |
| Universidade (consumir aula, responder quiz) | zero chamadas | **ZERO** |
| Assistente de Gestão | 1 chamada sob demanda | **BAIXO** |
| Conselheiro | 1 a 3 chamadas por mensagem | **MÉDIO** |
| Geração de conteúdo (offline) | 4 a 6 por job, poucos jobs | **MÉDIO** (amortizado: um curso serve a todos) |
| **Simulador** | **10 a 17 por sessão** | **ALTO** |

**A conclusão de custo é uma só:** o Simulador é o módulo caro, por uma ordem de
grandeza. Tudo o mais é barato ou grátis. Se o custo de IA um dia doer, é ali que se
mexe — reduzindo `maxTurns` ou avaliando a cada N turnos — e não no Conselheiro, que
é o diferencial do produto.

---

## 7. Fallback sem IA — o produto continua de pé?

Teste do §66, função por função:

| Se a IA estiver fora | O que acontece |
|---|---|
| Conselheiro | erro explícito ao usuário. **Único módulo que some** |
| Simulador | não abre sessão nova; histórico e notas anteriores intactos |
| Assistente de Gestão | o card não responde; **o painel gerencial inteiro continua** (Attention Engine é 100% determinístico) |
| Geração de conteúdo | Admin escreve à mão; o CMS é completo |
| Recomendação de trilha | ordem determinística assume |
| Classificadores do Conselheiro | fallback conservador, conversa segue |
| **Metas, Performance, Ranking, XP, Moeda, Badges, Missões, Universidade, Quiz, Certificação, Gestão** | **intactos — nenhum depende de IA** |

**Resposta:** com IA totalmente desligada, o Vendedor IA continua sendo um sistema de
metas, performance, gamificação, aprendizagem e gestão funcional. Perde o Conselheiro
e o Simulador. Isso é uma propriedade de arquitetura valiosa e deve ser mantida
explicitamente na V1.
