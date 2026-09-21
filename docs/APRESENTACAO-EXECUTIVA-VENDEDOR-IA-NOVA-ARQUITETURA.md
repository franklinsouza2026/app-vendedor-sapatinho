# Vendedor IA — Onde Estamos e Para Onde Vamos

Auditoria executiva 360º · baseline `40d7331` · **zero implementação**
Evidência técnica completa em `AUDITORIA-TECNICA-NOVA-ARQUITETURA.md`

---

## SLIDE 2 — Resumo executivo

Cinco frases.

1. **O produto é grande e está saudável.** 79 tabelas, 193 endpoints, 30 telas, 1.253
   testes verdes. Nenhum módulo é fachada.
2. **A nova visão não é uma reconstrução — é uma reorganização de navegação.** Do que
   a nova arquitetura pede, a maior parte da engenharia **já existe e já está testada**.
3. **A única coisa que realmente não existe é a cadeia de liderança.** Não há
   SUPERVISOR, não há COORDENADOR, não há árvore, e um gerente é estruturalmente
   preso a uma loja só.
4. **O gargalo dominante do produto hoje não é arquitetura — é conteúdo.** Há **6
   perguntas de quiz no sistema inteiro**, **zero certificações definidas**, e os 13
   Mandamentos estão como 13 linhas vazias.
5. **Retirar Treinador e Academia da navegação é barato. Perder o que há dentro deles
   seria caro** — o Treinador guarda o único conteúdo oficial real da empresa.

---

## SLIDE 3 — O produto atual em números

| | |
|---|---|
| Models · Enums · Migrations | **79 · 74 · 28** |
| Endpoints HTTP | **193** |
| Serviços | **100** |
| Telas | **30** em 31 rotas |
| Filas em produção | **4** |
| Especialistas de IA | **14**, todos em uso |
| Papéis | **4** (VENDEDOR · GERENTE · ADMIN · PLATFORM_ADMIN) |
| Testes | **1039 backend · 173 frontend · 41 E2E** |

Distribuição dos endpoints por quem pode chamar:
**92 ADMIN · 56 qualquer autenticado · 30 GERENTE · 10 ADMIN+GERENTE · 5 públicos.**

Guarde esse número do meio: **56 rotas não checam papel nenhum.** É ali que a
multi-papel da nova visão já está construída sem ninguém ter planejado.

---

## SLIDE 4 — O que já construímos

Onze blocos, todos funcionando ponta a ponta:

Identidade e ativação controlada · Estrutura empresa/loja · Metas · Performance via
ERP (em modo mock) · Gamificação completa (XP, moeda, níveis, badges, streak,
baseline, Score Geral, 7 rankings) · Competições/temporadas/ligas/feed/reconhecimento ·
Missões e desafios · Treinador com Playbook oficial · Academia com CMS e quiz ·
Universidade com competências, evidências, PDI, certificação e revisão espaçada ·
Conselheiro com pertinência, memória governada e conhecimento curado · Painel
Gerencial (alertas, planos de ação, 1:1, follow-ups, Reunião do Dia) · AI Control
Plane com gateway único, credenciais cifradas, budget e ledger.

---

## SLIDE 5 — Arquitetura atual, em uma frase

**Motores determinísticos calculam; a IA interpreta.** 42 arquivos de motor
determinístico contra 6 pontos de chamada de IA, todos passando por um gateway único
com budget, rate limit e ledger.

Essa é a decisão mais valiosa já tomada no projeto, e ela não muda em nenhum cenário.

---

## SLIDE 6 — O problema identificado: sobreposição no Evoluir

O hub "Evoluir" oferece hoje **quatro portas**: Treinador · Simulador · Academia ·
Universidade.

Para o vendedor, três delas respondem a perguntas parecidas ("como eu melhoro?") e as
fronteiras não são óbvias:

- **Treinador** — "como agir numa situação de venda"
- **Academia** — "aulas e exercícios rápidos"
- **Universidade** — "sua evolução, seu plano e suas certificações"

E duas coisas que o vendedor faz o tempo todo — **Missões** e **Conselheiro** — não
estão no hub. O Conselheiro, inclusive, já foi removido de lá numa fatia anterior.

O problema é real, e é de **navegação**, não de engenharia.

---

## SLIDE 7 — Decisão: simplificar sem destruir engenharia

A decisão tomada é acertada, e vale enunciar a distinção que a torna barata:

> **Tirar um módulo da navegação ≠ jogar fora a engenharia dele.**

O Treinador sai da porta de entrada. O que está dentro dele — 13 seções oficiais do
material real da empresa, 15 modos de conversa, prompt gerencial separado, contexto
de gestão — **não sai de lugar nenhum**. Continua alimentando Simulador e Academia,
como já alimenta hoje.

---

## SLIDE 8 — Nova hierarquia organizacional

```
ADMIN → COORDENADOR → SUPERVISOR → GERENTE DE LOJA → VENDEDOR
```

**Estado atual, medido:**

| Papel alvo | Existe hoje? |
|---|---|
| ADMIN | **Sim** |
| COORDENADOR | **Não — zero ocorrências no código** |
| SUPERVISOR | **Não — zero ocorrências no código** |
| GERENTE | **Sim** |
| VENDEDOR | **Sim** |

E três ausências estruturais, não cosméticas:

- **Não existe árvore.** Nenhum `parentId`, `supervisorId`, `reportsTo`. Zero.
- **Não existe tabela de equipe.** "Equipe" é derivada: mesma loja + papel VENDEDOR.
- **Ninguém pertence a duas lojas.** `Vendedor.lojaId` é escalar obrigatório, sem
  tabela de junção. **Um gerente regional é impossível pelo schema atual.**

Curiosidade útil: a própria Fonte de Verdade já previa "Gerente Regional" e os níveis
GRUPO e EQUIPE — conceitualmente, na seção 4. Nunca foram implementados. A nova cadeia
não contraria o projeto original; ela cobra uma dívida que ele já reconhecia.

---

## SLIDE 9 — Como funciona a cadeia de liderança hoje

Dois níveis, derivados em memória: agrupa por loja, separa por papel
(`src/routes/admin.ts:184-208`).

Consequência que importa: **dois gerentes na mesma loja são indistinguíveis.** Não há
aresta "vendedor X reporta ao gerente Y" em lugar nenhum do banco.

E o escopo é geográfico, não pessoal: todo filtro gerencial é `(empresaId, lojaId)`.

---

## SLIDE 10 — Nova experiência de desenvolvimento

```
MISSÕES = FAZER · UNIVERSIDADE = APRENDER · SIMULADOR = PRATICAR · CONSELHEIRO = EVOLUIR
```

Quatro verbos, quatro portas. Todas as quatro **já têm tela, backend e testes**.

A mudança de navegação é: **trocar Treinador e Academia por Missões e Conselheiro no
hub** — e as duas que entram já existem, só não estão lá.

---

## SLIDE 11 — Missões: atual × futuro

| | Hoje | Futuro pedido |
|---|---|---|
| Critérios | 10, todos implementados | mantém |
| Atribuição | **100% automática pelo sistema** | **líder pode aplicar a equipe ou pessoa** |
| Quem cria catálogo | **seed em código, sem UI** | **Admin governa pela UI** |
| Escopo | **sempre vendedor individual** | **equipe / loja / cascata** |
| API | **só GET** — não há endpoint de escrita | precisa de escrita governada |
| Missões de líder | **3 existem no backend** | mantém e expande |
| Recompensa | **estruturalmente zero** — a régua não define `MISSAO` | precisa de decisão de valor |

**Missões é o maior gap real da nova visão.** O motor de avaliação é excelente e
reaproveitável; o que não existe é qualquer noção de *comando* — nenhuma rota, nenhum
parâmetro de autor, nenhum alvo coletivo.

Achado de passagem: a missão gerencial **já é invisível hoje**. A função
`listarMissoesGerenciais()` existe no frontend e **nenhuma tela a chama**.

---

## SLIDE 12 — Universidade: atual × futuro

**A Universidade é a camada mais completa e a mais vazia ao mesmo tempo.**

| Engenharia | Conteúdo |
|---|---|
| 12 serviços, 33 endpoints, **97 testes** | **8 escolas + 22 competências** |
| Score Engine, Gap Engine, evidências ponderadas | **0 certificações** |
| PDI, avaliação de gerente, revisão espaçada | **0 targets** (tudo cai no default 70) |
| Certificação com 6 tipos de requisito | **0 PDIs, 0 evidências** |

Consequência medida: o motor exige **2 evidências** para calcular score. Num banco
novo, **toda a matriz de competências retorna "dados insuficientes"** e a aba
Certificações fica em branco — não por bug, por falta de conteúdo.

**Para absorver a Academia, a Universidade não precisa de código novo.** Ela já lê
`AcademyTrack`, `AcademyQuestion`, `AcademyProgress` e os Mandamentos. O acoplamento
já é bidirecional e intencional.

---

## SLIDE 13 — Quiz e certificação

A regra nova — **10 perguntas, mínimo 70%, aprovação determinística** — encontra o
sistema assim:

| Requisito | Estado |
|---|---|
| Aprovação determinística server-side | **já é** |
| Corte de 70% | **já é**, e já é configurável por quiz |
| N perguntas por tentativa | **campo já existe**, com anti-repetição e anti-fraude |
| IA cria perguntas | **já existe**, e a questão nasce desativada |
| **10 perguntas de verdade** | **impossível: o maior quiz tem 2, e há 6 no sistema inteiro** |

**Nada precisa ser construído para essa regra. Precisa ser escrito.**

Hoje, com 1 pergunta, o corte de 70% é binário (0 ou 100). Com 2, exige acertar as duas.

---

## SLIDE 14 — Simulador: atual × futuro

A nova visão quer "simulador de situações reais", com personagem por papel.
**Isso já começou a ser construído e ninguém percebeu.**

| Pedido | Estado |
|---|---|
| Cenário / personagem IA / conversa / avaliador separados | **existe de verdade** — 4 arquivos, 2 prompts, 2 contextos |
| Personagem não ensina nem avalia enquanto interpreta | **já é assim** |
| Avaliador separado analisa ao final | **já é assim**, e a **nota é do backend**, não do LLM |
| Gerente conversa com personagem de gestão | **já existe** — 2 cenários gerenciais, filtro por papel, teste dedicado |
| Supervisor / Coordenador | **não existe** (os papéis não existem) |
| Admin cria cenário pela UI | **não existe** — só pelo pipeline de IA |

Detalhe de produto: o gerente **pode** entrar no Simulador hoje, mas **não tem link
nenhum** para ele. A capacidade está pronta e escondida.

Custo: uma sessão completa gasta **10 a 17 chamadas de IA**. É de longe o módulo mais
caro do produto.

