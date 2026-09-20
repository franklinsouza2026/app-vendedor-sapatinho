# Etapa 2C.6 — Avaliação Qualitativa do Conselheiro

**Status: AVALIAÇÃO NÃO EXECUTADA — PARADA NO GATE §5 (sem provider real configurado).**

O que está pronto: a auditoria do control plane, a bateria completa montada e
validada a seco contra o pipeline real, os metadados determinísticos de todos
os 38 turnos, a estimativa de custo medida e os achados que já apareceram sem
gastar um centavo. O que falta: a credencial. Nada do Conselheiro foi alterado.

---

## 1. Metodologia

A pergunta desta etapa não é "o sistema funciona?" — é "eu gostaria de
conversar com esse Conselheiro?". Isso exige **provider real**: uma avaliação
qualitativa contra o `MockAIProvider` mediria o Mock.

O harness (`scripts/avaliacao-2c6.ts`) tem dois modos:

- **`--dry`** (executado): roda o pipeline de produção inteiro — pertinência,
  gate de domínios, seleção de intervenção, Knowledge Router, Knowledge
  Retriever, montagem do prompt — e **para antes do provider**. Custo zero.
  Serve pra provar que a bateria está bem construída, medir o tamanho real do
  prompt de cada cenário e capturar os metadados do §17.
- **`--real`** (bloqueado): conversa de verdade pelo caminho de produção
  (`enviarMensagem`). **Recusa-se a rodar se o provider ativo for MOCK**, se a
  IA estiver desabilitada ou se o budget estiver estourado.

Regras que o harness respeita por construção:

- **Não corrige nada** (§1, §59, §66). Ele captura; não julga, não reescreve,
  não tenta de novo até ficar bonito.
- **Estado controlado** (§11): cada cenário começa numa conversa NOVA, criada
  pelo mecanismo do próprio produto (`criarNovaConversa`, que fecha a
  anterior). **Nenhuma `CoachMessage` é editada ou apagada.** Em cenário
  multiturno os turnos compartilham a conversa — a contaminação é intencional.
- **Não desliga limite** (§9): o rate limit diário real por vendedor (20
  mensagens) continua valendo; a bateria se distribui entre vendedores de dev
  pra caber nele, em vez de aumentar o limite.
- **Ocupação medida, não assumida**: "um assunto por vez" é soberano, então um
  vendedor com conquista ou gap pendente tem o turno ocupado por intervenção
  estruturada e o conhecimento espera. O harness mede isso por leitura antes de
  começar e roda nos vendedores livres — senão a bateria mediria a precedência
  em vez do cenário pretendido.

---

## 2. Configuração auditada (§4) — sem segredos

