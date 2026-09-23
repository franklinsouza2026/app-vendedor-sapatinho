# Mapa de Reaproveitamento — Vendedor IA V1

Desenho. **Nada movido, nada apagado.** Baseline `25691ac`.

Este documento existe para responder uma pergunta e evitar um erro.

A pergunta: **o que já temos e não devemos refazer?**
O erro: confundir *tirar um módulo da navegação* com *jogar fora a engenharia dele*.

---

## 1. Regra de desmonte (§78) — nada é apagado agora

```
1. mapear consumidores  →  2. criar fachada nova  →  3. migrar chamadas
→  4. provar zero consumidores  →  5. só então cogitar cleanup
```

Hoje estamos no passo 1. Nenhuma tabela, serviço ou rota de Treinador e Academia deve
ser removida na V1. A remoção da **navegação** é uma linha de frontend; a remoção da
**engenharia** é um projeto inteiro, e não é necessário.

---

## 2. TREINADOR — decomposição peça por peça

**Contexto que muda a decisão:** o Treinador guarda **o único conteúdo oficial real da
empresa**. São 13 seções `OFICIAL` do Playbook, extraídas palavra por palavra do
material da Sapatinho de Luxo — Mandamentos #1 a #13 — mais 1 seção `DEMONSTRATIVO`
para objeções, porque a empresa não tem material oficial de objeções.

E esse Playbook **já é consumido por outros dois módulos**.

| Peça | O que é | Destino | Justificativa |
|---|---|---|---|
| **Playbook (14 seções)** | conteúdo oficial versionado, com origem por enum de banco | **REUSE → infraestrutura compartilhada** | Já consumido por Simulador e Academia. `getSecoesPorCategorias` é a API interna |
| **Distinção OFICIAL × DEMONSTRATIVO** | enum `OrigemConteudoPlaybook`, propagado ao prompt | **KEEP** | É o precedente de governança epistêmica de todo o produto |
| **15 modos de conversa** | 10 de vendas + 5 de liderança | **REUSE** | Os 5 gerenciais servem à cadeia. O mapa `modo → categorias` vira taxonomia de conteúdo |
| **Prompt gerencial + `manager-context.ts`** | prompt e contexto de liderança separados | **REUSE → Simulador de gestão e Conselheiro por papel** | Já existe e já funciona. Não refazer |
| **11 objeções** | lista estática hardcoded, sem banco | **REUSE → Universidade** (conteúdo) ou **→ Knowledge** (cards) | É conhecimento de vendas real, hoje preso num array |
| **Recuperação determinística por categoria** | sem RAG, sem busca semântica | **KEEP** | Decisão arquitetural validada; é o modelo que o Knowledge do Conselheiro herdou |
| **Tela `/treinador`** | chat com seletor de modo e chips | **HIDE** | Sai do hub. A rota pode seguir por deep-link durante a transição |
| **Conversa livre de treino** | a experiência em si | **DECISION (D-06)** | Vira modo do Conselheiro? Cenário do Simulador? Aposenta? |
| **`TrainerConversation`/`TrainerMessage`** | tabelas | **RETIRE-LATER** | Só depois de D-06 e de zero consumidores |
| **68 testes** | — | **KEEP** | Enquanto a engenharia existir |

### Lacuna a corrigir junto

**O Playbook não tem nenhum endpoint administrativo.** O único jeito de publicar é
seed/script. Se o Treinador sai de vista sem isso resolvido, o conteúdo mais valioso do
produto fica sem dono. **Isto é V1 obrigatório.**

**Detalhe medido:** as categorias `PRINCIPIOS` e `ARGUMENTACAO` não têm nenhuma seção
seedada, apesar de 5 modos apontarem para `PRINCIPIOS` e 1 para `ARGUMENTACAO`. Esses
modos hoje recebem só a outra categoria do par.

---

## 3. ACADEMIA — decomposição peça por peça

**Contexto que muda a decisão:** Academia e Universidade **não fazem a mesma coisa**.

- **Academia = conteúdo e entrega.**
- **Universidade = medição e certificação em cima desse conteúdo.**
- **A Universidade não tem nenhum conteúdo próprio.**

