# Fase 1 — Performance & Game · Auditoria A–Z de prontidão para teste em loja

> **Somente auditoria.** Nenhum código, schema, banco, teste ou configuração foi alterado. Este documento é o único arquivo criado.
> Data: 04/10/2026 · HEAD auditado: `889953a` (= `origin/main`, branch `main`, árvore limpa no início).
> Fonte final da verdade: o **código executável**. Documentação foi lida, mas, onde diverge do código, vale o código.

---

## 0. Veredito

# **NÃO PRONTO PARA PILOTO**

Motivo em uma frase: **a experiência que foi homologada (Vendedor + Admin da Fase 1) é um protótipo 100% mockado que nem entra no build de produção, e não existe nenhum caminho para venda real entrar no sistema.**

O backend é sólido em várias áreas (ledger, idempotência, competições, engajamento, escopo por empresa), mas a ponte entre ele e a experiência aprovada não existe, e a fonte de vendas também não.

---

## 1. Baseline Git

| Item | Valor |
|---|---|
| Diretório | `/Users/Franklin/app-vendedor-sapatinho` |
| Branch | `main` |
| HEAD | `889953aa72de5dde63791b4265401a5d330d71b8` |
| origin/main | `889953aa72de5dde63791b4265401a5d330d71b8` (após `git fetch`) |
| Árvore | limpa (`git diff` vazio) |
| Commits recentes | `889953a` engajamento · `8dc7a76` ajustes homologação vendedor · `01d8906` encerrar campanha · `6052cd2` Admin conectado ao app (mock) · `3a98f09` protótipo Fase 1 · `fb99e8a` constituição V1 · `25691ac` auditoria 360 · `40d7331` 2C.6 · `f16af4c` · `49c30fe` |

Ao final, a única diferença na árvore é **este documento** (não commitado).

---

## 2. Achado estrutural nº 1: existem DOIS frontends

| | **Protótipo homologado** `/fase1/*` | **App real** `/` e `/admin/*` |
|---|---|---|
| Onde | `web/src/fase1/**` (~7.500 linhas) | `web/src/screens/**` |
| O que é | a experiência aprovada nas homologações: Início, Desempenho, Ranking (Loja/Geral/Loja×Loja), Desafios, Progresso, Conquistas, Recordes, Feed, Moedas, Perfil + Admin (Performance, Pessoas, Incentivos, Gamificação e Comunicação, Operação) | app anterior à Fase 1: Home, Metas, Evoluir, Ranking, Perfil, Missões, Competições, Carteira, Conquistas, Meus Ganhos, Coach, Treinador, Simulador, Universidade, Academia + Admin (Usuários, Estrutura, Metas, Gamificação, Engajamento, IA, Treinamento, Universidade, Gerencial) |
| Dados | **zero chamadas de API**. Estado em `localStorage` (`fase1/demo/estado.ts:406-443`), cenário em `sessionStorage` (`fase1/demo/Fase1Contexto.tsx:55-64`), dados de `fase1/demo/cenarios.ts` | API real (`web/src/api/*`) |
| Produção | **não existe**: `App.tsx:45` só carrega o protótipo se `import.meta.env.DEV` ou `VITE_FASE1_DEMO === 'true'` | é o que o PWA abre (`vite.config.ts:21` `start_url: '/'`) |
| Navegação vendedor | Início/Desempenho/Ranking/Desafios/Perfil | `BottomNav.tsx`: Início/Metas/**Evoluir**/Ranking/Perfil (Evoluir = Universidade/Treino, **fora da Fase 1**) |

**Consequência:** se a loja instalasse o app hoje, veria o app antigo (com Conselheiro, Evoluir, Treinador, Simulador expostos), não a Fase 1 homologada. A "conexão" do protótipo ao backend é **o maior volume de trabalho que falta** e não foi iniciada (exceto engajamento, que foi ligado ao app real, não ao protótipo).

---

## 3. Mapa frontend → backend (experiência homologada da Fase 1)

Legenda: 🟢 pronto real · 🔵 existe, precisa conectar · 🟡 parcial · 🔴 ausente necessário · 🟣 mock · ⚫ bloqueador · ⚪ fora da Fase 1

### 3.1 Vendedor

| Tela (protótipo) | Informação/ação | Origem atual | Backend equivalente | Tabela | Status |
|---|---|---|---|---|---|
| Entrar | login loja + matrícula + senha | mock (qualquer persona) | `POST /auth/login` (`src/routes/auth.ts:69`), JWT 12h | `Vendedor`, `Loja` | 🔵 (o app real já usa) |
| Início | meta do dia, realizado, % e falta | mock `cenarios.ts` | `GET /metas/minhas` → `getProgressoVendedor` (`metas.service.ts:157`) | `Meta`, `IndicadorRealizado` | 🔵 + ⚫ (sem venda real, §25) |
| Início | meta do mês (Corrida do Mês), projeção | mock | idem (período MES) | idem | 🔵 / 🟡 projeção só no front |
| Início | "Faltam N vendas", pares, vendas/dia | `fase1/dominio/estimativas.ts` | **não existe no backend** | — | 🟡 regra só no front, marcada "NÃO CONGELADA" (`estimativas.ts:4`) |
| Início | ticket médio, PA | mock | `IndicadorRealizado.ticketMedio/pa` (agregados do ERP) | idem | 🔵 |
| Início | "Dados do ERP de HH:MM" + aviso de atraso | mock | `sincronizadoEm` em `GET /metas/minhas` (`routes/metas.ts:14`) | idem | 🔵 |
| Início | check-in diário, XP, VendaCoins, sequência de acesso | — (protótipo não tem) | `POST /engajamento/acesso`, `GET /engajamento/meu` | `AcessoDiario`, ledgers | 🟢 no app real · 🔵 para o protótipo |
| Desempenho / Comparativos | evolução, ticket, PA, comparação com loja | mock | parcial: `realizadoNoPeriodo`, `baseline` (`src/gamificacao/baseline*`) | `IndicadorRealizado` | 🟡 |
| Ranking da Loja | posição, distância, próximo alvo | mock `ordenarRanking` (`estimativas.ts:97`) | `GET /gamificacao/ranking?escopo=LOJA` (`routes/gamificacao.ts:85`), `RankingSnapshot` | `RankingSnapshot` | 🟡 só período DIA, sem desempate, sem variação |
| Ranking Geral | idem rede | mock | `escopo=REDE` | idem | 🟡 idem |
| Loja × Loja | ranking de lojas | mock `ordenarRankingLojas` (`estimativas.ts:107`) | **não existe no ranking**; só como Competição STORE | — | 🟡 via Competições / 🔴 como ranking |
| Desafios → Missões | missões do dia, progresso | mock | `GET /missoes/ativas` (`routes/missoes.ts`) | `MissionDefinition`, `MissionAssignment` | 🟡 catálogo por seed, sem CRUD Admin, bônus 0 |
| Desafios → Produto da Semana | "venda X pares da referência Y" | mock (`fase1/admin/Incentivos.tsx:511`) | **não existe** (sem produto, sem pares) | — | 🔴 / ⚫ depende de dado de item |
| Desafios → Competições/Campanhas | competição ativa, classificação, prêmio | mock | `GET /competicoes`, `/competicoes/:id` (`competicoes-seller.ts`) | `Competition`, `CompetitionResult` | 🔵 (Campanha = Competição; §9) |
| Progresso | XP, nível, próximo nível | mock (`fase1/dominio/niveis.ts`) | `GET /gamificacao/carteira`, `niveis.ts` backend | ledgers | 🔵 (atenção: níveis duplicados front/back) |
| Moedas / Meus ganhos | saldo, extrato | mock (`cenarios.ts:250-266`) | `GET /gamificacao/carteira`, `/extrato-moedas`, `/meus-ganhos` | ledgers | 🔵 (app real 🟢) |
| Conquistas | badges | mock `catalogoConquistas` (`cenarios.ts:186`) | `GET /gamificacao/badges` | `Badge`, `BadgeConquistado` | 🔵 / 🟡 6 badges sem gatilho |
| Recordes | melhor dia, mês, ticket, PA | mock | **não existe** (só `StreakVendedor.maiorStreak`) | — | 🔴 (calculável de `IndicadorRealizado`) |
| Sequências | dias batendo meta | mock | `GET /gamificacao/streak` | `StreakVendedor` | 🔵 + fuso servidor (§22) |
| Feed | eventos da loja | mock (`cenarios.ts:277-282`) | `GET /feed` (`feed.service.ts:72`) | `FeedEvent` | 🔵 / 🟡 sem eventos de posição/recorde/loja |
| Reconhecimentos | recebidos | mock | `GET /reconhecimentos` | `Recognition` | 🔵 |
| Celebrações | meta, missão, check-in | mock local | sem evento "novo desde a última visita"; app real só celebra check-in | — | 🟡 |
| Estados vazio/erro/atraso | | cenários de demo | `sincronizadoEm` existe | — | 🔵 |
| Desafio vendedor × vendedor | — | **removido** na homologação; não exposto no protótipo nem no app real | — | — | ⚪ confirmado não exposto |

