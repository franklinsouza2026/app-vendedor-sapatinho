# Fase 1 — Arquitetura da convergência (protótipo homologado → produto real)

> Fonte de verdade técnica desta rodada. Complementa `FASE-1-AUDITORIA-PRONTIDAO-PILOTO.md` (gaps) e aplica as decisões congeladas **D1–D12** e **T1–T8**.
> Regra de ouro: **frontend apresenta, backend decide.** Nada que mexa em dinheiro, posição, prêmio, recompensa ou elegibilidade é calculado no cliente.

## 1. Princípios de convergência

1. **Reaproveitar → conectar → completar → construir**, nessa ordem. Nenhum sistema paralelo:
   - um ledger de XP e um de VendaCoins (os existentes);
   - um motor de ranking (o existente, completado);
   - um modelo de competição (o existente, completado);
   - um modelo de missão (o existente, completado com missões governadas);
   - um feed;
   - um cadastro de usuários.
2. **A experiência homologada (`web/src/fase1`) passa a ser o app.**
   - `/` é o app da vendedora e `/admin` é a central do Admin, com o design homologado preservado.
   - O app anterior (Conselheiro, Evoluir, Universidade, Treinador, Simulador, painel do gerente) continua no código, mas só é montado com `VITE_MODULOS_LEGADOS=true` no front e `MODULOS_LEGADOS_ATIVOS=true` na API.
   - No piloto (padrão), essas rotas não existem: nem na tela, nem na API.
3. **Encaixe de dados.** As telas do vendedor só conhecem `Fase1Dados` (`fase1/dominio/tipos.ts`).
   - Em produção, quem o preenche é `GET /app/painel`, montado no servidor.
   - O mock de cenários (`fase1/demo`) fica restrito a testes e à rota `/demo` em DEV. Nunca entra no bundle de produção: o import dinâmico é condicionado a `import.meta.env.DEV`.
4. **Tempo por empresa.** `Empresa.timezone` (padrão `America/Sao_Paulo`) define o "dia".
   - Toda borda de dia, mês e semana passa por `src/tempo/`.
   - O fuso do processo deixa de importar (container UTC não vira o dia às 21h).

## 2. Vendas (D1, D4) — contrato do ERP Adapter

```
ErpAdapter.buscarEventos({ empresa, lojas[], desde, ate }) → EventoErp[]

EventoErp =
  | { tipo: 'VENDA', idExterno, lojaExterna, vendedorExterno, ocorridoEm, valor, itens[] }
  | { tipo: 'CANCELAMENTO', idExterno, vendaIdExterno, ocorridoEm }
  | { tipo: 'DEVOLUCAO', idExterno, vendaIdExterno, ocorridoEm, itens[] }

Item = { referencia, descricao, categoria?, quantidade, pares, valor }
```

### Pipeline
`ingerirEventos` faz, nesta ordem:
1. Normaliza: resolve loja e vendedor pelo vínculo da integração.
2. Grava de forma idempotente:
   - `Venda` com `@@unique([empresaId, idExterno])`;
   - `VendaAjuste` com `@@unique([empresaId, idExterno])`.
3. Recalcula o agregado diário `IndicadorRealizado` dos dias afetados. O agregado deixa de ser um snapshot horário: é um por vendedor por dia local, derivado das vendas.
4. **Reconcilia** os derivados do vendedor nos dias e períodos afetados: tiers de meta, sequência, missões, recordes e feed.
5. Recalcula o ranking do mês.

### Regras de estorno
- **Cancelamento:** a venda inteira deixa de contar.
- **Devolução:** os itens devolvidos deixam de contar.
- Os dois corrigem o **dia da venda original**. A realidade é refletida quando o evento chega.
- Nada é apagado: a venda fica com `status`, e o ajuste fica registrado.

### Adapters e uso fora do piloto
- `MockErpAdapter` (DEV) gera vendas determinísticas.
- `ControladoErpAdapter` (testes/E2E) recebe eventos injetados.
- `LinxErpAdapter` continua sendo só o ponto de encaixe. **Não é tocado nesta rodada.**
- Os agregados legados (`numAtendimentos`, `pa`, `ticketMedio`) continuam alimentando os módulos fora da Fase 1 sem mudança de contrato.

## 3. Reconciliação de recompensas (D4, T4)

Uma função única, `reconciliarRecompensa(chave, devida, valores)`, decide a partir do **estado devido**, calculado dos fatos, e não de "evento aconteceu":

