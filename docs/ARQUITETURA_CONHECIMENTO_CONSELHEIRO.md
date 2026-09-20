# Arquitetura do Conhecimento do Conselheiro

> **Etapa 2C.0 — desenho e auditoria. Zero código de produção alterado.**
>
> Zero migration · zero dependência · zero chamada de IA nova.
>
> Data: 2026-09-19. Baseline: `7f3c9f2`.

---

## 1. Objetivo

Descobrir o que já existe e definir a arquitetura mais simples e governada para
o Conselheiro **ter conhecimento sem virar chato**.

A pergunta não é "como colocar mais informação no prompt". É:

> **Tecnologia complexa por trás. Conversa simples na frente.**
>
> O Conselheiro não precisa mostrar tudo o que sabe. Precisa saber o que é útil
> dizer naquele momento.

---

## 2. O achado central da auditoria

O projeto tem **duas metades de um sistema de conhecimento que nunca se
encontraram**:

| | Motor de pertinência | Conhecimento curado |
|---|---|---|
| **Conselheiro** | ✅ completo (2B.0–2B.4) | ❌ **nenhum** |
| **Treinador** | ❌ nenhum | ✅ completo (Playbook governado) |

O Conselheiro sabe *quando* falar e *o que lembrar* da pessoa — e não tem nada
para falar além do que o modelo já sabe por si. O Treinador tem conteúdo
oficial, versionado, rotulado e recuperado deterministicamente — e carrega
performance sempre, sem gate.

**A 2C não precisa construir um sistema de conhecimento. Precisa casar as duas
metades que já existem.** Isso muda radicalmente o tamanho da obra.

### O que o Conselheiro sabe hoje sobre desenvolvimento

Apenas **títulos**: `listarAtividadesRecentes` traz título, data e nota das
atividades concluídas — nunca o conteúdo de uma aula. A superfície de
conhecimento do Conselheiro hoje é literalmente zero.

---

## 3. Princípios

1. **Necessidade antes de conhecimento.** Nada é carregado antes de sabermos se é útil.
2. **`NO_KNOWLEDGE` é o caso comum**, não a exceção.
3. **Minimum useful knowledge.** Recuperar o mínimo que responde bem.
4. **Uma necessidade por vez** — a mesma disciplina que a 2B.3 estabeleceu para intervenções.
5. **O gate autoriza o carregamento, não a renderização** — o que não é carregado não vaza.
6. **Conteúdo é DADO, nunca instrução.**
7. **O sistema não inventa conteúdo oficial.**
8. **Saber ≠ falar.** Silêncio continua sendo inteligência.
9. **Curto primeiro, profundidade sob demanda.**
10. **Classificar honestamente** — ciência é ciência, reflexão é reflexão.

---

## 4. Auditoria: o que já existe

### 4.1 Treinador — o modelo a seguir (`src/treinador/playbook.service.ts`)

É uma camada de conhecimento governada **já em produção**:

- **Tenant-scoped**: toda consulta exige `empresaId`; nunca busca por id isolado.
- **Lifecycle + versão**: `DRAFT → PUBLISHED → ARCHIVED`, `versao` incremental,
  índice único parcial garantindo **1 PUBLISHED por empresa**. Publicar arquiva
  a anterior — nunca apaga.
- **Recuperação determinística**: `CATEGORIAS_POR_MODO: Record<ModoTreinador, CategoriaPlaybook[]>`.
  Zero IA, zero busca semântica. O comentário do próprio arquivo diz o porquê:
  *"deliberadamente simples/auditável — nada de busca semântica/RAG nesta fatia"*.
- **Nunca o playbook inteiro**: só as seções da(s) categoria(s) do modo atual.
- **Proveniência rotulada**: `OrigemConteudoPlaybook = OFICIAL | DEMONSTRATIVO`,
  renderizada no prompt como `[OFICIAL]` / `[DEMONSTRATIVO]`, com instrução
  explícita de dizer ao vendedor quando algo **não** é política da loja.
- **Anti-injection estrutural**: `sanitizarRelatoLivre` colapsa quebras de linha
  do texto do vendedor, porque um relato multi-linha conseguia **forjar um bloco
  de playbook visualmente idêntico ao real** — achado de security review da
  Fatia 5. O bloco verdadeiro só é produzido pelo formatador.
- **Já compartilhado**: `getSecoesPorCategorias` serve Simulador e Academia.

**Conclusão: o padrão de recuperação governada já está provado neste repo. A 2C
deve estendê-lo, não recriá-lo.**

### 4.2 CMS (Fatia 7.5C) — governança editorial pronta

`AcademyLesson` já carrega tudo que um item de conhecimento precisa:

```
status          StatusConteudo   (DRAFT/REVIEW_PENDING/APPROVED/PUBLISHED/ARCHIVED)
audience        PublicoConteudo  (SELLER/MANAGER/BOTH)
origemEditorial OrigemEditorial  (ADMIN_CURATED/AI_RESEARCHED/AI_GENERATED/...)
origem          OrigemConteudoPlaybook (OFICIAL/DEMONSTRATIVO)
version         Int
createdBy / approvedBy / publishedAt
trainingJobId   (rastreia o job de IA que gerou o rascunho)
competencyIds   Json
playbookCategoria CategoriaPlaybook?
```

**Não precisamos de um CMS novo.** Precisamos, no máximo, de um tipo de conteúdo
novo dentro do CMS que existe.

### 4.3 Training Intelligence (Fatia 7.5D) — produção de conteúdo, já resolvida

Sete agentes lógicos (Research, Curator, Instructional Designer, Quiz,
Simulation Designer, Governance, Content Update) sobre `chamarAgente`, que
centraliza budget → Gateway → `AIUsage` → validação Zod.

