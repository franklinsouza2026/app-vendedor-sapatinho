# Constituição Executiva — Vendedor IA V1

**Desenho. Nenhuma implementação foi iniciada.** Baseline `25691ac`.

Documentos irmãos: `ORGANOGRAMA-FUNCIONAL` (diagramas) ·
`ESPECIFICACAO-FUNCIONAL` (módulo a módulo) · `MATRIZ-PERMISSOES` ·
`MAPA-IA` · `MAPA-REAPROVEITAMENTO` · `AUDITORIA-TECNICA-NOVA-ARQUITETURA` (evidência).

---

## 1. Visão do produto

> **O Vendedor IA é onde a pessoa que vende — ou que lidera quem vende — sabe o que
> fazer hoje, aprende a fazer melhor, pratica sem risco e tem alguém do lado dela.**

Não é um conjunto de ferramentas de IA. É um sistema de trabalho e desenvolvimento em
que a IA aparece onde acrescenta, e some onde uma regra resolve.

**Tecnologia complexa por trás. Experiência simples na frente.**

---

## 2. O problema que resolve

Numa rede de lojas, quatro coisas se perdem ao mesmo tempo:

1. O vendedor não sabe, **no momento em que importa**, quanto falta e o que fazer.
2. O que a empresa sabe sobre vender bem vive num PowerPoint que ninguém abre.
3. Errar na frente do cliente é caro, e não existe lugar para errar barato.
4. Quem lidera acompanha número, não pessoa — e descobre o problema tarde demais.

---

## 3. Ponto A — onde estamos

79 models · 74 enums · 193 endpoints · 100 serviços · 30 telas · 14 especialistas de
IA · 4 papéis · **1039 testes backend, 173 frontend, 41 E2E**.

Traduzindo: **a engenharia está pronta e o produto não está montado.**

| Dimensão | Estado |
|---|---|
| Motores determinísticos | **maduros** — 42 arquivos, gamificação, metas, competências, evidências |
| Módulos individualmente | **funcionam ponta a ponta** |
| Conteúdo | **quase vazio** — 6 questões, 0 certificações, 13 Mandamentos em branco |
| Hierarquia | **2 dos 5 níveis não existem** |
| Navegação | **4 portas sobrepostas** para a mesma pergunta |
| Notificações | **não existem** |
| Onboarding | **não existe** |
| IA real | **nenhum provider configurado** |
| ERP real | **nunca validado** |

---

## 4. Ponto Z — onde queremos chegar

Um produto que uma pessoa sem treinamento técnico abre e entende:

```
MISSÕES = FAZER · UNIVERSIDADE = APRENDER · SIMULADOR = PRATICAR · CONSELHEIRO = EVOLUIR
```

com uma cadeia de liderança de cinco níveis, conteúdo real da empresa, e o Admin
governando tudo sem abrir um terminal.

---

## 5. Princípios

1. **Motor calcula, IA interpreta.**
2. **IA produz, humano governa.**
3. **Visibilidade não é comando.**
4. **Governança não é vigilância.**
5. **Pessoa antes da performance.**
6. **Uma ação principal por vez.**
7. **Nada é apagado antes de provado sem consumidores.**
8. **Silêncio é resposta válida.**
9. **Não criar módulo porque existe tecnologia**, tela porque existe endpoint, ou
   agente porque a IA consegue.

---

## 6. Arquitetura geral

Dez blocos: Experiência Individual · Trabalho · Desenvolvimento · Gamificação ·
Gestão · Governança · Inteligência (invisível) — costurados por **um barramento:
a evidência de competência**.

Quatro fontes escrevem evidência (quiz, simulação, missão, avaliação do líder) e três
consomem (score/gap, PDI, certificação). **Isso já existe e já está ligado** — é por
isso que "Inteligência de Desenvolvimento" não precisa virar módulo visível.

---

## 7. Hierarquia

```
ADMIN → COORDENADOR → SUPERVISOR → GERENTE → VENDEDOR
```

**Dois desses cinco não existem no código** (zero ocorrências de SUPERVISOR e
COORDENADOR). Não há árvore, não há tabela de equipe, e `Vendedor.lojaId` é **escalar
obrigatório** — um gerente regional é impossível pelo schema atual.

Curiosidade útil: a própria Fonte de Verdade já previa "Gerente Regional" e os níveis
GRUPO e EQUIPE, conceitualmente. **A nova cadeia não contraria o projeto original —
cobra uma dívida que ele já reconhecia.**