| Situação | O que faz |
|---|---|
| Devida e o saldo líquido da chave é 0 | concede uma nova geração (`…-g{n}`) |
| Não devida e o saldo líquido é > 0 | lança estorno compensatório (`REVERSAO`) de XP **e** de VendaCoins |
| Já está no estado devido | não faz nada (idempotente, inclusive com cancelamento repetido) |

Garantias:
- Executa sob `pg_advisory_xact_lock` por vendedor: um evento lógico gera uma consequência, mesmo com chamadas concorrentes.
- Vale para tier de meta diária, sequência, missão, prêmio de campanha e prêmio de competição.
- O feed ligado a um derivado revertido é marcado `revogadoEm`: some da lista, mas fica no banco.
- Badge revertido também recebe `revogadoEm`.

## 4. Metas e dias de trabalho (D6, D10)

- `DiasTrabalhoMes(vendedorId, mes, dias)`: o Admin informa quantos dias o vendedor trabalha no mês. Não é escala nem ponto, e domingo conta normalmente.
- **Meta diária = meta mensal ÷ dias previstos**, arredondada a centavos, calculada no backend (`src/fase1/metas`).
  - Sem meta mensal ou sem dias informados: não há meta diária, e o Admin vê a pendência.
  - Linha explícita `Meta(periodo=DIA)` antiga só é usada como fallback legado.
- **Dias trabalhados até ontem** = dias do mês com ao menos uma venda válida.
- **Dias restantes depois de hoje** = max(0, previstos − trabalhados até ontem − 1).

## 5. Ranking (D9)

- Período principal: **mês corrente**, calculado dos agregados.
- Também são calculados o dia e a métrica escolhida pelo Admin.
- **Desempate:**
  1. métrica principal (faturamento em R$ no ranking principal);
  2. **mais acessos ao app no mês** (`AcessoDiario.quantidadeAcessos` somado);
  3. **maior ticket médio**.

  Se os três empatarem, **o empate permanece**: mesma posição.
- A posição anterior (↑↓) vem do snapshot do mês fechado no dia anterior: há um snapshot por dia e não se apaga o histórico.
- Elegibilidade: vendedor `ACTIVE` + papel `VENDEDOR` + `elegivelRanking`. Exceção manual exige motivo e é auditada.
- **Loja × Loja:** fórmula escolhida pelo Admin, uma das três:
  - **% da meta coletiva**: Σ faturamento ÷ Σ metas;
  - **média do score**;
  - **evolução coletiva**: pontos percentuais do % meta contra o mesmo dia do mês anterior.
- Privacidade preservada: o valor em R$ de colegas nunca sai do servidor.

## 5.1 PA — Peças por Atendimento (D12, congelada em 2026-10-05)

- **PA = peças válidas vendidas ÷ atendimentos válidos.** Não é "pares por atendimento".
- **Peça** = cada unidade comercial registrada na quantidade do item: 1 calçado = 1 peça, 1 bolsa = 1 peça, 2 unidades = 2 peças. Não há conversão calçado→par.
- **Atendimento** = venda/documento válido (contrato atual). A equivalência com o documento Linx será homologada com dado real.
- Cancelamento e devolução compensam pelos fatos (agregado recalculado): venda cancelada sai de peças, atendimentos e PA; devolução parcial desconta só as peças devolvidas. Nada é apagado.
- **Kit:** entra como a fonte registrar (item × quantidade). Regra definitiva com dados Linx; o ponto de ajuste é `pecasDoItem` em `src/fase1/indicadores/pa.ts` (fonte única: `calcularPa`).
- Usado em: PA do mês (ranking, painel, médias), baseline e recompensa "melhora de PA", PA de competição, recorde "Melhor PA", histórico mensal, estimativa "peças para bater a meta" e Desafio de PA (vendas com ≥ N peças).
- **Continua como par físico** (não é o indicador PA): indicador "Pares vendidos", unidade "par" das missões de produto, "pares da categoria". O parâmetro interno `minimoPares` do Desafio de PA é nome técnico legado (missões já gravadas); a semântica é peças.
- Antes da D12 havia inconsistência: o agregado diário já usava peças ÷ vendas, mas o PA do mês, a competição e o recorde usavam pares ÷ vendas.

## 6. Incentivos