O acoplamento já é bidirecional e intencional, **sem um único endpoint duplicado**:

| Direção | Evidência |
|---|---|
| Academia → Universidade | `quiz.service.ts` importa `gerarEvidenciaDeQuiz`, `concluirItemPDIPorConteudo`, `registrarResultadoQuestao` |
| Universidade → Academia | revisão espaçada lê `AcademyQuestion`; certificação lê `AcademyLesson` + `AcademyProgress`; learning path lê `AcademyTrack`; certificação importa `checarCompletudeMandamentos` |

| Peça | O que é | Destino | Justificativa |
|---|---|---|---|
| **Trilhas, aulas, conteúdo** | 4 trilhas, 7 aulas | **MERGE → Universidade** (navegação) | A Universidade já lê `AcademyTrack` |
| **Banco de questões** | `AcademyQuestion` + `AcademyOption` | **KEEP como motor, MERGE como experiência** | É o único banco de perguntas do produto; a revisão espaçada já bebe dele |
| **Quiz com nota** | `AcademyQuiz`, `passingScore`, `questionsPerAttempt` | **KEEP** | A regra nova (10q, 70%) já cabe aqui sem código novo |
| **Progresso de consumo** | `AcademyProgress` | **KEEP** | Fonte de 3 dos 6 tipos de requisito de certificação |
| **CMS (16 endpoints + tela)** | criação e lifecycle de conteúdo | **KEEP** | É o que o Admin usa para alimentar a Universidade inteira |
| **13 Mandamentos** (`MandamentoOficial`) | 13 linhas, conteúdo `null` | **KEEP** | Requisito de certificação `MANDAMENTOS_COMPLETOS` |
| **Recompensa XP/moeda** | `concederRecompensaTreinamento` | **KEEP** | A Universidade nunca recompensa — separação deliberada |
| **Vínculo ao Playbook** | `AcademyLesson.playbookCategoria` | **KEEP** | É a ponte conteúdo ↔ oficial |
| **Tela `/academia`** | 3 views | **HIDE → vira seção da Universidade** | Só navegação |
| **62 testes** | — | **KEEP** | — |

### A afirmação que importa

**Fundir os motores seria refazer 106 testes para chegar ao mesmo lugar.**
A fusão pedida é **de porta, não de motor** — e a porta é uma linha de navegação.

---

## 4. UNIVERSIDADE — o que absorve e o que já tem

| Capacidade | Estado | Papel na V1 |
|---|---|---|
| 8 escolas | seedadas, **sem nenhuma trilha vinculada** | taxonomia macro — vira a navegação do conteúdo |
| 22 competências | seedadas (11 vendedor + 11 gerente) | **precisa de 22 novas para supervisor e coordenador** |
| Score Engine + Gap Engine | completos, determinísticos | motor invisível |
| Evidências ponderadas | 4 fontes já ligadas | **barramento central do produto** |
| PDI | completo | semi-privado |
| Certificação | 6 tipos de requisito | **0 definições existem** |
| Revisão espaçada | completa | consome `AcademyQuestion` |
| Learning path ("Para você") | determinístico, IA só reordena | **só aparece em `/evoluir`, corte cego em 5** |
| CMS admin | 18 endpoints | governança |
| 97 testes | — | KEEP |

**Reaproveitamento: 95%.** O que falta é conteúdo, não engenharia.

**Três lacunas concretas:**
1. Nenhuma das 4 trilhas recebe `escolaId` no seed — as escolas estão desconectadas.
2. `AcademyTrack.onboarding` existe e **nenhuma rota permite marcá-lo** — o tipo
   `ONBOARDING` do "Para você" é inalcançável na prática.
3. O motor exige 2 evidências para calcular score; banco novo devolve
   `NOT_ENOUGH_DATA` em toda a matriz.

---

## 5. SIMULADOR — mais perto da visão do que parece

