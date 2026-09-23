# Matriz de Permissões — Vendedor IA V1

Desenho. **Nada implementado.** Baseline `25691ac`.

Esta matriz é escrita para ser convertível em autorização. Cada célula é
`DIMENSÃO:ESCOPO`, e a ausência de célula significa `NONE`.

---

## 1. O modelo

### Quatro dimensões

| Dimensão | Significa | Exemplo |
|---|---|---|
| **VER** | consultar dado que já existe | ver o PA de um vendedor |
| **OPERAR** | agir sobre o próprio trabalho | responder um quiz, iniciar uma simulação |
| **COMANDAR** | decidir/atribuir para outra pessoa | atribuir missão, criar PDI, avaliar |
| **GOVERNAR** | mudar a regra do sistema | definir valor de XP, publicar conteúdo |

### Quatro escopos

| Escopo | Alcance |
|---|---|
| **OWN** | só os próprios dados |
| **DIRECT_REPORTS** | as pessoas um nível imediatamente abaixo |
| **SUBTREE** | toda a árvore abaixo, em qualquer profundidade |
| **COMPANY** | a empresa inteira |

### Três regras que valem para todas as células

**R1 — Visibilidade não é comando.** `VER:SUBTREE` é a norma para líderes; `COMANDAR`
para no nível imediatamente inferior. Um coordenador vê tudo abaixo dele e comanda
supervisores.

**R2 — Deny by default.** Papel desconhecido, escopo indeterminado ou árvore
inconsistente resolvem para `NONE`. Nunca para `COMPANY`.

> Esta regra existe porque hoje o contrário é verdade: `lojaRestritaDe` está copiada em
> três arquivos e tipada como `string`; um papel novo cai no ramo `undefined`, que
> significa empresa inteira. **Fechar isso é pré-condição da hierarquia**, não melhoria.

**R3 — Privacidade não é escopo.** Conversa do Conselheiro, check-in, memória e
transcript de simulação são `OWN` e **permanecem `OWN` para todos os papéis, inclusive
ADMIN**. Não existe escalonamento que os alcance. Governança ≠ vigilância.

---

## 2. Matriz por função

Legenda de estado: **[hoje]** = já é assim · **[muda]** = existe e muda com a
hierarquia · **[novo]** = não existe hoje

### 2.1 Identidade e estrutura

| Função | VENDEDOR | GERENTE | SUPERVISOR | COORDENADOR | ADMIN | Estado |
|---|---|---|---|---|---|---|
| Ver próprio perfil | VER:OWN | VER:OWN | VER:OWN | VER:OWN | VER:OWN | [hoje] |
| Alterar própria senha | OPERAR:OWN | OPERAR:OWN | OPERAR:OWN | OPERAR:OWN | OPERAR:OWN | [hoje] |
| Ver pessoas | — | VER:DIRECT_REPORTS | VER:SUBTREE | VER:SUBTREE | VER:COMPANY | [muda] |
| Pré-autorizar pessoa | — | — | — | — | GOVERNAR:COMPANY | [hoje] |
| Bloquear/desligar/reativar | — | — | — | — | GOVERNAR:COMPANY | [hoje] |
| Realocar pessoa na árvore | — | — | — | — | GOVERNAR:COMPANY | [novo] |
| Criar/editar loja | — | — | — | — | GOVERNAR:COMPANY | [hoje] |
| Montar a árvore organizacional | — | — | — | — | GOVERNAR:COMPANY | [novo] |
| Vincular identidade do ERP | — | — | — | — | GOVERNAR:COMPANY | [hoje] |

**Decisão aberta (D-02):** supervisor e coordenador podem *sugerir* movimentação de
pessoas, ou só o Admin mexe na árvore? O desenho acima assume só Admin — mais simples
e mais seguro.

### 2.2 Metas