---

## SLIDE 15 — Conselheiro: atual × futuro

O módulo mais maduro, e o mais próximo da visão multi-papel — por arquitetura, não
por acaso: as 6 rotas usam `requireAuth()` **sem papel**.

| Pedido | Estado |
|---|---|
| Cada pessoa tem sua relação individual | **já é** |
| Não vira fiscal de KPI | **garantido por arquitetura** — domínio não autorizado nem é buscado no banco |
| Autorização vale também para o passado | **já é** (2B.4) |
| Um assunto por vez | **já é** (2B.3) |
| Conhecimento curado, que pode ser ignorado | **já é** (2C.5), 6 cards publicados |
| Gerente/Supervisor/Coordenador conversam | **gerente já pode**; os outros dois papéis não existem |
| **Admin governa o Conselheiro pela UI** | **NÃO existe** — o módulo de conhecimento **não está montado no servidor** |

Duas coisas para a mesa:
- **`PLATFORM_ADMIN` tem zero rotas.** O papel existe, o serviço o reconhece, e não há
  nenhuma superfície HTTP. Os cards só são governados por script.
- **A 2C.6 segue parada**: não há provider de IA real configurado. Nada aqui muda isso.

---

## SLIDE 16 — Treinador: o que acontece com ele

**Saindo da navegação. Não saindo do produto.**

O Treinador é o **único módulo com conteúdo OFICIAL real da empresa**: 13 das 14
seções do Playbook são os Mandamentos SDL, extraídos palavra por palavra do material
da empresa, com a distinção OFICIAL × demonstrativo garantida por enum de banco e
propagada ao prompt.

E esse Playbook **já é consumido por outros dois módulos** (Simulador e Academia).

| Peça | Destino |
|---|---|
| Playbook (13 seções oficiais) | **REUSE** — infraestrutura compartilhada, já é |
| 15 modos de conversa | **REUSE** — os 5 gerenciais servem à cadeia de liderança |
| Prompt e contexto gerencial | **REUSE** — o Simulador de gestão pode reaproveitar |
| 11 objeções (lista hardcoded) | **REUSE → Universidade** como conteúdo |
| Tela `/treinador` | **HIDE** — sai do hub, rota pode seguir por deep-link |
| Conversa livre de treino | **DECISÃO** — vira modo do Conselheiro? do Simulador? aposenta? |

**Alerta:** o Playbook **não tem nenhum endpoint administrativo**. O único jeito de
publicar um é por seed/script. Se o Treinador sair de vista sem isso ser resolvido, o
conteúdo mais valioso do produto fica sem dono.

---

## SLIDE 17 — Academia: o que acontece com ela

**Aqui a leitura tem que ser precisa, porque "fundir na Universidade" pode significar
duas coisas muito diferentes.**

Academia e Universidade **não fazem a mesma coisa**:

- **Academia = conteúdo e entrega** (aulas, banco de questões, quiz com nota,
  progresso, CMS, 13 Mandamentos, XP/moeda)
- **Universidade = medição e certificação em cima desse conteúdo** (competências,
  evidências, score, gap, PDI, certificação, revisão espaçada)

**A Universidade não tem nenhum conteúdo próprio.** Ela lê o da Academia.

O acoplamento já é bidirecional: a Academia importa três serviços da Universidade, e
a Universidade lê quatro entidades da Academia. **Não há um único endpoint duplicado
entre as duas.**

| Peça | Destino |
|---|---|
| Aulas, trilhas, conteúdo | **MERGE → Universidade** (navegação) |
| Banco de questões + quiz | **KEEP como engenharia, MERGE como experiência** |
| CMS (16 endpoints + tela) | **KEEP** — é o que o Admin usa para alimentar tudo |
| 13 Mandamentos | **KEEP** — requisito de certificação |
| Progresso e recompensa | **KEEP** |
| Tela `/academia` | **HIDE** — vira seção da Universidade |

**A fusão é de porta, não de motor.** Fundir os motores seria refazer 106 testes para
chegar ao mesmo lugar.

---

## SLIDE 18 — O que permanece INALTERADO

Metas · Performance · XP · VendaCoins · Ranking (7 tipos × 2 escopos × 3 períodos) ·
Perfil · Níveis · Badges · Streak · Baseline · Score Geral · Competições · Temporadas ·
Ligas · Reconhecimento · Feed · Autenticação · Identidade e ativação · Multiempresa ·
Multiloja · RBAC existente · ERP Adapter · Sincronização horária · Ledger imutável ·
Idempotência · Motores determinísticos · AI Control Plane · Auditoria.

Nada nesta auditoria recomenda tocar em nenhum deles.

---

## SLIDE 19 — Metas / Performance / Ranking / XP / VendaCoins

Preservados, sólidos e bem testados. Duas observações que não mudam a decisão, mas
devem ser ditas:

- **O ERP real nunca foi validado.** `ERP_MODE = 'mock'`. O adapter Linx tem 47 linhas,
  endpoint chutado, um `TODO` aberto no mapeamento e **zero testes**. Toda a
  performance do produto hoje vem de um mock determinístico.
- **`Badge` não tem arquivo de teste dedicado** — é a única capacidade de gamificação
  sem cobertura própria.

---

## SLIDE 20 — Inteligência de Desenvolvimento

Não precisa ser módulo visível, e a boa notícia é que **ela já existe inteira**:

Competências (22) · Targets · Evidências ponderadas · Score Engine · Gap Engine · PDI ·
Certificações (6 tipos de requisito) · Revisão espaçada · Learning path · Recomendação
por IA · Avaliação de gerente.

E as quatro fontes já alimentam: **quiz** (Academia), **simulação** (Simulador),
**missão** (Missões) e **avaliação do gerente**. Todas geram `CompetencyEvidence`.

**Engenharia ~95% pronta. Dado ~0%.** O motor está esperando conteúdo.

---

## SLIDE 21 — Admin: estado atual × papel futuro

**92 rotas de ADMIN** em 8 áreas, com 10 telas. O Admin já governa: usuários, lojas,
metas, conteúdo de treinamento, banco de questões, Mandamentos, escolas, competências,
certificações, PDI, seasons, competições, ligas, alertas gerenciais e a plataforma de IA.

**O que o Admin NÃO governa hoje:**

| Lacuna | Situação |
|---|---|
| **Catálogo de missões** | seed em código, zero rota admin |
| **Cenários do Simulador** | seed em código; só o pipeline de IA cria |
| **Playbook** | nenhum endpoint administrativo |
| **KnowledgeCards do Conselheiro** | módulo **não montado no servidor**; só script CLI |
| **Valor de recompensa de missão** | a régua não define `MISSAO` |

Essas cinco são o trabalho real de "Admin governa o produto" — e nenhuma delas exige
arquitetura nova, só superfície.

---

## SLIDE 22 — IA: onde usamos hoje

**14 especialistas, 6 pontos de chamada, 1 gateway.**

| Operação | Chamadas de IA |
|---|---|
| **Sessão completa de Simulador** | **10 a 17** |
| Job de geração de treinamento | **4 a 6** (até 12 com retry) |
| 1 mensagem ao Conselheiro | **1 a 3** (dois classificadores, ambos com curto-circuito por regex) |
| 1 mensagem ao Treinador | 1 |
| Sugestão de PDI / conselho de gestão | 1 |

Controles reais: budget mensal por empresa · rate limit de 20 mensagens/dia por
vendedor (implementado 3× independentemente, um por especialista) · ledger `AIUsage`
por chamada · janela de histórico de 16 · input de 4000 chars · timeout de 15s.

Duas lacunas: **os agentes de Training Intelligence e o Assistente de Gestão não têm
rate limit diário** (só budget), e **o "testar conexão" do Admin não passa pelo
gateway** — não checa budget nem o kill-switch.

---

## SLIDE 23 — IA: onde realmente vale usar

O projeto já acertou isso em 12 lugares. Onde há determinismo, não há IA:

nota do simulador · gabarito do quiz · classificação de intenção (quando o texto
resolve) · gate de pertinência · Knowledge Router (com teste que **proíbe** chamar IA) ·
guard dos Mandamentos · validação de questão · revalidação de IDs propostos pelo LLM ·
máquinas de estado de publicação · KPIs do Daily Huddle.

E a geração de conteúdo por IA **já nasce inerte**: aula em DRAFT, questão
`active: false`, cenário em rascunho. **Nenhuma publica sozinha.** O fluxo que a nova
visão pede para a Universidade (IA gera → Admin revisa → Admin publica) **já é o fluxo
implementado**.

---

## SLIDE 24 — Potencial de redução de custo e complexidade

Honestidade primeiro: **a simplificação de navegação não reduz custo de IA sozinha.**
Esconder o Treinador não apaga chamadas — só muda de onde elas partem.

Onde a redução real está, por ordem de tamanho:

1. **Simulador** (10-17 chamadas/sessão) — é o maior gasto por unidade de uso. Reduzir
   `maxTurns`, ou avaliar a cada N turnos em vez de sempre, tem impacto de primeira ordem.
2. **Conselheiro** — os dois classificadores já têm curto-circuito determinístico;
   ampliar a cobertura das regex reduz de 3 para 1 chamada em mais turnos.
3. **Training Intelligence** — 4 a 6 chamadas por job, sem rate limit diário.

**Complexidade que a simplificação realmente reduz:** quatro portas viram quatro
verbos, e o vendedor para de escolher entre "Treinador" e "Academia" sem saber a
diferença. Esse ganho é de produto, não de infraestrutura — e é legítimo.

---

## SLIDE 25 — Mapa de reaproveitamento

| Área | Reaproveitamento | Base da estimativa |
|---|---|---|
| **Universidade** | **95%** | 12 serviços, 33 endpoints, 97 testes; já lê tudo da Academia |
| **Quiz / Certificação** | **100% de engenharia, 0% de conteúdo** | corte 70%, server-side e `questionsPerAttempt` já existem |
| **Conselheiro** | **90%** | rotas já sem gate de papel; falta persona por papel e governança admin |
| **Simulador** | **85%** | separação de camadas + catálogo gerencial já existem; falta CRUD admin e 2 papéis |
| **Inteligência de Desenvolvimento** | **95% engenharia / ~0% dado** | motor completo, 4 fontes de evidência ligadas |
| **Admin** | **80%** | 92 rotas, 10 telas; faltam 5 superfícies de governança |
| **Missões** | **70%** | motor de avaliação excelente; **cascata de comando: 0%** |
| **Hierarquia / RBAC** | **35%** | tenant e auth sólidos; árvore, multi-loja e 2 papéis: inexistentes |

---

## SLIDE 26 — O que JÁ EXISTE para a nova arquitetura

