# Especificação Funcional — Vendedor IA V1

Desenho A–Z. **Nada implementado.** Baseline `25691ac`.
Notas 0–1000 são do **desenho**, não da quantidade de código.

---

## 0. Como ler este documento

Cada módulo tem o mesmo esqueleto: objetivo · usuários · telas · funções ·
permissões · **INPUT → PROCESSAMENTO → OUTPUT** · IA · dados · integrações ·
privacidade · notificações · estados vazios · fallback · testes futuros · nota ·
gaps · reaproveitamento.

`INPUT → PROCESSAMENTO → OUTPUT` recebe nota separada porque quase sempre um dos três
é o gargalo — e na maior parte deste produto o gargalo é o **INPUT**, não o processamento.

---

## 1. HOME

**Objetivo:** responder *"o que é mais importante eu saber e fazer agora?"* em menos de
cinco segundos.
**Usuários:** todos. **Cinco Homes distintas.**

### Home do Vendedor

Hoje tem **10 blocos** em sequência: saudação · card do Conselheiro · hero da meta ·
grid ticket/PA/posição · linha de ranking · missões de hoje · gamificação ·
temporada (condicional) · card Evoluir · frescor do ERP.

**Desenho V1 — 6 blocos, uma ação principal:**

| # | Bloco | Muda? |
|---|---|---|
| 1 | Saudação + nome + loja | mantém |
| 2 | **Hero da meta** — % · realizado · falta · "≈ N vendas" | mantém |
| 3 | **A ação de agora** — UMA só: continuar missão, ou continuar curso, ou praticar | **novo** — substitui "Missões de hoje" + "Evoluir" |
| 4 | Ticket · PA · Posição | mantém |
| 5 | Conselheiro | mantém, movido para baixo da ação |
| 6 | Gamificação + frescor do ERP | mantém, compactado |

**Por que a mudança:** hoje a Home oferece pelo menos quatro caminhos concorrentes
(missão, Evoluir, Conselheiro, temporada). O §54 pede **uma ação principal por vez** —
e o motor que escolhe qual é já existe (`montarParaVoce`), só nunca foi usado na Home.

### Home do Gerente

Hoje: saudação · assistente de IA (lazy) · meta do mês da loja · PA/ticket/ativos ·
alertas prioritários · destaques com "Parabenizar" · pendências · Reunião do Dia ·
Minha Equipe.

**Desenho V1:** mantém a estrutura (é boa) e acrescenta **"Meu desenvolvimento"** —
porque o gerente também é uma pessoa em desenvolvimento e hoje o bottom nav dele leva
para telas de vendedor.

### Home do Supervisor (nova)

Meta consolidada das lojas da árvore · gerentes que precisam de atenção (não
vendedores) · pendências do nível · Reunião com gerentes · meu desenvolvimento.

### Home do Coordenador (nova)

Consolidado da operação · supervisores e tendência · prioridades da semana ·
meu desenvolvimento.

### Home do Admin

Hoje o Admin é redirecionado para `/admin/usuarios`. **Desenho V1:** uma Home de
governança — saúde do conteúdo (quantas questões, quantas certificações, o que está
`DRAFT`), custo de IA no mês, estrutura, e o que precisa de aprovação.

| | Nota |
|---|---|
| INPUT | 850 — os dados existem todos |
| PROCESSAMENTO | 900 — agregação já existe |
| OUTPUT | **620** — poluição e caminhos concorrentes |
| **Home (desenho V1)** | **900** |

**Gaps para 950:** Home do Admin é nova; Homes de supervisor/coordenador dependem da
árvore. **Para 1000:** priorização da "ação de agora" precisa de uso real para calibrar.

---

## 2. METAS

**Objetivo:** saber onde chegar. **Usuários:** todos veem a própria; líderes veem a árvore.

**INPUT:** meta cadastrada pelo Admin (faturamento/ticket/PA × dia/semana/mês) +
indicadores do ERP.
**PROCESSAMENTO:** `realizadoNoPeriodo` agrupa snapshots por dia e usa o último de cada
dia como fechamento; calcula falta e estimativa de vendas restantes pelo ticket atual.
**OUTPUT:** progresso por período, gap, e "≈ N vendas" — determinístico, nunca do LLM.