| Função | VENDEDOR | GERENTE | SUPERVISOR | COORDENADOR | ADMIN | Estado |
|---|---|---|---|---|---|---|
| Ver própria meta | VER:OWN | VER:OWN | VER:OWN | VER:OWN | — | [hoje] |
| Ver metas da equipe | — | VER:DIRECT_REPORTS | VER:SUBTREE | VER:SUBTREE | VER:COMPANY | [muda] |
| Criar/editar meta | — | — | — | — | GOVERNAR:COMPANY | [hoje] |

**Preservado por decisão:** meta continua sendo decisão comercial da empresa, não do
gerente da loja. O código já registra isso explicitamente. **Não criar cascata de metas
por nível** — não foi pedido e adiciona um eixo inteiro de complexidade.

### 2.3 Performance

| Função | VENDEDOR | GERENTE | SUPERVISOR | COORDENADOR | ADMIN | Estado |
|---|---|---|---|---|---|---|
| Ver própria performance | VER:OWN | VER:OWN | VER:OWN | VER:OWN | — | [hoje] |
| Ver performance de pessoas | — | VER:DIRECT_REPORTS | VER:SUBTREE | VER:SUBTREE | VER:COMPANY | [muda] |
| Ver consolidado por loja | — | VER:OWN (sua loja) | VER:SUBTREE | VER:SUBTREE | VER:COMPANY | [muda] |

**O motor não muda. O que muda é o recorte da visualização.**

### 2.4 Ranking

| Função | VENDEDOR | GERENTE | SUPERVISOR | COORDENADOR | ADMIN | Estado |
|---|---|---|---|---|---|---|
| Ver ranking da loja | VER:OWN | VER:DIRECT_REPORTS | VER:SUBTREE | VER:SUBTREE | VER:COMPANY | [hoje] |
| Ver ranking da rede | VER:OWN | VER:OWN | VER:SUBTREE | VER:SUBTREE | VER:COMPANY | [hoje] |
| Ver faturamento alheio | **NONE** | **NONE** | **NONE** | **NONE** | VER:COMPANY | [hoje] |

**A célula que importa é a última.** O ranking mascara o valor absoluto de terceiros e
só entrega `gapParaAnterior` na própria linha — proteção que custou duas rodadas de
correção (vazamento direto e depois por aritmética encadeada). **Nenhum papel novo pode
reabri-la.**

**Não criar ranking de liderança agora** — decisão explícita da etapa anterior.

### 2.5 Missões

| Função | VENDEDOR | GERENTE | SUPERVISOR | COORDENADOR | ADMIN | Estado |
|---|---|---|---|---|---|---|
| Ver missões próprias | VER:OWN | VER:OWN | VER:OWN | VER:OWN | — | [hoje] |
| Executar missão própria | OPERAR:OWN | OPERAR:OWN | OPERAR:OWN | OPERAR:OWN | — | [hoje] |
| Ver missões de pessoas | — | VER:DIRECT_REPORTS | VER:SUBTREE | VER:SUBTREE | VER:COMPANY | [muda] |
| **Atribuir missão do catálogo** | — | **COMANDAR:DIRECT_REPORTS** | **COMANDAR:DIRECT_REPORTS** | **COMANDAR:DIRECT_REPORTS** | COMANDAR:COMPANY | **[novo]** |
| Atribuir missão a uma equipe/loja | — | COMANDAR:DIRECT_REPORTS | COMANDAR:DIRECT_REPORTS | COMANDAR:DIRECT_REPORTS | COMANDAR:COMPANY | **[novo]** |
| Cancelar missão que atribuiu | — | COMANDAR:OWN (a que criou) | idem | idem | COMANDAR:COMPANY | **[novo]** |
| Criar/editar o catálogo | — | — | — | — | GOVERNAR:COMPANY | **[novo]** |
| Definir recompensa (XP/moeda) | — | — | — | — | GOVERNAR:COMPANY | **[novo]** |

**Este bloco é o coração da nova visão, e é quase todo novo.** Hoje as 5 rotas de
missão são `GET`, a atribuição é 100% automática e não existe conceito de autor.

**Três invariantes de desenho, para não repetir erros já pagos:**