### Três modelos possíveis (D-01)

| | A — Árvore de pessoas | B — Unidade organizacional | C — Vínculo N:N pessoa↔loja |
|---|---|---|---|
| Como | `Vendedor.gestorId` (self-FK) | nova entidade Empresa→Região→Área→Loja | tabela de junção |
| Resolve comando | **sim** | sim | **não** |
| Resolve multi-loja | por transitividade | sim | sim |
| Toca as 21 tabelas com `lojaId` | **não** | talvez | **não, mas muda todo o escopo** |
| Custo | **baixo** | alto | médio |
| Escala | CTE recursivo; precisa materialização acima de ~dezenas de milhares | boa | boa |

**Recomendação técnica: A.** O produto já deriva equipe por loja; a transitividade dá o
SUBTREE sem tocar em nenhuma tabela de fato. **B é o certo se "região" e "área" forem
conceitos de negócio de verdade** — e isso é pergunta para o humano, não para o código.

---

## 8. Permissões

Quatro dimensões — **VER · OPERAR · COMANDAR · GOVERNAR** — sobre quatro escopos —
**OWN · DIRECT_REPORTS · SUBTREE · COMPANY**.

| | VENDEDOR | GERENTE | SUPERVISOR | COORDENADOR | ADMIN |
|---|---|---|---|---|---|
| **VER** | OWN | DIRECT_REPORTS | SUBTREE | SUBTREE | COMPANY |
| **OPERAR** | OWN | OWN + DIR | OWN + SUB | OWN + SUB | OWN |
| **COMANDAR** | — | DIRECT_REPORTS | DIRECT_REPORTS | DIRECT_REPORTS | COMPANY |
| **GOVERNAR** | — | — | — | — | COMPANY |

**A linha COMANDAR é igual para os três níveis de liderança, e é deliberado.** Um
coordenador com `COMANDAR:SUBTREE` esvaziaria supervisor e gerente — e produziria a
cultura de atropelo que uma cadeia existe para evitar.

**Regra de falha — a mais importante do documento:** papel desconhecido resolve para
`NONE`, nunca `COMPANY`. Hoje é o contrário: `lojaRestritaDe` está copiada em três
arquivos, tipada como `string`, e um papel novo cai no ramo `undefined` = empresa
inteira. **O escopo atual falha aberto.**

Matriz completa em `MATRIZ-PERMISSOES-VENDEDOR-IA-V1.md`.

---

## 9–13. Jornadas

**Vendedor:** abre → vê quanto falta → vê **uma** ação de agora → age → volta.
Desenvolvimento em Evoluir, Conselheiro na Home, ranking e perfil no nav.

**Gerente:** *eu* (igual ao vendedor) **+** *minha equipe* (alertas, destaques,
pendências, Reunião do Dia, 1:1, planos).

**Supervisor:** *eu* + *meus gerentes*. Trabalha sobre **gerentes**, não sobre
vendedores — vê a árvore, comanda o nível imediato.

**Coordenador:** *eu* + *minha operação*. Trabalha sobre **supervisores**, com visão
consolidada e tendência.

**Admin:** governa estrutura, performance, desenvolvimento, inteligência, gamificação
e auditoria. **Não lidera ninguém** — governar não é liderar.

Detalhamento em `ESPECIFICACAO-FUNCIONAL`.

---

## 14–15. Home e navegação

**Cinco itens, sempre, para todo papel:**

```
Início · [meu escopo] · Evoluir · [minhas pendências] · Perfil
```

O que muda entre papéis são os itens 2 e 4 — nunca a quantidade.

**"Evoluir" é igual para todos**, inclusive coordenador. É a diferença entre um app de
gestão e um sistema de trabalho: quem lidera também é uma pessoa em desenvolvimento.

**Hoje**: bottom nav de 5 itens **idêntico para vendedor e gerente**, com três deles
apontando para telas de vendedor. O gerente chega às telas dele por cards na Home.

---

## 16–19. Metas · Performance · Missões · Universidade

**Metas e Performance: preservados.** O motor não muda; muda o recorte da visualização
por nível. **Não criar cascata de metas** — não foi pedida e adiciona um eixo inteiro.

**Missões — o maior gap de construção.** Hoje: 5 rotas `GET`, atribuição 100%
automática, sem autor, sem alvo coletivo, e **recompensa estruturalmente zero** (a
régua nunca valorou `MISSAO`). A V1 acrescenta **comando** e **governança de catálogo**.