Esta é a lista que evita reconstrução:

- **Conselheiro multi-papel** — 56 rotas não checam papel; gerente já conversa
- **Simulador por papel** — catálogo gerencial separado, com teste dedicado
- **Treinador gerencial** — prompt, contexto e 5 modos de liderança já existem
- **Separação personagem × avaliador** no Simulador
- **Nota e gabarito determinísticos no backend**
- **Corte de 70% configurável por quiz**
- **Nº de perguntas por tentativa**, com anti-repetição e anti-fraude
- **IA gera rascunho → humano publica** — em aula, questão e cenário
- **Motor de competências, evidências, PDI e certificação**
- **Missões gerenciais** (3), já avaliadas contra evidência real
- **Governança de conteúdo** com lifecycle de 5 estados, reusado em 7 entidades
- **AI Control Plane** com gateway, budget, ledger e credenciais cifradas

---

## SLIDE 27 — O que realmente precisa ser construído

Lista curta e honesta:

| # | Item | Por quê é novo |
|---|---|---|
| 1 | **Papéis COORDENADOR e SUPERVISOR** | zero ocorrências no código |
| 2 | **Árvore organizacional** | nenhum `parentId`; equipe é derivada por loja |
| 3 | **Vínculo pessoa ↔ múltiplas lojas** | `lojaId` é escalar obrigatório; gerente regional é impossível hoje |
| 4 | **Cascata de missões (comando)** | nenhuma rota de escrita, nenhum alvo coletivo, nenhum autor |
| 5 | **Governança admin de missões, cenários, Playbook e KnowledgeCards** | quatro superfícies inexistentes |
| 6 | **Conteúdo** — perguntas, certificações, Mandamentos | 6 perguntas e 0 certificações hoje |

Tudo o mais na nova visão é rearranjo do que existe.

---

## SLIDE 28 — O que NÃO precisamos reconstruir

Seção obrigatória, porque cada item aqui é dinheiro não gasto:

- **Quiz de 10 perguntas com 70%** — só falta escrever as perguntas
- **Aprovação determinística** — já é
- **Universidade absorver Academia** — já lê tudo dela; é navegação
- **Simulador multi-papel** — a metade gerencial já existe
- **Conselheiro para líderes** — o backend já permite
- **"IA gera, humano publica"** — já é o fluxo implementado
- **Certificação** — 6 tipos de requisito prontos, faltam definições
- **Evidência de competência** — 4 fontes já ligadas
- **Separação personagem/avaliador** — já existe
- **Ranking, XP, moeda, badges, streak** — intocados

---

## SLIDE 29 — Impacto da nova hierarquia

Onde dois níveis novos encostam:

| Camada | Impacto |
|---|---|
| **Schema** | novo enum de papel + árvore + vínculo N:N pessoa↔loja. **Migration obrigatória** |
| **JWT / Auth** | claims hoje carregam `lojaId` singular — precisa virar escopo |
| **RBAC** | **`lojaRestritaDe` está copiada em 3 arquivos e tipada como `string`, não como `Papel`** |
| **Escopo** | 27 leituras de `lojaId`, **23 delas num único arquivo** — concentração favorável |
| **Frontend** | bottom nav é fixo em 5 itens, igual para todos; não há nav por papel |
| **Admin** | criar/mover pessoas na árvore; hoje só existe "realocar" destrutivo |
| **Seeds e testes** | 22 specs E2E e centenas de fixtures assumem 1 loja |
| **Ranking / Metas / Performance** | precisam decidir se ganham escopo de nível |

**O risco número um, medido:** adicionar `SUPERVISOR` ao enum **não quebra a
compilação** nas três cópias de `lojaRestritaDe` — elas caem no ramo `undefined`, que
significa **empresa inteira**. O mecanismo de escopo atual, diante de um papel novo,
**falha aberto**. Isso precisa ser fechado *antes* do papel existir, não depois.

---

## SLIDE 30 — Riscos de regressão

O que não pode quebrar, em ordem de gravidade se quebrar:

1. **Privacidade do Conselheiro** — hoje garantida por arquitetura (o dado não
   autorizado nem sai do banco). Qualquer atalho de "líder vê o time" pode furá-la.
2. **Ledger de XP/VendaCoins** — imutável e idempotente. Reversão errada é dinheiro
   virtual errado.
3. **Privacidade do ranking** — já custou duas rodadas de correção (vazamento direto e
   depois por aritmética).
4. **Escopo de tenant** — 74 leituras de `empresaId`.
5. **Metas e Performance** — base de tudo.
6. **Evidências e certificação** — imutáveis por design.
7. **Idempotência do sync ERP**.

**E um risco que já está presente:** a suíte E2E variou nesta auditoria — **40/41 nas
duas primeiras execuções, com o spec que falha mudando, e 41/41 na terceira**. Cada um
passa isolado. Causa: os 22 specs compartilham o banco de desenvolvimento. Uma suíte
que varia não consegue provar ausência de regressão — e é exatamente isso que uma
transformação de hierarquia vai exigir dela.

---

## SLIDE 31 — Segurança e privacidade

Três achados reais, **não corrigidos** (esta é uma auditoria):

**R1 · ALTO — login resolve loja sem filtrar empresa.**
`POST /auth/login` faz `findFirst({ where: { codigoErp } })`, mas a unicidade é
`@@unique([empresaId, codigoErp])`. Com duas empresas, pode emitir JWT da empresa
errada. Inócuo hoje (uma empresa); crítico no dia em que houver duas. O próprio schema
documenta o risco; a query não aplica.