**Permissões:** ver OWN (todos) · ver SUBTREE (líderes) · governar COMPANY (Admin).
**IA:** nenhuma, e deve continuar assim.
**Decisão preservada:** meta é decisão comercial da empresa, não do gerente da loja.
**Não fazer:** cascata de metas por nível de liderança — não foi pedida e adiciona um
eixo inteiro.

**Estado vazio:** *"Nenhuma meta de hoje cadastrada ainda."* — hoje é a primeira coisa
que um vendedor recém-ativado vê se a loja não tem meta. **Precisa de CTA ou de dado
mínimo no lançamento.**

| | Nota |
|---|---|
| INPUT | 800 — depende de o Admin cadastrar; sem cascata, é trabalho manual por vendedor |
| PROCESSAMENTO | 950 |
| OUTPUT | 950 |
| **Metas** | **930** |

**Para 950:** facilitar o cadastro em lote. **Aceito por simplicidade:** não criar
cascata automática.

---

## 3. PERFORMANCE

**Objetivo:** saber como estou. **INPUT:** `IndicadorRealizado` do ERP, de hora em hora.
**PROCESSAMENTO:** motor determinístico → baseline (14 dias, mín. 5 amostras) →
Score Geral (meta .40 · evolução .20 · PA .15 · ticket .15 · consistência .10) com
redistribuição quando a amostra é insuficiente.
**OUTPUT:** ticket, PA, faturamento, score, tendência.

**IA:** nenhuma. **Permissões:** OWN · SUBTREE para líderes · COMPANY para Admin.

**Risco conhecido e declarado:** `ERP_MODE = 'mock'`. O adapter Linx tem 47 linhas,
endpoint chutado, `TODO` aberto no mapeamento e **zero testes**. A premissa de que cada
snapshot é o acumulado do dia (não incremento) **nunca foi validada** contra o contrato
real.

| | Nota |
|---|---|
| INPUT | **500** — o ERP real nunca foi validado |
| PROCESSAMENTO | 970 |
| OUTPUT | 950 |
| **Performance** | **820** |

**Para 950:** validar o Linx. É o item de INPUT mais crítico do produto inteiro —
sem ele, tudo acima é um motor girando sobre dado simulado.

---

## 4. MISSÕES — desenho A–Z

**Objetivo:** FAZER. Traduzir uma necessidade em uma ação concreta com prazo e prova.

### O que é uma missão (definição de desenho)

Uma missão é **um compromisso com prazo, critério verificável e recompensa governada**.
Não é lembrete, não é sugestão, não é meta.

### Estrutura

| Campo | Hoje | V1 |
|---|---|---|
| Template (catálogo) | 10 definições em seed, global | **administrável pelo Admin** |
| Título e descrição | sim | sim |
| Público (`targetPapel`) | VENDEDOR / GERENTE | **+ SUPERVISOR / COORDENADOR** |
| Critério | 10 tipos, switch exaustivo | mantém, **+ critérios de liderança** |
| Período | DIA / SEMANA | mantém |
| **Autor** | **não existe** | **sistema** ou **pessoa que atribuiu** |
| **Alvo** | sempre vendedor individual | **pessoa · equipe · loja** |
| Progresso | calculado na leitura | mantém |
| Evidência | fato do sistema | **inegociável** |
| Conclusão | automática por evidência | mantém |
| Recompensa | XP/moeda pela régua — **hoje zero** | **Admin define o valor** |
| Status | 5 estados | mantém |
| Expiração | sem punição | mantém |
| Auditoria | — | **missão atribuída por pessoa é auditada** |

### INPUT → PROCESSAMENTO → OUTPUT

**INPUT:** catálogo governado + (atribuição automática do motor **ou** atribuição por
um líder dentro do escopo).
**PROCESSAMENTO:** `garantirMissoesDoDia` (idempotente por `[vendedor, definição,
startsAt]`) → avaliação de critério contra evidência real → transição condicional de status.
**OUTPUT:** progresso, conclusão, recompensa, evidência de competência, evento no feed.