Regra fundamental já implementada: **IA não é autoridade editorial** — todo
output nasce rascunho e passa pelos mesmos gates do CMS manual.

**Distinção que a 2C.0 precisa fazer e que o repo já respeita:**

| | Produzir conteúdo | Recuperar em conversa |
|---|---|---|
| Quem faz | Training Intelligence | Playbook service |
| Quando | offline, em job assíncrono | no turno, em milissegundos |
| Custo | chamadas de IA | zero IA |
| Aprovação | humana, antes de publicar | nenhuma (já publicado) |

**A curadoria do conhecimento do Conselheiro já tem motor: é o Training
Intelligence.** Falta apenas o destino — um tipo de conteúdo que o Conselheiro
consuma.

### 4.4 Taxonomia — já existe, e é administrável

`EscolaUniversidade`, 8 escolas seedadas **hoje no banco**:

```
vendas · atendimento · produto · performance
organizacao · desenvolvimento-pessoal · lideranca · gestao-equipes
```

Duas delas — **Organização e Produtividade** e **Desenvolvimento Pessoal e
Financeiro** — são exatamente o território que a 2C quer cobrir, e já estão
modeladas, com `audience` e `sortOrder`.

E 23 `Competency` com `category` (`COMERCIAL` / `LIDERANCA`).

**Não vamos inventar 18 famílias novas. A taxonomia existe.**

### 4.5 13 Mandamentos

13 posições sempre existem; `conteudoOficial` é **nullable** e hoje **1 de 13
está preenchido**. O sistema nunca inventou os outros 12 — disciplina que a 2C
herda integralmente.

### 4.6 AI Gateway

`EspecialistaIA` tem **12 valores**. Todo consumo passa por `gerarViaGateway`;
o singleton global de provider foi removido do código na 7.5B, tornando
estruturalmente impossível pular o Gateway.

### 4.7 Volume real de conteúdo — o dado que decide as perguntas técnicas

Contagem no banco de dev, hoje:

| Conteúdo | Unidades |
|---|---|
| `academy_lesson` | 10 (média **451 chars**, máx 611) |
| `playbook_section` | 14 |
| `mandamento_oficial` | 13 (1 com conteúdo oficial) |
| `simulation_scenario` | 14 |
| `competency` | 23 |
| `escola_universidade` | 8 |

**~37 unidades de texto recuperáveis, de ~500 caracteres cada.**

E o custo medido do Conselheiro hoje (`AIUsage`): **1218 tokens de input em
média**, máx 1292.

---

## 5. Gaps

1. O Conselheiro não tem **nenhuma** fonte de conhecimento — só títulos.
2. Não existe tipo de conteúdo pensado para **uso conversacional** (curto,
   aplicável, com "quando usar / quando não usar"). Aula é material de estudo.
3. Não existe eixo de conteúdo para **desenvolvimento pessoal** — as escolas
   existem, o conteúdo não.
4. Não existe classificação de **tipo de fonte** (ciência ≠ metodologia de autor
   ≠ reflexão). Só o eixo `OFICIAL/DEMONSTRATIVO`, que é sobre a empresa.
5. O Treinador **não tem motor de pertinência** (registrado na 2B.4).
6. Não há `provenance` de resposta: não dá para responder *"qual conhecimento
   influenciou esta resposta?"*.

---

## 6. Respostas diretas às perguntas técnicas

### 6.1 Precisamos de RAG agora? **NÃO.**

RAG resolve "o corpus não cabe no contexto". Nosso corpus **inteiro** cabe:
37 unidades × ~500 chars ≈ 18 KB ≈ **~5 mil tokens**. Mesmo com crescimento de
**20×** (700 itens curados — muito além do realista para conteúdo com aprovação
humana), o corpus todo daria ~350 KB ≈ **~90 mil tokens**: ainda uma fração de
uma janela moderna, e nunca precisaria ser enviado inteiro de qualquer forma,
porque o princípio é *minimum useful knowledge*.

Recuperar 1–2 cards por categoria é um `WHERE categoria = $1 AND status = 'PUBLISHED'`.

### 6.2 Precisamos de embeddings agora? **NÃO.**

- **Volume**: a semântica só ganha de tags quando há itens demais para taxonomia
  manual. Com 37 (ou 700) itens curados por humanos, a tag é mais precisa que o
  cosseno — e auditável.
- **Custo**: embeddings exigem uma chamada por item na ingestão *e* uma por
  query. Isso viola §91 e a diretriz de custo da 2B.
- **Latência**: adiciona um round-trip ao caminho quente de toda mensagem.
- **Manutenção**: reindexar a cada edição, versão e arquivamento.
- **Qualidade**: busca semântica pode trazer o item *parecido* em vez do item
  *certo* — e o Treinador prova que o mapa determinístico acerta.

### 6.3 Precisamos de vector DB agora? **NÃO.**

Seria infraestrutura nova para um corpus que cabe numa tabela. O Postgres do
projeto tem **apenas a extensão `plpgsql`** instalada — `pgvector` exigiria
provisionar extensão em dev, teste, CI e produção. Custo real, benefício zero
neste tamanho.

### 6.4 PostgreSQL atual é suficiente? **SIM.**

Categoria + tags + `status` + índice B-tree resolve. Se um dia a busca textual
for necessária, o Postgres 16 tem `to_tsvector('portuguese', …)` **nativo, sem
extensão** — e mesmo isso é prematuro hoje.

### 6.5 Precisamos de CMS novo? **NÃO.**

