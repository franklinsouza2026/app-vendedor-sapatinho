# Engajamento, check-in diário, XP e VendaCoins

> Implementado em 04/10/2026. Backend (Postgres/Prisma/Express) + app real (`/`, `/ganhos`) + Admin real (`/admin/engajamento`, `/admin/gamificacao?aba=recompensa`).
> O protótipo `/fase1` continua mockado; este backend é o que ele vai consumir na etapa de conexão.

## 1. Conceitos — separados no modelo e na tela

| Conceito | O que é | Onde vive | NÃO é |
|---|---|---|---|
| **Acesso** | abriu o app no dia | `AcessoDiario` (1 linha por vendedor por dia local) | prova de que vende bem |
| **Engajamento** | fez uma ação relevante | `EventoEngajamento` | acesso |
| **XP** | evolução/status; acumula, não se gasta | `XpTransacao` (ledger já existente) | moeda |
| **VendaCoins** | moeda; acumula, futuramente trocável | `MoedaTransacao` (ledger já existente) | XP |
| **Resultado** | venda/meta | `IndicadorRealizado` (inalterado) | — |

O painel do Admin diz isso explicitamente: “Acesso mede adoção — não mede resultado de vendas”.

## 2. Diagnóstico do que existia

- Ledgers imutáveis de XP e VendaCoins (`XpTransacao`, `MoedaTransacao`), com `idempotencyKey` única. **Reaproveitados**, sem sistema paralelo.
- Enum `TipoEventoGamificacao.CHECKIN_DIARIO` e régua v1 com `CHECKIN_DIARIO: 5` XP. Esse "check-in" é o **check-in de humor do Conselheiro**. A Constituição do Conselheiro (§12) proíbe que ele vire recompensa, então ele **não foi usado**. Criado `ACESSO_DIARIO`, um conceito diferente.
- Streak existente (`StreakVendedor`) = dias seguidos **batendo a meta**, com `vendedorId @unique`. Não serve para sequência de acesso, por isso a sequência de acesso é calculada de `AcessoDiario`. As duas aparecem separadas na Home.
- Escopo: `requireAuth` revalida status e papel no banco a cada request; gerente tem uma loja (`Vendedor.lojaId`); Admin é escopado por `empresaId` do token.
- **Timezone: não havia regra.** `inicioDoDia()` usa o fuso do processo (`setHours(0)`). Em servidor UTC, 21h em Pernambuco viraria "amanhã".
- Sem escala de trabalho no backend (calendário só existe no protótipo mock).
- Nenhuma telemetria de acesso; o feed (`publicarEventoFeed`) é social, não analítico.

## 3. Arquitetura adotada

```
App aberto / volta ao primeiro plano
  └─ POST /engajamento/acesso  (sem corpo útil — o cliente não decide nada)
       └─ registrarAcesso(vendedorId, agora)                         [servidor]
            dia = diaLocal(agora, Empresa.timezone)
            TRANSAÇÃO:
              INSERT acesso_diario … ON CONFLICT (vendedorId, dia)
                DO UPDATE ultimoAcesso, quantidade+1
                RETURNING (xmax = 0) AS inserido
              se inserido E config.ativo:
                XpTransacao  (ACESSO_DIARIO, idempotencyKey acesso-diario:{vendedor}:{dia})
                MoedaTransacao (idem)
                acesso_diario.recompensaConcedida = true, xp/moedas concedidos
```

**Garantia de no máximo uma recompensa por dia:**
1. o índice único `acesso_diario(vendedorId, dia)`;
2. só quem **inseriu** concede a recompensa;
3. a `idempotencyKey` única nos dois ledgers.

Resiste a refresh, várias abas, vários aparelhos, logout/login e requisições simultâneas (teste com 12 chamadas paralelas: 1 recompensa).

## 4. Schema / migration

`prisma/migrations/20261004120000_engajamento_acesso_diario`, **puramente aditiva**:

| Mudança | Detalhe |
|---|---|
| `empresa.timezone` | TEXT, default `America/Sao_Paulo` (UTC−3, mesmo fuso de PE) |
| enum `TipoEventoGamificacao` | + `ACESSO_DIARIO` |
| enum `TipoEventoEngajamento` | `MISSAO_CONCLUIDA`, `DESAFIO_CONCLUIDO`, `AULA_CONCLUIDA`, `QUIZ_APROVADO`, `SIMULACAO_CONCLUIDA` |
| `acesso_diario` | `@@unique(vendedorId, dia)`; índices `(empresaId, dia)` e `(empresaId, lojaId, dia)` |
| `config_recompensa_acesso` | uma por empresa; sem linha = recompensa **desligada** |
| `evento_engajamento` | `chave` única = tipo + vendedor + referência |

## 5. Endpoints

