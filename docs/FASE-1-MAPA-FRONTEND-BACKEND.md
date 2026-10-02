# Fase 1: mapa frontend → backend

> Ponte para a próxima etapa (**auditar backend → conectar → testar E2E → piloto**).
> Para cada informação exibida pela Fase 1: de onde ela viria, se já existe e qual regra ainda está pendente.
> Contrato de dados das telas: `web/src/fase1/dominio/tipos.ts` (`Fase1Dados`). Mock atual: `web/src/fase1/demo/cenarios.ts`.

Legenda: **✅ Pronto** = endpoint atual entrega o dado · **🟡 Parcial** = existe, mas falta campo, recorte ou regra · **❌ Ausente** = não existe no backend.

## Identidade e status

| Tela / componente | Dado | Situação | Endpoint atual | Mock usado | Regra pendente |
|---|---|---|---|---|---|
| Home: cabeçalho | Nome, loja, empresa | ✅ | `GET /auth/me` (sessão) | `vendedor`, `lojas` | — |
| Perfil | Data de admissão | ❌ | — | `admitidoEm` | Origem (ERP? cadastro?) |
| Home: rodapé, banner | Hora do último sync do ERP | ✅ | `GET /metas/minhas` → `sincronizadoEm` | `status.sincronizadoEm` | — |
| Banner | Sync atrasado | 🟡 | derivável de `sincronizadoEm` | `status.desatualizado` | Limite de atraso (ex.: > 90 min) |
| Ranking | Ranking indisponível | 🟡 | ranking vazio hoje | `status.rankingDisponivel` | Distinguir "sem dado" de "atrasado" |
| Home | Dia de folga | ❌ | — | `status.diaDeFolga` | Escala de trabalho |
| Home | Loja fechada (feriado) | ❌ | — | `status.lojaFechada` | Calendário da loja |
| Layout | Offline | ✅ (navegador) | `navigator.onLine` | `status.offline` | Cache offline de dado autenticado (hoje proibido por design) |

## Metas e ritmo

| Tela / componente | Dado | Situação | Endpoint atual | Mock usado | Regra pendente |
|---|---|---|---|---|---|
| Meta de hoje / Meu ritmo | Meta do dia e do mês | ✅ | `GET /metas/minhas` → `progresso[DIA|MES].metaFaturamento` | `hoje.meta`, `mes.meta` | — |
| Meta de hoje | Faturamento do dia/mês | ✅ | idem → `realizado.faturamento` | `realizado.faturamento` | — |
| Meta de hoje | Falta | ✅ | idem → `faltaParaMeta` | derivado | — |
| Ticket / PA | Ticket médio e PA do período | ✅ | idem → `realizado.ticketMedio`, `realizado.pa` | `realizado.ticketMedio/pa` | — |
| Indicadores, Plano de hoje | **Nº de vendas** do período | 🟡 | idem → `realizado.numAtendimentos` (é contagem de vendas?) | `realizado.vendas` | Confirmar semântica de `numAtendimentos` |
| Indicadores, Plano de hoje | **Pares** do período | ❌ | — (derivável de PA × vendas) | `realizado.pares` | Expor pares diretamente |
| Estimativas | Ticket de referência | 🟡 | ticket do mês existe | `referencia` | **Qual ticket usar** (mês / 90 dias / loja) e mínimo de vendas para valer |
| Estimativas (vendedor novo) | Ticket médio da loja | ❌ | — | `referencia.origem = 'LOJA'` | Agregado por loja |
| Corrida do mês, Meu ritmo | Dias de trabalho restantes / trabalhados | ❌ | — (front atual usa dias corridos) | `mes.diasTrabalhoRestantes`, `diasTrabalhados` | **Cadastro de escala** |
| Meu ritmo | Projeção do mês | 🟡 | derivável | derivado | Depende de dias de trabalho |
| Barra de meta | Marcos 100/110/120/150% | ✅ | regras do ledger (`META_DIARIA_*`) | `MARCOS_META` | — |
| Indicadores | Período comparável (mês anterior até o mesmo dia) | ❌ | — | `comparavel` | Definir "comparável" (dia do mês? dias úteis?) |
| Indicadores: Histórico | Meses anteriores (faturamento, meta, ticket, PA) | ❌ | — | `historico` | Endpoint de histórico mensal |
| Indicadores | Evolução (p.p.) | 🟡 | ranking `EVOLUCAO` existe (baseline) | derivado | Alinhar com o baseline do motor |
| Indicadores | Conversão | ❌ **não exibir** | — | — | Sem denominador de atendimentos sem venda |