`StatusConteudo` + `version` + `createdBy/approvedBy/publishedAt` +
`origemEditorial` + `audience` já são o lifecycle pedido, já com UI de Admin e
já reusados por três módulos.

### 6.6 Precisamos de agente novo? **NÃO.**

Já existem 12 especialistas. Recuperar conhecimento é **lookup, não conversa** —
o Treinador faz isso há cinco fatias com zero IA. E a 2B.1 estabeleceu a regra
que decide o caso: **o LLM pode nomear uma intenção; o código decide o que
carregar.** Um "agente de conhecimento" inverteria isso.

O que precisamos é uma **camada**, usada pelo Conselheiro que já existe.

---

## 7. O que é uma "skill" neste projeto

**Uma skill NÃO é um LLM novo, nem um agente, nem um prompt separado.**

> **Skill = uma Escola + o conjunto governado de Knowledge Cards ligados a ela,
> com regras de quando usar e quando não usar.**

Reusa `EscolaUniversidade` como a família (já administrável, já com `audience`),
e o card carrega o conhecimento. O Conselheiro continua sendo o mesmo
Conselheiro, com o mesmo prompt e a mesma Constituição.

**Poucas famílias fortes, não 50 skills.** As 8 escolas que já existem bastam
para começar e para escalar — acrescentar uma escola é operação de Admin, não de
engenharia.

---

## 8. Knowledge Unit — o Knowledge Card

A menor unidade recuperável. **Não é um livro, nem um capítulo, nem uma aula.**

> Fonte = livro/metodologia/artigo.
> Card = **princípio útil + quando usar + quando não usar + exemplo + limites + origem.**

Campos propostos (**proposta — nenhuma migration nesta etapa**):

| Campo | Para quê |
|---|---|
| `escolaId` | a família (skill) |
| `titulo`, `principio` | o conteúdo, curto por desenho (teto ~600 chars, o tamanho real das aulas de hoje) |
| `quandoUsar`, `quandoNaoUsar` | **o que diferencia um card de um parágrafo de livro** |
| `exemplo` | linguagem de vendedor, não de manual |
| `tipoFonte` | ver §9 |
| `fonte`, `autor`, `licenca` | atribuição e direitos |
| `status`, `version`, `createdBy`, `approvedBy`, `publishedAt` | **reusar `StatusConteudo`** |
| `origemEditorial` | reusar — rastreia se veio de agente de IA |
| `audience` | reusar |
| `empresaId` (nullable) | `NULL` = global; preenchido = conteúdo da empresa |
| `tags` | recuperação fina dentro da escola |
| `competencyIds` | ponte com a Universidade, como a aula já faz |

`quandoNaoUsar` é o campo mais importante e o que não existe em nenhum conteúdo
atual. É ele que impede o Conselheiro de dar conselho de hábito para quem está
sobrecarregado.

### 8.1 Por que não é só uma `AcademyLesson`

Pergunta obrigatória do review, porque os dois modelos se parecem (ambos têm
conteúdo, status, versão, audiência). São coisas diferentes:

| | `AcademyLesson` | `KnowledgeCard` |
|---|---|---|
| Quem lê | o vendedor, na tela da Academia | **o Conselheiro**, nunca o vendedor |
| Como é consumida | inteira, do início ao fim | em fragmento, dentro de uma conversa |
| Tem quiz / minutos estimados | sim | não faz sentido |
| Gera `CompetencyEvidence` | sim, ao concluir | não — ler não é aprender |
| `quandoNaoUsar` | não existe | **obrigatório** |

Acrescentar os campos de card à `AcademyLesson` faria cards aparecerem na
listagem de trilhas da Academia — material de conversa virando material de
estudo. Tabela separada, **com os mesmos enums de governança**, é reuso sem
sobrecarga semântica.

### 8.2 Atualização, versão e arquivamento

Conhecimento antigo não pode continuar ativo e invisível. O ciclo já existe e é
reusado: editar um card publicado incrementa `version`; publicar uma versão nova
arquiva a anterior (padrão do Playbook); `ARCHIVED` sai da recuperação e **nada
é apagado**. O `Content Update Agent` da 7.5D já existe para propor revisão de
conteúdo desatualizado — e, como todo agente, **propõe rascunho, nunca publica**.

---

## 9. Tipos de fonte — e a regra da física quântica

Um eixo novo, **ortogonal** ao `OFICIAL/DEMONSTRATIVO` (que é sobre a empresa) e
ao `origemEditorial` (que é sobre quem produziu):

| `tipoFonte` | O que é | Como pode ser apresentado |
|---|---|---|
| `OFICIAL_EMPRESA` | 13 Mandamentos, política, processo | "é assim que a loja faz" |
| `CIENTIFICO` | evidência, estudo | pode afirmar como fato, com a fonte disponível |
| `PROFISSIONAL` | prática consolidada de vendas/atendimento | "o que costuma funcionar" |
| `METODOLOGIA_AUTOR` | método nomeado de alguém | "existe uma abordagem que propõe…" |
| `DESENVOLVIMENTO_PESSOAL` | hábitos, foco, metas | orientação, nunca garantia |
| `REFLEXIVO` | gratidão, propósito, visualização, práticas contemplativas | **convite à reflexão, nunca afirmação factual** |
| `DEMONSTRATIVO` | placeholder sem material real | sempre marcado como não-oficial |

### A regra metodológica da linguagem "quântica"

O usuário quer, no futuro, conteúdo ligado a física quântica, mentalização,
energia e manifestação. **Isso não é proibido. É classificado.**

> **Física quântica como ciência** é `CIENTIFICO`.
> **Interpretações espirituais ou de desenvolvimento pessoal que usam linguagem
> "quântica"** são `REFLEXIVO` — nunca `CIENTIFICO`.