| Entidade | Origem | Observação |
|---|---|---|
| **Produto** | novo `Produto` por empresa | referência, nome, categoria, preço, foto; casado com `VendaItem.referencia` |
| **Prêmio** | novo `Premio` por empresa | DIGITAL (XP/VendaCoins/badge, pelo ledger) ou EMPRESARIAL (informativo) |
| **Missão governada** | `MissionDefinition` completada | `empresaId`, `template`, parâmetros, lojas, período, `statusCiclo`, recompensa, `premioId`; progresso por vendedor em `MissionAssignment` |
| **Competição** | `Competition` completada | `empresaId`, escopo (todas / cada loja), métricas da Fase 1, prêmios, `ARCHIVED` |
| **Campanha** | nova `Campanha` + `CampanhaFrente` | orquestra competições, a meta do mês e missões; ao encerrar, congela `resultado` imutável e concede os prêmios de cada frente pelo ledger |

### Templates de missão (mecânica e limites governados no servidor)

| Template | Mecânica | Unidades permitidas |
|---|---|---|
| SPRINT_META | vendas (ou R$) no período | venda, reais |
| PRODUTO_SEMANA | pares (ou vendas) das referências escolhidas | par, venda |
| PONTA_ESTOQUE | idem, para uma seleção de produtos | par, venda |
| DESAFIO_PA | vendas com ≥ N pares no mesmo cupom | venda |
| CATEGORIA | vendas com item da categoria, ou pares da categoria | venda, par |
| SUPERACAO | dias com ticket médio do dia acima do valor definido | dia |
| CONSISTENCIA | maior sequência de dias trabalhados com meta diária batida | dia |

Limites:
- alvo de 1 a 10.000;
- XP e VendaCoins de 0 a 1.000;
- período de no máximo 92 dias.

Regras do ciclo:
- Regra crítica não muda depois de PROGRAMADA/ATIVA: para mudar, cancela e duplica.
- O status é calculado pelo servidor a partir das datas, nunca enviado pelo cliente.

## 7. Recordes (D5)

Calculados dos agregados reais:
- melhor dia;
- melhor mês;
- maior ticket (mês);
- melhor PA (mês);
- maior sequência;
- melhor posição (ranking mensal fechado);
- maior % da meta (mês).

Recorde novo de **dia fechado** publica `RECORD_BROKEN` no feed (idempotente). Se uma correção desfizer o recorde, o evento é revogado.

## 8. Multiempresa (D8)

- `empresaId` passa a existir em:
  - `Competition`, `Season`, `League`;
  - `FeedEvent`, `Recognition`;
  - todas as entidades novas.
- A migration faz backfill a partir de dados existentes.
- Toda query de leitura filtra por `empresaId` do token.
- `resolverEmpresaUnica()` deixa de ser usado no caminho da Fase 1.

## 9. Segurança (T4, T5)

- **Sessão:** `Vendedor.sessaoVersao` entra no JWT. Trocar senha, bloquear, desligar, mudar papel ou transferir de loja incrementa a versão, e o token antigo morre na hora.
- **Escopo do token:** `requireAuth` usa `empresaId`/`lojaId` **do banco**, nunca os do token.
- **Login:**
  - aceita `lojaId` (UUID global);
  - por `codigoErpLoja`, só aceita se o código for único entre empresas ativas, senão erro;
  - bloqueio por conta após 5 falhas em 15 min (Redis).
- **Deny by default:** rotas do vendedor exigem papel explícito.
- **`lojaRestritaDe`:** fail-closed, centralizado.
- **Segredos de integração:** AES-256-GCM com `INTEGRATION_SECRETS_ENCRYPTION_KEY` (env, fora do banco).
  - Resposta só mascarada (`••••••••abcd`).
  - Pode trocar, não pode revelar.
  - Nunca vai para log nem para auditoria.

## 10. Integrações e saúde (T1, T3, T6)

| Peça | Conteúdo |
|---|---|
| `Integracao` | por empresa: provedor, status, credencial cifrada, configuração não sensível |
| `IntegracaoLoja` | código externo ↔ loja |
| Vínculo de vendedor | `ExternalIdentity` (já existe) |
| `IntegracaoExecucao` | cada sync: início, fim, status, registros, erro sem segredo |
| Heartbeat do worker | `WorkerHeartbeat` a cada minuto |

**Saúde:**
- 🟢 operacional: último sync com sucesso há ≤ 90 min;
- 🟡 atenção: entre 90 min e 3 h, ou erro recente com sucesso posterior;
- 🔴 falha: mais de 3 h, worker sem heartbeat há > 5 min, ou última execução com erro.

Também entram na saúde: fila acumulada e última venda recebida.

