# Auditoria Técnica — Produto Atual × Nova Arquitetura

Documento de evidência. Baseline `40d7331`, árvore limpa. **Zero alteração de produção,
zero migration, zero dependência, zero chamada de IA real.** Tudo abaixo foi lido do
código, do schema e do seed — nada veio de documentação antiga sem confirmação.

A leitura executiva está em `APRESENTACAO-EXECUTIVA-VENDEDOR-IA-NOVA-ARQUITETURA.md`.
Este arquivo é o lastro.

---

## 1. O produto em números

| Dimensão | Medido |
|---|---|
| Models Prisma | **79** |
| Enums Prisma | **74** |
| Migrations | **28** |
| Endpoints HTTP | **193** (190 declarações literais + 4 geradas por `rotaTransicao` em `admin.ts`, menos 1 de contagem dupla) |
| Arquivos `.ts` em `src/` (sem teste) | **189** |
| Serviços (`*.service.ts`) | **100** |
| Routers | **23** |
| Telas (componentes de tela) | **30** em **31 rotas** |
| Componentes compartilhados | **8** |
| Wrappers de API no front | **17** (16 de domínio + 1 cliente base) |
| Filas BullMQ | **4** (3 repetíveis + 1 sob demanda) |
| Especialistas de IA (`EspecialistaIA`) | **14**, todos em uso |
| Papéis (`Papel`) | **4** |
| Testes backend | **1039** em 99 arquivos (80 integração + 19 unitários) |
| Testes frontend | **173** em 33 arquivos |
| Testes E2E | **41** em 22 specs |
| Scripts operacionais | **18** |

### Distribuição dos 193 endpoints por proteção

| Guard | Qtd | Leitura |
|---|---|---|
| `requireAuth('ADMIN')` | 92 | O Admin é, em superfície, o maior usuário do sistema |
| `requireAuth()` — qualquer autenticado | 56 | **Aqui mora a multi-papel que já existe** |
| `requireAuth('GERENTE')` | 30 | Todas em `manager-panel.ts` |
| `requireAuth('ADMIN','GERENTE')` | 10 | Universidade/Competições/leitura de usuários |
| Público | 5 | health×2, `/lojas`, login, ativação |
| `requireAuth('PLATFORM_ADMIN')` | **0** | O papel existe e não tem nenhuma rota |

---

## 2. Hierarquia real — o gap estrutural

### O que existe

```
Empresa ──1:N── Loja ──1:N── Vendedor (papel ∈ {VENDEDOR, GERENTE, ADMIN, PLATFORM_ADMIN})
```

`Vendedor.lojaId` é **escalar, obrigatório, singular** (`prisma/schema.prisma:99,122`).
`Loja.vendedores` é o lado N. **Não existe tabela de junção pessoa↔loja** em nenhum
dos 79 models.

### O que NÃO existe

| Procurado | Resultado |
|---|---|
| `SUPERVISOR`, `COORDENADOR` | **zero ocorrências** em `src/`, `prisma/`, `web/src/` |
| `parentId`, `supervisorId`, `reportsTo`, `liderId` | **zero** |
| Model `Team`, `Grupo`, `Equipe`, `Squad` | **não existe** |
| Gerente multi-loja | **impossível pelo schema** — `lojaId` é escalar único |
| Aresta "vendedor X reporta ao gerente Y" | **não existe** |

A única "hierarquia" é derivada em memória, com 2 níveis fixos, em
`src/routes/admin.ts:184-208`: agrupa por loja e separa por `papel`. Dois gerentes
na mesma loja são **indistinguíveis**.

"Equipe" é derivada, não modelada — `src/universidade/manager-scope.service.ts:13`:
equipe do gerente = `Vendedor` com mesmo `empresaId` + mesmo `lojaId` + `papel='VENDEDOR'`.

### Como o escopo é aplicado hoje — 3 padrões

**A) `lojaRestritaDe(req)`** — ternário duplicado **literalmente em 3 arquivos**
(`admin.ts:29`, `universidade-manager.ts:40`, `competicoes-manager.ts:28`):

```ts
return req.auth!.papel === 'GERENTE' ? req.auth!.lojaId : undefined;
```

**B) `garantirVendedorNoEscopoDoGerente`** (`manager-scope.service.ts:13`) — guarda
anti-IDOR com `papel: 'VENDEDOR'` hardcoded e 404 genérico.