### Permissões

Ver OWN (todos) · Ver SUBTREE (líderes) · **COMANDAR:DIRECT_REPORTS** (os três níveis
de liderança) · GOVERNAR catálogo e recompensa (só Admin).

### Três invariantes

1. **Admin governa a economia; liderança só aplica o autorizado.** Se um gerente
   definisse quanto vale uma missão, a moeda perderia comparabilidade entre lojas — e
   comparar lojas é a razão de o produto ser multi-loja.
2. **Conclusão vem de evidência**, nunca de declaração — nem do vendedor, nem do líder,
   nem da IA.
3. **API de escrita apenas para atribuição.** Não existe "marcar como concluída".

### IA

Sugerir rascunho de missão: **OPCIONAL**, com gate humano. Avaliar conclusão e definir
recompensa: **SEM IA, sempre**.

**Estado vazio:** *"Nenhuma missão pra hoje ainda."* — precisa de CTA.

| | Nota |
|---|---|
| INPUT | **400** — sem catálogo administrável, sem autor, sem alvo coletivo, recompensa zero |
| PROCESSAMENTO | 950 — motor de critério é excelente |
| OUTPUT | 800 — conclui, gera evidência e feed, mas não recompensa |
| **Missões (desenho V1)** | **950** |
| **Missões (hoje)** | **690** |

**Para 950 no desenho:** tudo acima. **É o maior gap de construção da V1.**

---

## 5. UNIVERSIDADE — desenho A–Z

**Objetivo:** APRENDER e CERTIFICAR. Único destino de aprendizagem.

### Estrutura

```
ESCOLA (8, taxonomia macro)
  └── CURSO/TRILHA
        └── AULA (texto · vídeo · PDF · material)
              └── (opcional) exercício
        └── AVALIAÇÃO FINAL (10 questões, ≥70%)
              └── CERTIFICAÇÃO
```

**Nomenclatura:** "trilha" (termo atual) e "curso" (termo da nova visão) são a mesma
entidade. **Decisão de desenho: adotar CURSO na experiência**, manter `AcademyTrack`
no banco. Renomear tabela não agrega.

### As 8 escolas existentes (não inventar novas antes de usar estas)

Vendas · Atendimento · Produto · Performance · Organização e Produtividade ·
Desenvolvimento Pessoal e Financeiro · **Liderança** · **Gestão de Equipes**.

Duas já são de liderança — **a Universidade já foi desenhada para líderes** e ninguém
notou. **Gap medido:** nenhuma das 4 trilhas atuais tem `escolaId`; as escolas estão
desconectadas do conteúdo.

### Conteúdo suportado

texto · vídeo (allowlist YouTube/Vimeo) · material/PDF · misto. **Livro/material
autorizado:** entra como material com licença declarada — o enum `SituacaoLicenca` já
existe no Knowledge e deve ser reusado, não reinventado.

### Obrigatoriedade e prazo

**Novo.** Hoje nada é obrigatório. Desenho: líder marca conteúdo como obrigatório para
`DIRECT_REPORTS`, com prazo; vira item de PDI e aparece em "Para você". **Não vira
missão automática** — senão a pessoa recebe a mesma coisa duas vezes.

### INPUT → PROCESSAMENTO → OUTPUT

**INPUT:** conteúdo publicado pelo Admin (manual ou rascunho de IA aprovado) +
mapeamento conteúdo → competência.
**PROCESSAMENTO:** progresso por aula · quiz determinístico · evidência ponderada ·
score de competência · gap · recomendação · revisão espaçada.
**OUTPUT:** progresso, aprovação, evidência, certificado, XP/moeda, próximo passo.

**IA:** criar conteúdo (OPCIONAL, gate humano) · recomendar ordem (OPCIONAL) ·
**corrigir prova: NUNCA**.

| | Nota |
|---|---|
| INPUT | **300** — 4 trilhas, 7 aulas, **6 questões**, 0 certificações |
| PROCESSAMENTO | 960 |
| OUTPUT | 900 |
| **Universidade (desenho V1)** | **950** |
| **Universidade (hoje)** | **770** |