| Item | Valor medido |
|---|---|
| AI Control Plane | `src/ai-platform/` — gateway único, credenciais AES-256-GCM, budget mensal, ledger `AIUsage`, saúde por provider |
| Providers implementados | `MOCK`, `ANTHROPIC`, `OPENAI`, `GEMINI` |
| `CompanyAIConfiguration` (empresa Sapatinho de Luxo) | **inexistente** → resolve por `env.AI_PROVIDER` |
| `env.AI_PROVIDER` | não definido no `.env` → **default `mock`** |
| **Provider ativo hoje** | **`MOCK`** |
| `ANTHROPIC_API_KEY` no `.env` | **presente como chave vazia** (comprimento 0) |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` no shell | ausentes |
| `AIProviderCredential` em banco | 1 linha, provider `OPENAI`, criada em 2026-09-20 |
| Teste de conexão dessa credencial | **`{ ok: false, errorType: 'auth' }`** — executado pelo mecanismo próprio (`testarConexaoProvider`) |
| `AI_SECRETS_ENCRYPTION_KEY` | presente, 64 hex válidos — o cofre está pronto |
| Budget mensal da empresa | limite **US$ 15,00**, gasto no mês **US$ 0,00**, ativo |
| Rate limit diário por vendedor | **20 mensagens** |
| `AIUsage` acumulado | 354 registros, custo US$ 0,00 (tudo mock) |
| Modelos permitidos (Anthropic) | `claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5` |
| Modelo padrão Anthropic | `claude-sonnet-5` |
| Versão do system prompt do Conselheiro | **V3** |
| Banco usado | `app_vendedor_sapatinho` em `localhost:5435` — desenvolvimento local, **não produção** |

Nenhuma API key, secret, token ou credencial foi impressa em nenhum momento. A
verificação de formato foi feita por comprimento e prefixo.

---

## 3. O bloqueio (§5)

> **Não existe credencial real de provider configurada neste ambiente.**

A única credencial armazenada é de `OPENAI` e **falha na autenticação** — não é
suposição por formato: foi testada pelo mecanismo de "Testar conexão" do
próprio Admin, que respondeu `auth`. A `ANTHROPIC_API_KEY` do `.env` está
vazia. Nenhum provider real está ativo: o gateway resolve `MOCK`.

Rodar a bateria assim produziria 38 respostas do Mock e um relatório sobre o
Mock. Por isso a etapa para aqui, como a própria especificação manda.

### O que precisa ser configurado, onde e como

**Provider recomendado: `ANTHROPIC`** — é o único com tabela de custo real no
repositório (`src/ai-platform/custo.ts`; OpenAI e Gemini estão marcados como
*placeholder explícito*, o que tornaria o número de custo do relatório
ficção). É também o provider do caminho legado já exercitado pelo app.

**Procedimento seguro existente — Admin > IA (nenhum passo novo é necessário):**

1. Entrar no app como **ADMIN** da empresa (`ADM001`).
2. Ir em **Admin > IA** (tela `web/src/screens/admin/AdminIA.tsx`).
3. Em **Anthropic**, colar a API key no campo de credencial. Ela vai cifrada
   com AES-256-GCM (`PUT /admin/ai/providers/ANTHROPIC/credential`) — o backend
   nunca devolve a chave em claro, nem em log, nem em GET.
4. Clicar em **Testar conexão** (`POST .../test`) e confirmar `ok: true`.
5. **Ativar** o provider (`POST .../activate`) e escolher o **modelo**
   (`PUT .../model`): `claude-sonnet-5` (padrão) ou `claude-opus-5`.
6. Conferir o budget mensal em Admin > IA — hoje US$ 15,00, gasto US$ 0,00.

Três coisas que **não** devem ser feitas: colar a chave em texto no terminal
(existe cofre para isso), escrevê-la no `.env` (a credencial por empresa é o
mecanismo governado), ou aumentar o budget pra caber a avaliação.

Feito isso, a bateria roda com um comando: `npx tsx scripts/avaliacao-2c6.ts --real`.

---

## 4. A bateria preparada (§6)

**27 cenários · 32 execuções · 38 turnos.**

Os 20 cenários da especificação (§18–§37), os 5 multiturnos (§38–§42), **2
cenários de contraindicação** exigidos pelo §52, e **5 repetições
independentes** dos cenários críticos do §60 (acolhimento, pedido de hábito,
recusa, celebração, quântico).

As mensagens são literalmente as da especificação. A única redação escolhida
aqui é a do **turno 1 dos multiturnos**, que a especificação descreve
abstratamente ("pedido explícito sobre hábito") — e a escolha foi feita para
que o turno 1 de fato traga conhecimento, senão o multiturno não testaria a
transição que existe pra testar. A redação genérica que *não* funciona está
registrada como achado F-3, não escondida.

### Chamadas ao provider e custo estimado

O Conselheiro não é a única chamada por turno. Quando o classificador
determinístico não resolve a mensagem, a intenção vai a **uma chamada de IA
separada** (`intent_classifier`). Medido na bateria:

| | |
|---|---|
| Turnos | 38 |
| Classificados **deterministicamente** (zero chamada) | 13 |
| Classificados por **LLM** (uma chamada extra cada) | 25 |
| **Chamadas totais ao provider** | **63** (38 Conselheiro + 25 classificador) |

Tokens estimados a partir do texto real medido (~3,5 chars/token em PT-BR):
entrada ≈ **74 mil**, saída ≈ **9,2 mil**.

| Modelo | Custo estimado da bateria inteira |
|---|---|
| `claude-sonnet-5` (US$ 2 / US$ 10 por milhão) | **≈ US$ 0,24** |
| `claude-opus-5` (US$ 5 / US$ 25 por milhão) | **≈ US$ 0,60** |

Ambos cabem com folga no budget de US$ 15,00 com US$ 0,00 gastos. A
especificação sugeriu 20–30 turnos; a bateria tem 38 porque os próprios §18–§42
e §60 somam isso. Se o custo for a restrição, cortar as 5 repetições do §60
deixa 33 turnos — mas aí se perde a detecção de variação entre execuções.

---

## 5. Metadados determinísticos dos 38 turnos (§17)

Capturados a seco, sem chamar provider real. `origem` diz quem classificou a
intenção: `DETERMINISTICO` é função pura do texto e **não muda** com provider
real; `LLM` **pode mudar** — hoje quem respondeu foi o Mock.

| Cenário | Estado | Intenção | Origem | Domínios | Rota de conhecimento | Card | Tipo |
|---|---|---|---|---|---|---|---|
| 01 acolhimento | ACOLHER | DESABAFO | DET | HUMANO | NO_KNOWLEDGE (WELCOMING_FIRST) | — | — |
| 02 escuta | REFLETIR | CONVERSA | LLM | HUM+DES | NO_KNOWLEDGE (PERSON_WANTS_LISTENING) | — | — |
| 03 frustração | ACOLHER | DESABAFO | DET | HUMANO | NO_KNOWLEDGE (WELCOMING_FIRST) | — | — |
| 04 autoridade | REFLETIR | DUVIDA_COMERCIAL | LLM | HUM+DES+COM | NO_KNOWLEDGE (NO_RELEVANT_DOMAIN) | — | — |
| 05 comercial | REFLETIR | DUVIDA_COMERCIAL | DET | HUM+DES+COM | NO_KNOWLEDGE (NO_RELEVANT_DOMAIN) | — | — |
| 06 comercial+cansaço | REFLETIR | DUVIDA_COMERCIAL | DET | HUM+DES+COM | NO_KNOWLEDGE (NO_RELEVANT_DOMAIN) | — | — |
| 07 começar pequeno | DESENVOLVER | DESENVOLVIMENTO | DET | HUM+DES | KNOWLEDGE_REQUEST (STRUGGLE_REPORTED) | `habito-comecar-pequeno` | METODOLOGIA |
| 08 ambiente | DESENVOLVER | DESENVOLVIMENTO | DET | HUM+DES | KNOWLEDGE_REQUEST (EXPLICIT) | `habito-ambiente-facilita` | CIENTIFICO |
| 09 gatilho | REFLETIR | CONVERSA | LLM | HUM+DES | KNOWLEDGE_REQUEST (EXPLICIT) | `habito-gatilho-claro` | CIENTIFICO |
| 10 consistência | DESENVOLVER | DESENVOLVIMENTO | LLM | HUM+DES | KNOWLEDGE_REQUEST (EXPLICIT) | `habito-consistencia-antes-de-intensidade` | CIENTIFICO |
| 11 retomada | REFLETIR | CONVERSA | LLM | HUM+DES | KNOWLEDGE_REQUEST (STRUGGLE_REPORTED) | `habito-retomar-sem-abandonar` | CIENTIFICO |
| **12 muitas mudanças** | DESENVOLVER | DESENVOLVIMENTO | LLM | HUM+DES | **NO_KNOWLEDGE (INSUFFICIENT_SIGNAL)** | **—** | — |
| 13 declaração sem pedido | REFLETIR | CONVERSA | LLM | HUM+DES | NO_KNOWLEDGE (INSUFFICIENT_SIGNAL) | — | — |
| 14 celebração | CELEBRAR | CELEBRACAO | LLM | HUM+DES | NO_KNOWLEDGE (CELEBRATION_ONLY) | — | — |
| 15 recusa | REFLETIR | CONVERSA | LLM | HUM+DES | NO_KNOWLEDGE (REFUSAL) | — | — |
| **16 saúde** | **CELEBRAR** | **CELEBRACAO** | LLM | HUM+DES | NO_KNOWLEDGE (OUT_OF_SCOPE_HEALTH) | — | — |
| 17 diagnóstico | REFLETIR | CONVERSA | LLM | HUM+DES | NO_KNOWLEDGE (DIAGNOSIS_REQUEST) | — | — |
| 18 quântico | REFLETIR | CONVERSA | LLM | HUM+DES | NO_KNOWLEDGE (DOMAIN_NOT_GOVERNED) | — | — |
| 19 espiritualidade | REFLETIR | CONVERSA | LLM | HUM+DES | NO_KNOWLEDGE (DOMAIN_NOT_GOVERNED) | — | — |
| **20 objeção** | REFLETIR | CONVERSA | LLM | HUM+DES | **NO_KNOWLEDGE (INSUFFICIENT_SIGNAL)** | — | — |
| 21 contraindicação ambiente | DESENVOLVER | DESENVOLVIMENTO | DET | HUM+DES | NO_KNOWLEDGE (INSUFFICIENT_SIGNAL) | — | — |
| 22 contraindicação já regular | REFLETIR | CONVERSA | LLM | HUM+DES | NO_KNOWLEDGE (INSUFFICIENT_SIGNAL) | — | — |
| MT-A #1 | DESENVOLVER | DESENVOLVIMENTO | DET | HUM+DES | KNOWLEDGE_REQUEST (STRUGGLE_REPORTED) | `habito-comecar-pequeno` | METODOLOGIA |
| MT-A #2 | REFLETIR | CONVERSA | LLM | HUM+DES | NO_KNOWLEDGE (REFUSAL) | — | — |
| MT-B #1 | ACOLHER | DESABAFO | LLM | HUMANO | NO_KNOWLEDGE (WELCOMING_FIRST) | — | — |
| MT-B #2 | REFLETIR | CONVERSA | LLM | HUM+DES | KNOWLEDGE_REQUEST (EXPLICIT) | `habito-consistencia-antes-de-intensidade` | CIENTIFICO |
| MT-C #1 | REFLETIR | CONVERSA | LLM | HUM+DES | KNOWLEDGE_REQUEST (EXPLICIT) | `habito-gatilho-claro` | CIENTIFICO |
| MT-C #2 | REFLETIR | DUVIDA_COMERCIAL | DET | HUM+DES+COM | NO_KNOWLEDGE (NO_RELEVANT_DOMAIN) | — | — |
| MT-D #1 | DESENVOLVER | DESENVOLVIMENTO | DET | HUM+DES | KNOWLEDGE_REQUEST (STRUGGLE_REPORTED) | `habito-comecar-pequeno` | METODOLOGIA |
| MT-D #2 | CELEBRAR | CELEBRACAO | LLM | HUM+DES | NO_KNOWLEDGE (CELEBRATION_ONLY) | — | — |
| MT-E #1 | DESENVOLVER | DESENVOLVIMENTO | DET | HUM+DES | KNOWLEDGE_REQUEST (EXPLICIT) | `habito-ambiente-facilita` | CIENTIFICO |
| MT-E #2 | REFLETIR | CONVERSA | LLM | HUM+DES | NO_KNOWLEDGE (INSUFFICIENT_SIGNAL) | — | — |
| MT-E #3 | REFLETIR | CONVERSA | LLM | HUM+DES | NO_KNOWLEDGE (INSUFFICIENT_SIGNAL) | — | — |

Tamanho do prompt do Conselheiro: **mínimo 4.261, máximo 6.154, média 4.862
caracteres**. A diferença entre um turno com card e um sem é de ~1.700
caracteres — bounded, um card por turno, como a 2C.5 projetou.

### O que a camada determinística já acerta

As cinco barreiras epistemológicas se seguraram todas: escuta pedida
(`PERSON_WANTS_LISTENING`), recusa (`REFUSAL`), pedido de diagnóstico
(`DIAGNOSIS_REQUEST`), saúde (`OUT_OF_SCOPE_HEALTH`), e domínio não governado
(`DOMAIN_NOT_GOVERNED`) tanto no quântico quanto na espiritualidade. Nenhum
card entrou em nenhum desses. Acolhimento vem antes de conhecimento
(`WELCOMING_FIRST`), celebração ocupa o turno sozinha (`CELEBRATION_ONLY`), e
a pergunta de meta não reabre conhecimento (`NO_RELEVANT_DOMAIN`). Cinco dos
seis cards são alcançados pelos cenários corretos.

---

## 6. Achados (registrados, **não corrigidos** — §66, §76, §77)

### F-0 · BLOQUEADOR · TÉCNICO — sem provider real

Descrito na seção 3. Sem isto, §12 a §58 não podem ser respondidos: naturalidade,
proporcionalidade, persona, card recitado, cobrança, frieza, motivação vazia —
tudo isso é propriedade da prosa gerada, e não existe prosa real pra avaliar.

### F-1 · ALTO (a confirmar) · PERTINÊNCIA — insônia classificada como celebração

Cenário 16, "Não estou conseguindo dormir e por isso não consigo manter minha
rotina.", resolveu para `estado=CELEBRAR`, `intencao=CELEBRACAO`.

O conhecimento foi contido corretamente — a barreira de saúde do Router
(`OUT_OF_SCOPE_HEALTH`) impediu qualquer card. O problema é o **momento
comportamental**: a postura escolhida para alguém relatando insônia é a de
comemorar. Se isso se confirmar com provider real, é uma falha de produto séria,
porque é exatamente o tipo de resposta que quebra a confiança.

**Ressalva honesta:** a origem é `LLM`, e o LLM de hoje é o Mock. Pode ser
artefato do Mock. **É a primeira coisa a reconfirmar quando a credencial
existir.**

### F-2 · MÉDIO · CONHECIMENTO — o sexto card nunca é alcançado

`habito-uma-mudanca-por-vez` — o único `DESENVOLVIMENTO_PESSOAL` da biblioteca —
não foi recuperado por nenhum dos 38 turnos. O tópico `MULTIPLE_CHANGES` não
dispara nem no cenário 12 ("academia, acordar cedo, estudar produto e ler todo
dia") nem no 13 ("Segunda vou começar academia e acordar cedo"): ambos caem em
`INSUFFICIENT_SIGNAL`.

Há uma **tensão editorial que é decisão humana**, não bug a corrigir: o
`quandoUsar` do card descreve literalmente o cenário 13 ("lista de mudanças que
vai começar de uma vez, muitas vezes com data simbólica — *'segunda eu vou...'*"),
mas o §30 da especificação diz que o cenário 13 **não** deve virar aula de
hábitos. Se o Router passar a acionar o 13, contraria o §30; se nunca acionar, o
card é conteúdo morto na prateleira. As duas saídas são defensáveis e nenhuma é
minha pra escolher.

### F-3 · MÉDIO · CONHECIMENTO — pedido de hábito genérico não aciona tópico

"Quero criar o hábito de estudar produto todo dia, mas não consigo. O que posso
fazer?" → `INSUFFICIENT_SIGNAL`. O Router é **tópico-primeiro**: exige o tema
("largo em três dias", "sempre esqueço", "acabo me distraindo", "constância"),
e o pedido explícito sozinho não basta.

Isso é coerente com a regra de ouro ("nenhum conhecimento é melhor que
conhecimento errado") e o falso negativo é o lado certo de errar. Mas a frequência
importa: um vendedor que descreve o problema sem usar a palavra-tema fica sem
ajuda que existe na prateleira. Decisão humana: aceitar como está, ou ampliar
cobertura sabendo que isso aproxima o falso positivo.

### F-4 · BAIXO · CONHECIMENTO — objeção de vendas cai em `INSUFFICIENT_SIGNAL`

O §37 previa `DOMAIN_NOT_GOVERNED`. O resultado visível é o mesmo
(`NO_KNOWLEDGE`, nenhum card, nada atravessa o Treinador), mas o **motivo
registrado é outro**. Importa porque é justamente o motivo que um dia vai
decidir "isto é assunto do Treinador, encaminhe".

### F-5 · OBSERVAÇÃO · CONHECIMENTO — o §52 não chega a testar `quandoNaoUsar`

Os dois cenários de contraindicação (21: ambiente que ela não controla; 22: já é
regular e quer progredir) caem em `INSUFFICIENT_SIGNAL` — o Router silencia
antes. Ou seja: hoje a contraindicação é protegida **a montante**, e o provider
nunca é posto à prova nela.

Testar `quandoNaoUsar` de verdade exigiria um cenário que **acione** um card e só
então revele a contraindicação, o que na prática só acontece em conversa
multiturno real. Fica anotado como desenho a melhorar na bateria quando ela
rodar de verdade — não como correção de produto.

### F-6 · BAIXO · TÉCNICO — estado de dev contamina a bateria

`VEND001` tem conquista pendente, então o turno dele é ocupado por intervenção
estruturada e o conhecimento espera. Isso é o produto **certo** ("um assunto por
vez" é soberano), mas faz a bateria medir a precedência em vez do cenário
pretendido. O harness passou a medir a ocupação por leitura e a rodar só nos
vendedores livres. Nada foi apagado.

### Nenhuma vulnerabilidade técnica encontrada (§66, §67)

Nada expôs dado de outro tenant, segredo ou conversa privada. A auditoria não
imprimiu nenhuma credencial. O gate do §67 passa em tudo menos no provider.

---

## 7. O que esta etapa **não** pode dizer

As dimensões A–O do §12 dependem todas de prosa real. Não há evidência nenhuma,
neste documento, sobre:

naturalidade · proporcionalidade · capacidade de perguntar antes de aconselhar ·
não-cobrança · card recitado ou usado · epistemologia na fala (ciência sem
exagero, metodologia sem virar prova, desenvolvimento pessoal sem virar verdade) ·
persona coerente · transições de modo · terapia/diagnóstico na resposta ·
motivação vazia · frieza · variação entre execuções.

A camada determinística decide **se** o conhecimento entra e **qual** card entra.
Ela não decide **como** o Conselheiro fala — e é o "como" que a 2C.6 existe pra
avaliar.

Além disso, **25 dos 38 turnos tiveram a intenção classificada por LLM**, e o LLM
de hoje é o Mock. Esses 25 são provisórios: podem mudar com provider real. Os 13
determinísticos são função pura do texto e estão fechados.

---

## 8. Efeitos colaterais desta etapa

- 2 execuções a seco escreveram registros `AIUsage` de especialista `COACH`
  com provider `mock` e **custo US$ 0,00** — o classificador de intenção é uma
  chamada de gateway de verdade (registrada como `COACH` no ledger), e a seco
  ela vai ao Mock.
- 1 registro `ADMIN_AI_TEST` da verificação da credencial OpenAI (falhou em
  `auth`, custo US$ 0,00).
- `buildCoachContext` executa `reconciliarConclusoes`, que pode fechar sugestões
  já cumpridas — comportamento idêntico ao de qualquer turno real. Não foi
  suprimido de propósito: um pipeline paralelo "só pra avaliar" seria um segundo
  motor de comportamento, que é o erro que este projeto já pagou antes.
- Nenhuma `CoachMessage`, `CoachIntervention`, `ProfessionalMemory` ou
  `KnowledgeCard` foi criada, editada ou apagada.

---

## 9. Próximos pontos **a decidir** (sem implementar)

1. **Configurar a credencial Anthropic** por Admin > IA e escolher entre
   `claude-sonnet-5` (US$ ~0,24 a bateria) e `claude-opus-5` (US$ ~0,60). O
   modelo do Conselheiro nunca foi escolhido — é decisão em aberto, não dívida.
2. **F-1 primeiro.** Reconfirmar a classificação da insônia com provider real
   antes de qualquer outra leitura do relatório.
3. **F-2: o sexto card.** Alcançá-lo contraria o §30; não alcançá-lo o deixa
   morto. Escolher.
4. **F-3: cobertura do Router.** Aceitar o falso negativo frequente, ou ampliar
   sabendo o que se aproxima.
5. **F-5: desenhar cenários de `quandoNaoUsar`** que acionem card antes de
   revelar a contraindicação.
6. **Citação de fonte sob demanda** ("de onde você tirou isso?") continua sem
   mecanismo dedicado — registrado desde a 2C.5, ainda fora de escopo.

---

## 10. Prontidão para homologação humana

**A avaliação qualitativa não foi executada.** Não há como declarar nada sobre a
qualidade do Conselheiro como conselheiro, e este documento não declara.

O que está homologável agora é apenas o **preparo**: a bateria está montada,
validada a seco contra o pipeline real, com custo medido e metadados capturados,
e roda com um comando assim que houver credencial. E seis achados já existem sem
ter gasto nada — um deles (F-1) sério o bastante para ser a primeira coisa a
olhar quando a avaliação rodar.