**C) `(empresaId, lojaId)` posicional** — as 30 rotas de `manager-panel.ts`.

### Leituras do JWT

| Claim | Ocorrências | Concentração |
|---|---|---|
| `req.auth.vendedorId` | 134 | difusa |
| `req.auth.empresaId` | **74** | 12 arquivos |
| `req.auth.lojaId` | **27** | **23 das 27 em `manager-panel.ts`** |
| `req.auth.papel` | 10 | só 3 usos reais (as 3 cópias de `lojaRestritaDe`) |

**Leitura que importa:** o tenant real do sistema é `empresaId`. `lojaId` é
essencialmente um recorte do Painel Gerencial. Inserir dois níveis entre empresa e
loja mexe num eixo que hoje quase não é usado — o que é boa notícia para o custo, e
má notícia para a cobertura de testes desse eixo.

---

## 3. Riscos de escopo já presentes (não corrigidos — §66 desta auditoria)

### R1 · ALTO · `POST /auth/login` resolve loja sem filtrar empresa

`src/routes/auth.ts:80`:
```ts
const loja = await prisma.loja.findFirst({ where: { codigoErp: codigoErpLoja, ativa: true } });
```

Mas a unicidade é **por empresa** (`prisma/schema.prisma:49`: `@@unique([empresaId, codigoErp])`).
Com duas empresas no mesmo banco, duas lojas podem legitimamente ter o mesmo
`codigoErp`, e `findFirst` escolhe uma em silêncio. O login então valida a matrícula
contra a loja errada e, casando, emite JWT com `empresaId`/`lojaId` da **empresa errada**.

O próprio schema documenta o risco nas linhas 44-48. O comentário existe; a query não
aplica. E o `GET /lojas` adjacente (`auth.ts:31`) **filtra certo** — o que torna a
inconsistência mais visível, não menos.

Hoje é inócuo: há uma empresa só. Vira crítico no dia em que houver duas.

### R2 · MÉDIO (hoje) / ALTO (com hierarquia) · Entidades globais sem coluna de tenant

Sem `empresaId`: `Season`, `Competition`, `League`, `Recognition`, `AcademyTrack`,
`AcademyLesson`, `AcademyQuiz`, `AcademyQuestion`, `Competency`, `CompetencyTarget`,
`DevelopmentPlan`, `DevelopmentPlanItem`, `CertificationDefinition`.