**Para 950:** conteúdo. Só conteúdo.

---

## 6. QUIZ — dentro da Universidade

**Regra definida:** 10 questões por avaliação, ≥70% (7/10), server-side, anti-fraude.

### O que já existe e atende

| Requisito | Estado |
|---|---|
| Aprovação determinística no servidor | **já é** |
| Corte de 70% | **já é** — default do model e do seed, configurável por quiz |
| N questões por tentativa | **campo `questionsPerAttempt` já existe** |
| Sorteio com anti-repetição do conjunto anterior | **já existe** |
| Anti-fraude (só aceita o conjunto sorteado e persistido) | **já existe** |
| Gabarito nunca exposto | **já é** |
| Banco de questões administrável | **já existe** |
| IA cria questões | **já existe**, nascendo `active: false` |

### O que falta decidir (D-08)

| Item | Hoje | Proposta |
|---|---|---|
| Tentativas | **ilimitadas** | manter ilimitado; a evidência de cada tentativa já registra a curva |
| Cooldown | não existe | **não criar** — complexidade sem problema observado |
| Feedback pós-prova | não existe | mostrar acertos/erros **sem revelar o gabarito das erradas** |
| Embaralhamento de alternativas | não existe | **opcional**, baixo valor com pool pequeno |
| Versionamento de questão | `origemEditorial` + `active` | suficiente |

### O gargalo

**6 questões no sistema inteiro; o maior quiz tem 2.** Com 1 questão o corte de 70% é
binário (0 ou 100); com 2, exige acertar as duas.

**Para uma avaliação de 10 questões com sorteio fazer sentido, o pool mínimo por curso
é ~20 a 25 questões.** Com 4 cursos, isso é **80 a 100 questões** — contra 6 hoje.

| | Nota |
|---|---|
| INPUT | **150** — 6 questões |
| PROCESSAMENTO | 970 |
| OUTPUT | 850 — sem feedback pós-prova |
| **Quiz (desenho V1)** | **960** |
| **Quiz (hoje)** | **650** |

**Nenhuma linha de código é necessária para a regra nova. Só perguntas.**

---

## 7. CERTIFICAÇÃO

**INPUT:** definição publicada pelo Admin com requisitos.
**PROCESSAMENTO:** `avaliarElegibilidade` contra evidência real; emissão idempotente
por `(userId, definitionId, version)`; status recalculado (VALID / EXPIRING ≤30d / EXPIRED).
**OUTPUT:** certificado com template, snapshot de evidência, evento no feed.

**Seis tipos de requisito já existem:** conclusão de trilha · conclusão de aula ·
nota mínima em quiz · simulação · target de competência · **Mandamentos completos**.

**Validade e recertificação:** o motor já suporta. **Decisão (D-09):** usar ou não.
Recomendação: **usar validade só onde o conteúdo muda** (política comercial), não por
padrão — validade universal cria trabalho recorrente sem benefício.

**Simulador como requisito:** **já é um dos seis tipos.** Recomendação: usar como
**opcional**, nunca como único caminho — simulação depende de IA e o certificado não
deve depender de provider disponível.

| | Nota |
|---|---|
| INPUT | **0** — **zero certificações definidas** |
| PROCESSAMENTO | 960 |
| OUTPUT | 900 |
| **Certificação (desenho V1)** | **950** |
| **Certificação (hoje)** | **650** |

---

## 8. SIMULADOR — desenho A–Z

**Objetivo:** PRATICAR situações reais em ambiente seguro.

### Matriz de quem pratica com quem

| Usuário | Personagem IA | Existe? |
|---|---|---|
| VENDEDOR | Cliente | **sim** (12 cenários) |
| GERENTE | Vendedor virtual | **sim** (2 cenários de gestão) |
| GERENTE | Cliente | possível (o catálogo filtra por papel — decisão) |
| SUPERVISOR | Gerente virtual | **não** |
| COORDENADOR | Supervisor virtual | **não** |

### Estrutura do cenário (desenho)