### 3.2 Admin

| Área (protótipo) | Ação | Origem atual | Backend equivalente | Status |
|---|---|---|---|---|
| Visão geral / Performance | indicadores da loja e da rede | mock (`fase1/admin/Performance.tsx`) | parcial: painel do gerente (`store-summary`), painel de engajamento; **sem endpoint de visão geral para ADMIN** | 🟡 |
| Pessoas | cadastrar, editar, ativar, bloquear, desligar, reativar, transferir, reemitir acesso | mock (`fase1/admin/Pessoas.tsx`) | `src/routes/admin.ts:70-333` (ADMIN), com auditoria | 🔵 (app real `/admin/usuarios` 🟢) |
| Lojas | CRUD, inativar | mock | `admin.ts` lojas CRUD | 🔵 (`/admin/estrutura` 🟢) |
| Vínculo ERP | matrícula ERP / identidade externa | mock | `admin.ts` identidade-externa | 🔵 |
| Metas | meta individual DIA/SEMANA/MÊS | mock (com meta da loja e distribuição) | `src/routes/admin-metas.ts:28-105`, **uma meta por vendedor por período, cadastro manual** | 🟡 sem meta da loja, sem distribuição mensal→diária, sem calendário |
| Calendário operacional / regra de meta diária | | mock | **não existe** | 🔴 |
| Indicadores / Rankings / Elegibilidade | | mock | ranking DIA; elegibilidade = ACTIVE + VENDEDOR fixa no código | 🟡 |
| Incentivos → Missões / templates | criar, publicar missão | mock (`fase1/admin/Incentivos.tsx`) | **sem CRUD** (catálogo só por `catalogo-seed.ts`) | 🔴 |
| Incentivos → Produto da Semana | | mock | **não existe** | 🔴 |
| Incentivos → Competições/Campanhas | criar, agendar, ativar, encerrar, prêmio | mock | `src/routes/competicoes-admin.ts:53-279` (ADMIN), job `temporadas` | 🔵 (UI real só parcial em `AdminGamificacao.tsx`) |
| Gamificação e Comunicação | XP/VendaCoins por evento, níveis, conquistas, reconhecimento, feed | mock | régua `RegraGamificacaoVersao` (sem tela de edição), níveis fixos no código, reconhecimento via `POST /equipe/:id/reconhecimentos` (ADMIN/GERENTE) | 🟡 |
| Recompensa por acesso diário | | — | `GET/PUT /admin/engajamento/config` | 🟢 (app real) |
| Engajamento / analytics | | — | `GET /engajamento/painel` | 🟢 (app real) |
| Operação → Saúde dos dados | último sync, atraso | mock (`fase1/admin/Operacao.tsx`) | **sem endpoint de saúde de sync para Admin**; `/health/deep` só DB/Redis | 🔴 |
| Operação → Auditoria | | mock | `GET /admin/auditoria` (`admin.ts`) | 🔵 |
| Operação → Prontidão do piloto | checklist | mock | não existe | 🟡 (pode ser derivado) |
| Visualizar como vendedor | preview | mock (troca de persona) | não existe | ⚪ não necessário para piloto |

---

## 4. Inventário de mocks

| # | Onde | Simula | Backend real equivalente? | Basta conectar? | Necessário ao piloto? | Pode ficar só como DEV? |
|---|---|---|---|---|---|---|
| M1 | `web/src/fase1/demo/estado.ts` (localStorage) | todo o estado Admin↔Vendedor: pessoas, metas, missões, campanhas, prêmios, encerramentos | parcial (pessoas, metas, competições, engajamento sim; missões CRUD, produto, calendário não) | parcial | sim | sim |
| M2 | `fase1/demo/cenarios.ts` (`EU='ana'`, personas Ana/Rafaela/Maria/João, lojas Caruaru Shopping/Santa Cruz) | vendedores, lojas, desempenho, ranking, feed, extrato, conquistas | sim para vendedores/lojas/extrato/badges/feed; não para recordes/Loja×Loja | sim (maioria) | sim | sim |
| M3 | `fase1/demo/cenarios.ts:662+` `CENARIOS` A–T | situações de homologação (início do dia, 76%, quase 1º, erro, lento, atraso) | n/a | n/a | não | **sim** (devem ficar só em DEV) |
| M4 | `fase1/demo/Fase1Contexto.tsx` (sessionStorage) | cenário/persona selecionados | n/a | n/a | não | sim |
| M5 | `fase1/demo/simulacao.ts` | passagem do tempo, vendas chegando | sim (sync ERP) | não: depende de venda real | sim | sim |
| M6 | `fase1/demo/cenarios.ts:52` `REGUA_V1` (cópia) | valores de XP/moedas | **duplicação** de `src/gamificacao/regras.service.ts:67-102` | sim (ler do backend) | sim | não deve ficar |
| M7 | `fase1/dominio/niveis.ts` | níveis | **duplicação** de `src/gamificacao/niveis.ts` | sim | sim | não deve ficar |
| M8 | datas fixas em `cenarios.ts` (`2026-10-2x`) | extrato/feed | sim | sim | — | sim |
| M9 | `src/integracoes/erp/mock-adapter.ts` (**backend**) | vendas: hash SHA-256 de `vendedorId:dia`, 4–11 atendimentos, ticket R$90–200, PA 1,2–3,0 | é o **único** caminho de venda hoje (`ERP_MODE=mock` é o padrão em `config.ts:24` e `docker-compose.yml:70`) | — | **⚫ não pode rodar no piloto** | sim (DEV/testes) |
| M10 | `scripts/seed.ts` | empresa, LOJA001, Helena ADM001, Marina VEND001, Rafael VEND002, Paulo GER001, senhas triviais, meta R$1000 de hoje **+ configuração necessária** (régua, badges, catálogo de missões, academia…) | — | — | parte é necessária (configuração) | **⚫ mistura demo com configuração** (§30) |
| M11 | `scripts/seed-engajamento-demo.ts` | histórico de acesso `SEED_DEMO` | — | — | não | sim (tem trava localhost) |
| M12 | `src/missoes/catalogo-seed.ts` | catálogo de missões | é a "fonte" real hoje (não há CRUD) | — | sim | — |

---

## 5. Cálculos exibidos ao vendedor

| Cálculo | Fórmula atual | Onde | Fonte | Duplicação? | Fuso | Pronto? |
|---|---|---|---|---|---|---|
| % meta | realizado ÷ meta | protótipo `estimativas.ts:22`; backend calcula `faltaParaMeta` (`metas.service.ts:157-185`), % no front do app real | `IndicadorRealizado` + `Meta` | sim (front e back) | servidor | 🟡 |
| Valor faltante | max(0, meta − realizado) | back `metas.service.ts` e front `estimativas.ts:27` | idem | sim | servidor | 🔵 |
| Vendas restantes | ⌈faltante ÷ ticket médio atual⌉ | **só front** `estimativas.ts:36` | ticket do ERP | não | — | 🟡 regra "NÃO CONGELADA" |
| Pares restantes | vendas × PA | **só front** `estimativas.ts:42` | PA do ERP | não | — | 🟡 |
| Vendas/dia | vendas ÷ dias restantes | **só front** `estimativas.ts:52`; dias vêm do **mock** | sem calendário | — | — | 🔴 sem dias de trabalho reais |
| Projeção do mês | média/dia trabalhado × dias | **só front** `estimativas.ts:61` | idem | — | — | 🔴 idem |
| Realizado do dia | último snapshot horário do dia | `metas.service.ts:34-69` | ERP | — | **servidor** (`setHours(0)`) | 🟡 premissa "acumulado" a validar no Linx |
| Realizado semana/mês | soma do último snapshot de cada dia | idem | ERP | — | servidor; **semana começa domingo** (`metas.service.ts:20`), engajamento começa segunda | 🟡 inconsistência |
| Ticket / PA do período | faturamento ÷ atendimentos; PA ponderado por atendimentos | `metas.service.ts:51-58` | ERP | — | servidor | 🔵 |
| Posição / distância | ordenação por métrica; `gapParaAnterior` só na linha do próprio vendedor | back `ranking.service.ts:118-265`; protótipo reimplementa (`estimativas.ts:97`) | `RankingSnapshot` | sim | servidor | 🟡 sem desempate, só DIA |
| Score Geral | 0–1000: meta 0,4 · evolução 0,2 · PA 0,15 · ticket 0,15 · consistência 0,1; componente ausente redistribui e marca `provisorio` | `src/gamificacao/score.ts` | ERP + baseline | não | servidor | 🔵 |
| Loja × Loja | média dos scores dos vendedores (só em Competição STORE) | `competicoes/metricas.service.ts:119-125`; protótipo próprio | | sim | servidor | 🟡 |
| Consistência | componente do score; sem ranking próprio | `score.ts` | | — | | 🟡 |
| Próximo alvo | `proximoAlvo.ts`/`alvos.ts` | **só front** | mock | — | — | 🟡 regra só no front |
| Variação de posição | — | **não existe** (snapshot apagado e recriado, `ranking.service.ts:142-160`) | — | — | — | 🔴 se a tela homologada mostra ⬆️/⬇️ |
| Recordes | — | **não existe** | — | — | — | 🔴 |
| Sequência de meta | dias fechados ≥100% da meta diária; dia sem meta é neutro | `streak.service.ts`, job 00:10 | `StreakVendedor` | — | **servidor + cron UTC** | 🟡 |
| Frequência/sequência de acesso | X de Y dias válidos decorridos | `src/engajamento/regras.ts` | `AcessoDiario` | — | **empresa** ✅ | 🟢 |
| XP / nível | soma do ledger; níveis fixos | `niveis.ts` (back) + `fase1/dominio/niveis.ts` | `XpTransacao` | **sim** | — | 🔵 |
| VendaCoins | soma do ledger | back | `MoedaTransacao` | — | — | 🟢 |