**Universidade — absorve a Academia por navegação, não por motor.** As duas não fazem
a mesma coisa: Academia é conteúdo e entrega; Universidade é medição e certificação em
cima dele. O acoplamento já é bidirecional e **não há um único endpoint duplicado**.

Descoberta: **duas das 8 escolas já são de liderança** (Liderança, Gestão de Equipes).
A Universidade já foi desenhada para líderes e ninguém notou. Mas **nenhuma das 4
trilhas tem escola vinculada** — a taxonomia está desconectada do conteúdo.

---

## 20–21. Quiz e Certificação

**A regra nova não precisa de código.** Aprovação server-side, corte de 70%
configurável por quiz, `questionsPerAttempt` com anti-repetição e anti-fraude, gabarito
protegido, IA que cria questões nascendo desativadas — **tudo já existe**.

**O que falta são perguntas.** Há **6 no sistema inteiro**; o maior quiz tem 2. Para
uma prova de 10 com sorteio fazer sentido, o pool por curso precisa de ~20-25 questões.

Certificação: **6 tipos de requisito prontos, 0 definições criadas.**

---

## 22–23. Simulador e Conselheiro

**Simulador:** a arquitetura pedida (cenário → personagem → conversa → avaliador
separado → feedback → evidência) **já é a arquitetura existente**. O catálogo por papel
já filtra gestão vs. venda, com teste dedicado. Falta: cenários para supervisor e
coordenador, CRUD de cenário no Admin, e a decisão de privacidade.

Detalhe de produto: **o gerente pode entrar no Simulador hoje e não tem nenhum link**.

**Conselheiro:** o módulo mais maduro. Multi-papel já é possível — as 6 rotas usam
`requireAuth()` sem papel. Falta contexto por papel e governança do conhecimento.

**Um núcleo, quatro contextos, nenhum agente novo.** Skill é conhecimento governado,
não bot. A pessoa nunca escolhe com qual assistente falar.

**Privacidade inegociável:** conversa, check-in, memória e intervenções são `OWN` para
todos os papéis, **inclusive ADMIN**. A garantia é arquitetural — o domínio não
autorizado nem é buscado no banco.

---

## 24–27. Ranking · XP · VendaCoins · Gamificação · Perfil

Preservados. **Inegociável:** faturamento alheio mascarado no ranking (proteção que
custou duas rodadas de correção — vazamento direto e depois por aritmética encadeada).

**Nenhum líder concede moeda.** A economia é governada centralmente e alimentada por
evidência. É a regra antifraude que sustenta o ranking entre lojas.

**Não criar ranking de liderança agora.**

---

## 28–29. Desenvolvimento invisível e PDI

A Inteligência de Desenvolvimento **não vira quinto módulo** — é a costura entre os
quatro. Aparecem ao usuário: score de competência, gaps traduzidos ("Reforçar X", nunca
"lista de fraquezas"), PDI, certificações, revisões e "Para você". Não aparecem:
evidências, ponderação por fonte, mecânica de cálculo.

**O Conselheiro não cria PDI** — no máximo sugere levar ao 1:1. É essa fronteira que
impede o Conselheiro de virar gerente digital.

---

## 30–31. Conteúdo e Admin

**Cinco superfícies de governança não existem:** Playbook · cenários do Simulador ·
catálogo de missões · KnowledgeCards · valor de recompensa.

**IA produz, humano governa — já implementado.** Aula nasce `DRAFT`, questão nasce
`active:false`, cenário nasce rascunho, job só termina em `WAITING_REVIEW`.

**IA nunca inventa** 13 Mandamentos, políticas, regras, processos ou Playbook oficial.
Sem material real, a categoria fica **vazia e declarada vazia**.

---

## 32–36. IA

**14 especialistas, 6 pontos de chamada, 1 gateway.**

**Agentes novos realmente necessários: ZERO.** Passei sete candidatos pelo teste do
§40 e todos foram rejeitados — Conselheiro do Gerente/Supervisor/Coordenador é o mesmo
Conselheiro com outro contexto; agente de missões é recomendação determinística que já
existe; agente de hábitos é exatamente o que os KnowledgeCards fazem; Admin Copilot
seria um segundo caminho para as mesmas ações, competindo com o CMS governado.

**Onde IA não entra** (lista fechada, tudo já determinístico hoje): nota do simulador ·
gabarito · aprovação 7/10 · meta · XP · moeda · ranking · ledger · RBAC · tenant ·
escopo · status · conclusão por regra · idempotência · reversão.