1. **Admin governa o catálogo e a economia; liderança só aplica o que foi autorizado.**
   Um gerente nunca define quanto vale uma missão — senão a moeda vira inflação local.
2. **Missão atribuída por líder tem autor registrado e é auditada.** Missão automática
   do sistema continua sem autor.
3. **A conclusão continua vindo de evidência, nunca de declaração.** Nem do vendedor,
   nem do líder, nem da IA. Essa regra já existe e não se abre exceção.

**Decisão aberta (D-03):** um coordenador pode atribuir missão direto a um vendedor
(pulando dois níveis)? R1 diz não. Se a operação real exigir, é exceção explícita e
auditada, não a regra.

**Decisão aberta (D-04):** o que acontece quando dois níveis atribuem missões
conflitantes à mesma pessoa no mesmo dia? Hoje o cap é 3 missões/dia. Precisa de regra
de precedência ou de fila.

### 2.6 Universidade, Quiz e Certificação

| Função | VENDEDOR | GERENTE | SUPERVISOR | COORDENADOR | ADMIN | Estado |
|---|---|---|---|---|---|---|
| Consumir curso/aula | OPERAR:OWN | OPERAR:OWN | OPERAR:OWN | OPERAR:OWN | — | [hoje] |
| Responder avaliação | OPERAR:OWN | OPERAR:OWN | OPERAR:OWN | OPERAR:OWN | — | [hoje] |
| Ver próprio progresso | VER:OWN | VER:OWN | VER:OWN | VER:OWN | — | [hoje] |
| Ver progresso de pessoas | — | VER:DIRECT_REPORTS | VER:SUBTREE | VER:SUBTREE | VER:COMPANY | [muda] |
| Emitir própria certificação | OPERAR:OWN | OPERAR:OWN | OPERAR:OWN | OPERAR:OWN | — | [hoje] |
| Ver certificações de pessoas | — | VER:DIRECT_REPORTS | VER:SUBTREE | VER:SUBTREE | VER:COMPANY | [muda] |
| Tornar conteúdo obrigatório | — | COMANDAR:DIRECT_REPORTS | COMANDAR:DIRECT_REPORTS | COMANDAR:DIRECT_REPORTS | GOVERNAR:COMPANY | **[novo]** |
| Criar/editar curso, aula, questão | — | — | — | — | GOVERNAR:COMPANY | [hoje] |
| Publicar conteúdo | — | — | — | — | GOVERNAR:COMPANY | [hoje] |
| Definir certificação e requisitos | — | — | — | — | GOVERNAR:COMPANY | [hoje] |
| Ver gabarito | **NONE** | **NONE** | **NONE** | **NONE** | GOVERNAR:COMPANY | [hoje] |

**O gabarito nunca sai do servidor para ninguém abaixo de Admin** — inclusive não sai
para o próprio avaliado antes da resposta. Já é assim e é inegociável.

### 2.7 Simulador

| Função | VENDEDOR | GERENTE | SUPERVISOR | COORDENADOR | ADMIN | Estado |
|---|---|---|---|---|---|---|
| Praticar no próprio catálogo | OPERAR:OWN | OPERAR:OWN | OPERAR:OWN | OPERAR:OWN | — | [muda] |
| Ver próprio histórico completo | VER:OWN | VER:OWN | VER:OWN | VER:OWN | — | [hoje] |
| Ver **que** alguém praticou | — | VER:DIRECT_REPORTS | VER:SUBTREE | VER:SUBTREE | VER:COMPANY | [novo] |
| Ver **score** de alguém | — | VER:DIRECT_REPORTS | VER:SUBTREE | VER:SUBTREE | VER:COMPANY | [novo] |
| Ver **feedback detalhado** de alguém | **NONE** | **NONE** | **NONE** | **NONE** | **NONE** | [novo] |
| Ver **transcript** de alguém | **NONE** | **NONE** | **NONE** | **NONE** | **NONE** | [novo] |
| Criar/editar cenário | — | — | — | — | GOVERNAR:COMPANY | **[novo]** |