público · papel do usuário · papel da IA · situação · contexto · objetivo · dificuldade ·
**fatos conhecidos** · **fatos proibidos** · comportamento · resistência · condições de
avanço · condições de encerramento · rubrica (2-4 dos 11 critérios) · competências ·
máximo de interações · **custo estimado**.

**Quase tudo já existe.** Faltam explicitamente: **fatos proibidos** (o que o personagem
não pode inventar) e **custo estimado** visível ao Admin.

### Arquitetura — já é a desejada

```
CENÁRIO → PERSONAGEM IA → CONVERSA → FINALIZAÇÃO → AVALIADOR SEPARADO → FEEDBACK → EVIDÊNCIA
```

Dois prompts distintos, dois contextos, dois `mode` na telemetria. **O personagem não
ensina nem avalia enquanto interpreta.** A nota é média dos critérios **calculada no
backend**; formato inválido vira `EVALUATION_PENDING`, nunca nota falsa.

### Privacidade (D-07) — o trade-off

| Opção | Líder vê | Consequência |
|---|---|---|
| **A (recomendada)** | que praticou · score · competência | preserva o espaço de erro |
| B | + feedback detalhado | líder ajuda melhor; a pessoa começa a "atuar para a nota" |
| C | + transcript | vigilância; o simulador morre como espaço de prática |

**Recomendação de desenho: A.** O valor do simulador é errar sem custo. Se o transcript
vira insumo de avaliação, as pessoas param de arriscar — e um simulador onde ninguém
arrisca não treina nada.

### Custo

**10 a 17 chamadas por sessão.** É o módulo mais caro do produto por uma ordem de
grandeza. Alavancas: reduzir `maxTurns`, ou avaliar a cada N turnos.

| | Nota |
|---|---|
| INPUT | 700 — 14 cenários, mas **sem CRUD admin** e sem cenários de níveis superiores |
| PROCESSAMENTO | 950 |
| OUTPUT | 900 |
| **Simulador (desenho V1)** | **950** |
| **Simulador (hoje)** | **760** |

---

## 9. CONSELHEIRO — desenho A–Z

**Objetivo:** EVOLUIR. Acompanhar a pessoa que vende ou lidera — não os números que ela produz.

### Princípios (preservados da Constituição existente)

Pessoa antes da performance · performance é contexto, não identidade · silêncio também
é inteligência · **o Conselheiro nunca cobra** · um assunto por vez · card recuperado ≠
card recitado.

### Modos (invisíveis ao usuário)

ACOLHER · REFLETIR · DESENVOLVER · TREINAR · AGIR · CELEBRAR.

### Contexto autorizado por papel (D-10)

| Papel | Domínios |
|---|---|
| VENDEDOR | pessoa · desenvolvimento · comercial (meta, PA, ticket) |
| GERENTE | pessoa · desenvolvimento · **liderança, equipe, feedback** |
| SUPERVISOR | pessoa · desenvolvimento · **liderança de gerentes, lojas, prioridades** |
| COORDENADOR | pessoa · desenvolvimento · **liderança de supervisores, execução, visão ampla** |
| ADMIN | **como usuário, igual aos outros** — nunca por privilégio |

**Um núcleo, quatro contextos. Nenhum agente novo.** O gate de pertinência já é
determinístico e já decide quais domínios carregar; ampliá-lo é adicionar entradas ao
`Record`, não criar bot.

### Conhecimento (skills)

Skill = **domínio governado e recuperável**, não agente. Domínios previstos: vendas ·
liderança · gestão · comunicação · hábitos · produtividade · desenvolvimento pessoal ·
inteligência emocional · objetivos · disciplina · **conhecimento oficial da empresa** ·
metodologias.

**Governança obrigatória, herdada do Playbook:** origem declarada e visível ·
versionamento · ciclo editorial com aprovação humana · **nunca inventar conteúdo**.

**Regra epistêmica:** `CIENTIFICO` não vira certeza; `METODOLOGIA` não vira prova
científica; `DESENVOLVIMENTO_PESSOAL` não vira ciência; conteúdo espiritual/reflexivo
**não é apresentado como física**. O `Record` exaustivo por `tipoFonte` já força isso
em tempo de compilação.

### Privacidade