**R2 · MÉDIO hoje, ALTO com hierarquia — entidades globais sem tenant.**
`Season`, `Competition`, `League`, `AcademyTrack`, `Competency`, `CertificationDefinition`
e outras não têm `empresaId`. `GET /equipe/competicoes` (GERENTE) lista competições
**sem nenhum filtro de escopo**.

**R3 · MÉDIO — dois gerentes da mesma loja leem as notas privadas um do outro.**
`OneOnOne` tem coluna `managerId` e até índice para ela, mas o filtro é só
`(empresaId, lojaId)`. O código afirma privacidade "do gerente"; a garantia real é por
loja. **Isso é o §12 da nova visão já falhando um nível acima do previsto** — e a
coluna para fechar já existe.

**O que está bem:** `lojaId`/`empresaId` nunca são aceitos do cliente para decidir
escopo (zero ocorrências). Credenciais de IA cifradas com AES-256-GCM. Gabarito nunca
sai na resposta. Papel revalidado contra o banco a cada request.

---

## SLIDE 32 — Notas 0–1000 por módulo

Nota de **desenho de arquitetura e produto**, não de quantidade de código.

| Módulo | Nota | O que está forte | O que impede 1000 |
|---|---|---|---|
| **Conselheiro** | **920** | pertinência por arquitetura, memória governada, conhecimento curado, privacidade real | sem provider real avaliado; sem governança admin; multi-papel só até GERENTE |
| **Gamificação** | **880** | ledger imutável, idempotência, reversão, régua versionada | `MISSAO` e `COMPETICAO` sem valor; `Badge` sem teste próprio |
| **Segurança/Privacidade** | **780** | tenant do JWT, cifra, gabarito protegido, revalidação de papel | R1 (login), R2 (globais sem tenant), R3 (1:1 entre pares) |
| **Universidade** | **770** | motor completo e testado, 6 tipos de requisito, evidência ponderada | **0 certificações, 0 targets, 0 evidências** |
| **Simulador** | **760** | 4 camadas separadas, nota no backend, catálogo por papel | sem CRUD admin; custo de 10-17 chamadas; personas derivadas de uma base |
| **Admin** | **740** | 92 rotas, lifecycle de 5 estados reusado, auditoria append-only | não governa missões, cenários, Playbook nem conhecimento |
| **Integração (módulos entre si)** | **730** | evidência flui de 4 fontes; playbook alimenta 3 módulos | Academia↔Universidade acoplam bidirecionalmente sem fronteira declarada |
| **Missões** | **690** | critérios contra evidência real, idempotência, API só-leitura por princípio | sem comando, sem alvo coletivo, sem UI admin, recompensa zero |
| **Quiz/Certificação** | **650** | server-side, anti-fraude, idempotente | **6 perguntas no sistema; 0 certificações** |
| **Custo de IA** | **640** | gateway único, budget, ledger, 12 determinismos | Simulador caro; agentes sem rate limit; teste de conexão fura o gateway |
| **UX / Simplicidade** | **600** | 5 itens de nav, mobile-first, estados tratados | 4 portas sobrepostas no Evoluir; gerente com nav de vendedor; capacidades escondidas |
| **Hierarquia** | **380** | tenant sólido, guarda anti-IDOR, papel revalidado | sem árvore, sem multi-loja, sem 2 papéis, escopo que **falha aberto** |
| **PRODUTO GERAL** | **735** | engenharia madura, determinismo bem colocado, privacidade levada a sério | conteúdo quase vazio; hierarquia inexistente; navegação sobreposta |

---

## SLIDE 33 — Gaps para 1000, com o teste da necessidade

| Gap | Leva a 1000? | **É necessário ou só aumenta complexidade?** |
|---|---|---|
| Conteúdo real (perguntas, certificações, Mandamentos) | Universidade, Quiz | **NECESSÁRIO.** Sem isso o motor mais caro do produto não liga |
| Fechar `lojaRestritaDe` (fail-open) | Hierarquia, Segurança | **NECESSÁRIO** antes de qualquer papel novo |
| R1 — login por empresa | Segurança | **NECESSÁRIO** antes da segunda empresa |
| R3 — 1:1 por gerente | Segurança | **NECESSÁRIO** se a cadeia crescer; a coluna já existe |
| Cascata de missões | Missões | **NECESSÁRIO** — é a decisão de produto já tomada |
| Árvore + 2 papéis | Hierarquia | **NECESSÁRIO** — é a decisão de produto já tomada |
| Governança admin (missões, cenários, playbook, conhecimento) | Admin | **RECOMENDADO** — sem isso o conteúdo depende de deploy |
| Unificar Evoluir em 4 verbos | UX | **RECOMENDADO** — barato e resolve o problema identificado |
| Estabilizar E2E | Riscos | **RECOMENDADO** antes de transformar hierarquia |
| Reduzir custo do Simulador | Custo | **OPCIONAL** — só se o custo doer |
| Valorar `MISSAO`/`COMPETICAO` | Gamificação | **DECISÃO DE NEGÓCIO**, não técnica |
| R2 — tenant nas entidades globais | Segurança | **OPCIONAL hoje**, necessário com multi-empresa |
| Validar Linx | Performance | **NECESSÁRIO** para produção real, fora deste escopo |
| Ranking por nível de liderança | Ranking | **NÃO RECOMENDADO AGORA** — a decisão diz "não criar" |