**Determinismo:** todos são determinísticos dados os insumos. O problema não é a fórmula, é **onde ela mora** (várias só no front, sem teste de backend) e **de onde vem o insumo** (mock).

---

## 6. Meta de Hoje e Meta Mensal

| Pergunta | Estado real |
|---|---|
| De onde vem a meta mensal? | `Meta` com `periodo=MES`, cadastrada pelo Admin, **por vendedor** (`admin-metas.ts`). 🔵 |
| De onde vem a meta diária? | `Meta` com `periodo=DIA` e `referencia` = aquele dia, **também cadastrada à mão, uma por vendedor por dia**. Não é derivada da mensal. ⚫ operacional: 5 vendedores × ~26 dias = ~130 cadastros/mês; sem meta diária **não há tiers de meta, sequência nem missão DAILY_GOAL** |
| Meta da loja | **não existe** como entidade (protótipo tem). 🔴 se a tela homologada a mostra |
| Realizado | último snapshot do ERP no dia. ⚫ só mock hoje |
| Ticket / PA | agregados do ERP, não calculados de itens | 
| Vendas e pares necessários, vendas/dia, dias restantes | só no front, com dias do mock. 🔴 sem calendário |
| Calendário, feriado, domingo, loja fechada | **inexistente no backend** |
| Vendedor novo | meta só se o Admin cadastrar; score `provisorio` sem baseline. 🟡 |
| Transferido | `Meta` guarda `lojaId` do cadastro; realizado é por vendedor (segue a pessoa); ranking usa `lojaId` atual. 🟡 sem regra definida |
| Desligado | sai do ranking/sync (só ACTIVE); metas permanecem. 🔵 |
| Dia sem venda | sem snapshot → realizado 0; sequência: com meta e 0 → quebra. 🔵 |

---

## 7. Rankings

| Aspecto | Estado |
|---|---|
| Métricas | FATURAMENTO, PERCENTUAL_META, PA, TICKET, MOEDAS, SCORE_GERAL, EVOLUCAO (`ranking.service.ts:118-128`) |
| Períodos | **só DIA é calculado** (`recalcularTodosOsRankingsDoDia` no sync, `sync-erp.queue.ts:102`). `recalcularRankings` (SEMANA/MÊS) **não tem nenhum chamador**: a rota aceita `periodo=SEMANA/MES` e devolve vazio. ⚫ para "Corrida do Mês" |
| Atualização | a cada sync (hora em hora) |
| Elegibilidade | ACTIVE + VENDEDOR, fixo no código; sem regra para novo/transferido; sem tela de elegibilidade |
| Desempate | **nenhum** (sort simples, `:140`) — decisão pendente |
| Distância | `gapParaAnterior` só na linha do próprio; valores dos colegas mascarados |
| Variação de posição | **não existe** |
| Ausência de meta | PERCENTUAL_META sem meta → fora/zero (verificar na conexão) |
| Loja × Loja | não existe no ranking; só Competição STORE |

---

## 8. Missões

| Etapa | Estado |
|---|---|
| Admin cria/salva/publica | **🔴 inexistente** — catálogo só por `src/missoes/catalogo-seed.ts` (7 vendedor, 3 gerente, 3 desafios) |
| Vendedor recebe | atribuição **preguiçosa** ao abrir `GET /missoes/ativas` (`garantirMissoesDoDia`, prioridade fixa) — 🔵 |
| Evento comercial → progresso | só critérios indiretos: DAILY_GOAL (tier 100 concedido), PA/TICKET_IMPROVEMENT. **Nenhum critério de produto, categoria, pares ou faturamento** (`schema.prisma:1497-1511`) |
| Conclusão | reavaliada na leitura; idempotente — 🟢 |
| XP/VendaCoins | **bônus = 0**: `concederBonusMissao` só concede se a régua tiver `MISSAO`, e a REGUA_V1 não tem (`missoes/recompensa.service.ts:25-38`) — 🟡 |
| Ledger / feed / auditoria | feed `MISSION_COMPLETED` ✅; `EventoEngajamento` ✅; sem `AuditEvent` |
| Tipos fora da Fase 1 | COMPLETE_LESSON, PASS_QUIZ, COMPLETE_SIMULATION, critérios gerenciais ⚪ |
| Separação | Missão (diária, automática) ≠ Desafio (seed) ≠ Competição (Admin) ≠ Campanha (não existe) |

---

## 9. Campanhas

**Não existe entidade Campanha no backend** (nenhuma ocorrência em `schema.prisma` nem em `src`). No protótipo, "Campanha" é um conceito do Admin mock com encerramento que congela resultado (`01d8906`). O equivalente real mais próximo é **Competição** (período, participantes, métrica, prêmio, ciclo de vida, resultado imutável, histórico, cancelamento, auditoria de prêmio). → **Decisão humana D3**: Campanha = Competição?

---

## 10. Competições

| Aspecto | Estado |
|---|---|
| Criação/ciclo Admin | 🟢 backend: DRAFT→SCHEDULED→ACTIVE→FINISHED/CANCELLED, `rulesVersion` (`competicoes-admin.ts`, `competitions.service.ts:113`) |
| Participantes | SELLER ou STORE, inscrição automática na ativação, mínimo de dias/vendedores |
| Métricas | GOAL_ATTAINMENT, PERSONAL_IMPROVEMENT, SCORE_GERAL, PA, TICKET_MEDIO, CONSISTENCY (+ TRAINING etc. ⚪). **Sem métrica de faturamento bruto nem produto** |
| Classificação | ao vivo, desempate score→consistência→id |
| Encerramento | job `temporadas` (15 min) + manual; `CompetitionResult` imutável, idempotente sob concorrência ✅ |
| Prêmio | **só 1º lugar SELLER**; loja vencedora não recebe nada (`competitions.service.ts:220-234`) 🟡 |
| Histórico | ✅ |
| Front vendedor | app real `/competicoes` 🔵; protótipo mock |
| Front Admin | API completa; UI real parcial; protótipo mock 🔵 |
| Isolamento | ⚫ latente: Season/Competition/League **sem `empresaId`** (§21) |

---

## 11. Produto da Semana / Ponta de Estoque

| Pergunta | Resposta |
|---|---|
| Existe como missão? | Não. Só no protótipo (`fase1/admin/Incentivos.tsx:511`, `fase1/dominio/tipos.ts:78`) |
| Produto vem de onde? | mock (localStorage) |
| Cadastro/foto/referência/categoria | **não existem** (nenhum model de produto) |
| Progresso real? | **impossível hoje**: o sync só traz 5 agregados por vendedor (faturamento, ticket, PA, atendimentos); não traz itens, referência, pares |
| Como no piloto sem Linx? | não há caminho técnico atual. → **Decisão D2** |

---

## 12. XP