Conversa · check-in · memória · intervenções: **`OWN` para todos os papéis, inclusive
ADMIN**. Garantia é arquitetural — o domínio não autorizado **nem é buscado no banco**.

**A travessia legítima:** *"isso parece assunto pro seu 1:1 — quer ajuda pra organizar
o que falar?"* A informação atravessa pela decisão da pessoa.

### Fallback

Sem IA, o Conselheiro **não funciona** — e é o único módulo com essa propriedade.
Aceito: é a natureza da função.

| | Nota |
|---|---|
| INPUT | 800 — contexto rico; **6 cards, e o seed os cria como DRAFT** |
| PROCESSAMENTO | 970 — pertinência, histórico governado, conhecimento |
| OUTPUT | **?** — **nunca foi avaliado com provider real (2C.6 parada)** |
| **Conselheiro (desenho V1)** | **950** |
| **Conselheiro (hoje)** | **920** |

**Para 950:** contexto por papel · governança admin do conhecimento · **e rodar a 2C.6**.
Sem avaliação real, a nota de OUTPUT é uma aposta, não uma medição.

---

## 10. RANKING · XP · VENDACOINS · GAMIFICAÇÃO

**Preservados integralmente.** Notas: Ranking **900** · XP **950** · VendaCoins **900**
· Gamificação geral **880**.

**O que impede 950 em VendaCoins:** `MISSAO` e `COMPETICAO` nunca foram valorados na
régua. A economia tem dois eventos mudos.

**O que impede 950 em Ranking:** nada de desenho. Não criar ranking de liderança agora.

**Inegociável:** faturamento alheio mascarado; `gapParaAnterior` só na própria linha.

**Como novos módulos usam gamificação sem duplicar motor:** sempre por
`concederXp`/`concederMoeda` com `idempotencyKey`, nunca escrevendo saldo.

---

## 11. PERFIL

**Impactos da hierarquia:** cargo · loja · **líder direto** · certificações · nível ·
conquistas · segurança.

**Cuidado de desenho:** não expor a árvore inteira no perfil. Uma pessoa precisa saber
quem é seu líder direto; não precisa do organograma da empresa.

Nota: **900**.

---

## 12. INTELIGÊNCIA DE DESENVOLVIMENTO — camada invisível

**Pergunta do §35:** quais destas capacidades precisam aparecer ao usuário?

| Capacidade | Aparece? | Como |
|---|---|---|
| Competências e score | **sim** | "Minha evolução" |
| Gaps | **sim, traduzido** | "Reforçar X" no Para você — nunca como lista de fraquezas |
| Evidências | **não** | motor |
| Ponderação por fonte | **não** | motor |
| PDI | **sim** | "Meu plano" |
| Certificações | **sim** | aba própria |
| Revisão espaçada | **sim, disfarçada** | "Revisões pendentes" |
| Learning path | **sim** | "Para você" |
| Histórico | **parcial** | evolução ao longo do tempo |

**Não vira quinto módulo.** É a costura entre os quatro.

| | Nota |
|---|---|
| INPUT | **200** — 0 evidências em banco novo; motor exige 2 para calcular |
| PROCESSAMENTO | 960 |
| OUTPUT | 850 — "Para você" só aparece em `/evoluir` e falha em silêncio |
| **Inteligência (desenho V1)** | **950** |

---

## 13. PDI

**Quem cria:** líder direto, ou o próprio, ou sugerido pelo Gap Engine.
**Quem aprova:** o líder direto. **Quem vê:** a pessoa e a árvore acima (fato); edição
só o líder direto.
**Relação com o Conselheiro:** o Conselheiro **não cria PDI** — no máximo sugere levar
ao 1:1. Essa fronteira é o que impede o Conselheiro de virar gerente digital.
**Relação com Universidade/Simulador/Missões:** itens de PDI apontam para conteúdo real
e são concluídos por evidência (`concluirItemPDIPorConteudo` já faz isso).

**Decisão (D-05):** PDI é semi-privado ou operacional? Recomendação: **ver toda a
árvore, editar só o líder direto**.

Nota: **900**.

---

## 14. ADMIN