---

## 37. Custos

| Módulo | Chamadas por uso | Classe |
|---|---|---|
| Performance, Metas, Ranking, Gamificação, Missões, Universidade | **0** | ZERO |
| Assistente de Gestão | 1 sob demanda | BAIXO |
| Conselheiro | 1 a 3 por mensagem | MÉDIO |
| Geração de conteúdo (offline, amortizada) | 4-6 por job | MÉDIO |
| **Simulador** | **10 a 17 por sessão** | **ALTO** |

**Uma conclusão só:** o Simulador é caro por uma ordem de grandeza; o resto é barato ou
grátis. Se o custo doer, mexe-se ali — nunca no Conselheiro, que é o diferencial.

Único número medido: a bateria da 2C.6 (~63 chamadas ≈ US$ 0,24 com sonnet-5).
Preço real na tabela existe **só para Anthropic**; OpenAI e Gemini são placeholder.

---

## 38–40. Integrações, privacidade e segurança

**Quatro achados incorporados como PRÉ-CONDIÇÃO da hierarquia** (não corrigidos aqui):

| # | Achado | Gravidade |
|---|---|---|
| 1 | `lojaRestritaDe` **falha aberto** para papel desconhecido | **ALTO para a nova hierarquia** |
| 2 | `POST /auth/login` resolve loja por `codigoErp` **sem filtrar empresa** | ALTO com 2ª empresa |
| 3 | `OneOnOne`/`FollowUp`/`ActionPlan` filtram por loja, **não por `managerId`** | MÉDIO, vira furo com a cadeia |
| 4 | **E2E compartilha banco e varia entre execuções** | pré-condição de prova |

O #4 merece ênfase: nas duas primeiras rodadas completas da auditoria o resultado foi
**40/41, com o spec que falha mudando**, e 41/41 na terceira. **Uma suíte que varia não
prova ausência de regressão** — e é exatamente isso que uma transformação de hierarquia
vai exigir dela.

**Fronteiras de privacidade:** privado individual (conversa, check-in, memória,
transcript) · semi-privado (PDI, avaliação, notas de 1:1, score) · operacional (meta,
KPI, missões, certificações) · visível aos pares (ranking mascarado, feed) ·
governança (auditoria, regras).

---

## 41–42. Notificações e onboarding

**Ambos não existem hoje.** Nenhuma tabela, endpoint, badge, toast, push ou e-mail; e
o app **não tem como saber** que é o primeiro login. A pessoa só descobre algo se abrir
a tela certa.

**V1:** notificação **in-app** com contador e lido/não-lido, cap diário, **nunca gerada
por IA e nunca com linguagem de cobrança**. Onboarding em **três telas**, não um curso.

Detalhe: `AcademyTrack.onboarding` já existe no schema e **nenhuma rota permite
marcá-lo** — a trilha de integração é inalcançável na prática.

---

## 43–44. Conteúdo e dados mínimos para lançamento

**Estrutura recomendada. O conteúdo é humano — a IA gera rascunho, ninguém inventa
material oficial.**

| Item | Hoje | Mínimo para uso real |
|---|---|---|
| Cursos (vendedor) | 4 | **6 a 8** |
| Cursos (liderança) | 0 | **3 a 4** |
| Aulas | 7 | **30 a 40** |
| **Questões** | **6** | **80 a 100** (20-25 por curso, para sorteio de 10) |
| Certificações | 0 | **2 a 3** (ex.: Fundamentos de Atendimento, 13 Mandamentos, Liderança) |
| Cenários de simulação | 14 | **20+** (incluindo supervisor e coordenador) |
| **13 Mandamentos** | **13 linhas vazias** | **13 preenchidos** — o texto já existe no Playbook |
| KnowledgeCards | 6 (**DRAFT no seed**) | **6 publicados + liderança** |
| Playbook | 14 seções | + `PRINCIPIOS` e `ARGUMENTACAO`, hoje vazias |

**Dados mínimos:** 1 empresa · N lojas reais · **árvore completa** · usuários com papel
correto · **metas cadastradas** (sem meta, a primeira frase que um vendedor lê é
"Nenhuma meta de hoje cadastrada ainda") · régua de gamificação com `MISSAO` valorada ·
1 temporada ativa (hoje nenhuma é seedada) · ligas.

**Alerta de instalação:** o seed cria os KnowledgeCards como `DRAFT`. Eles só estão
publicados no banco de dev porque um script foi rodado. **Uma instalação nova nasce sem
conhecimento publicado.**