| Evento | Gatilho real | Idempotência | Reversão | Status |
|---|---|---|---|---|
| META_DIARIA_100/110/120/150 | sync ERP → `avaliarMetaDiaria` | `meta-diaria-{tier}-{vend}-{data}-g{n}` | **XP nunca revertido** (só geração 0) | 🟡 |
| MELHORA_PA / MELHORA_TICKET | idem | `melhora-pa-{vend}-{data}` | não | 🟡 |
| STREAK_3/5/10 | fechamento do dia | `streak-{n}-{vend}-{data}` | não | 🟡 fuso |
| ACESSO_DIARIO | `POST /engajamento/acesso` | `acesso-diario:{vend}:{dia}` + unique `(vendedorId, dia)` | n/a | 🟢 |
| MISSAO | conclusão | `missao-{assignmentId}` | não | 🟡 valor 0 |
| COMPETICAO | finalização | `competicao-{id}-vencedor` | não | 🟡 só 1º SELLER |
| TREINAMENTO/QUIZ | Academia/Simulador | ✅ | não | ⚪ |
| CHECKIN_DIARIO (humor) | **nunca concedido** (§12 Conselheiro) | — | — | ✅ correto |
| AJUSTE_MANUAL | **enum sem uso; sem endpoint** | — | — | 🔴 Admin não corrige erro sem SQL |

Ledger imutável com `idempotencyKey @unique` (`schema.prisma:276`) ✅. Saldo = soma ✅. Extrato: `/gamificacao/meus-ganhos` ✅. Régua editável só por seed/SQL (sem tela) 🟡.

## 13. VendaCoins

Mesmo ledger (`schema.prisma:297`). Reversão **existe só para tiers de meta diária** (`REVERSAO` negativa, `ledger.service.ts:82-111`), regranha com chave `-g{geracao}`. Sem ajuste manual. Loja de recompensas **não faz parte do piloto** ⚪. Status 🟡.

## 14. Engajamento / acesso diário

Verificado de fato (commit `889953a`, 33 testes backend + 7 frontend, homologação real): timezone por empresa ✅, unicidade por índice ✅, concorrência (12 paralelas → 1) ✅, config Admin auditada ✅, XP/VendaCoins via ledger ✅, painel/frequência/sequência/histórico ✅, escopos ✅.
**Conectado ao app real (`/`, `/ganhos`, `/admin/engajamento`), NÃO ao protótipo `/fase1`.** Status: 🟢 backend · 🔵 para a experiência homologada.

## 15. Privacidade do Conselheiro

**GREEN.** Nenhuma rota/serviço de admin, gerente, engajamento, universidade ou competições lê `CoachMessage`, `CoachConversation` ou `CoachCheckIn`; `TipoEventoEngajamento` não inclui coach; `CHECKIN_DIARIO` nunca é recompensado. Ressalva: o app real ainda **expõe** o Conselheiro (`/coach`) ao vendedor — fora da Fase 1, deveria estar oculto no piloto (P1).

## 16. Feed

Persistido (`FeedEvent`, `@@unique(eventType, sourceType, sourceId)`), escopo COMPANY + STORE da própria loja, nunca PRIVATE (`feed.service.ts:72-74`). Eventos reais: GOAL_REACHED, BADGE_EARNED, MISSION_COMPLETED, RECOGNITION_RECEIVED, LEAGUE_PROMOTED, COMPETITION_WON (+ CERTIFICATION/PDI ⚪). **Não existem** eventos de posição no ranking, recorde, liderança de loja (o protótipo mostra os três). GOAL_REACHED não é revertido em cancelamento. Status 🟡.

## 17. Reconhecimento

`POST /equipe/:vendedorId/reconhecimentos` com `requireAuth('ADMIN','GERENTE')` → `Recognition` + `AuditEvent` + feed (`recognition.service.ts:14-31`); vendedor lê em `GET /reconhecimentos`. Rota está no módulo "equipe" do gerente, mas o Admin pode usar. **Sem UI de Admin no app real** para isso. Status 🔵.

## 18. Recordes

**Não existe backend.** Melhor dia/mês/ticket/PA seriam deriváveis de `IndicadorRealizado` (histórico suficiente após algumas semanas de sync real), mas não há cálculo nem persistência. Melhor posição: impossível (ranking não guarda histórico). Status 🔴 se a tela Recordes ficar no escopo do piloto → **Decisão D5**.

---

## 19. Admin — operação sem terminal

| Operação | Sem terminal? |
|---|---|
| Criar vendedor / bloquear / desligar / reativar / transferir / reemitir acesso | ✅ (`/admin/usuarios`) |
| Criar loja | ✅ (`/admin/estrutura`) |
| Meta mensal / diária individual | ✅ mas **uma a uma** (meta diária manual por dia) ⚠️ |
| Meta da loja / distribuição / calendário | ❌ não existe |
| Missão (criar/publicar) | ❌ **só seed** |
| Produto da semana | ❌ não existe |
| Campanha/Competição | ⚠️ API completa; UI real parcial |
| Prêmio | ⚠️ dentro da Competição (só 1º SELLER) |
| Reconhecimento | ⚠️ API ok; sem tela Admin |
| XP/VendaCoins por evento (régua) | ❌ só seed/SQL |
| Recompensa de acesso diário | ✅ |
| Ajuste manual de XP/moedas | ❌ não existe |
| Elegibilidade | ❌ fixa no código |
| Acompanhar uso | ✅ `/admin/engajamento` |
| Saúde dos dados (sync parou?) | ❌ só logs |
| Auditoria | ⚠️ API `GET /admin/auditoria`; verificar UI |
| **Configurar o banco do piloto** | ❌ exige rodar `scripts/seed.ts`, que também cria contas demo (§30) |
| Disparar sync manual | ❌ `scripts/trigger-sync-once.ts` |

---

## 20. Banco de dados (modelos da Fase 1)

| Modelo | Escopo | Unique/índices | Riscos |
|---|---|---|---|
| `Empresa` (+`timezone`) | — | — | `timezone` usado só pelo engajamento |
| `Loja` | empresa | `@@unique([empresaId, codigoErp])` | login busca por `codigoErp` sem empresa (§22 A1) |
| `Vendedor` | empresa, loja | matrícula por loja | `lojaId` atual sobrescreve (histórico de transferência só em auditoria/`AcessoDiario`) |
| `Meta` | empresa, loja, vendedor | `@@unique([vendedorId, tipo, periodo, referencia])` | editável só em período aberto ✅; sem meta de loja |
| `IndicadorRealizado` | empresa, loja, vendedor | `@@unique([vendedorId, dataHora])` | **só agregados**; sem venda, item, produto, cancelamento; sobrescrita do snapshot horário apaga o valor anterior (sem histórico de correção) |
| `XpTransacao` / `MoedaTransacao` | empresa, loja, vendedor | `idempotencyKey @unique` | imutáveis ✅; saldo derivado ✅ |
| `RegraGamificacaoVersao` | empresa | 1 ativa por empresa | sem tela |
| `StreakVendedor` / `StreakChecagem` | vendedor | `@@unique([vendedorId,tipo,data])` | fechamento único, ignora correções |
| `RankingSnapshot` | empresa/loja | — | **delete+create**: sem histórico, sem variação |
| `MissionDefinition` / `MissionAssignment` | empresa? | `@@unique([vendedorId, missionDefinitionId, startsAt])` | catálogo por seed |
| `Season` / `Competition` / `League` | **sem `empresaId`** | — | ⚫ latente multiempresa |
| `CompetitionResult`, `SeasonPointLedger` | | imutáveis | ✅ |
| `FeedEvent` | empresa/loja | `@@unique(eventType, sourceType, sourceId)` | ✅ |
| `Recognition`, `AuditEvent` | empresa | | ✅ |
| `AcessoDiario`, `ConfigRecompensaAcesso`, `EventoEngajamento` | empresa, loja, vendedor | uniques corretos | ✅ |

Divergência estrutural: **o banco de dev foi criado com `db push`** (sem histórico de migrations), enquanto o deploy pressupõe `migrate deploy` (§29).

---

## 21. Multiempresa / multiloja

- Rotas de Admin: `empresaId` sempre do token; IDs do body/URL conferidos contra a empresa (`identidade/admin.service.ts:146`, `metas-admin.service.ts:61-69,129,158`, `admin.ts:78`). ✅
- Engajamento: ✅ (testado A×B).
- **Competições/Temporadas/Ligas: sem `empresaId`** → `listarSeasons`, `buscarSeason`, `buscarCompetition`, `listarLigas` sem filtro; `/competicoes/:id` mostra DRAFT de qualquer id; `/temporadas/:id/ranking` devolve nomes sem filtro. **Com uma empresa no banco não vaza; com duas vira IDOR entre empresas.** ⚫ latente.
- Feed COMPANY: depende do filtro de empresa no serviço (OK) mas eventos de competição herdam o problema acima.

