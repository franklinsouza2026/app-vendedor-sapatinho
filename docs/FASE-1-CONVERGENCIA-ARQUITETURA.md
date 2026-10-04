# Fase 1 — Arquitetura da convergência (protótipo homologado → produto real)

> Fonte de verdade técnica desta rodada. Complementa `FASE-1-AUDITORIA-PRONTIDAO-PILOTO.md` (gaps) e aplica as decisões congeladas **D1–D11** e **T1–T8**.
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

## 11. Ambientes (T7)

- `NODE_ENV=production` exige:
  - `CORS_ORIGINS`, `TRUST_PROXY_HOPS ≥ 1`;
  - chaves de criptografia;
  - `ERP_MODE ≠ controlado`;
  - seed demo bloqueado.
- Deploy: `docker compose` com serviço `migrate` (`prisma migrate deploy`) antes da API, Caddy com HTTPS e Postgres/Redis sem porta pública.
- Seed separado:
  - `seed:configuracao` é idempotente e sem pessoas;
  - `seed` (demo) recusa produção.
- E2E: banco próprio `app_vendedor_sapatinho_e2e`, API própria e Vite próprio. Nunca toca o banco de DEV.