**Seis áreas:** Estrutura · Performance · Desenvolvimento · Inteligência · Gamificação ·
Governança.

**O que já governa (92 rotas, 10 telas):** usuários, lojas, metas, conteúdo de
treinamento, banco de questões, Mandamentos, escolas, competências, certificações, PDI,
temporadas, competições, ligas, limiares de alerta, plataforma de IA, auditoria.

**O que NÃO governa — as cinco lacunas de V1:**

| Lacuna | Hoje |
|---|---|
| **Playbook oficial** | nenhum endpoint administrativo — só seed/script |
| **Cenários do Simulador** | seed em código; só o pipeline de IA cria |
| **Catálogo de missões** | seed em código, zero rota admin |
| **KnowledgeCards** | módulo **não montado em `app.ts`**; só script CLI |
| **Valor de recompensa de missão** | régua não define `MISSAO` |

**Princípio de conteúdo (§38):** IA produz, humano governa. **Já implementado** — aula
nasce `DRAFT`, questão nasce `active:false`, cenário nasce rascunho, e o job só termina
em `WAITING_REVIEW`.

**IA nunca inventa:** 13 Mandamentos · políticas · regras · processos · Playbook oficial.
Quando não há material real, a categoria fica **vazia e declarada vazia**.

| | Nota |
|---|---|
| INPUT | 900 |
| PROCESSAMENTO | 950 |
| OUTPUT | **700** — cinco superfícies faltando |
| **Admin (desenho V1)** | **950** |
| **Admin (hoje)** | **740** |

---

## 15. NOTIFICAÇÕES

**Estado atual, medido: não existe sistema de notificação.** Sem tabela, sem endpoint,
sem badge, sem toast, sem push, sem e-mail, sem estado lido/não-lido. **Tudo é pull** —
a pessoa só descobre algo se abrir a tela certa.

O que faz o papel hoje: alertas gerenciais persistidos · contadores textuais de
pendências · cards na Home · feed da loja.

### Desenho V1 — mínimo viável, dentro do app

| Evento | Quem recebe | Prioridade |
|---|---|---|
| Missão atribuída por um líder | a pessoa | alta |
| Missão perto do prazo | a pessoa | média |
| Conteúdo obrigatório atribuído | a pessoa | alta |
| Certificado emitido | a pessoa | baixa |
| Reconhecimento recebido | a pessoa | **alta** |
| Alerta gerencial novo | o líder | alta |
| Conteúdo aguardando aprovação | Admin | média |

**Desenho mínimo:** um contador no bottom nav e uma lista com lido/não-lido.
**Não fazer na V1:** push externo, e-mail, digest. **Anti-spam:** no máximo N por dia
por pessoa, e nunca notificação gerada por IA.

| | Nota |
|---|---|
| Notificações (hoje) | **200** |
| **Notificações (desenho V1)** | **900** |

**Aceito por simplicidade:** não chega a 1000 sem push, e push não vale a V1.

---

## 16. ONBOARDING

**Estado atual, medido:** **não existe**. Sem tour, sem boas-vindas, sem wizard — e o
app **nem tem como saber** que é o primeiro login (não existe `lastLoginAt` nem
equivalente). Depois de ativar, a pessoa cai na Home; se a loja não tem meta, a primeira
frase que ela lê é *"Nenhuma meta de hoje cadastrada ainda."*

E `/ativacao` **não tem link de lugar nenhum** — só chega quem digita a URL.

**`AcademyTrack.onboarding` existe no schema e nenhuma rota permite marcá-lo** — o tipo
`ONBOARDING` do "Para você" é inalcançável na prática.

### Desenho V1 — três telas, não um curso

1. **Boas-vindas** (1 tela): o que é o app, em uma frase por verbo.
2. **Primeira ação**: uma trilha de integração marcada como `onboarding`.
3. **Checklist leve** que some sozinho: fiz check-in · vi minha meta · concluí a
   primeira aula.

Por papel: vendedor foca em meta e desenvolvimento; líder ganha uma tela a mais sobre
a equipe.

| | Nota |
|---|---|
| Onboarding (hoje) | **100** |
| **Onboarding (desenho V1)** | **900** |

---