---

## 22. Autenticação e autorização

| Item | Estado |
|---|---|
| Rotas sem auth | só `/health`, `/health/deep`, `/lojas`, `/auth/login`, `/auth/ativacao` (intencionais) ✅ |
| `requireAuth` | revalida `status` e `papel` no banco a cada request ✅; **não revalida `lojaId`** |
| JWT | 12h (`auth.ts:27`), sem refresh, **sem revogação por troca de senha/logout**; token em `localStorage` (`web/src/api/client.ts`). CSP `script-src 'self'` mitiga XSS |
| Rate limit | por IP, em memória, 10/min no login; sem bloqueio por conta |
| CORS/helmet/trust proxy | allowlist obrigatória em produção ✅, helmet ✅, `TRUST_PROXY_HOPS` explícito ✅ (não obriga >0) |
| PLATFORM_ADMIN | acessa rotas `requireAuth()` de vendedor (só os próprios dados) — baixo |

**Achados de auditorias anteriores:**

| | Achado | Estado | Bloqueia piloto? |
|---|---|---|---|
| A | `lojaRestritaDe` retorna `undefined` (empresa inteira) para qualquer papel ≠ GERENTE; duplicada em `admin.ts:29`, `competicoes-manager.ts:28`, `universidade-manager.ts:40` | **ainda existe**; hoje inexplorável porque as rotas exigem `ADMIN`/`GERENTE` | não (P2) |
| B | login/ativação resolvem loja por `codigoErp` **sem empresa** (`auth.ts:80`, `ativacao.service.ts:95`) | **ainda existe** | não com 1 empresa; sim com 2 (P1) |
| C | OneOnOne: escopo empresa+loja, só GERENTE, vendedor e Admin sem acesso, texto não lido por outros serviços | OK, ressalva `lojaId` do token (até 12h após transferência) | ⚪ fora do caminho |

---

## 23. Timezone

| Recurso | Fuso usado | Risco Pernambuco (UTC−3) em container UTC |
|---|---|---|
| Acesso diário / engajamento | **empresa** ✅ | nenhum |
| Meta diária / realizado | **processo** (`metas.service.ts:7-11` `setHours(0)`) | vendas após 21h caem no dia seguinte; meta de "amanhã" avaliada às 21h |
| Tiers de meta / XP / moedas | processo; `dataISO` via `toISOString` | chave de idempotência do dia errado |
| Sequência de meta (fechamento) | cron `10 0 * * *` sem `tz` → **21h10 de Brasília**, fecha "ontem" UTC | fecha o dia com a loja ainda aberta |
| Ranking do dia | processo | idem |
| Missões do dia | processo | idem |
| Competições/temporadas | datas absolutas; ativação por job 15 min | baixo |
| Semana | metas: **domingo** (`metas.service.ts:18-22`); engajamento: **segunda** | inconsistência |
| Fechamento mensal | processo | último dia do mês fecha às 21h |
| Deploy | **nenhum `TZ`** em `Dockerfile`/`docker-compose.yml`; `node:20-alpine` sem tzdata | o problema é **certo** em produção, não hipotético |

---

## 24. Calendário / dias de trabalho

Não existe no backend (nem domingo, feriado, loja fechada, escala). Mínimo que falta para os cálculos aprovados: **saber quais dias do mês a loja abre** (dias restantes, vendas/dia, projeção, meta diária derivada, sequência e frequência sem penalizar domingo fechado). O engajamento já tem o ponto de extensão (`ehDiaValido`). Escala individual de RH: **⚪ fora do escopo**.

---

## 25. Dados de venda — PONTO CRÍTICO

**De onde virão as vendas reais no piloto? Hoje, de lugar nenhum.**

| Peça | Estado |
|---|---|
| `MockErpAdapter` | números pseudoaleatórios determinísticos — **padrão** |
| `LinxErpAdapter` (`src/integracoes/erp/linx/linx-client.ts`) | esqueleto HTTP com endpoint, auth e campos **supostos**; o próprio arquivo diz "não uma integração testada" (`:4-11`), `TODO: mapear campos reais` (`:31`); nunca executado contra o Linx |
| Contrato | 5 agregados por vendedor/hora (matrícula, faturamento, ticket, PA, atendimentos) |
| Sync | BullMQ hora em hora, só a **hora corrente** (dias passados nunca são re-buscados) |
| Gravação | **somente** `sync-erp.queue.ts:64` grava `IndicadorRealizado` (fora testes) |
| Itens, pares, categoria, produto, preço, horário, cancelamento, devolução | **não existem** |
| Importação manual / CSV / endpoint Admin | **não existe** |

**É possível pilotar com vendas reais hoje? NÃO.**
**Menor bloqueio técnico:** não existe nenhum caminho para gravar o realizado real em `IndicadorRealizado`. O ponto de encaixe já existe (interface `ErpAdapter` + pipeline sync → meta → ranking); falta **uma fonte real** que o alimente: ou o Linx com contrato validado e credenciais, ou uma entrada alternativa (planilha/relatório do ERP). → **Decisão D1**. Validar também a premissa "snapshot = acumulado do dia" (`metas.service.ts:1-5`).

## 26. Cancelamento / devolução

O sistema não conhece cancelamento; só percebe **queda do agregado** do dia corrente no resync.

| Efeito | Corrige? |
|---|---|
| Performance/meta do dia | ✅ (snapshot sobrescrito) — **só no dia corrente**; dias passados nunca re-sincronizam |
| Ranking do dia | ✅ recalculado |
| VendaCoins de tier de meta | ✅ `REVERSAO` |
| XP de tier de meta | ❌ |
| XP/moedas de melhora PA/ticket | ❌ |
| Badge PRIMEIRA_META, feed GOAL_REACHED | ❌ |
| Missão concluída + bônus | ❌ (missão não volta) |
| Sequência | ❌ (fechada uma vez) |
| Competição finalizada | ❌ (resultado imutável, por desenho) |
| Recorde | n/a (não existe) |

Status: 🟡 — integridade parcial. → **Decisão D4** (política de estorno).

## 27. Idempotência

| Evento | Pode duplicar? |
|---|---|
| Sync ERP / venda | não (`@@unique([vendedorId, dataHora])`; não há venda individual) |
| Cancelamento | n/a; oscilação pode conceder/reverter moeda várias vezes no dia (rastreável) |
| Acesso diário | não (provado) |
| Missão | não (`MissionAssignment` unique + chave) |
| XP / moedas | não (`idempotencyKey @unique`) |
| Reconhecimento | sem chave de idempotência — duplo clique cria dois (baixo) |
| Feed | não (`@@unique`) |

Status: 🟢 no geral.

---

## 28. PWA / celular

Manifest standalone retrato, ícones 192/512 (maskable reaproveita 512 — pode cortar), `registerType: autoUpdate`, Workbox só precache (API nunca cacheada), `viewport-fit=cover`, safe-area em `index.css:17-19`, metas Apple. Offline: banner "Sem conexão" existe **só no protótipo** (`Fase1Layout.tsx`). Sem `navigateFallbackDenylist` para `/api` (baixo). Sessão 12h sem refresh → vendedor relogará ~1×/dia. **`start_url: '/'` abre o app antigo.** Larguras 320/390/430: verificadas no protótipo nas homologações; o app real não foi re-homologado para a Fase 1. Android/iPhone físicos: **não testados**. Status 🟡.

## 29. Deploy e ambiente

| Item | Estado |
|---|---|
| Docker (api, worker, web, postgres, redis) | ✅ `Dockerfile`, `web/Dockerfile`, `docker-compose.yml`, `web/nginx.conf` (CSP, sem cache de `index.html`/`sw.js`) |
| Onde publicar | **não definido** (`README.md:55`) |
| HTTPS / domínio | ❌ nginx só porta 80, web preso em `127.0.0.1:8080`; proxy TLS não documentado |
| Migrations no deploy | ❌ nenhum `migrate deploy` no compose/README; imagem final faz `npm prune --omit=dev` e `prisma` é devDependency |
| Seed no deploy | ❌ imagem não contém `scripts/` nem `tsx` |
| CD | ❌ CI só testa |
| `TZ` | ❌ |
| `.env.example` | faltam `POSTGRES_PASSWORD`, `REDIS_PASSWORD` |
| `npm run dev` | não carrega `.env` (sem dotenv); exige `--env-file` |
| Segredos | validados por tamanho (≥32); nenhum segredo foi exibido nesta auditoria |