Está assumido explicitamente em `src/routes/admin-training.ts:3-5` ("catálogo é
global… a autorização em si já é o controle de acesso") — mas **não há comentário
equivalente** em `competicoes-admin.ts` nem em `universidade-admin.ts`.

Leituras concretas sem escopo, alcançáveis por GERENTE:
- `src/routes/competicoes-manager.ts:33` — `GET /equipe/competicoes` chama
  `listarCompetitions('ACTIVE')` **sem argumento de escopo**; a rota nem lê `req.auth`.
- `src/manager/daily-huddle.service.ts:116` — `competition.findMany({ where: { status: 'ACTIVE' } })`
  dentro da Reunião do Dia, que é a rota mais escopada do produto.

### R3 · MÉDIO · Dois gerentes da mesma loja leem as notas privadas um do outro

`OneOnOne`, `ManagerFollowUp` e `ManagerActionPlan` **têm coluna `managerId`** e
`OneOnOne` até tem índice `@@index([empresaId, lojaId, managerId])`
(`prisma/schema.prisma:2474`). Mas os filtros são só `(empresaId, lojaId)`:
`one-on-one.service.ts:45`, `followup.service.ts:42,49`, `action-plan.service.ts:51,57`.

O cabeçalho de `one-on-one.service.ts:1-4` afirma que as notas são "PRIVADAS do
gerente". A garantia real é **por loja**. A coluna para fechar isso já existe.

Isto é diretamente relevante ao §12 da nova visão (hierarquia ≠ acesso): o padrão
atual de privacidade é geográfico, não pessoal.

### R4 · ALTO para a nova hierarquia · `lojaRestritaDe` falha ABERTO

As três cópias tipam o parâmetro como `{ papel: string }`, **não como `Papel`**.
Adicionar `SUPERVISOR` ao enum **não gera nenhum erro de compilação** nas três — elas
simplesmente caem no ramo `undefined`, que significa **escopo de empresa inteira**, o
mais permissivo possível.

Ou seja: o mecanismo de escopo atual, diante de um papel novo, abre em vez de fechar.
Esse é o achado que mais importa para o §38.

### R5 · BAIXO · `testarConexaoProvider` fura o Gateway

`src/ai-platform/admin-ai.service.ts:168` chama `instancia.generateResponse(...)`
direto, sem `gerarViaGateway`. Consequência: não respeita o kill-switch
`config.enabled` e **não verifica budget**. O próprio comentário (`:157-160`) admite
que "o teste consome budget/custo de verdade".

### Onde NÃO há risco (verificado)

`lojaId`/`empresaId` **nunca** são aceitos do cliente para decidir escopo — grep por
`req.query.lojaId|req.body.lojaId|req.params.lojaId|req.query.empresaId|req.body.empresaId`
em `src/` (excl. testes): **zero**. Os dois `lojaId` em schema Zod são alvos de
escrita, revalidados contra `req.auth.empresaId`.

---

## 4. Módulos de aprendizagem — quem faz o quê

### Treinador — **o único módulo com conteúdo OFICIAL da empresa**

| Peça | Estado |
|---|---|
| UI | `web/src/screens/Treinador.tsx` (205 l.), rota `/treinador`. Um componente, dois títulos: "Treinador de Gestão" (gerente) ou "de Vendas" (vendedor) |
| Endpoints | 5 + `GET /playbook/active` |
| **Playbook** | **1 playbook, 14 seções — 13 `OFICIAL`** extraídas palavra por palavra de `[SDL]-13-Mandamentos.pptx`, material real da empresa. 1 seção `DEMONSTRATIVO` (objeções, porque não há material oficial) |
| Distinção OFICIAL/demonstrativo | **Enum de banco** (`OrigemConteudoPlaybook`), propagado ao prompt e explicitado no system prompt |
| Modos | **15** — 10 de vendas + 5 gerenciais (LIDERANCA, FEEDBACK, REUNIAO_1A1, GESTAO_DE_CONFLITOS, DESENVOLVIMENTO_DE_EQUIPE) |
| Prompt gerencial | **Já existe, separado** — `prompts/system-prompt-gerencial.ts` + `manager-context.ts` (que não usa Playbook: `playbookId: null`) |
| Objeções | Lista **estática hardcoded**, 11 itens, sem banco (`objection.service.ts`) |
| Admin | **Não existe endpoint administrativo de Playbook** — só seed/script |
| Testes | 68 |

Recuperação do Playbook é determinística por mapa `modo → categorias`, sem RAG. O
mesmo `getSecoesPorCategorias` é reaproveitado pelo **Simulador** e pela **Academia**.

**Nota:** as categorias `PRINCIPIOS` e `ARGUMENTACAO` não têm nenhuma seção seedada,
apesar de 5 modos apontarem para `PRINCIPIOS`.

### Academia — o conteúdo e o CMS

| Item | Seed |
|---|---|
| Trilhas | **4** |
| Aulas | **7** |
| Quizzes | **4** (3 das 7 aulas não têm quiz) |
| **Perguntas no sistema inteiro** | **6** |
| Origem do conteúdo | **100% `DEMONSTRATIVO`** (redação pedagógica própria) |
| 13 Mandamentos (`MandamentoOficial`) | **13 linhas vazias**, `conteudoOficial = null`, status DRAFT |
| Nota de corte | **70** em todos os 4 quizzes (default do model e do seed) |
| Gabarito | **100% servidor** — `correct` nunca sai na resposta |
| CMS | 16 endpoints `/admin/training/*` + tela `AdminTreinamento.tsx` |
| Testes | 44 (+18 do CMS) |

### Universidade — a medição, sem conteúdo próprio

| Item | Seed |
|---|---|
| Escolas | **8** |
| Competências | **22** (11 vendedor + 11 gerente) |
| `CertificationDefinition` | **0** |
| `CertificationRequirement` | **0** |
| `CompetencyTarget` | **0** (tudo cai no default 70) |
| `DevelopmentPlan` / PDI | **0** |
| `CompetencyEvidence` | **0** (só nasce por uso) |
| `UserCertification` | **0** |
| `ReviewSchedule` | **0** |
| Serviços | 12 |
| Endpoints | **33** (10 vendedor + 5 gerente + 18 admin) |
| Testes | **97** |

**Consequência medida:** `MINIMO_EVIDENCIAS_PARA_SCORE = 2`. Num banco recém-seedado
todo vendedor tem 0 evidências → **toda a matriz de competências retorna
`NOT_ENOUGH_DATA`**. Sem certificação publicada, a aba "Certificações" nunca mostra nada.

E as 8 escolas não estão ligadas a nada: `AcademyTrack.escolaId` é opcional e
**nenhuma das 4 trilhas do seed recebe escola**.

### A sobreposição Academia × Universidade — o achado que muda a decisão

**Elas não fazem a mesma coisa.** São duas camadas:
**Academia = conteúdo e entrega. Universidade = medição e certificação em cima desse conteúdo.**
A Universidade **não tem nenhum conteúdo próprio**.

O acoplamento já é **bidirecional e intencional**:

| Direção | Evidência |
|---|---|
| Academia → Universidade | `src/academia/quiz.service.ts:8-10` importa `gerarEvidenciaDeQuiz`, `concluirItemPDIPorConteudo`, `registrarResultadoQuestao` |
| Universidade → Academia | `spaced-repetition.service.ts:53,86` lê `AcademyQuestion`; `certification.service.ts:164,171,178` lê `AcademyLesson`+`AcademyProgress`; `learning-path.service.ts:46` lê `AcademyTrack`; `certification.service.ts:11` importa `checarCompletudeMandamentos` (que mora na Academia) |

**Zero sobreposição de endpoint.** Nenhum `/academia/*` duplica um `/universidade/*`.
As telas são complementares: `/academia` consome aula/quiz, `/universidade` mostra
score, PDI e certificado.

**O que a Academia tem e a Universidade não tem:** conteúdo didático
(`AcademyLesson.content`, vídeo, material), banco de questões com gabarito, quiz com
nota, progresso de consumo, CMS completo, os 13 Mandamentos, vínculo ao Playbook, e
**a concessão de XP/moeda** (a Universidade nunca recompensa — separação documentada
em `quiz.service.ts:176-178`).

**O que a Universidade tem e a Academia não tem:** competências, targets, evidências
ponderadas, score/gap, PDI, avaliação de gerente, certificação com 6 tipos de
requisito, revisão espaçada, escolas, recomendação por IA.

### Quiz — a regra nova já é possível, falta conteúdo

| Requisito da nova visão | Estado hoje |
|---|---|
| Aprovação determinística server-side | **Já é** (`quiz.service.ts:132-151`) |
| Mínimo 70% | **Já é** — `passingScore` default 70 em todos os quizzes, configurável por quiz via `PUT /admin/training/lessons/:id/quiz` |
| 10 perguntas por prova | **Campo já existe** (`questionsPerAttempt`), com anti-repetição de conjunto e anti-fraude. **Nenhum quiz do seed o configura** |
| IA ajuda a criar perguntas | **Já existe** — `quiz-agent.service.ts`, e a questão nasce `active: false` |
| **10 perguntas de verdade** | **Impossível hoje: o maior quiz tem 2 perguntas, e há 6 no sistema inteiro** |

Não há limite de tentativas nem cooldown. Cada tentativa gera evidência, aprovado ou não.
Recompensa só na 1ª aprovação (idempotente).

Num quiz de 1 pergunta, o corte de 70% é binário (0 ou 100). Num de 2, exige acertar
as duas (50 < 70).

---

## 5. Simulador — mais perto da nova visão do que parece

| Item | Estado |
|---|---|
| Cenários no seed | **14** — 12 de venda + **2 gerenciais** (`FEEDBACK_BAIXA_PERFORMANCE`, `CONDUZIR_1A1_DESENVOLVIMENTO`) |
| Separação cenário/personagem/conversa/avaliador | **Existe de verdade** — 4 arquivos, 2 prompts distintos (`system-prompt-cliente.ts`, `system-prompt-avaliador.ts`), 2 contextos, 2 `mode` na telemetria |
| Nota final | **Backend** — média dos critérios em `evaluation.service.ts:52`. Formato inválido → `EVALUATION_PENDING`, nunca nota falsa |
| Rubrica | **11 critérios**; cada cenário declara 2-4; o LLM nunca escolhe |
| Dificuldade | 3 níveis derivados de **uma** persona base (varia nº de objeções, comportamento e `maxTurns` 8/11/15) |
| Evidência de competência | **Sim** — `gerarEvidenciaDeSimulacao` com `scoreFinal` do backend |
| Mínimo de turnos p/ recompensa | 3 |
| **Multi-papel** | **JÁ EXISTE para GERENTE** — `listarCenariosAtivos(papel)` filtra `GESTAO_DE_PESSOAS`; `resolverCenario` nunca revela o catálogo do outro papel; teste dedicado (`simulador-gerencial.integration.test.ts`, 5 testes) |
| Admin cria cenário pela UI | **Não** — só via pipeline de IA (`TrainingScenarioDraft` → aprovar → publicar). Não há `POST /admin/simulador/cenarios` |
| Chamadas de IA por sessão | **N + 2** → EASY 10, MEDIUM 13, HARD 17 |
| Testes | 59 |

**Ponto de UX, não de backend:** o gerente pode acessar `/simulador` (a rota é
`requireAuth()` sem papel), mas **não tem nenhum link visível** — `Evoluir.tsx` está no
Layout do vendedor e `GerenteHome.tsx` só linka `/equipe`, `/gerente/pendencias` e
`/gerente/reuniao-do-dia`.

---

## 6. Missões — o maior gap real da nova visão

| Item | Estado |
|---|---|
| Critérios (`CriterioMissao`) | **10**, todos implementados em switch exaustivo |
| Atribuição | **100% automática pelo sistema**, na leitura do `GET /missoes/ativas` |
| Recomendação | Determinística, prioridade fixa, sem LLM, cap de **3/dia** |
| Catálogo | Seed em código, **global, sem UI** — 7 missões de vendedor + 3 gerenciais + 3 desafios |
| **Admin cria missão pela UI** | **Não existe.** Zero rota admin de missão |
| **Gerente atribui missão** | **Não existe.** Prova: as 5 rotas de `missoes.ts` são todas `GET`; `manager-panel.ts` só lê; `atribuicao.service.ts` não tem parâmetro de autor nem de equipe |
| Escopo de `MissionAssignment` | **Sempre `vendedorId` individual** — não há missão de loja/equipe |
| Missões gerenciais | **3 existem no backend** (`RECOGNITION_CREATED`, `ONE_ON_ONE_COMPLETED`, `PDI_REVIEWED`), sobre ações do próprio gerente |
| Missão gerencial no front | **MORTA** — `listarMissoesGerenciais()` existe em `web/src/api/managerPanel.ts:285` e **nenhuma tela a chama** |
| Desafios | 3, semanais, **individuais** |
| **Recompensa** | **Estruturalmente 0** — `REGUA_V1` não define `MISSAO` em `regrasXp` nem `regrasMoeda` |
| Efeitos que de fato ocorrem | evidência de competência, conclusão de item de PDI, evento no feed |
| Testes | 47 |

---

## 7. Conselheiro — o mais maduro, e já multi-papel por acidente de arquitetura

| Item | Estado |
|---|---|
| Rotas | 6, todas `requireAuth()` **sem papel** → gerente já pode conversar |
| Pertinência (2B.1) | Gate determinístico: domínio não autorizado **não é buscado no banco** |
| Histórico governado (2B.4) | Autorização de turno vale também para o passado |
| Continuidade (2B.2) | `CoachIntervention` com ciclo de vida, "um assunto por vez" |
| Conhecimento (2C.1-2C.5) | Router puro → Retriever → orquestrador → contexto. 6 cards publicados |
| Privacidade | `PLATFORM_ADMIN` **não alcança** conversa, check-in nem memória (documentado no enum e testado) |
| **Governança pela UI** | **Não existe.** O módulo `conhecimento` **não está montado em `src/app.ts`** — nenhum router de knowledge. Cards só por script CLI |
| `PLATFORM_ADMIN` | **0 rotas.** O papel existe, o serviço o reconhece, e não há superfície HTTP |
| Provider real | **Nenhum configurado** (2C.6 parada no gate) |
| Testes | ~200 entre coach/pertinencia/conhecimento |

---

## 8. Gamificação, Metas, Performance, Ranking — preservados e sólidos

| Capacidade | Backend | Front | Seed | Observação |
|---|---|---|---|---|
| XP | ledger idempotente | Carteira + Home | 12 eventos valorados | — |
| VendaCoins | ledger + reversão | extrato por cursor | 11 eventos | — |
| Níveis | 6 níveis hardcoded (Bronze→Elite) | carteira | em código | — |
| Badges | catálogo de **10** | `/conquistas` | upsert no seed | **sem arquivo de teste dedicado** |
| Streak | tiers 3/5/10 | Home | valorado | só dias fechados |
| Baseline | 14 dias, mín. 5 amostras | indireto | — | — |
| Score Geral | pesos .40/.20/.15/.15/.10 | Ranking | `REGUA_V1` | 18 testes |
| Rankings | **7 tipos × 2 escopos × 3 períodos**, snapshot | Ranking | — | recalculado pelo sync ERP |
| Competições | 9 de 10 métricas com calculador | Competicoes + AdminGamificacao | **zero seed** | `CUSTOM_RULE` fora por design |
| Temporadas | fila a cada 15 min | aba Temporada | **zero seed** | — |
| Ligas | promoção/rebaixamento | aba + admin | **seedadas lazily no GET admin** | — |
| Reconhecimento | 7 tipos, sanitiza HTML | Equipe + aba | — | nunca altera KPI |
| Feed | idempotente, system-generated | aba Feed | — | nunca LLM |

### ERP

- Job BullMQ `'0 * * * *'`, 5 tentativas, backoff exponencial.
- **`ERP_MODE = 'mock'`** hoje.
- **`LinxErpAdapter` nunca validado:** 47 linhas, endpoint chutado
  (`/lojas/{codigo}/indicadores-vendedor`), `// TODO: mapear campos reais do payload
  Linx` na linha 31, **zero testes**. O único teste da pasta é do mock (6).
- Premissa documentada e **não validada**: cada snapshot é o acumulado do dia, não incremento.

---

## 9. Inventário de IA — onde o custo mora

### Chamadas por operação

| Operação | Chamadas |
|---|---|
| **1 mensagem ao Conselheiro** | **1 a 3** — `response_classifier` + `intent_classifier` + `coach`. Ambos os classificadores têm curto-circuito determinístico por regex |
| 1 mensagem ao Treinador | 1 |
| Abrir sessão do Simulador | 1 |
| Mensagem no Simulador | 1 (2 no último turno, que encadeia a avaliação) |
| Encerrar sessão | 1 |
| **Sessão completa de Simulador** | **N+2 → 10 (EASY), 13 (MEDIUM), 17 (HARD)** |
| Job `PACOTE_TREINAMENTO` | **4 a 6** (até 12 com retry) |
| Job `ATUALIZACAO_CONTEUDO` | 1 a 2 |
| Sugestão de PDI/trilha | 1 |
| Conselho do Assistente de Gestão | 1 |
| Testar conexão (Admin) | 1 — **sem checagem de budget** |

### Controles

| Controle | Valor |
|---|---|
| Budget mensal por empresa | default US$ 20 (env); **US$ 15 configurado** no banco de dev |
| Rate limit diário por vendedor | **20 mensagens — implementado 3× independentemente** (Coach, Treinador, Simulador), por especialista e não global, por decisão documentada |
| Agentes de Training Intelligence | **sem rate limit diário** — só `TRAINING_JOB_DAILY_LIMIT_PER_ADMIN = 10` + budget |
| Assistente de Gestão | **sem rate limit diário** |
| Janela de histórico | 16 mensagens |
| Input máximo | 4000 chars |
| Timeout | 15 s |
| Preço real na tabela | **só Anthropic**. OpenAI e Gemini são **placeholder explícito** |
| Fallback de modelo desconhecido | o mais caro da tabela (viés conservador) |

### Determinismo já preferido a IA (não reconstruir)

Nota do simulador · gabarito do quiz · classificador determinístico de intenção ·
classificador determinístico de resposta · gate de pertinência · Knowledge Router
(com teste que proíbe `prisma.`, `gerarViaGateway`, `Date.now`, `Math.random`) ·
guard dos 13 Mandamentos · validação estrutural de questão · revalidação de IDs
propostos pelo LLM · retrieval de fontes · máquinas de estado de publicação ·
KPIs do Daily Huddle.

### Geração de conteúdo por IA — revisão humana já é obrigatória e provada

| Gerador | Nasce como | Quem publica |
|---|---|---|
| Aula | `status: DRAFT`, `origemEditorial: AI_GENERATED` | job só termina em `WAITING_REVIEW`; publicar exige `revisarJob` humano |
| Questão de quiz | **`active: false`** | Admin ativa |
| Cenário de simulação | `TrainingScenarioDraft` | máquina `DRAFT→REVIEW_PENDING→APPROVED→PUBLISHED` |
| Parecer de governança | `TrainingGovernanceFinding` | nunca altera conteúdo |

**Não existe geração de KnowledgeCard por IA** — e há teste proibindo `gerarViaGateway`
naquele módulo.

---

## 10. Telas — as 30, com destino

Bottom nav tem **5 itens fixos, iguais para vendedor e gerente**: Início · Performance ·
Evoluir · Ranking · Perfil. O gerente vê os mesmos 5, e três deles apontam para telas
de vendedor. O acesso dele às telas gerenciais só existe por cards dentro de
`GerenteHome` e um link em `Perfil`.

Hub **Evoluir** lista hoje **4 módulos**: Treinador · Simulador · Academia ·
Universidade. O Conselheiro **já foi removido de lá** (Fatia 9.6) e virou card na Home;
`/coach` segue funcionando por deep-link. Missões e Competições **não estão no hub**.

### Telas que são casca por falta de dado, não de código

| Tela | Por quê |
|---|---|
| `Competicoes` (6 abas) | **zero season, competição ou liga seedada** |
| `AdminGamificacao` (3 abas, CRUD completo) | **zero registro** — todas as listas nascem vazias |
| `Universidade` — aba Certificações | **zero `CertificationDefinition`** |
| `Universidade` — aba Minha Evolução | `NOT_ENOUGH_DATA` até haver 2 evidências |
| `Revisao` | vazio até haver uso |
| `AdminTreinamento` — aba Mandamentos | 13 linhas, conteúdo oficial `null` |
| `Badges` | catálogo real, mas vazio até conquistar |
| `Ranking` / `Carteira` | dependem de cálculo/evento do dia |

---

## 11. Testes — baseline e uma fragilidade medida

| Suíte | Resultado |
|---|---|
| Backend | **1039 / 1039** (99 arquivos) |
| Frontend | **173 / 173** (33 arquivos) |
| E2E | **41 / 41** na terceira execução |
| Typecheck backend + web | limpo |
| Build backend + web | limpo |

**Fragilidade medida, não teórica:** nas duas primeiras execuções completas do E2E
nesta auditoria o resultado foi **40/41, com o spec que falha variando** —
`jornada-academia` na primeira, `jornada-coach` na segunda, `41/41` na terceira. Cada
um passa isolado. Causa: os 22 specs compartilham o **banco de desenvolvimento**, e os
scripts de reset (`reset:academia-e2e`, `reset:coach-e2e`, …) cobrem o próprio spec,
não o resíduo deixado pelos outros. A execução de harness que fizemos na 2C.6 contra o
mesmo banco foi suficiente para inclinar o resultado.

Isto não é regressão do produto — é infraestrutura de teste. E é um risco real para
qualquer transformação: uma suíte que varia não consegue provar ausência de regressão.

---

## 12. Módulos sem serviço / código morto

| Item | Situação |
|---|---|
| `PlatformActor` | Zero acesso em produção; só teste e `scripts/publicar-piloto-habitos.ts` |
| Módulo `conhecimento` | **Não montado em `src/app.ts`** — sem nenhuma rota HTTP |
| `requireAuth('PLATFORM_ADMIN')` | **0 ocorrências** |
| `listarMissoesGerenciais()` (front) | Definida, **nunca chamada** |
| `ChallengeDefinition`/`ChallengeAssignment` | Sem rota própria; só via `missoes.ts` |
| `REGUA_V1.MISSAO` / `.COMPETICAO` | Eventos existem no enum, **nunca valorados** |
| `PRINCIPIOS` e `ARGUMENTACAO` (Playbook) | 5 modos apontam para elas; **zero seções seedadas** |
| `AcademyTrack.escolaId` | Campo existe; **nenhuma trilha do seed o preenche** |
| `seedMissoesEDesafios` / `seedCenariosSimulador` | `update: {}` — editar título no seed **não propaga** para bancos existentes |