## Ranking e comparativos

| Tela / componente | Dado | Situação | Endpoint atual | Mock usado | Regra pendente |
|---|---|---|---|---|---|
| Ranking loja/geral | Posição e valor por métrica | ✅ | `GET /gamificacao/ranking?tipo=&escopo=LOJA|REDE` | `rankings.loja/geral` | — |
| Ranking | Distância para quem está acima | ✅ | idem → `gapParaAnterior` | derivado | — |
| Ranking | Faturamento de colegas oculto | ✅ | idem → `valor = null` | regra mantida | — |
| Ranking | **Variação de posição (↑↓)** | ❌ | — | `posicaoAnterior` | Snapshot da posição anterior (ontem? semana?) |
| Ranking geral | Loja de cada vendedor | 🟡 | `escopo=REDE` não devolve a loja | `pessoas[].lojaId` | Incluir `loja` na linha |
| Ranking | **Consistência** | ❌ | — | `CONSISTENCIA` | Definir métrica (dias de meta batida?) |
| Ranking | Elegibilidade (vendedor novo) | 🟡 | regra fixa por papel/status | filtro `novo` | **Período de adaptação** |
| Loja × Loja | Pontos por loja | ❌ | — (só competição `participantType=STORE`) | `rankings.lojas` | **Fórmula do score entre lojas** |
| Comparar | Média da loja/empresa por métrica | 🟡 | derivável do ranking (exceto R$ alheio) | derivado | Agregado no backend sem expor valores individuais |
| Home: Sua posição | Métrica da corrida | 🟡 | ranking `FATURAMENTO` | Vendas (R$) | **Vendas ou Score Geral?** |

## Próximo Alvo

| Tela / componente | Dado | Situação | Endpoint atual | Mock usado | Regra pendente |
|---|---|---|---|---|---|
| ⚡ Próximo alvo / Você está perto | Lista priorizada de alvos | ❌ | — | derivado no front (`alvos.ts` + `proximoAlvo.ts`) | **Regra de prioridade**; mover para backend determinístico |

## Missões, competições e campanha

| Tela / componente | Dado | Situação | Endpoint atual | Mock usado | Regra pendente |
|---|---|---|---|---|---|
| Missões | Missões ativas/histórico | 🟡 | `GET /missoes/ativas`, `/missoes/historico`, `/desafios/ativos` | `missoes` | Motor só tem missões de **treinamento** (`actionType`) |
| Missões | Missões de **venda** (categoria, referência, pares, ticket, consistência) | ❌ | — | `missoes[].tipo/unidade/produtos` | Critérios do motor + leitura de itens vendidos |
| Missões | Recompensa XP/VendaCoins | 🟡 | `recompensa.service` | `recompensa` | — |
| Competições | Lista, período, status | ✅ | `GET /competicoes` | `competicoes` | — |
| Competições | Classificação e minha posição | ✅ | `GET /competicoes/:id` → `ranking` | `participantes` | Nome do participante na linha |
| Competições | Duelo vendedor × vendedor | ❌ | — | `tipo = 'DUELO'` | Novo tipo |
| Competições | Categoria (ex.: salto) | ❌ | `metricType` fixo | `tipo = 'CATEGORIA'` | Métrica por categoria de produto |
| Competições | Prêmio descritivo ("café da manhã") | 🟡 | `rewardXp/rewardMoedas/rewardBadgeCodigo` | `premio` | Campo de prêmio livre |
| Campanha | Programa com frentes | ❌ | (Temporada ≈ agrupador) | `campanha` | **Entidade Campanha** ou Temporada estendida |
| Admin | Criar campanha / missão de venda | ❌ | — | UX simulada | Depende das entidades acima |