| Capacidade | Estado | Papel na V1 |
|---|---|---|
| Separação cenário / personagem / conversa / avaliador | **existe de verdade** — 4 arquivos, 2 prompts, 2 contextos | é exatamente a arquitetura pedida |
| Nota calculada no backend | média dos critérios, clamp 0-100 | **inegociável** |
| Rubrica de 11 critérios | cada cenário declara 2 a 4 | parametrização por cenário já existe |
| 14 cenários | 12 de venda + **2 gerenciais** | base para supervisor/coordenador |
| Catálogo por papel | `listarCenariosAtivos(papel)` filtra; 404 genérico para o catálogo alheio | **multi-papel já implementado** |
| Evidência de competência | `gerarEvidenciaDeSimulacao` com score do backend | barramento |
| Mínimo de turnos para recompensa | 3 | antifarming |
| Admin cria cenário | **só pelo pipeline de IA** | **falta CRUD** |
| Custo | **10 a 17 chamadas por sessão** | módulo mais caro |
| 59 testes | — | KEEP |

**Reaproveitamento: 85%.** Falta: cenários para supervisor e coordenador, CRUD de
cenário no Admin, e a decisão de privacidade (D-07).

**Ponto de produto escondido:** o gerente **pode** entrar no Simulador hoje — a rota é
`requireAuth()` sem papel — mas **não tem nenhum link**. A capacidade está pronta e
invisível.

---

## 6. CONSELHEIRO — o mais maduro

| Capacidade | Estado |
|---|---|
| Pertinência (2B.1) | gate determinístico; domínio não autorizado **nem é buscado no banco** |
| Continuidade (2B.2) | `CoachIntervention` com ciclo de vida |
| Um assunto por vez (2B.3) | seleção antes da geração |
| Histórico governado (2B.4) | autorização de turno vale também para o passado |
| Conhecimento (2C.1-2C.5) | Router puro → Retriever → orquestrador; card é contexto, pode ser ignorado |
| Privacidade | garantida por arquitetura, não por filtro |
| Multi-papel | **as 6 rotas usam `requireAuth()` sem papel** — gerente já pode conversar |
| Governança pela UI | **não existe** — módulo de conhecimento **não montado em `app.ts`** |
| Provider real | **nenhum configurado** (2C.6 parada) |

**Reaproveitamento: 90%.** Falta: contexto por papel, governança admin do conhecimento,
e rotas para `PLATFORM_ADMIN` (que hoje tem **zero**).

**Conteúdo:** 6 KnowledgeCards de hábitos existem. Mas atenção — o **seed os cria como
`DRAFT`**; eles só estão `PUBLISHED` no banco de dev porque um script de publicação foi
rodado na etapa 2C.3C. **Uma instalação nova nasce sem conhecimento publicado.**

---

## 7. MANAGER COMMAND CENTER — a base da cadeia de liderança

Esta é a descoberta de reaproveitamento mais subestimada do produto. O que existe para
GERENTE é, em grande parte, o que Supervisor e Coordenador vão precisar:

| Capacidade | Reaproveitável para níveis acima? |
|---|---|
| Attention Engine (100% determinístico) | **sim** — muda o escopo, não o motor |
| Alertas com dedupe e ciclo de vida | **sim** |
| Inbox de pendências | **sim** |
| Planos de ação (SELLER/TEAM/STORE) | **sim** — `subjectType` já é genérico |
| 1:1 com notas privadas | **sim**, com a correção de `managerId` |
| Follow-ups | **sim** |
| Reunião do Dia | **sim** — muda o agregado |
| Reconhecimento | **sim** |
| Store summary / team overview | **sim** — precisa agregar por nível |
| Assistente de Gestão (IA) | **sim** — muda o recorte |
| Missões gerenciais (3) | **sim**, mas **estão invisíveis**: `listarMissoesGerenciais()` existe no frontend e nenhuma tela a chama |

**Reaproveitamento: ~80%**, e o que falta é escopo, não funcionalidade.

---

## 8. GAMIFICAÇÃO, METAS, PERFORMANCE — intocados

| Capacidade | Reaproveitamento |
|---|---|
| Ledger XP/Moeda imutável e idempotente | **100%** |
| Régua versionada por empresa | **100%** |
| 6 níveis, 10 badges, streak, baseline | **100%** |
| Score Geral com redistribuição de peso | **100%** |
| 7 rankings × 2 escopos × 3 períodos | **100%** |
| Privacidade do ranking (faturamento alheio mascarado) | **100% — e inegociável** |
| Competições, temporadas, ligas, feed, reconhecimento | **100% de engenharia, 0% de conteúdo** |
| Metas + CRUD admin | **100%** |
| Motor de performance + sync ERP | **100%**, mas o **adapter Linx nunca foi validado** |