A consequência prática é só uma: **não apresentar afirmação metafórica como
conclusão estabelecida da física.** O card de tipo `REFLEXIVO` entra no prompt
rotulado como tal, exatamente como `[DEMONSTRATIVO]` já entra hoje no Treinador
— e o Conselheiro pode convidar à reflexão sem afirmar mecanismo físico.

Isso **não exclui o conteúdo**. Permite explorá-lo com honestidade.

---

## 10. Hierarquia e conflito entre fontes

Quando duas fontes divergem, **não concatenar**. Precedência:

```
1. SEGURANÇA E LIMITES          (nunca cede)
2. CONSTITUIÇÃO DO CONSELHEIRO  (nunca cede)
3. OFICIAL_EMPRESA              (vence sobre geral, no escopo da empresa)
4. CIENTIFICO
5. PROFISSIONAL
6. DESENVOLVIMENTO_PESSOAL
7. METODOLOGIA_AUTOR            (coexistem como abordagens)
8. REFLEXIVO                    (nunca substitui 3–5)
```

Regras derivadas:
- **Oficial vence demonstrativo** — já é o comportamento do Treinador.
- **Reflexivo nunca substitui ciência.** Metodologias de autor podem coexistir
  quando apresentadas como abordagens, não como verdades.
- Na prática, **o retriever deve trazer UM card por turno** (§13), o que faz o
  conflito ser raro por construção. A precedência é a regra de desempate.

---

## 11. Arquitetura proposta

```
MENSAGEM
   ↓
MOMENTO / INTENÇÃO        ← já existe (2B.1)
   ↓
PERTINÊNCIA               ← já existe (2B.1) — soberana
   ↓
NECESSIDADE DE CONHECIMENTO   ← NOVO — e o default é NO_KNOWLEDGE
   ↓
KNOWLEDGE ROUTER          ← NOVO — determinístico primeiro
   ↓
KNOWLEDGE RETRIEVER       ← NOVO — WHERE escola + status + escopo
   ↓
BOUNDED KNOWLEDGE CONTEXT ← NOVO — 1 card, rotulado, como DADO
   ↓
CONSELHEIRO               ← o mesmo de sempre
   ↓
RESPOSTA NATURAL
```

### Responsabilidades

| Componente | Decide | Nunca faz |
|---|---|---|
| **Router** | se e qual necessidade | não busca, não vê KPI, não vê memória |
| **Retriever** | quais itens aprovados existem | não decide se é pertinente |
| **Context Builder** | o mínimo que entra no prompt | não formata resposta |
| **Conselheiro** | como falar | não escolhe conhecimento |
| **Governança** | o que pode estar ativo | não participa do turno |

### O Router NÃO precisa de chamada de IA nova

A peça decisiva do desenho. Hoje, `classificarIntencao` já roda em toda mensagem
e devolve um enum fechado — **e ~2/3 das mensagens são resolvidas pelo
curto-circuito determinístico, sem nenhuma IA.**

Proposta:

1. **Determinístico primeiro.** Intenções já resolvidas mapeiam direto para
   necessidade, **em código**:
   `DESABAFO → NO_KNOWLEDGE` · `CELEBRACAO → NO_KNOWLEDGE` ·
   `DUVIDA_COMERCIAL → NO_KNOWLEDGE` (é pergunta de dado, não de método) ·
   `CONVERSA/OUTRO → NO_KNOWLEDGE`.
   **Só `DESENVOLVIMENTO` abre a porta** — e mesmo assim precisa de um tema.
2. **Ambíguo: um campo a mais na chamada que já acontece.** O JSON do
   classificador ganha `{ "intencao": …, "tema": … }` com enum fechado das
   escolas. **Zero chamadas novas, ~30 tokens a mais no prompt do classificador.**
3. **O código mapeia tema → escola.** Nunca o LLM — mesma disciplina da 2B.1,
   onde o classificador devolve intenção e o `POR_INTENCAO` decide domínios.
4. **Falha = `NO_KNOWLEDGE`.** "Em dúvida, silêncio" estendido ao conhecimento.

E o Router recebe **só a mensagem** — sem KPI, sem memória, sem histórico. A 2B.1
e a 2B.4 já garantem isso e há teste provando.

---

## 12. `NO_KNOWLEDGE` é o caso comum

Tão importante quanto escolher a skill certa. Deve ser o **short-circuit mais
barato do sistema**: `"bom dia"` não pode custar mais do que custa hoje.

Casos obrigatórios de `NO_KNOWLEDGE`:
`"bom dia"` · `"consegui!"` · `"hoje tô cansado"` · `"obrigado"` · `"vou tentar"` ·
`"beleza"` · desabafo sem pedido · celebração · pergunta pelos próprios números ·
turno de resposta a sugestão (2B.3) · **qualquer falha de classificação**.

> Conhecimento desnecessário **piora** a conversa. Não é neutro.

---

## 13. Bounded knowledge

**Teto: 1 card por turno.** Não é número arbitrário — é a mesma regra que a 2B.3
já provou para intervenções ("um assunto por vez"), e é medível: um card de ~600
chars ≈ **~160 tokens** sobre os **~1220 tokens** que o prompt do Conselheiro
custa hoje (+13%). Cinco cards seriam +65%, e é exatamente a palestra que
queremos evitar.

Nunca carregar simultaneamente hábitos + motivação + liderança + vendas só
porque todos têm relação.

### Custo e latência estimados