## 11. Ambientes (T7) — estado implementado

- `NODE_ENV=production` recusa subir sem `INTEGRATION_SECRETS_ENCRYPTION_KEY`,
  com `JWT_SECRET = CPF_HASH_SECRET`, com `ERP_CONTROLADO_DIR`, com
  `MODULOS_LEGADOS_ATIVOS=true`; a API também exige `CORS_ORIGINS` e
  `TRUST_PROXY_HOPS ≥ 1`. O provedor MOCK é recusado pela API em produção.
- Deploy: `docker compose` com job `migrate` (`prisma migrate deploy`) antes
  de api/worker; Postgres e Redis sem porta no host; Redis `noeviction` + AOF.
  Guia: `docs/FASE-1-DEPLOY.md`.
- Provisionamento de empresa: `scripts/provisionar-empresa.ts` (empresa, 1ª loja,
  1º Admin, régua v1, badges) — sem dado demo. O `seed` demo e os `seed-*`
  recusam produção; os `reset-*` só rodam em banco `_e2e`/`_test` (ou com
  `PERMITIR_RESET_BANCO_DEV=1`).
- E2E: `npm run e2e:fase1` — banco `app_vendedor_sapatinho_e2e`, Redis db 3,
  API :3020, worker, Vite :5183 e build de produção em :5184. Nunca toca o DEV.

## 12. Mocks permitidos (e onde)

| O quê | Onde | Por que não chega ao piloto |
|---|---|---|
| Adapter MOCK (vendas determinísticas `DEMO-*`) | `src/integracoes/erp/mock-adapter.ts` | API recusa criar/ativar MOCK com `NODE_ENV=production` |
| Adapter CONTROLADO (arquivos JSON) | `src/integracoes/erp/controlado-adapter.ts` | exige `ERP_CONTROLADO_DIR`, proibido em produção |
| Provedor de demonstração + cenários A–X | `web/src/fase1/demo/` | só importado por testes; ausente do bundle (verificado no `dist`) |
| Seed demo (`ADM001`, `VEND001`…) | `scripts/seed*.ts` | recusa `NODE_ENV=production` |
| Fixtures E2E (`E2E-*`) | `scripts/e2e-fase1/`, `web/e2e-fase1/` | só no banco `_e2e` |
| `localStorage` | `real/ProvedorVendedor.tsx` | guarda só ids de celebração já exibidas (estado de UI, nunca dado de negócio) |

## 13. Preparação para a Linx

- Implementar `src/integracoes/erp/linx/linx-client.ts` (hoje lança
  `ErroIntegracao`) devolvendo eventos do contrato `eventoErpSchema`
  (VENDA, CANCELAMENTO, DEVOLUCAO com `idExterno` estável).
- Credencial e URL já têm onde morar (Integrações, cifrada); lojas já se
  vinculam por código externo; vendedores casam pela matrícula do ERP.
- **`LINX-INTEGRATION-DECISION`** (decidir só na integração Linx, com o contrato real em mãos): o sync busca por janela de `ocorridoEm` (cursor − 30 min).
  Se a Linx publicar vendas com atraso maior que isso, a consulta Linx deve
  ser por data de alteração/integração, não pela data da venda.
- Validar com dados reais: cancelamento/devolução parcial, vendas multi-par,
  categorias (pares × acessórios) e identidade do vendedor por loja.

## 14. Checkpoints (git)

`4e0f25d` auditoria · `b46bd29` arquitetura · `f5ad829` backend green ·
`2d53fd4` Admin/app convergidos · `a2765fe` relógio/fechamento ·
`dab9e1c` E2E E1–E25 · `b08c35f` concorrência/tempo · `7e52ba3` Security Gate ·
`1367c60` produção · `d53139a` resquícios do protótipo.
`eac0716` celebração estornada + E2E campanha/tablet · `7297f20` PWA offline/deploy ·
`99c761f` HTTPS/backup validados · tag **`restore/pre-linx-fase1`** = último
estado homologado antes da integração Linx.

Dívida técnica controlada (decisão: não fazer antes da Linx): vite 5→8,
vitest 2→4, tailwind 3→4, react-router 6→7 — vulnerabilidades só em
ferramentas de dev/build; no bundle, react-router moderada não explorável
(sem navegação por destino vindo da URL, sem SSR).

Rollback de aplicação: checkout da tag anterior + rebuild (migrations aditivas);
de dados: dump `pg_dump` antes de cada atualização (`docs/FASE-1-DEPLOY.md`).