---

## 45–46. V1 — MoSCoW

Aplicando a lente `moscow-imperatriz`, com a auditoria dela (>70% Must = escopo inflado)
e a **Won't list explícita**, que é o ouro do framework.

### MUST — sem isso a V1 falha (10)

1. Fechar o fail-open do escopo (`lojaRestritaDe` → resolução única, deny by default)
2. Isolar a suíte E2E entre specs
3. Papéis COORDENADOR e SUPERVISOR + árvore organizacional
4. Escopo por árvore nas rotas de liderança
5. **Cascata de missões** — comando, autor, alvo coletivo, auditoria
6. Admin: **catálogo de missões** + **valor de recompensa**
7. Admin: **endpoint de Playbook** (o conteúdo oficial precisa de dono)
8. Navegação em 4 verbos; Treinador e Academia saem do hub
9. **Conteúdo mínimo** (questões, certificações, Mandamentos)
10. Estados vazios com saída

### SHOULD — alto benefício, custo moderado (8)

11. Admin: cenários do Simulador · KnowledgeCards · rotas de `PLATFORM_ADMIN`
12. Conselheiro com contexto por papel
13. Simulador para supervisor e coordenador
14. Onboarding (3 telas)
15. Notificações in-app
16. Fechar R1 (login por empresa) e R3 (1:1 por gerente)
17. Home do Admin (saúde do conteúdo e do custo)
18. Competências de supervisor e coordenador

### COULD — se sobrar (4)

19. Busca contextual na Universidade
20. Feedback pós-prova no quiz
21. Validade/recertificação onde o conteúdo muda
22. Missões novas de liderança

### WON'T — nesta versão, explicitamente (14)

Push externo, e-mail, digest · busca global · **ranking de liderança** · performance por
papel além do recorte · **cascata de metas** · vínculo N:N pessoa↔loja · `empresaId` nas
entidades globais · **Admin Copilot** · **qualquer agente de IA novo** · marketplace de
recompensas · otimização de custo do Simulador · cooldown e limite de tentativas no
quiz · renomear `AcademyTrack` · **apagar tabelas de Treinador e Academia**.

*Won't tem prazo de revisão: reavaliar após a V1 em uso real, não "nunca".*

**Auditoria do escopo:** 10 Must de 36 itens = **28%**. Escopo saudável, não inflado.

---

## 47. Notas 0–1000 — antes e depois do adversarial review

| Item | Hoje | Desenho v1 | **Desenho v2** | Motivo da mudança |
|---|---|---|---|---|
| Arquitetura geral | 850 | 950 | **950** | — |
| **Hierarquia** | 380 | 950 | **920** | admiti custo de recursão em escala e risco de travamento operacional |
| Permissões | 600 | 960 | **960** | — |
| Segurança | 780 | 950 | **950** | — |
| Privacidade | 850 | **970** | **970** | o ponto mais forte do produto |
| Home | 620 | 900 | **920** | ação de agora passou a priorizar o que tem **prazo** |
| **Navegação** | 600 | 900 | **940** | supervisor e coordenador unificados numa experiência parametrizada |
| Metas | 930 | 930 | **930** | — |
| Performance | 820 | 850 | **850** | limitado pelo Linx não validado |
| **Missões** | 690 | 950 | **930** | risco de virar instrumento de pressão; teto + painel focado em conclusão |
| Universidade | 770 | 950 | **950** | — |
| Quiz | 650 | 960 | **960** | — |
| Certificação | 650 | 950 | **950** | — |
| Simulador | 760 | 950 | **950** | — |
| Conselheiro | 920 | 950 | **950** | — |
| Ranking | 900 | 900 | **900** | aceito por simplicidade |
| XP | 950 | 950 | **950** | — |
| VendaCoins | 900 | 950 | **950** | — |
| Gamificação | 880 | 930 | **930** | — |
| Perfil | 880 | 900 | **900** | — |
| Admin | 740 | 950 | **950** | — |
| Gestão | 850 | 940 | **940** | — |
| Desenvolvimento | 800 | 950 | **950** | — |
| **Conteúdo** | **200** | 900 | **900** | é trabalho humano, não de engenharia |
| Integração | 730 | 950 | **950** | — |
| IA | 820 | 950 | **950** | — |
| Custo de IA | 640 | 880 | **880** | Simulador segue caro; otimizar é Won't |
| Fallback | 900 | 950 | **950** | — |
| Observabilidade | 850 | 900 | **900** | — |
| UX | 600 | 920 | **940** | menos telas após unificação |
| Mobile | 880 | 900 | **900** | — |
| **Onboarding** | **100** | 900 | **900** | — |
| **Notificações** | **200** | 900 | **880** | risco de cobrança disfarçada; regra de linguagem |
| Testes | 850 | 950 | **950** | — |
| Produção | 500 | 850 | **850** | Linx + provider real seguem pendentes |
| Simplicidade | 600 | 930 | **950** | a Won't list de 14 itens é o que produz isso |
| **GERAL** | **735** | **935** | **935** | |