---

## SLIDE 34 — Complexidade necessária × desnecessária

**Onde estamos complicando sem necessidade:**

1. **`lojaRestritaDe` copiada 3×, tipada como `string`** — duplicação que falha aberto.
2. **Rate limit implementado 3× independentemente** — foi decisão consciente, mas a
   terceira cópia é o momento de perguntar se ainda é.
3. **Quatro portas para "como eu melhoro?"** — o problema que motivou esta auditoria.
4. **Missão gerencial existe e é invisível** — código vivo sem usuário.
5. **`PLATFORM_ADMIN` sem nenhuma rota** e módulo de conhecimento não montado — papel
   e módulo existem e não são alcançáveis.
6. **Catálogos com `update: {}`** — editar o seed não propaga; a fonte de verdade do
   conteúdo fica ambígua entre código e banco.
7. **Ligas nascem no `GET` do admin** — efeito colateral de uma leitura.

**Onde a complexidade é necessária e deve ser defendida:**

Gateway único de IA · ledger imutável · idempotência em toda concessão · gate de
pertinência · separação evidência/recompensa · lifecycle de 5 estados · determinismo
nos cálculos · auditoria append-only.

---

## SLIDE 35 — Decisões humanas ainda abertas

1. **Escopo de liderança:** "um líder **enxerga** sua árvore" ou "um líder **comanda**
   qualquer um abaixo dele"? **Não são a mesma coisa**, e a segunda exige regra de
   conflito (o que acontece quando o coordenador atribui missão direto a um vendedor
   cujo gerente atribuiu outra?).
2. **Multi-loja:** supervisor cobre N lojas via árvore, ou via vínculo N:N pessoa↔loja?
3. **O que acontece com a conversa livre do Treinador** — vira modo do Conselheiro,
   cenário do Simulador, ou aposenta?
4. **Valor de recompensa de missão** — hoje é zero, estruturalmente.
5. **Quem escreve as perguntas de quiz** — IA gera rascunho e Admin aprova (já
   possível), ou conteúdo humano primeiro?
6. **Os 13 Mandamentos** — o texto real está no Playbook e a tabela `MandamentoOficial`
   está vazia. Copiar de um para o outro é decisão editorial, não técnica.
7. **Missões de líder** — cada nível tem catálogo próprio?
8. **Privacidade entre pares** — dois gerentes da mesma loja devem se ver? (hoje: sim)

---

## SLIDE 36 — Cenário A: MÍNIMO

**Só o necessário para executar as decisões já tomadas.**

- Papéis COORDENADOR e SUPERVISOR + árvore organizacional
- Fechar o fail-open de `lojaRestritaDe` (pré-requisito de segurança)
- Cascata de missões: líder aplica a pessoa ou equipe
- Hub Evoluir com 4 verbos; Treinador e Academia saem da navegação
- Quiz com 10 perguntas e 70% — **configuração + conteúdo**, sem código novo

**Migration:** sim (papéis + árvore). **IA:** nenhuma nova. **Risco:** médio-alto —
mexe em auth, RBAC e escopo, com E2E instável.

---

## SLIDE 37 — Cenário B: RECOMENDADO

**A + o que tem relação benefício/custo forte.**

Acrescenta:
- Governança admin de **missões** e **cenários do Simulador** (tira conteúdo do deploy)
- Endpoint administrativo de **Playbook** (o conteúdo oficial ganha dono)
- Montar o módulo de **conhecimento** e dar rotas ao `PLATFORM_ADMIN`
- Fechar **R1** (login por empresa) e **R3** (1:1 por gerente — a coluna já existe)
- **Estabilizar a suíte E2E** antes da transformação
- Conselheiro e Simulador visíveis para os papéis de liderança (backend já permite)

**Migration:** a mesma de A + nada estrutural. **Risco:** médio — as adições são
superfícies novas sobre motores existentes, não mudanças de motor.

---

## SLIDE 38 — Cenário C: AMPLIADO

**B + oportunidades encontradas na auditoria.**

Acrescenta:
- Vínculo N:N pessoa↔loja (gerente regional de verdade)
- `empresaId` nas entidades globais (multi-empresa real)
- Redução de custo do Simulador
- Rate limit para agentes e Assistente de Gestão
- Valoração de `MISSAO` e `COMPETICAO`
- Validação do adapter Linx

**Migration:** várias, uma delas ampla (N:N toca ~21 tabelas com `lojaId`).
**Risco:** alto. **E C não é automaticamente melhor** — metade do que ele adiciona só
tem valor quando existir uma segunda empresa ou um custo de IA que doa.

---

## SLIDE 39 — Impacto comparativo A / B / C

| | A — Mínimo | B — Recomendado | C — Ampliado |
|---|---|---|---|
| Entrega a decisão tomada | **sim** | sim | sim |
| Migrations | 1 conjunto | 1 conjunto | vários, um amplo |
| Superfícies novas | 2 | 6 | 10+ |
| Fecha achados de segurança | 1 (o fail-open) | **3** | 4 |
| Tira conteúdo do deploy | não | **sim** | sim |
| Reduz custo de IA | não | não | sim |
| Tempo relativo | **1×** | ~1,7× | ~3× |
| Risco de regressão | médio-alto | **médio** | alto |
| Dependência de decisão humana | 2 itens | 4 itens | 8 itens |

---

## SLIDE 40 — Recomendação técnica