**Classificação: PARCIAL.**

## 30. Dados de demonstração

- `scripts/seed.ts` **não tem trava** e mistura **configuração indispensável** (régua v1, badges, catálogo de missões, academia, playbook, orçamento de IA) com **dados demo** (empresa UUID fixo, LOJA001, Helena/Marina/Rafael/Paulo com senhas `admin123`/`vendedor123`/`gerente123`, meta R$1.000, impressão das senhas). Hoje, para configurar um banco de piloto é preciso rodar o seed — e ele leva junto contas com senha trivial. ⚫
- Em `ERP_MODE=mock`, qualquer vendedor real recebe vendas inventadas. ⚫
- 11 scripts `reset-*-e2e.ts` fazem `deleteMany` **sem checar ambiente**; `reset-missoes-e2e.ts` apaga dados de VEND001/VEND002. ⚫ se apontados para o banco do piloto.
- `seed-engajamento-demo.ts`: trava localhost/produção ✅ (túnel SSH em 127.0.0.1 passaria).
- Protótipo (Ana, Rafaela, Maria, João, Caruaru Shopping, Santa Cruz): fica em localStorage, não contamina banco.

**Risco de dado demo contaminar o piloto: ALTO**, principalmente via `seed.ts` e `ERP_MODE=mock`.

## 31. Observabilidade

| Pergunta | Conseguimos saber? |
|---|---|
| API caiu? | só via healthcheck do Docker (`/health` raso, sempre ok) ou usuário reclamando |
| Sync parou? | ❌ (worker sem healthcheck; falha vira só `logger.error`) |
| Dado atrasado? | 🟡 o vendedor vê `sincronizadoEm`; o Admin não tem tela |
| Erro ocorreu? | só logs pino em stdout; sem Sentry/alerta |
| Vendedor não consegue entrar? | ❌ (rate limit/erros só em log; painel de engajamento mostra quem não acessou) |
| Missão não atualizou / recompensa falhou? | ❌ |

Mínimo obrigatório faltante: **saber que o sync parou** (frescor do último sync visível ao Admin + healthcheck do worker).

## 32. Auditoria de eventos (`AuditEvent`)

| Ação | Auditada? |
|---|---|
| Vendedor (cadastro, status, transferência, reemissão) | ✅ |
| Meta | ✅ (`metas-admin.service.ts:121,170`) |
| Reconhecimento | ✅ |
| Prêmio de competição | ✅ `COMPETITION_REWARD_GRANTED` |
| Configuração de acesso diário | ✅ `ENGAGEMENT_REWARD_CONFIG_UPDATED` |
| Competição (criação/edição/ativação) | 🟡 verificar — `rulesVersion` sim, `AuditEvent` não confirmado |
| Concessões de XP/moedas (meta, streak, acesso) | ledger serve de trilha; sem `AuditEvent` (aceitável) |
| Missão | ❌ (não há ação Admin) |
| Campanha | n/a |
| Elegibilidade | n/a (não configurável) |

---

## 33. Testes

### 33.1 Executados nesta auditoria

| Suíte | Resultado |
|---|---|
| Backend typecheck (`tsc --noEmit`) | ✅ OK |
| Backend vitest (unit + integration, banco de teste dedicado) | ✅ **1072/1072** (101 arquivos) |
| Backend build | ✅ OK |
| Web typecheck | ✅ OK |
| Web vitest | ✅ **251/251** (38 arquivos; 4 deles testam o protótipo mock) |
| Web build | ✅ OK — bundle principal 390,56 kB (101 kB gzip) |

### 33.2 NÃO executados

| Suíte | Motivo |
|---|---|
| **E2E Playwright** (22 specs) | **alteram o banco de desenvolvimento** (`web/e2e/fixtures.ts` usa o `.env` da raiz; `reset-*-e2e` apagam dados de VEND001/VEND002, inclusive o histórico homologado). A regra desta auditoria proíbe alterar o banco. |
| Jornadas de browser manuais | não fazem parte do escopo "somente leitura"; o protótipo já foi homologado em rodadas anteriores |
| Teste em Android/iPhone físico | sem dispositivo |

### 33.3 Cobertura por jornada

| # | Jornada | Existe? | Arquivos | Bloqueia piloto? |
|---|---|---|---|---|
| J1 | Admin cria meta → vendedor vê | ✅ backend · 🟡 E2E | `metas-admin.integration`, `admin-metas.integration`, `AdminMetas.test.tsx`, `jornada-fatia97` | não |
| J2 | Venda entra → performance muda | 🟡 | `motor.integration`, `mock-adapter.integration`; **`sync-erp.queue.ts` sem teste** | sim (sem venda real) |
| J3 | Venda entra → ranking muda | 🟡 | `ranking-elegibilidade.integration` (elegibilidade, não mudança de posição) | sim |
| J4 | Venda entra → missão progride | 🟡 | `missoes/criterio.integration` (DAILY_GOAL) | sim |
| J5 | Missão conclui → XP/moedas uma vez | ✅ | `missoes.integration` (concorrência), `jornada-missoes` | não (mas bônus é 0) |
| J6 | Cancelamento → efeitos corrigidos | 🟡 | `motor.integration` (moeda), `seasons.integration`; nada para XP/missão/ranking E2E | sim (D4) |
| J7 | Admin reconhece → vendedor recebe | 🟡 | `recognition.integration`, `competicoes-manager.integration` — pelo **gerente** | não |
| J8 | Acesso diário → recompensa única | ✅ | `engajamento.integration`, `engajamento.test.tsx` | não |
| J9 | Empresa A não vê B | ✅ (exceto competições) | `gamificacao`, `admin-metas`, `missoes`, `engajamento`, identidade | latente (§21) |
| J10 | Vendedor não vê outro | ✅ | `gamificacao.integration`, `missoes.integration`, `Ranking.test.tsx`, `jornada-fatia97` | não |
| J11 | Campanha inicia → termina → resultado permanece | ✅ via Competições | `competitions.integration`, `seasons.integration`, `jornada-competicoes-admin` | depende de D3 |
| J12 | Dados atrasados → sistema sinaliza | 🔴 | só mocks no front; nada no backend | sim |

**Nenhum teste cobre a experiência homologada contra o backend real** (os testes do protótipo testam o mock).

---

## 34. Simulação do primeiro dia de piloto

| # | Passo | Status | Por quê |
|---|---|---|---|
| 1 | Admin cadastra/ativa loja | 🔵 | existe no app real; o banco precisa do seed (⚫ §30) |
| 2 | Admin cadastra vendedores | 🟢 | `/admin/usuarios`, com ativação por CPF/token |
| 3 | Admin configura metas | 🟡 | só individual; meta diária uma a uma |
| 4 | Admin configura incentivo | 🟡 | competição via API/UI parcial; missão só seed; produto da semana inexistente |
| 5 | Vendedor instala/abre | ⚫ | sem HTTPS/domínio; PWA abre o app antigo |
| 6 | Vendedor entra | 🟢 | login real |
| 7 | Venda acontece | — | |
| 8 | Dados chegam | ⚫ | sem fonte real (§25) |
| 9 | Home atualiza | 🔵 | sync horário; Home homologada é mock |
| 10 | Ranking atualiza | 🟡 | só DIA |
| 11 | Missão progride | 🟡 | só DAILY_GOAL/PA/ticket; bônus 0 |
| 12 | Recompensa ocorre | 🟡 | tiers de meta e acesso diário sim |
| 13 | Admin acompanha | 🟡 | engajamento sim; performance Admin não |
| 14 | Erro pode ser detectado | 🔴 | sem alerta/frescor para Admin |
| 15 | Dia encerra | ⚫ | fechamento às 21h10 (UTC) |
| 16 | Dia seguinte começa corretamente | ⚫ | dia vira às 21h; meta diária precisa ter sido cadastrada |

---

## 35. Matriz de prontidão