### Itens abaixo de 950 no desenho — justificativa obrigatória

| Item | Nota | Classificação |
|---|---|---|
| Hierarquia (920) | recursão em escala e rigidez do comando | **ACEITO POR SIMPLICIDADE** — materializar árvore antes de haver volume é over-engineering |
| Home (920) | priorização só calibra com uso real | **ACEITO** |
| Navegação (940) | — | **ACEITO** |
| Missões (930) | risco cultural de pressão | **ACEITO COM MITIGAÇÃO** — teto de missões atribuídas, painel focado em conclusão |
| Metas (930) | cadastro manual por vendedor | **ACEITO** — cascata é Won't |
| **Performance (850)** | **ERP nunca validado** | **BLOQUEADOR DO DESENHO** — nenhum desenho resolve; exige contrato do Linx |
| Ranking (900) | sem ranking de liderança | **ACEITO** — decisão explícita |
| Gamificação (930) | — | **ACEITO** |
| Perfil (900) | — | **ACEITO** |
| **Conteúdo (900)** | depende de gente escrevendo | **BLOQUEADOR DO DESENHO** — engenharia não resolve |
| Custo de IA (880) | Simulador caro | **ACEITO** — otimizar é Won't até doer |
| Observabilidade (900) | — | **ACEITO** |
| Mobile (900) | — | **ACEITO** |
| Onboarding (900) | — | **ACEITO** |
| Notificações (880) | sem push | **ACEITO POR SIMPLICIDADE** |
| **Produção (850)** | Linx + provider real | **BLOQUEADOR DO DESENHO** |

**Três bloqueadores, e nenhum é de arquitetura:** validar o Linx, configurar um provider
real, e escrever conteúdo. São os três itens que separam este produto de estar pronto.

---

## 48. Adversarial review — onde ataquei o próprio desenho

| Ataque | Achou algo? | O que mudei |
|---|---|---|
| Onde vai confundir o usuário? | **sim** | a "ação de agora" priorizava gap sobre missão — com 5 gaps, a pessoa nunca veria o que tem prazo. **Invertida a prioridade** |
| Onde tem duplicidade? | **sim** | Homes separadas de supervisor e coordenador. **Unificadas** numa "Minha Operação" parametrizada por nível — metade das telas |
| Onde IA está sobrando? | sim | conversa livre do Treinador (já é D-06) e, marginalmente, o Assistente de Gestão (resume o que já está na tela) — mantido por ser lazy e barato |
| Onde falta IA? | pouco | traduzir gap em linguagem humana — o Conselheiro já pode; não vira feature |
| Onde liderança pode abusar? | **sim** | missão com alvo coletivo vira instrumento de pressão. **Teto de missões atribuídas** + painel que mostra conclusão, não "quem falhou" |
| Onde privacidade quebra? | **sim** | transcript do Simulador visível ao líder mataria o espaço de prática. **Recomendação explícita (D-07)** |
| Onde custo explode? | **sim** | Simulador multi-papel × 10-17 chamadas. **Teto por papel** |
| Onde módulo não conversa? | sim | "Para você" só aparece em `/evoluir`. **Vai para a Home** |
| Onde há clique demais? | sim | gerente chega às telas dele só por cards. **Nav por papel** |
| Onde manutenção será cara? | **sim** | duas experiências de liderança quase iguais. **Unificadas** |
| Onde estamos reconstruindo? | **não** | 25 fundações listadas no mapa de reaproveitamento |
| Onde há feature sem problema? | **sim** | busca global, cooldown de quiz, ranking de liderança, Admin Copilot. **Todos para Won't** |
| Onde não escala? | **sim** | árvore recursiva. **Registrado**: materializar só acima de dezenas de milhares |
| **A V1 ficou grande demais?** | **sim, no primeiro corte** | MoSCoW reduziu o Must de ~18 para **10 itens** |