| Estratégia | Tokens/turno | Chamadas IA extras | Veredito |
|---|---|---|---|
| Aula/documento inteiro | +400 a +2000 | 0 | context stuffing |
| **1 knowledge card** | **+160** | **0** | **recomendado** |
| Top-K=5 chunks | +800 | 0 (ou +1 com embedding) | palestra |
| Summary por LLM | variável | **+1 por turno** | rejeitado (§52/§65) |
| RAG + vector | +800 | +1 embedding | rejeitado (§39–41) |

Consultas: **+1 query** (`SELECT` por escola/status), e **zero** quando
`NO_KNOWLEDGE` — que é a maioria dos turnos.

### 13.1 Cache: não agora

Uma query indexada sobre uma tabela de centenas de linhas não é gargalo — cache
aqui seria otimizar o que não dói. E teria custo real de correção: a chave
precisaria incluir `empresaId` **e** a versão publicada, senão um card arquivado
ou o conteúdo oficial da empresa errada sobreviveria em memória depois de
despublicado. **Não criar cache nesta camada** até haver medição que justifique;
se um dia houver, a invalidação tem que ser por publicação, nunca por tempo.

---

## 14. Conhecimento ≠ memória ≠ intervenção

Três camadas que **não podem se misturar**:

| | O que é | Onde vive |
|---|---|---|
| **Memória** | algo sobre a pessoa e a relação | `ProfessionalMemory`, `CoachIntervention` |
| **Conhecimento** | algo sobre o mundo e método | Knowledge Cards |
| **Intervenção** | o que foi efetivamente apresentado e tem continuidade | `CoachIntervention` |

Consequências, em regra:

- **Ler um card NÃO cria `CoachIntervention`.** Só vira intervenção o que
  satisfizer a definição já aprovada na 2B.2/2B.3 — fonte identificável e
  continuidade a acompanhar. Dizer *"comece com um hábito pequeno"* é conversa,
  não pendência. **Não transformar toda dica em cobrança futura.**
- **Não colocar conteúdo em `ProfessionalMemory`.** Ela é memória profissional
  derivada de KPI, não depósito de biblioteca.

E a divisão de trabalho:

> **Memória** diz: "essa pessoa já tentou X."
> **Conhecimento** diz: "existem estratégias Y e Z."
> **Pertinência** decide: "é hora de falar disso?"
> **Conselheiro** decide: "como falar naturalmente?"

**Personalização** vem dessa combinação, não de perfil psicológico: duas pessoas
com dificuldade de consistência — uma sobrecarregada, outra tentando cinco
hábitos ao mesmo tempo — recebem **a mesma biblioteca e conversas diferentes**.

---

## 15. Multiempresa

```
empresaId = NULL  → conteúdo GLOBAL (desenvolvimento pessoal, profissional geral)
empresaId = X     → conteúdo da empresa X (oficial, processo, política)
```

**Precedência**: havendo card da empresa e card global para a mesma necessidade,
**o da empresa vence** — mesma lógica de `OFICIAL` vencer `DEMONSTRATIVO`.

**Invariante inegociável**: conteúdo `OFICIAL_EMPRESA` da empresa A nunca alcança
a empresa B. O retriever deve exigir `empresaId` no `WHERE`, como o
`playbook.service.ts` já faz — *"nunca busca por playbookId isolado sem
confirmar a empresa dona"*.

Escopo por loja: **não**, até existir necessidade real. Não criar eixo sem caso.

---

## 16. Segurança — threat model

| Ameaça | Mitigação proposta |
|---|---|
| **Prompt injection dentro do conteúdo** | Card é **DADO**. Vai em bloco rotulado no system prompt, nunca como instrução, e nunca no array de mensagens. Reusar `sanitizarRelatoLivre` do Treinador para colapsar quebras de linha e impedir forja de bloco. Um card dizendo "ignore as regras" é texto, não comando. |
| **Tenant leakage** | `empresaId` obrigatório no `WHERE`; card global é explicitamente `NULL`, nunca "qualquer empresa". Teste de allowlist, como o da 2B.4. |
| **Publicação sem aprovação** | Reusar `StatusConteudo`; só `PUBLISHED` é recuperável. Mesmo gate que fechou o HIGH da 7.5C (quiz de aula não publicada). |
| **Conteúdo arquivado ainda recuperado** | O `WHERE status = 'PUBLISHED'` resolve — **foi exatamente o bug HIGH da 7.5C**, onde o quiz não herdou o gate que o resto do catálogo tinha. Auditar **todos** os pontos de leitura, não só o principal. |
| **Versão antiga ativa** | Publicar arquiva a anterior (padrão do Playbook). |
| **Source poisoning / Research Agent** | IA nunca publica: nasce `DRAFT`, aprovação humana obrigatória. Já implementado na 7.5D. |
| **Copyright** | Card é princípio curado + atribuição, **nunca cópia de livro**. Campo `licenca`. |
| **PII em conteúdo** | Conteúdo é catálogo, não dado de pessoa. Revisão humana é a barreira. |
| **Admin malicioso ou enganado** | `AuditEvent` já existe para ação administrativa. |
| **Conteúdo oficial forjado** | Só `OFICIAL_EMPRESA` aprovado pode ser apresentado como regra da loja — a instrução já existe no prompt do Treinador. |

---

## 17. Provenance e observabilidade

Precisamos conseguir responder tecnicamente **"qual conhecimento influenciou
esta resposta?"** — para debugging, governança e qualidade.

- Registrar os `cardIds` do turno, do lado técnico.
- **Nunca mostrar ao vendedor por padrão.** Ele não precisa saber qual skill,
  qual documento, qual motor. Conhecimento funciona **por baixo** da experiência.