Sem decidir pelo usuário, o que a evidência sustenta:

**O Cenário B tem a melhor relação entre o que entrega e o que arrisca** — porque
três dos seus itens (fechar o fail-open, R1, estabilizar E2E) não são melhorias
opcionais: são **pré-condições para fazer A com segurança**. Fazer A sem eles é
construir a hierarquia sobre um mecanismo de escopo que abre diante de papel novo, com
uma suíte que não consegue provar que nada quebrou.

E uma observação que a auditoria tornou difícil de ignorar: **nenhum dos três cenários
resolve o problema mais visível do produto, que é a falta de conteúdo.** Com 6
perguntas e 0 certificações, a Universidade reorganizada continuará mostrando "dados
insuficientes". Conteúdo não é fatia de engenharia — mas é o que separa este produto
de parecer pronto.

---

## SLIDE 41 — Sequência possível de implementação (hipótese, não iniciada)

| # | Fatia | Reaproveita | Migration | IA | Risco | Decisão humana prévia |
|---|---|---|---|---|---|---|
| 0 | Estabilizar E2E (isolamento entre specs) | — | não | não | baixo | não |
| 1 | Fechar fail-open de escopo + R1 + R3 | RBAC atual | não | não | baixo | não |
| 2 | Papéis + árvore organizacional | identidade, auth | **sim** | não | **alto** | §35.1, §35.2 |
| 3 | Escopo por árvore nas rotas gerenciais | manager-panel | não | não | médio | §35.1 |
| 4 | Navegação em 4 verbos; Treinador/Academia saem do hub | telas existentes | não | não | baixo | §35.3 |
| 5 | Cascata de missões (comando + alvo coletivo) | motor de missões | **sim** | não | médio | §35.1, §35.7 |
| 6 | Governança admin: missões, cenários, Playbook, conhecimento | CMS existente | talvez | não | médio | não |
| 7 | Conteúdo: perguntas, certificações, Mandamentos | CMS + pipeline de IA | não | opcional | baixo | §35.5, §35.6 |
| 8 | Liderança no Conselheiro e no Simulador | backend já permite | não | sim | baixo | não |

A Fatia 0 vem antes de tudo de propósito: sem ela, nenhuma das outras consegue provar
que não quebrou nada.

---

## SLIDE 42 — Gate executivo: vale aumentar o projeto?

| Classificação | Itens |
|---|---|
| **NECESSÁRIO** | árvore + 2 papéis · cascata de missões · fechar fail-open · conteúdo real |
| **RECOMENDADO** | R1 e R3 · governança admin · navegação em 4 verbos · estabilizar E2E |
| **OPCIONAL** | redução de custo do Simulador · rate limit dos agentes · tenant nas globais |
| **NÃO RECOMENDADO AGORA** | ranking por nível de liderança · performance por papel · N:N pessoa↔loja antes de haver segunda empresa |

**A resposta honesta:** o projeto não precisa aumentar muito. Precisa de **duas coisas
novas de verdade** (hierarquia e comando de missões), **quatro superfícies de
governança**, e **conteúdo**. Todo o resto da nova visão já está construído e só
precisa ser reorganizado ou revelado.

---

## SLIDE 43 — Próxima decisão

Três perguntas, nesta ordem:

1. **Escopo de liderança: enxergar ou comandar?** Tudo em Missões e RBAC depende disso.
2. **Cenário A, B ou C?**
3. **Quem escreve o conteúdo, e quando?** Porque sem ele a reorganização entrega uma
   casa melhor arrumada e igualmente vazia.

E uma pendência herdada, que segue de pé: **a 2C.6 continua parada** por falta de
provider de IA real configurado. Nada nesta auditoria altera isso.

---

## Anexo — Teste de honestidade da análise (§47)

Separação exigida: o que eu descobri lendo o código × o que passei a considerar por
causa da nova visão × o que é ideia opcional minha.

**DESCOBERTA DO CÓDIGO** (existiria mesmo sem a nova arquitetura):
- `lojaRestritaDe` falha aberto para papel novo
- R1 — login resolve loja sem filtrar empresa
- R3 — 1:1 privado por loja, não por gerente
- 6 perguntas de quiz; 0 certificações; Mandamentos vazios
- Missão gerencial invisível no frontend
- `PLATFORM_ADMIN` sem rotas; módulo de conhecimento não montado
- Recompensa de missão estruturalmente zero
- Adapter Linx sem teste, com TODO aberto
- Suíte E2E instável entre execuções
- `testarConexaoProvider` fura o gateway
- Playbook sem endpoint administrativo

**DECORRENTE DA NOVA DECISÃO DE PRODUTO** (só virou questão por causa da nova visão):
- Papéis COORDENADOR e SUPERVISOR
- Árvore organizacional e vínculo multi-loja
- Cascata de comando em missões
- Navegação em 4 verbos
- Conselheiro e Simulador para níveis acima de GERENTE
- Quiz de 10 perguntas

**IDEIA OPCIONAL MINHA** (nem o código nem a nova visão pediram):
- Reduzir o custo do Simulador mexendo em `maxTurns` ou na frequência da avaliação
- Ampliar a cobertura das regex dos classificadores do Conselheiro
- Rate limit diário para agentes de Training Intelligence
- Unificar as três implementações de rate limit
- Dar `empresaId` às entidades globais antes de existir uma segunda empresa

Nenhum item do terceiro grupo entrou como "necessário" em nenhum cenário.