**Catálogo por papel, já implementado:** cenários de gestão só aparecem para quem
lidera; cenários de venda só para quem vende. E `resolverCenario` nunca revela a
existência do catálogo do outro papel — devolve 404 genérico.

**O trade-off das duas últimas linhas é decisão humana (D-07).** O desenho acima
protege o espaço de prática: o líder sabe que a pessoa praticou e como foi, mas não lê
o que ela disse. A alternativa — líder vê o transcript — transforma treino em avaliação
e as pessoas param de errar de propósito, que é justamente o valor do simulador.

### 2.8 Conselheiro

| Função | VENDEDOR | GERENTE | SUPERVISOR | COORDENADOR | ADMIN |
|---|---|---|---|---|---|
| Conversar | OPERAR:OWN | OPERAR:OWN | OPERAR:OWN | OPERAR:OWN | OPERAR:OWN |
| Check-in de humor | OPERAR:OWN | OPERAR:OWN | OPERAR:OWN | OPERAR:OWN | OPERAR:OWN |
| Ler conversa de outra pessoa | **NONE** | **NONE** | **NONE** | **NONE** | **NONE** |
| Ler check-in de outra pessoa | **NONE** | **NONE** | **NONE** | **NONE** | **NONE** |
| Ler memória de outra pessoa | **NONE** | **NONE** | **NONE** | **NONE** | **NONE** |
| Ver *que* alguém usou o Conselheiro | **NONE** | **NONE** | **NONE** | **NONE** | VER:COMPANY (só custo agregado de IA) |
| Governar conhecimento da empresa | — | — | — | — | GOVERNAR:COMPANY |
| Governar conhecimento global | — | — | — | — | PLATFORM_ADMIN |

**Cinco linhas `NONE` em todas as colunas.** Não é rigor decorativo: hoje a garantia é
**arquitetural** — o domínio não autorizado não é sequer buscado no banco, então não
existe caminho de vazamento nem por bug de renderização. Qualquer atalho de
"líder vê o resumo da conversa" destrói essa propriedade.

**Admin aparece como usuário, não como auditor.** Ele conversa com o próprio
Conselheiro; não ganha acesso ao de ninguém.

**A travessia legítima:** o Conselheiro pode sugerir *"isso parece assunto pro seu
1:1"*. A informação atravessa pela decisão da pessoa — nunca por relatório automático.

### 2.9 Gestão

| Função | VENDEDOR | GERENTE | SUPERVISOR | COORDENADOR | ADMIN | Estado |
|---|---|---|---|---|---|---|
| Ver alertas da própria operação | — | VER:DIRECT_REPORTS | VER:SUBTREE | VER:SUBTREE | VER:COMPANY | [muda] |
| Reconhecer/resolver/dispensar alerta | — | OPERAR:DIRECT_REPORTS | OPERAR:SUBTREE | OPERAR:SUBTREE | — | [muda] |
| Criar plano de ação | — | COMANDAR:DIRECT_REPORTS | COMANDAR:DIRECT_REPORTS | COMANDAR:DIRECT_REPORTS | — | [muda] |
| Registrar 1:1 | — | COMANDAR:DIRECT_REPORTS | COMANDAR:DIRECT_REPORTS | COMANDAR:DIRECT_REPORTS | — | [muda] |
| **Ler notas de 1:1 de outro líder** | — | **NONE** | **NONE** | **NONE** | **NONE** | **[muda]** |
| Reconhecer publicamente | — | COMANDAR:DIRECT_REPORTS | COMANDAR:SUBTREE | COMANDAR:SUBTREE | — | [muda] |
| Reunião do Dia | — | VER:DIRECT_REPORTS | VER:SUBTREE | VER:SUBTREE | — | [muda] |
| Configurar limiares de alerta | — | — | — | — | GOVERNAR:COMPANY | [hoje] |