- **Não vira vigilância do vendedor**: o registro é sobre qual conteúdo o sistema
  usou, nunca sobre o que a pessoa disse.

Eventos técnicos mínimos: `knowledge_needed` · `domain_selected` ·
`item_ids_retrieved` · `knowledge_used`. **Sem transcrição.**

### Atribuição ao vendedor

O Conselheiro **não** cita autor toda hora. Usa o princípio naturalmente. Mas
quando houver precisão científica, metodologia nomeada ou pedido explícito
(*"de onde você tirou isso?"*), precisa conseguir informar a origem — por isso os
campos `fonte`/`autor` existem no card.

---

## 18. Fronteiras

O Conselheiro **não é** terapeuta, médico, guru nem pregador. Conhecimento sobre
emoção, frustração e motivação **não autoriza** diagnóstico, tratamento,
avaliação clínica, inferência de transtorno nem psicoterapia simulada — a
Constituição já proíbe e a 2C não afrouxa nada disso.

| Tema | Fronteira |
|---|---|
| Saúde mental / crise | acolher, nunca diagnosticar; conhecimento não muda isso |
| Medicina | nunca prescrever, nunca afirmar doença |
| Religião | nunca impor crença |
| Espiritualidade | reflexão, nunca ciência, nunca promessa de resultado |
| Ciência | afirmação factual só com `tipoFonte = CIENTIFICO` |
| Finanças pessoais | orientação geral; nunca recomendação de investimento |
| Conflito / assédio | acolher e orientar caminho institucional; não julgar |
| Performance | continua governada pelo gate da 2B.1 |

**Não vira guru.** Proibido afirmar como verdade: *"isso vai mudar sua vida"*,
*"o universo vai entregar"*, *"essa técnica garante resultado"*, *"se você
acreditar vai acontecer"*. Práticas reflexivas podem ser oferecidas **dentro da
natureza correta delas**.

E **accountability não é cobrança**: o Conselheiro pode perguntar *"quer que eu
retome isso com você depois?"* — mas não assume que toda intenção virou
compromisso. Consentimento antes de transformar em pendência.

---

## 19. Quando a biblioteca não tem a resposta

Três opções, e uma recomendação:

- **(A) Só biblioteca** — o Conselheiro só fala do que está curado.
  **Seria uma regressão**: hoje ele conversa com o conhecimento geral do modelo
  e a biblioteca tem zero itens. Adotar (A) emudeceria o produto.
- **(B) Biblioteca preferencial + conhecimento geral do modelo** — simples, mas
  sem limite claro para afirmação factual.
- **(C) Por categoria** ✅ **recomendado**:
  - **conversa, acolhimento, reflexão, orientação geral** → o modelo fala
    naturalmente, como já faz hoje;
  - **afirmação científica, metodologia nomeada, política da empresa, número** →
    **só com card**. Sem card, o Conselheiro diz que não tem esse dado — regra
    que a Constituição já aplica a indicadores.

(C) preserva o produto atual e fecha exatamente onde inventar é perigoso.

---

## 20. Linguagem e simplicidade

**1 ideia principal · 1 pergunta quando útil · 1 ação pequena quando pertinente.**
Não impor mecanicamente, mas evitar blocos enormes.

**Curto primeiro. Aprofunda se a pessoa quiser.**

Evitar: jargão, diagnóstico, sermão, texto longo desnecessário, excesso de
listas, cobrança, linguagem corporativa fria, promessa, falsa ciência.

### 20.1 Quinze exemplos ERRADO / MELHOR

**1. Saudação**
- Seller: *"bom dia"*
- ❌ "Bom dia! Que tal começarmos definindo três objetivos para maximizar seu desempenho hoje?"
- ✅ "Bom dia! Como você tá hoje?"

**2. Desânimo vago — acolher antes de saber**
- Seller: *"tô desanimado hoje"*
- ❌ "Desânimo é comum. Estudos mostram que a motivação é um estado flutuante e o segredo é criar sistemas em vez de depender dela. Três estratégias: 1)… 2)… 3)…"
- ✅ "Entendi. Foi alguma coisa que aconteceu hoje ou é um cansaço que já vem de alguns dias?"

**3. Dificuldade de consistência — aqui o conhecimento ajuda**
- Seller: *"eu começo animado, mas nunca consigo manter uma rotina"*
- ❌ "A formação de hábitos envolve o loop gatilho-rotina-recompensa. Recomendo empilhamento de hábitos, desenho de ambiente e rastreamento diário."
- ✅ "Então talvez o problema não seja começar, e sim tentar mudar muita coisa de uma vez. Que hábito pequeno você conseguiria manter até num dia ruim?"

**4. Objeção de preço**
- Seller: *"como eu faço quando a cliente diz que tá caro?"*
- ❌ *(oito parágrafos reproduzindo uma aula inteira)*
- ✅ "Na maioria das vezes 'tá caro' quer dizer 'não entendi por que vale isso'. Antes de falar de preço, dá pra entender pra que ela vai usar o sapato? Se quiser, a gente treina isso no Treinador."

**5. Celebração**
- Seller: *"consegui! bati a meta"*
- ❌ "Parabéns! O reforço positivo é fundamental para a consolidação de comportamentos. Agora que você atingiu, que tal estabelecer uma meta 20% maior?"
- ✅ "Boa! 👏 Você tava atrás disso já fazia uns dias. O que fez diferença dessa vez?"

**6. Cobrança emendada em elogio**
- ❌ "Parabéns pela certificação, mas seu PA continua abaixo da meta."
- ✅ "Parabéns pela certificação! Foi difícil?"