---

## 49. Complexidade evitada

Não entraram no desenho, por não facilitarem a vida de ninguém: agente novo (zero) ·
quinto módulo de "inteligência" · ranking de liderança · cascata de metas · push
externo · busca global · Admin Copilot · N:N pessoa↔loja antes de haver segunda
empresa · renomear tabelas · cooldown de quiz · dashboards adicionais · aprovação em
dois níveis para missão · notificação gerada por IA.

---

## 50. Decision Board

### BLOQUEANTES — decidir antes de começar

| ID | Pergunta | A | B | C | Recomendação |
|---|---|---|---|---|---|
| **D-01** | Modelo de hierarquia | árvore de pessoas (`gestorId`) | unidade organizacional (região/área) | N:N pessoa↔loja | **A**, a menos que "região" seja conceito de negócio real |
| **D-02** | Quem mexe na árvore | só Admin | Admin + líderes sugerem | qualquer líder move abaixo | **A** — mais simples e seguro |
| **D-03** | Comando pula nível? | nunca (`DIRECT_REPORTS`) | exceção auditada | livre no subtree | **A**, com B como exceção explícita se a operação exigir |
| **D-04** | Conflito de missões entre níveis | precedência do nível mais baixo | fila com cap | o mais alto vence | **A** — o gerente conhece o vendedor |
| **D-07** | Privacidade do Simulador | líder vê conclusão + score | + feedback detalhado | + transcript | **A** — o valor do simulador é errar sem custo |

### IMPORTANTES — decidir durante

| ID | Pergunta | Recomendação |
|---|---|---|
| **D-05** | PDI é semi-privado ou operacional? | ver toda a árvore, **editar só o líder direto** |
| **D-06** | Destino da conversa livre do Treinador | avaliar como **modo do Conselheiro**; aposentar se não houver uso |
| **D-10** | Contexto do Conselheiro por papel | um núcleo, quatro contextos — **nenhum agente novo** |
| **D-11** | Valor de recompensa de missão | decisão de negócio; hoje é zero |
| **D-12** | Quem escreve as 80-100 questões | IA gera rascunho + Admin aprova (já possível) **ou** conteúdo humano primeiro |

### POSTERGÁVEIS

**D-08** regras finas do quiz (tentativas, cooldown, embaralhamento) ·
**D-09** validade e recertificação · **D-13** conteúdo espiritual/quântico como
biblioteca governada (a regra epistêmica já existe; falta o material).

---

## 51. Roadmap hipotético — **não iniciado**

| # | Fatia | Reaproveita | Migration | IA | Risco | Tamanho | Decisão prévia |
|---|---|---|---|---|---|---|---|
| 0 | Isolar E2E entre specs | — | não | não | baixo | **P** | — |
| 1 | Escopo único deny-by-default + R1 + R3 | RBAC atual | não | não | baixo | **M** | — |
| 2 | Papéis + árvore organizacional | identidade | **sim** | não | **alto** | **G** | D-01, D-02 |
| 3 | Escopo por árvore nas rotas de liderança | manager-panel | não | não | médio | **M** | D-03 |
| 4 | Navegação em 4 verbos + nav por papel + estados vazios | telas | não | não | baixo | **M** | — |
| 5 | Cascata de missões + catálogo admin + recompensa | motor de missões | **sim** | não | médio | **G** | D-04, D-11 |
| 6 | Admin: Playbook · cenários · conhecimento · `PLATFORM_ADMIN` | CMS | talvez | não | médio | **G** | — |
| 7 | **Conteúdo** | CMS + pipeline de IA | não | opcional | baixo | **MG** | D-12 |
| 8 | Conselheiro e Simulador para liderança | backend já permite | não | **sim** | baixo | **M** | D-07, D-10 |
| 9 | Onboarding + notificações in-app | — | **sim** | não | baixo | **M** | — |
| 10 | Provider real + 2C.6 | harness pronto | não | **sim** | baixo | **P** | — |
| 11 | Linx | adapter | não | não | **alto** | **G** | contrato da API |

**Caminho crítico:** `0 → 1 → 2 → 3` — nada de valor pode ser construído com segurança
antes que o escopo pare de falhar aberto e a suíte pare de variar.

**Caminho paralelo, e é o mais longo:** a fatia 7 (conteúdo) não depende de nenhuma
outra e é **MUITO GRANDE**. Ela deveria começar **no dia 1**, em paralelo, com quem
escreve — senão a V1 fica pronta e vazia.