**A linha em negrito corrige um comportamento atual.** Hoje `OneOnOne`,
`ManagerFollowUp` e `ManagerActionPlan` filtram por `(empresaId, lojaId)` e **não por
`managerId`** — dois gerentes da mesma loja leem as notas privadas um do outro, apesar
de a coluna e o índice já existirem. O código afirma privacidade "do gerente"; a
garantia real é por loja.

Com supervisor e coordenador acima, isso deixa de ser incômodo e vira furo de desenho:
o supervisor precisa ver *que houve* 1:1, não *o que foi dito*.

**Desenho proposto:** `VER:SUBTREE` sobre o **fato** (houve 1:1, quando, com quem);
`NONE` sobre as **notas**.

### 2.10 Desenvolvimento (competências, evidências, PDI)

| Função | VENDEDOR | GERENTE | SUPERVISOR | COORDENADOR | ADMIN | Estado |
|---|---|---|---|---|---|---|
| Ver própria matriz | VER:OWN | VER:OWN | VER:OWN | VER:OWN | — | [hoje] |
| Ver matriz de pessoas | — | VER:DIRECT_REPORTS | VER:SUBTREE | VER:SUBTREE | VER:COMPANY | [muda] |
| Avaliar competência de alguém | — | COMANDAR:DIRECT_REPORTS | COMANDAR:DIRECT_REPORTS | COMANDAR:DIRECT_REPORTS | — | [muda] |
| Criar PDI para alguém | — | COMANDAR:DIRECT_REPORTS | COMANDAR:DIRECT_REPORTS | COMANDAR:DIRECT_REPORTS | GOVERNAR:COMPANY | [muda] |
| Ver PDI de alguém | — | VER:DIRECT_REPORTS | VER:SUBTREE | VER:SUBTREE | VER:COMPANY | [muda] |
| Definir competências e targets | — | — | — | — | GOVERNAR:COMPANY | [hoje] |
| Mapear conteúdo → competência | — | — | — | — | GOVERNAR:COMPANY | [hoje] |
| Criar evidência manualmente | **NONE** | **NONE** | **NONE** | **NONE** | **NONE** | [hoje] |

**A última linha é estrutural:** evidência nasce de fato (quiz, simulação, missão,
avaliação registrada), nunca de digitação. É o que impede a matriz de competências de
virar opinião.

**Decisão aberta (D-05):** o PDI é semi-privado (pessoa + líder direto) ou operacional
(toda a árvore vê)? O desenho acima diz: **ver, toda a árvore; editar, só o líder
direto**. Se o PDI contiver conteúdo sensível, precisa ser `DIRECT_REPORTS` também no VER.

### 2.11 Gamificação

| Função | VENDEDOR | GERENTE | SUPERVISOR | COORDENADOR | ADMIN | Estado |
|---|---|---|---|---|---|---|
| Ver próprio XP, moeda, nível, badges | VER:OWN | VER:OWN | VER:OWN | VER:OWN | — | [hoje] |
| Ver extrato próprio | VER:OWN | VER:OWN | VER:OWN | VER:OWN | — | [hoje] |
| Ver saldo de pessoas | — | VER:DIRECT_REPORTS | VER:SUBTREE | VER:SUBTREE | VER:COMPANY | [muda] |
| Conceder XP/moeda manualmente | **NONE** | **NONE** | **NONE** | **NONE** | GOVERNAR:COMPANY (auditado) | [hoje] |
| Definir a régua | — | — | — | — | GOVERNAR:COMPANY | [hoje] |
| Criar competição/temporada/liga | — | — | — | — | GOVERNAR:COMPANY | [hoje] |
| Participar de competição | OPERAR:OWN | OPERAR:OWN | OPERAR:OWN | OPERAR:OWN | — | [hoje] |

**Nenhum líder concede moeda.** É a regra antifraude mais importante do produto: a
economia é governada centralmente e alimentada por evidência. Se um gerente pudesse
premiar diretamente, a moeda perderia comparabilidade entre lojas — e o ranking
entre lojas é a razão de o produto ser multi-loja.