**Duas observações:**
- `MISSAO` e `COMPETICAO` existem no enum de eventos e **nunca foram valorados** na
  régua. Recompensa de missão é estruturalmente zero hoje.
- `Badge` é a única capacidade de gamificação **sem arquivo de teste dedicado**.

---

## 9. TRAINING INTELLIGENCE — o pipeline que já resolve "IA produz, humano governa"

| Peça | Reaproveitamento |
|---|---|
| Orquestrador de 6 etapas com retry | **100%** |
| 7 agentes offline | **100%** |
| Job com máquina de estados terminando em `WAITING_REVIEW` | **100%** |
| Aula nasce `DRAFT`, questão nasce `active:false`, cenário nasce rascunho | **100% — é o fluxo pedido no §38** |
| Governance Agent que nunca altera conteúdo | **100%** |
| Proveniência de fontes com confiabilidade | **100%** |

**O §38 da etapa ("IA gera DRAFT → Admin revisa → aprova → publica") já está
implementado e testado.** Não precisa ser desenhado, precisa ser conectado às
superfícies que faltam (playbook, cenários, missões, conhecimento).

---

## 10. Resumo — percentual e o que falta

| Área | Reaproveitamento | O que falta |
|---|---|---|
| **Gamificação / Metas / Performance / Ranking** | **100%** | valorar `MISSAO`; teste de badge |
| **Training Intelligence** | **100%** | conectar às 4 superfícies faltantes |
| **Universidade** | **95%** | conteúdo; competências de supervisor/coordenador; vincular escolas |
| **Conselheiro** | **90%** | contexto por papel; governança admin; rotas de `PLATFORM_ADMIN` |
| **Simulador** | **85%** | cenários de liderança; CRUD admin; decisão de privacidade |
| **Manager Command Center** | **80%** | escopo por árvore; revelar missões gerenciais |
| **Academia (como motor)** | **100%** | só a porta muda |
| **Treinador (como engenharia)** | **~70% aproveitável** | endpoint admin de Playbook; decidir o destino da conversa livre |
| **Missões** | **70%** | **cascata de comando: 0%** |
| **Hierarquia / RBAC** | **35%** | árvore, 2 papéis, escopo que falha fechado |

---

## 11. O que NÃO deve ser refeito — lista fechada

Validada contra o código, item por item:

1. **Ledger de XP/VendaCoins** — imutável, idempotente, com reversão compensatória
2. **Régua de gamificação versionada** por empresa
3. **Score Geral** com redistribuição de peso por amostra insuficiente
4. **Baseline pessoal** (14 dias fechados, mínimo 5 amostras)
5. **Streak** sobre dias fechados
6. **7 rankings paralelos** por snapshot, com privacidade de faturamento
7. **Motor de metas e sync ERP idempotente**
8. **Attention Engine** determinístico
9. **Manager Command Center** inteiro
10. **Separação personagem × avaliador** do Simulador
11. **Nota do Simulador calculada no backend**
12. **Gabarito e score do quiz no servidor**, com anti-fraude de conjunto
13. **Competency Score Engine e Gap Engine**
14. **Evidência imutável com 4 fontes**
15. **PDI e avaliação de gerente versionada**
16. **Certificação idempotente** com 6 tipos de requisito
17. **Revisão espaçada**
18. **Playbook oficial** com origem por enum
19. **Pertinência, histórico governado, continuidade e conhecimento do Conselheiro**
20. **Knowledge Router puro** (com teste que proíbe IA, banco e não-determinismo)
21. **AI Gateway** com budget, ledger, credencial cifrada e kill-switch
22. **Pipeline de Training Intelligence** com gate humano
23. **CMS com lifecycle de 5 estados** reusado em 7 entidades
24. **Ativação por CPF + token** com consumo atômico
25. **Auditoria append-only** (empresa e plataforma)

**Vinte e cinco fundações.** A V1 constrói **em cima** delas.