---

## 52. Teste de coerência (§96)

| Pergunta | Resposta |
|---|---|
| Uma pessoa explica o produto em 30 segundos? | **Sim** — "sei quanto falta, sei o que fazer hoje, aprendo, pratico, e tenho alguém do meu lado" |
| O vendedor sabe o que fazer ao abrir? | **Sim, no desenho** — uma ação principal. Hoje, não: quatro caminhos concorrentes |
| O gerente sabe o que gerir? | **Sim** — o Manager Command Center já responde isso |
| O supervisor entende que lidera gerentes? | **Sim** — a Home dele mostra gerentes, não vendedores |
| O coordenador entende que lidera supervisores? | **Sim** |
| O Admin governa sem terminal? | **Ainda não** — cinco superfícies faltam. É Must da V1 |
| Treinador e Academia saíram sem perder engenharia? | **Sim** — nenhuma seta do mapa aponta para o lixo |
| Cada IA tem motivo real? | **Sim** — 5 necessárias, 10 opcionais, **zero agentes novos** |
| Os módulos estão conectados? | **Sim** — evidência é o barramento, e já funciona |

**Uma resposta é "ainda não".** Ela é Must da V1, e é a única.

### Teste da frase simples (§97)

```
MISSÕES = FAZER          ✓ verdadeiro
UNIVERSIDADE = APRENDER  ✓ verdadeiro (e certificar)
SIMULADOR = PRATICAR     ✓ verdadeiro
CONSELHEIRO = EVOLUIR    ✓ verdadeiro
```

```
METAS = SABER ONDE CHEGAR        ✓
PERFORMANCE = SABER COMO ESTOU   ✓
RANKING = SABER ONDE ME POSICIONO ✓ — com a ressalva de que ele mascara faturamento alheio
GAMIFICAÇÃO = RECONHECER         ✓ — "e engajar" é consequência, não promessa
```

Nenhuma forçada.

---

## 53. Teste de honestidade (§70)

**JÁ IDENTIFICADO** — antes desta etapa, na auditoria 360º:
fail-open do escopo · login sem filtro de empresa · 1:1 por loja · E2E instável ·
6 questões e 0 certificações · missão gerencial invisível · `PLATFORM_ADMIN` sem rotas ·
módulo de conhecimento não montado · recompensa de missão zero · Linx sem teste ·
Playbook sem endpoint admin · "testar conexão" furando o gateway.

**DESCOBERTO NESTA AUDITORIA (2D.0)** — só apareceu ao varrer experiência:
**não existe sistema de notificação nenhum** · **não existe onboarding, e o app nem
sabe que é o primeiro login** · `AcademyTrack.onboarding` existe e nenhuma rota o marca ·
busca existe em **um** lugar só · "Para você" só aparece em `/evoluir`, com corte cego e
falha silenciosa · `/ativacao` não tem link de lugar nenhum · `EmptyState` sem CTA ·
**nenhuma trilha tem escola vinculada** · **duas das 8 escolas já são de liderança** ·
**o seed cria os KnowledgeCards como DRAFT** · categorias `PRINCIPIOS` e `ARGUMENTACAO`
vazias apesar de 6 modos apontarem para elas.

**SURGIU DESTA PERGUNTA** — só virou tema porque a nova arquitetura ou a nota 0–1000
pediram: "uma ação principal por vez" na Home · notificações como módulo · onboarding em
3 telas · busca contextual · Home do Admin · competências de supervisor e coordenador ·
"fatos proibidos" no cenário do Simulador · obrigatoriedade de conteúdo com prazo.

**IDEIA OPCIONAL MINHA** — nem o código nem a nova visão pediram: feedback pós-prova no
quiz · unificar supervisor e coordenador numa experiência parametrizada · teto de
missões atribuídas por líder · custo estimado do cenário visível ao Admin ·
materialização da árvore acima de dezenas de milhares.

**Nenhum item do quarto grupo entrou como Must.** Um entrou como mitigação (teto de
missões) e um mudou o desenho para menos, não para mais (unificação).

---

## 54. Gate para implementação

Esta constituição precisa de validação humana antes de virar roadmap.

Três perguntas destravam tudo:

1. **D-01 — qual modelo de hierarquia?** Tudo depende disso.
2. **D-07 — o líder vê o transcript do Simulador?** Define se o simulador é treino ou avaliação.
3. **D-12 — quem escreve o conteúdo, e quando começa?** É o caminho mais longo e o único
   que não depende de código.