| Método | Rota | Quem | O que faz |
|---|---|---|---|
| POST | `/engajamento/acesso` | VENDEDOR ativo | registra o acesso e o check-in; ignora qualquer valor do corpo |
| GET | `/engajamento/meu` | VENDEDOR | hoje, recompensa de hoje, configuração vigente, sequência, semana |
| GET | `/engajamento/painel` | ADMIN, GERENTE | KPIs, série diária, lojas, lista nominal. Filtros: `periodo` (HOJE, SEMANA_ATUAL, ULTIMOS_7, SEMANA_PASSADA, ULTIMOS_30, PERSONALIZADO até 92 dias), `de`, `ate`, `lojaId`, `vendedorId` |
| GET/PUT | `/admin/engajamento/config` | ADMIN | liga/desliga; XP e VendaCoins inteiros de 0 a 1000; auditado (`ENGAGEMENT_REWARD_CONFIG_UPDATED`) |
| GET | `/gamificacao/meus-ganhos` | autenticado | XP e VendaCoins do próprio usuário, só transações reais, agrupadas por evento |

## 6. Regras

| Tema | Regra |
|---|---|
| Check-in | primeiro acesso do dia local da empresa; recompensa = configuração vigente **no momento** do primeiro acesso. Mudança do Admin vale no próximo dia (não retroage). Desligada: registra acesso, sem XP/VendaCoins. XP 0 ou VendaCoins 0: não cria linha no ledger daquela moeda |
| Elegíveis | papel VENDEDOR e status ACTIVE. Pendente, bloqueado e desligado ficam fora do denominador; o histórico deles permanece |
| Frequência "X de Y dias" | Y = dias válidos já decorridos no período, a partir da admissão (`createdAt`). Quarta-feira com acessos seg/qua = 2 de 3 (nunca 2 de 7) |
| Dias válidos | hoje todo dia corrido é válido (sem escala no sistema). `ehDiaValido` é o ponto único para trocar por escala/calendário |
| Semana | comercial, segunda → domingo |
| Sequência (streak) | dias consecutivos com acesso; sem acesso hoje, a sequência de ontem continua viva até o fim do dia; janela de 400 dias. Sem bônus por sequência (medir primeiro) |
| Engajamento | registrado no servidor quando a ação conclui de verdade: missão, desafio, aula (1ª conclusão), quiz (1ª aprovação), simulação encerrada. Best-effort: falha não quebra a ação. Idempotente |

## 7. Segurança e escopos

| Perfil | O que vê |
|---|---|
| VENDEDOR | só os próprios dados; nenhuma rota aceita id vindo do cliente |
| GERENTE | só a própria loja, lida do banco; pedir outra loja → 403 |
| ADMIN | só a própria empresa; loja ou vendedor de outra empresa → 404 |

- O cliente nunca envia data, valor ou "primeiro acesso"; o saldo é sempre a soma do ledger.
- Conversa com o Conselheiro **não é instrumentada** (§8).

## 8. Decisão pendente do produto

**Mostrar ao Admin "interações com o Coach IA" por vendedor?** A Constituição do Conselheiro §12 garante que nenhuma rota de gerente ou Admin toca a conversa privada (e proíbe indicadores derivados dela). A contagem de uso não é conteúdo, mas expõe o uso do espaço privado. Não instrumentado até decisão explícita.

## 9. Limitações reais

- Sem escala/folga/feriado no backend: domingo com loja fechada conta como dia válido e pode quebrar a sequência.
- Fuso explícito só no engajamento. Metas, missões e streak de meta continuam com o fuso do servidor (risco pré-existente; corrigir pede uma rodada própria com testes de regressão).
- Histórico de engajamento começa agora (sem backfill de missões/aulas antigas).
- Admission = `Vendedor.createdAt` (data de cadastro no sistema, não a data de contratação).
- Uma loja por gerente (modelo atual); "lojas autorizadas" múltiplas não existem no schema.
- Correlação uso × vendas não implementada (preparada: mesma chave vendedor + dia).

## 10. Preparado para evolução

- `ehDiaValido` (escala/calendário), `Empresa.timezone` por empresa e enum de eventos extensível.
- Ledger pronto para novas origens (campanha, bônus, ajuste do Admin com lançamento compensatório).
- `AcessoDiario` guarda a loja do dia (análise por loja mesmo após transferência).

## 11. Homologação local

```bash
docker compose -f docker-compose.dev.yml up -d
npx prisma migrate deploy                    # (dev atual foi criado via db push: use npx prisma db push)
npm run seed:engajamento-demo                # histórico de demo (origem SEED_DEMO), recompensa +5/+2
npx tsx --env-file=.env src/server.ts        # API em http://localhost:3010
cd web && npm run dev                        # app em http://localhost:5173
```

| Perfil | Loja | Matrícula | Senha |
|---|---|---|---|
| Vendedora | LOJA001 | VEND001 | vendedor123 |
| Admin | LOJA001 | ADM001 | admin123 |

Para remover os dados de demo: `npm run seed:engajamento-demo -- --limpar`.