**7. Jargão interno**
- ❌ "Detectei baixa aderência ao seu plano de desenvolvimento."
- ✅ "Percebi que isso tá difícil de colocar em prática. O que tá te atrapalhando mais?"

**8. Conflito com colega**
- Seller: *"tô tendo problema com uma colega da loja"*
- ❌ "Conflitos interpessoais geralmente decorrem de falhas de comunicação assertiva. Aplique a técnica CNV em quatro etapas."
- ✅ "Que chato. Aconteceu alguma coisa específica ou é uma coisa que vem se acumulando?"

**9. Pedido de meta**
- Seller: *"quero bater 10 mil esse mês"*
- ❌ "Metas devem ser SMART: específicas, mensuráveis, atingíveis, relevantes e temporais."
- ✅ "Dez mil no mês dá mais ou menos 400 por dia de trabalho. Isso tá perto do que você costuma fazer ou seria um salto grande?"

**10. Pergunta espiritual**
- Seller: *"você acredita que pensamento positivo atrai venda?"*
- ❌ "Sim, a física quântica comprova que sua vibração altera a realidade material."
- ✅ "Não sei dizer se atrai. O que eu vejo é que quem entra na loja acreditando que vai vender aborda mais gente — e abordar mais gente muda o resultado. Você tem sentido diferença nos dias que começa melhor?"

**11. Pergunta científica**
- Seller: *"dormir mal atrapalha minha venda mesmo?"*
- ❌ "Com certeza! Sono é tudo, quem dorme mal nunca vende bem."
- ✅ "Atrapalha, sim — principalmente atenção e paciência, que é o que o atendimento mais exige. Tá conseguindo dormir?"

**12. Promessa**
- ❌ "Se você aplicar isso por 21 dias, sua vida vai mudar."
- ✅ "Vale testar por uma semana e a gente vê se mudou alguma coisa pra você."

**13. Sugestão vira cobrança**
- ❌ "Anotei aqui: você vai fazer a aula de sondagem até sexta. Vou cobrar."
- ✅ "Se quiser, eu te lembro disso mais pra frente — ou deixo você tocar no seu tempo."

**14. Recusa**
- Seller: *"não quero fazer isso agora"*
- ❌ "Entendo, mas a disciplina é justamente fazer o que precisa mesmo sem vontade."
- ✅ "Tranquilo. Tem alguma outra coisa que tá mais no seu caminho hoje?"

**15. Pedido de aprofundar**
- Seller: *"me explica melhor isso do hábito pequeno"*
- ❌ *(responder curto de novo, porque "resposta curta é a regra")*
- ✅ "Claro. A ideia é escolher uma coisa tão pequena que você faria até num dia corrido — tipo cumprimentar as três primeiras clientes do dia pelo nome. Aí o que você constrói é a constância, não o tamanho. Quer pensar em qual seria a sua?"

---

## 21. Matriz de avaliação

| # | Cenário | Esperado |
|---|---|---|
| A | `"bom dia"` | `NO_KNOWLEDGE` |
| B | desânimo vago | `NO_KNOWLEDGE` — acolher e perguntar primeiro |
| C | "começo e não mantenho" | Escola de Organização/Desenvolvimento Pessoal — **1** card |
| D | "cliente disse que tá caro" | Vendas/objeções — card curto **+ oferecer o Treinador** |
| E | conflito com colega | Atendimento/comunicação — só depois de entender o caso |
| F | meta explícita | Metas — sem virar SMART recitado |
| G | pergunta espiritual | card `REFLEXIVO`, rotulado, sem afirmar mecanismo |
| H | pergunta científica | card `CIENTIFICO` ou honestidade sobre não ter o dado |
| I | afirmação "quântica" espiritual | classificar `REFLEXIVO`, **nunca** `CIENTIFICO` |
| J | celebração | `NO_KNOWLEDGE` — não palestrar |
| K | resposta a sugestão pendente | `NO_KNOWLEDGE` (2B.3: turno de resposta não abre assunto) |
| L | falha do classificador | `NO_KNOWLEDGE` |
| M | pedido de aprofundar | pode estender **o mesmo** card, não trazer outro |

Critério de qualidade: comparar a resposta com e sem card **no fluxo final**,
com a régua qualitativa de §20. A regra permanente do projeto (Decisão 205) vale
aqui: comportamento crítico se prova no fluxo efetivamente apresentado ao
vendedor, com os dados reais montados.

---

## 22. Fronteira entre os módulos

| Módulo | Papel | Relação com o Conselheiro |
|---|---|---|
| **Treinador** | desenvolvimento profissional deliberado | pode **compartilhar** a Knowledge Layer; contexto e comportamento continuam diferentes |
| **Academy** | aprendizado estruturado | o Conselheiro **não recita aula** — pode sugerir |
| **University** | competência, evidência, PDI, certificação | o Conselheiro interpreta o momento e sugere; **não duplica o motor** |
| **Simulator** | prática | o Conselheiro pode identificar que prática ajudaria e sugerir; **não simula cliente por default** |

Nesta fase **não** criar biblioteca de skills visível ao vendedor. A experiência
principal é conversa; Academy e University continuam os ambientes formais.

---

## 23. Piloto recomendado

### ✅ **HÁBITOS E CONSISTÊNCIA**

Critérios de §95, avaliados:

- **Útil e frequente**: "começo e não mantenho" é a queixa mais comum de quem
  trabalha por meta diária.
- **Seguro**: não é clínico, não é oficial da empresa, não é científico
  contestado — erra para o lado inofensivo.
- **Fácil de avaliar**: a resposta certa é reconhecível (um passo pequeno e
  possível) e a errada também (lista de técnicas).