### 2.12 Inteligência e governança

| Função | VENDEDOR | GERENTE | SUPERVISOR | COORDENADOR | ADMIN | PLATFORM_ADMIN |
|---|---|---|---|---|---|---|
| Configurar provider/modelo | — | — | — | — | GOVERNAR:COMPANY | — |
| Ver custo e uso de IA | — | — | — | — | VER:COMPANY | — |
| Definir budget | — | — | — | — | GOVERNAR:COMPANY | — |
| Pedir geração de conteúdo por IA | — | — | — | — | GOVERNAR:COMPANY | — |
| Aprovar/publicar o que a IA gerou | — | — | — | — | GOVERNAR:COMPANY | — |
| Governar KnowledgeCard da empresa | — | — | — | — | GOVERNAR:COMPANY | — |
| Governar KnowledgeCard global | — | — | — | — | **NONE** | GOVERNAR |
| Ler auditoria | — | — | — | — | VER:COMPANY | — |

**`PLATFORM_ADMIN` é menor privilégio, não maior.** Ele governa conhecimento global e
**nada mais**: não administra pessoas, não vê metas, não entra em ranking e **não
alcança conversa, check-in ou memória do Conselheiro**. Existe por uma razão só — no
dia em que houver dezenas de empresas, um Admin de uma delas não pode reescrever
conhecimento que vale para todas.

Hoje ele tem **zero rotas HTTP** e o módulo de conhecimento **nem está montado no
servidor**. Dar superfície a ele é trabalho de V1.

---

## 3. Resumo por papel

| | VENDEDOR | GERENTE | SUPERVISOR | COORDENADOR | ADMIN |
|---|---|---|---|---|---|
| **VER** | OWN | DIRECT_REPORTS | SUBTREE | SUBTREE | COMPANY |
| **OPERAR** | OWN | OWN + DIRECT_REPORTS | OWN + SUBTREE | OWN + SUBTREE | OWN |
| **COMANDAR** | — | DIRECT_REPORTS | DIRECT_REPORTS | DIRECT_REPORTS | COMPANY |
| **GOVERNAR** | — | — | — | — | COMPANY |

**Leia a linha COMANDAR.** Ela é igual para os três níveis de liderança, e é
deliberado: cada um comanda quem está logo abaixo. Um coordenador com
`COMANDAR:SUBTREE` esvaziaria o supervisor e o gerente — e produziria exatamente a
cultura de atropelo que uma cadeia de liderança existe para evitar.

**E a coluna ADMIN não tem `COMANDAR:COMPANY` em gestão** de propósito: Admin governa
regra e conteúdo; ele não conduz 1:1 nem cria plano de ação. Governar não é liderar.

---

## 4. Como isto vira autorização (nota de implementação, não implementada)

O padrão atual — `lojaRestritaDe(req)` copiado em três lugares — não comporta quatro
escopos. O desenho pede uma resolução única:

```
resolverEscopo(auth, dimensao, recurso) → { tipo: 'NONE'|'OWN'|'DIRECT_REPORTS'|'SUBTREE'|'COMPANY', ids: string[] }
```

Três propriedades que a implementação precisa ter:

1. **Exaustividade sobre o enum de papel** (`Record<Papel, …>`), para que um papel novo
   **não compile** até alguém decidir o escopo dele. É o mesmo mecanismo que o projeto
   já usa em `DOMINIO_DA_MISSAO` e em `PRECEDENCIA` do Retriever, e é o antídoto exato
   do fail-open de hoje.
2. **Escopo resolvido antes da query, nunca dentro dela** — o filtro de tenant e o de
   relevância não podem disputar a mesma chave do `where`. O projeto já pagou esse
   preço uma vez (vazamento entre empresas por dois `OR` no mesmo objeto Prisma).
3. **Um único ponto de resolução**, com teste que enumera os arquivos autorizados a
   chamá-lo e falha se aparecer um segundo. O projeto já usa essa técnica no
   orquestrador de conhecimento.