| Área | Front | Back | Banco | Conectado | Testado | Piloto |
|---|---|---|---|---|---|---|
| Auth | 🟢 real / 🟣 protótipo | 🟢 | 🟢 | 🟢 real | 🟢 | 🟡 (A1, revogação) |
| Vendedores | 🟢 real / 🟣 | 🟢 | 🟢 | 🟢 real | 🟢 | 🟢 |
| Lojas | 🟢 real / 🟣 | 🟢 | 🟢 | 🟢 real | 🟢 | 🟢 |
| Metas | 🟡 | 🟡 | 🟢 | 🔵 | 🟢 | 🟡 sem meta loja/diária derivada |
| Performance | 🟣 | 🟡 | 🟡 | 🔵 | 🟡 | ⚫ sem venda |
| Comparativos | 🟣 | 🟡 | 🟡 | 🔵 | 🔴 | 🟡 |
| Rankings | 🟣 | 🟡 | 🟡 | 🔵 | 🟡 | 🟡 só DIA |
| Loja × Loja | 🟣 | 🟡 (competição) | 🟡 | 🔴 | 🟡 | 🟡 |
| Missões | 🟣 | 🟡 | 🟢 | 🔵 | 🟢 | 🟡 sem CRUD, bônus 0 |
| Campanhas | 🟣 | 🔴 (= competição?) | 🔴 | 🔴 | n/a | D3 |
| Competições | 🟣 / 🟡 real | 🟢 | 🟡 sem empresaId | 🔵 | 🟢 | 🟡 |
| Produto da Semana | 🟣 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 D2 |
| XP | 🟣 / 🟢 real | 🟢 | 🟢 | 🔵 | 🟢 | 🟡 sem reversão/ajuste |
| VendaCoins | 🟣 / 🟢 real | 🟢 | 🟢 | 🔵 | 🟢 | 🟡 sem ajuste |
| Níveis | 🟣 | 🟢 (fixo) | n/a | 🔵 | 🟢 | 🟢 |
| Conquistas | 🟣 / 🟢 real | 🟡 | 🟢 | 🔵 | 🟢 | 🟡 |
| Recordes | 🟣 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 D5 |
| Reconhecimento | 🟣 | 🟢 | 🟢 | 🔵 | 🟢 | 🟡 sem UI Admin |
| Feed | 🟣 | 🟡 | 🟢 | 🔵 | 🟢 | 🟡 |
| Engajamento | 🟢 real | 🟢 | 🟢 | 🟢 real / 🔵 protótipo | 🟢 | 🟢 |
| Acesso diário | 🟢 real | 🟢 | 🟢 | 🟢 real / 🔵 protótipo | 🟢 | 🟢 |
| Admin | 🟣 protótipo / 🟡 real | 🟡 | 🟢 | 🔵 | 🟡 | 🟡 |
| Auditoria | 🟣 | 🟢 | 🟢 | 🔵 | 🟢 | 🟢 |
| Analytics | 🟢 (engajamento) | 🟢 | 🟢 | 🟢 | 🟢 | 🟢 |
| Saúde dos Dados | 🟣 | 🔴 | 🟡 (`sincronizadoEm`) | 🔴 | 🔴 | 🔴 |
| PWA | 🟡 | n/a | n/a | — | 🔴 físico | 🟡 |
| Dados de Venda | — | 🔴 (mock/stub) | 🟡 só agregados | 🔴 | 🟡 | ⚫ |
| Cancelamentos | 🟣 | 🟡 | 🟡 | — | 🟡 | 🟡 D4 |
| Timezone | — | 🟡 só engajamento | 🟢 campo existe | — | 🟡 | ⚫ |
| Calendário | 🟣 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 |
| Segurança | 🟢 | 🟢 / 🟡 | 🟡 | — | 🟢 | 🟡 |
| E2E | — | — | — | — | 🟡 (no banco de dev, não executado) | 🟡 |
| Deploy | — | 🟡 | — | — | 🔴 | ⚫ |
| Observabilidade | — | 🔴 | — | — | 🔴 | 🔴 |

---

## 36. Bloqueadores (somente escopo aprovado)

### P0 — bloqueia teste em loja

1. **Experiência homologada não é o produto.** O protótipo `/fase1` é mock, fora do build de produção; o PWA abre o app antigo. É preciso conectar as telas homologadas ao backend (ou portá-las para o app real) e torná-las a entrada do PWA.
2. **Não há fonte de venda real.** `ERP_MODE=mock` inventa números; Linx é esqueleto; não há entrada manual. (D1)
3. **Fuso horário de metas/ranking/sequência/missões/fechamento = fuso do processo, e o deploy roda em UTC.** O dia vira às 21h em Pernambuco.
4. **Meta diária sem origem operável.** Sem meta diária não há tiers, sequência, missão DAILY_GOAL nem "Meta de Hoje"; hoje ela é cadastrada à mão, uma por vendedor por dia, sem calendário. (D6)
5. **Banco do piloto só se configura com `seed.ts`, que cria contas demo com senhas triviais e não tem trava.**
6. **Deploy sem HTTPS, sem domínio, sem passo de migration** (e a imagem não contém o CLI do Prisma).

### P1 — necessário para piloto confiável

1. Ranking SEMANA/MÊS (Corrida do Mês) nunca é calculado.
2. Saúde dos dados: Admin precisa ver se o sync parou/atrasou; worker sem healthcheck.
3. Cancelamento/estorno: XP, missão, badge e feed não revertem; dias passados nunca re-sincronizam. (D4)
4. Missões: sem CRUD/publicação pelo Admin e bônus 0 — se "Missões" do Admin homologado entram no piloto. (D7)
5. Calendário mínimo da loja (dias abertos) para dias restantes, vendas/dia, projeção e sequência.
6. Cálculos de exibição (vendas/pares restantes, próximo alvo, projeção) estão só no front e marcados "NÃO CONGELADOS": congelar a regra antes de conectar.
7. Duplicação de régua e níveis no protótipo (`cenarios.ts:52`, `fase1/dominio/niveis.ts`) → ler do backend.
8. Ocultar no piloto o que está fora da Fase 1 e exposto no app real (Conselheiro, Evoluir/Universidade, Treinador, Simulador).
9. Login por `codigoErp` sem empresa (A1) e invalidação de token na troca de senha/desligamento — este último já mitigado pela revalidação de status.
10. E2E rodando contra o banco de dev: isolar antes de usar como gate do piloto.
11. Ajuste manual de XP/VendaCoins pelo Admin (corrigir erro sem SQL).
12. Competições sem `empresaId` — aceitável com uma empresa por banco, se isso for decidido e documentado (D8).

### P2 — pode esperar

1. `lojaRestritaDe` fail-open para papel desconhecido (achado A).
2. `lojaId` do token desatualizado até 12h após transferência (gerente — fora do piloto).
3. Variação de posição no ranking (⬆️/⬇️) e histórico de posições, se não for exigido pela tela final.
4. Desempate formal no ranking (pode ser decisão simples, D9).
5. Prêmio para loja vencedora em competição STORE.
6. Badges sem gatilho (TOP_3, CONSISTENCIA etc.).
7. Rate limit em memória por IP; `/health/deep` público.
8. Ícone maskable; `navigateFallbackDenylist`.
9. N+1 no sync (aceitável no porte do piloto).
10. Reconhecimento sem idempotência.

---

## 37. Decisões que Franklin precisa tomar

| # | Pergunta | Opções | Impacto | Recomendação técnica | Por que é humana |
|---|---|---|---|---|---|
| D1 | De onde vem a venda no piloto? | (a) Linx real: obter documentação/credenciais e validar o contrato; (b) entrada por relatório/planilha do ERP importada pelo Admin; (c) adiar piloto até (a) | sem isso não há piloto | (b) como ponte e (a) em paralelo — o pipeline já aceita um novo adapter | depende de acesso ao Linx, custo e rotina da loja |
| D2 | Produto da Semana entra no piloto? | (a) sim — exige dado de item/referência/pares, que o sync atual não traz; (b) não no primeiro piloto | grande: muda o contrato de venda | (b), a não ser que D1 traga itens | escopo de produto |
| D3 | Campanha = Competição? | (a) sim, mapear a "Campanha" homologada para Competição; (b) entidade nova | (b) cria backend novo | (a) | define o modelo mental do Admin |
| D4 | Política de estorno | (a) reverter tudo (XP, moedas, missão, badge); (b) só moedas (atual); (c) congelar ao fim do dia | integridade do jogo e percepção do vendedor | (c) + (b) intradiário; nunca "tomar de volta" badge/missão | justiça percebida pela equipe |
| D5 | Recordes entram no piloto? | (a) sim (derivar de `IndicadorRealizado`); (b) não | médio | (b) no 1º piloto | escopo |
| D6 | Como nasce a meta diária? | (a) Admin cadastra mensal e o sistema distribui pelos dias de loja aberta; (b) Admin cadastra diária manualmente; (c) vem do ERP | operação diária do Admin | (a), exige calendário mínimo (P1-5) | regra comercial da rede |
| D7 | Missões no piloto: catálogo fixo ou Admin cria? | (a) catálogo fixo (atual) com bônus definido na régua; (b) CRUD Admin | (b) é desenvolvimento novo | (a) no 1º piloto, definindo valores de bônus | valor de recompensa é decisão de negócio |
| D8 | Uma empresa por banco (single-tenant) no piloto? | (a) sim, documentar; (b) multiempresa real já | (b) exige `empresaId` em Competições | (a) para o piloto | modelo de implantação |
| D9 | Desempate do ranking | ex.: maior % meta → mais atendimentos → ordem alfabética | baixo | definir antes de mostrar posição | percepção de justiça |
| D10 | Domingo/feriado conta para sequência e frequência? | (a) sim (atual); (b) só dias de loja aberta | médio | (b) | depende da operação real da loja |
| D11 | Coach IA no Admin (pendente da rodada anterior) | mostrar contagem ou manter fora | §12 Conselheiro | manter fora (Conselheiro está fora da Fase 1) | princípio de privacidade |