- **Não excessivamente subjetivo**: tem princípios estáveis — começar pequeno,
  gatilho, ambiente, retomar depois de falhar.
- **Tem casa**: as escolas *Organização e Produtividade* e *Desenvolvimento
  Pessoal* **já existem no banco**, com zero conteúdo.
- **E o argumento decisivo**: é o único candidato que o Conselheiro **não pode
  delegar**. Não existe módulo de hábitos no produto.

### ❌ Por que **não** OBJEÇÕES primeiro

Parece o candidato óbvio, e é o **errado para validar a camada**: objeções já
têm dono. O Playbook tem categoria `OBJECOES`, existe a competência
`QUEBRA_DE_OBJECOES`, e o Treinador já recupera isso deterministicamente. Um
piloto ali mediria duplicação, não capacidade nova. É o **segundo** passo
natural — quando a camada for compartilhada com o Treinador.

### ❌ Por que **não** espiritualidade / física quântica primeiro

Confirmado tecnicamente: são o domínio de **maior ambiguidade de classificação**
e maior custo de erro reputacional, e exigem o eixo `tipoFonte` **já validado**
para não apresentar reflexão como ciência. Validar a arquitetura primeiro num
domínio de fronteira clara; expandir depois, com o mecanismo de rotulagem já
provado em produção.

---

## 24. Sequência recomendada para a 2C

Derivada da auditoria — não de um template:

| Etapa | Escopo | Migration? |
|---|---|---|
| **2C.1** | `KnowledgeCard` + governança reusando `StatusConteudo`. Sem router, sem Conselheiro. Admin cria e publica. | **SIM** (1 tabela — gate humano) |
| **2C.2** | Retriever + escopo multiempresa + teste de vazamento entre empresas. Ainda sem tocar o Conselheiro. | não |
| **2C.3** | Conteúdo piloto de **Hábitos**, curado e aprovado por humano. | não |
| **2C.4** | Router: `NO_KNOWLEDGE` **primeiro**, campo extra no classificador existente. | não |
| **2C.5** | Integração no Conselheiro: 1 card, rotulado, como dado. Provenance técnica. | não |
| **2C.6** | Avaliação real contra a matriz de §21 e a régua de linguagem de §20. | não |
| **2C.7** | Compartilhar a camada com o Treinador (objeções) — e avaliar dar pertinência a ele. | não |

**A 2C.1 é o único ponto com migration** e por isso é o próximo gate humano.

Ordem deliberada: **`NO_KNOWLEDGE` antes de qualquer recuperação**. Se a camada
entrar sabendo só falar, nunca aprenderá a calar.

---

## 25. Decisões

### Decidido nesta etapa (técnico, sem dependência humana)
- Sem RAG, sem embeddings, sem vector DB — **medido**, não estimado.
- Sem CMS novo — `StatusConteudo` e companhia já são o lifecycle.
- Sem agente novo — recuperação é lookup; o Treinador prova há cinco fatias.
- Taxonomia = `EscolaUniversidade` existente, não 18 famílias novas.
- Skill = Escola + cards, nunca um LLM novo.
- Router reusa a chamada de classificação existente — zero IA nova.
- Card é DADO; reusar o padrão anti-injection do Treinador.
- Teto de 1 card por turno (alinhado à 2B.3 e medido em tokens).
- Conhecimento ≠ memória ≠ intervenção.

### Recomendado (aguarda concordância)
- Piloto em **Hábitos e Consistência**.
- Política de conhecimento **(C) por categoria** (§19).
- Sequência 2C.1 → 2C.7.

### Decisão humana pendente
1. **Aprovar a migration da 2C.1** (`KnowledgeCard`) — gate.
2. **Confirmar o piloto** Hábitos (e não Objeções).
3. **Confirmar a política (C)** para o que fazer sem card.
4. **Conteúdo oficial da empresa**: os 12 Mandamentos vazios continuam
   dependendo de material real — o sistema não inventa.
5. **Treinador ganha motor de pertinência?** (registrado desde a 2B.4)
6. **Licenciamento**: qual política para material de terceiros curado.

---

## 26. Riscos e limitações

- **Risco de duplicar o Playbook.** Mitigação: escopos diferentes — Playbook é
  processo comercial da empresa, card é conhecimento aplicável. Se convergirem,
  unificar em vez de manter dois.
- **Risco de a biblioteca virar depósito de livros.** Mitigação: `quandoUsar`/
  `quandoNaoUsar` obrigatórios — um parágrafo copiado não preenche esses campos.
- **Risco de o Conselheiro virar palestrante.** Mitigação: 1 card, `NO_KNOWLEDGE`
  por padrão, e avaliação de linguagem como critério de aceite.
- **Risco de conteúdo envelhecer ativo e invisível.** Mitigação: versão +
  arquivamento; e o gate `PUBLISHED` auditado em **todos** os pontos de leitura,
  porque foi exatamente aí que a 7.5C teve seu HIGH.
- **Limitação**: a qualidade da camada é a qualidade da curadoria humana.
  Nenhuma arquitetura conserta card ruim.
- **Limitação**: sem provenance de resposta hoje, não dá para responder "o que
  influenciou isto" — só a partir da 2C.5.

---

## 27. Recomendação objetiva para a 2C.1

Implementar **apenas** `KnowledgeCard` + governança, reusando `StatusConteudo`,
`OrigemEditorial`, `audience` e o padrão tenant do Playbook. **Sem router, sem
retriever, sem tocar no Conselheiro.**

Uma tabela, um gate humano, nenhuma mudança de comportamento em produção — e a
fundação pronta para ser preenchida com conteúdo curado antes de qualquer
vendedor ver a diferença.