## 17. BUSCA

**Estado atual:** existe **uma** busca textual em todo o app — Admin > Usuários, e só
por `nome`. Nenhuma busca para vendedor ou gerente, nenhuma busca em conteúdo.

**Desenho V1:** busca **contextual dentro da Universidade** (cursos e aulas) e no
**Admin** (conteúdo e pessoas). **Não fazer:** busca global — não há volume que a
justifique, e ela criaria a expectativa de encontrar coisas privadas.

Nota do desenho: **900**. (Não vai a 1000, e não deve: busca global aqui é complexidade
sem problema.)

---

## 18. ESTADOS VAZIOS

Sete usos de `EmptyState`, nenhum com CTA. Cinco telas têm vazio "caseiro" fora do
componente. Três blocos **simplesmente não renderizam** quando vazios.

**Desenho V1:** todo estado vazio responde *"o que eu faço agora?"* e leva a uma ação.

| Situação | Hoje | V1 |
|---|---|---|
| Sem meta | "Nenhuma meta de hoje cadastrada ainda." | + "enquanto isso, veja seu desenvolvimento" |
| Sem missão | "Nenhuma missão pra hoje ainda." | + sugestão de curso |
| Sem ranking | "Ainda não há ranking calculado para hoje." | + quando será calculado |
| Sem badge | já tem direção, sem link | virar link |
| Sem evidência | matriz em branco | "responda um quiz para começar a medir" |
| Sem certificação | aba vazia | listar disponíveis |
| **Sem IA / budget estourado** | erro genérico | **mensagem honesta e específica** |

| | Nota |
|---|---|
| Estados vazios (hoje) | **400** |
| **Estados vazios (desenho V1)** | **950** |

---

## 19. Conexões entre módulos — o grafo

| Origem | Evento | Destino | Dado | Auto | Humano | IA | Privado |
|---|---|---|---|---|---|---|---|
| ERP | sync horário | Performance | indicadores | sim | — | — | operacional |
| Performance | meta batida | XP/Moeda | evento | sim | — | — | operacional |
| Performance | snapshot | Ranking | posição | sim | — | — | mascarado |
| Performance | baseline vs. real | Missões | critério | sim | — | — | operacional |
| Universidade | quiz aprovado | Evidência | score | sim | — | — | semi |
| Universidade | aula concluída | XP/Moeda | evento | sim | — | — | operacional |
| Simulador | sessão avaliada | Evidência | score final | sim | — | **avaliador** | semi |
| Missões | missão concluída | Evidência + XP | evento | sim | — | — | operacional |
| Gestão | avaliação do líder | Evidência | rating | — | **sim** | — | semi |
| Evidência | ≥2 registros | Score/Gap | competência | sim | — | — | semi |
| Gap | prioridade ALTA | Para você | sugestão | sim | — | reordena | privado |
| Gap | — | PDI | item | — | **sim** | sugere | semi |
| Evidência | requisitos ok | Certificação | certificado | sim | — | — | operacional |
| Conselheiro | — | (nada) | **só lê** | — | — | sim | **privado** |

**Duas leituras:**
1. **Evidência é o barramento.** Quatro fontes escrevem, três consomem.
2. **O Conselheiro só lê.** Ele não escreve em nenhum outro módulo — e é isso que
   permite que a conversa seja privada sem quebrar nada.

---

## 20. Testes futuros — estratégia (§59)

**Jornada E2E por papel:** vendedor · gerente · **supervisor** · **coordenador** · admin.

**Autorização não aceita só teste unitário.** Para cada função da matriz de permissões,
um teste que prova a **negação**: pessoa do nível errado recebe 404/403, e o 404 é
genérico (nunca revela existência).

**Pré-condição medida:** a suíte E2E atual **varia entre execuções** — 40/41 nas duas
primeiras rodadas da auditoria, com o spec que falha mudando, e 41/41 na terceira. Os 22
specs compartilham o banco de desenvolvimento. **Uma suíte que varia não prova ausência
de regressão** — e é exatamente isso que a transformação de hierarquia vai exigir dela.

**Isolamento por spec é pré-condição, não melhoria.**