---

## 38. Notas 0–1000

| Dimensão | Nota | Pontos fortes | Limitações | Para ≥950 | Antes do piloto (real) | Seria só complexidade |
|---|---|---|---|---|---|---|
| Frontend vendedor | **420** | experiência homologada, estados vazio/erro/atraso, mobile | tudo mock; não está em produção; app real é o antigo | conectar e publicar o protótipo | conexão + entrada PWA + ocultar fora de escopo | recordes, variação de posição |
| Frontend Admin | **380** | protótipo completo e homologado; app real cobre pessoas, lojas, metas, engajamento | Admin homologado é mock; app real sem missões, saúde dos dados, performance | conectar e cobrir as operações sem terminal | metas operáveis, saúde do sync, competições na UI | preview como vendedor |
| Backend | **690** | ledger, idempotência, competições, engajamento, escopos, revalidação de status | fuso, ranking só DIA, bônus missão 0, sem calendário, sem ajuste manual | corrigir fuso, ranking por período, calendário | fuso + ranking MÊS + meta diária | CRUD rico de missões |
| Banco / integridade | **720** | uniques corretos, ledgers imutáveis, metas de período encerrado travadas | sem `empresaId` em competições, snapshot de ranking sem histórico, dev via `db push` | migrations como fonte única, histórico de ranking | migrations no deploy | particionamento |
| Segurança | **760** | auth em todas as rotas, tenant pelo token, helmet/CORS/CSP, revalidação por request | A1, competições sem empresa, sem revogação, token em localStorage | A1, revogação, `empresaId` | A1 + revogação na troca de senha | refresh token |
| Gamificação | **600** | XP/moedas confiáveis e idempotentes; tiers; acesso diário; competições | missão sem bônus, sem estorno de XP, badges sem gatilho, campanha inexistente | D4, D7, bônus definidos | valores de bônus + política de estorno | loja de recompensas |
| Dados de venda | **150** | pipeline sync→meta→ranking pronto e idempotente | nenhuma fonte real; só agregados; dias passados não resync | fonte real validada + resync | **fonte real** | itens/produto (se D2 = não) |
| Mobile / PWA | **620** | manifest, SW autoUpdate sem cache de API, safe-area | abre o app errado; sem HTTPS; sem teste físico | entrada correta + HTTPS + teste físico | entrada + HTTPS + 1 teste em Android e iPhone | offline completo |
| Testes | **700** | 1072 + 251 verdes; jornadas de backend sólidas | E2E no banco de dev; nada da experiência homologada contra backend; sync sem teste | E2E isolado das jornadas do piloto | isolar E2E + testes da conexão | — |
| Operação | **300** | cadastro de pessoas/lojas/metas pela tela, painel de engajamento | seed obrigatório com demo, sem saúde do sync, meta diária manual, deploy incompleto | separar configuração de demo, saúde do sync, deploy reproduzível | os quatro itens | CD automatizado |
| **Prontidão para piloto** | **310** | backend reaproveitável e bem testado | os 6 P0 | resolver P0 + P1 | P0 | — |

---

## 39. Honestidade

**Já identificados antes deste comando (registrados em docs/relatórios anteriores):**
- protótipo `/fase1` é mock e precisa de "etapa de conexão" (dito no relatório do engajamento);
- fuso do servidor fora do engajamento (doc `ENGAJAMENTO-E-CHECKIN.md` §9);
- ausência de calendário/escala;
- Linx é esqueleto não validado (comentário no próprio código; auditoria 360);
- privacidade do Conselheiro;
- `lojaRestritaDe` e login por `codigoErp` (auditorias anteriores);
- `npm run dev` sem `.env`.

**Percebidos só porque esta auditoria obrigou a cruzar as camadas:**
- o protótipo **nem entra no build de produção** e o PWA abre o app antigo, com Conselheiro/Evoluir expostos;
- **ranking SEMANA/MÊS nunca é calculado** (`recalcularRankings` sem chamador);
- **bônus de missão é 0** na régua v1;
- **meta diária é manual por dia e por vendedor**, e tudo de gamificação de meta depende dela;
- semana de metas começa no **domingo**, a do engajamento na segunda;
- o cron de fechamento roda às **21h10** de Brasília em produção;
- **XP nunca é revertido** e dias passados **nunca** re-sincronizam;
- **Competições sem `empresaId`**;
- **E2E altera o banco de dev** e apaga dados das usuárias do seed;
- `seed.ts` mistura configuração obrigatória com contas demo e não tem trava;
- deploy sem `migrate deploy` e sem CLI do Prisma na imagem; sem HTTPS;
- worker sem healthcheck — sync parado é invisível.

Eu não tinha cruzado nenhum desses pontos nas rodadas anteriores, embora vários estivessem a uma busca de distância.

---

## 40. Respostas diretas

| Pergunta | Resposta |
|---|---|
| Frontend do vendedor está pronto? | **Como experiência, sim (homologado). Como produto, não**: é mock e não está no build de produção. |
| Frontend do Admin está pronto? | Mesma resposta; o Admin real cobre pessoas, lojas, metas individuais e engajamento. |
| O que ainda é mock? | todo o `/fase1` (M1–M8) e a venda (`MockErpAdapter`). |
| Quais backends já existem? | auth, pessoas, lojas, metas, sync, motor de meta, ledgers, ranking DIA, missões automáticas, competições/temporadas/ligas, feed, reconhecimento, badges, engajamento, auditoria. |
| Quais só precisam ser conectados? | auth, pessoas, lojas, metas individuais, carteira/extrato, badges, feed, reconhecimentos, competições, engajamento, `sincronizadoEm`, auditoria. |
| Quais estão incompletos? | ranking (só DIA), missões (sem CRUD/bônus), cancelamento, meta diária/loja, competições (prêmio só 1º SELLER, sem empresaId), saúde dos dados. |
| O que realmente precisa ser criado? | fonte de venda real, calendário mínimo, saúde do sync para Admin, configuração de banco sem demo, deploy com HTTPS e migrations. Produto da Semana, Recordes e Campanha dependem de D2/D5/D3. |
| Os cálculos são confiáveis? | as fórmulas sim; os insumos não (mock, fuso, sem calendário); várias regras só no front e não congeladas. |
| O ranking é confiável? | do dia, sim (exceto fuso e desempate); semana/mês não existem. |
| XP e VendaCoins são confiáveis? | sim quanto a duplicidade; não quanto a estorno de XP e ajuste manual. |
| Missões funcionam com venda real? | só as indiretas (meta diária, PA, ticket) e sem bônus; nenhuma por produto. |
| Campanhas funcionam de verdade? | Campanha não existe; Competição sim. |
| Cancelamentos corrigem o jogo? | parcialmente: moedas de meta do dia corrente sim; o resto não. |
| Os dados de venda conseguem chegar? | **não**. |
| O Admin opera sem terminal? | não: configuração do banco, missões, régua, saúde do sync e ajuste exigem terminal. |
| O vendedor usa pelo celular? | o app real sim (PWA); a experiência homologada não está publicada; sem HTTPS hoje. |
| Há bloqueio de segurança? | nenhum explorável com uma empresa por banco; A1 e Competições sem `empresaId` viram problema com duas. Contas demo do seed são o maior risco prático. |
| O que impede colocar uma loja hoje? | os 6 P0 da §36. |

---

**AUDITORIA A–Z DA FASE 1 CONCLUÍDA.**
**NENHUMA NOVA FUNCIONALIDADE FOI IMPLEMENTADA.**
**O ESTADO REAL DE FRONTEND, BACKEND, BANCO, INTEGRAÇÕES, SEGURANÇA, TESTES E OPERAÇÃO FOI MAPEADO.**
**AGUARDANDO ANÁLISE HUMANA DOS GAPS ANTES DE QUALQUER IMPLEMENTAÇÃO.**