## Progressão e recompensas

| Tela / componente | Dado | Situação | Endpoint atual | Mock usado | Regra pendente |
|---|---|---|---|---|---|
| Cabeçalho, XP e nível | XP total, nível, próximo nível | ✅ | `GET /gamificacao/carteira` → `xp`, `nivel` | `xp.total` + `niveis.ts` | — |
| XP | Histórico de XP por origem | ❌ | — (só extrato de moedas) | `xp.historico` | Extrato de XP |
| VendaCoins | Saldo e extrato | ✅ | `GET /gamificacao/carteira`, `/gamificacao/extrato-moedas` | `moedas` | — |
| VendaCoins | Vitrine de recompensas | ❌ | — | estático, "em breve" | Catálogo e resgate (sem conversão em R$) |
| Admin | Ajuste manual XP/VendaCoins | ❌ | rótulo `AJUSTE_MANUAL` existe só no front | — | Endpoint auditado |
| Perfil | Sequência atual/maior | ✅ | `GET /gamificacao/streak` | `sequencia` | Confirmar critério ("meta batida", não "abrir app") |
| Conquistas | Badges conquistadas | ✅ | `GET /gamificacao/badges` | `conquistas` (CATALOGO) | — |
| Conquistas | Badges **a conquistar** + "quanto falta" | ❌ | — | `falta`, `progresso` | Catálogo completo + progresso |
| Conquistas | Badges propostas (110/120/150%, Número 1, Quebra-recorde) | ❌ | — | `origem = 'PROPOSTA'` | Aprovar e incluir no catálogo |
| Recordes | Melhor dia/mês, maior venda, melhor PA, maior sequência, melhor posição, maior % | ❌ (parcial: maior sequência) | `/gamificacao/streak` → `maiorStreak` | `recordes` | Endpoint de recordes pessoais |
| Celebrações | Eventos a celebrar | ❌ | — | `celebracoes` | Fila de eventos "não vistos" por vendedor |

## Feed e reconhecimento

| Tela / componente | Dado | Situação | Endpoint atual | Mock usado | Regra pendente |
|---|---|---|---|---|---|
| Acontecendo agora | Eventos | 🟡 | `GET /feed` | `feed` | Eventos de performance (subiu de posição, bateu meta, recorde) |
| Reconhecimentos | Lista do vendedor | ✅ | `GET /reconhecimentos` | `reconhecimentos` | Campo título |
| Admin: Reconhecer | Admin reconhecer vendedor | ❌ | só GERENTE: `POST /equipe/:id/reconhecimentos` | UX simulada | Permissão para ADMIN |

## Admin: o que já existe

| Capacidade | Situação | Tela atual |
|---|---|---|
| Vendedores | ✅ | `/admin/usuarios` |
| Lojas | ✅ | `/admin/estrutura` |
| Metas | ✅ (sem importação em lote) | `/admin/metas` |
| Temporadas, Ligas | ✅ | `/admin/gamificacao` |
| Competições, Premiações | 🟡 | `/admin/gamificacao` |
| XP, VendaCoins, Badges, Elegibilidade | 🟡 (em código, sem tela) | — |
| Campanhas, Missões de venda, Reconhecimento pelo Admin | ❌ | — |

## Ordem sugerida de conexão

1. Ligar o que está ✅ (metas, ranking, carteira, extrato, streak, badges, competições, reconhecimentos), trocando `montarCenario()` por um carregador real que monta `Fase1Dados`.
2. Decidir as regras de produto (ticket de referência, métrica da corrida, prioridade do alvo, elegibilidade).
3. Backend 🟡: nº de vendas/pares, loja na linha do ranking, variação de posição, histórico mensal, extrato de XP.
4. Backend ❌ do piloto: escala/dias de trabalho, Loja × Loja, recordes, missões de venda, Campanha, reconhecimento pelo Admin.
