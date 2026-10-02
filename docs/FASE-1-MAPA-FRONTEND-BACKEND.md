# Fase 1 — Mapa frontend → backend

> Ponte para o **gap analysis de backend** (que só começa depois da homologação humana).
> Para cada informação ou ação da Fase 1: onde aparece, se o backend já tem, qual endpoint, o mock usado e a regra pendente.
> Contratos: `web/src/fase1/dominio/tipos.ts` (`Fase1Dados`, visão da vendedora) e `web/src/fase1/demo/estado.ts` (`EstadoDemo`, configuração do Admin).

Legenda: **✅ Pronto** · **🟡 Parcial** · **❌ Ausente**. "Mock" aponta o campo em `estado.ts` (E) ou `cenarios.ts` (C).

## A. Vendedor — leitura

| Tela / componente | Informação | Backend | Endpoint atual | Mock | Regra pendente |
|---|---|---|---|---|---|
| Home · cabeçalho | Nome, loja, empresa | ✅ | `GET /auth/me` | E `vendedores` | — |
| Home · cabeçalho | Nível, XP | ✅ | `GET /gamificacao/carteira` | C `xpTotal` | — |
| Home · cabeçalho | VendaCoins | ✅ | `GET /gamificacao/carteira` | C `moedas.saldo` | — |
| Meta de hoje / Meu ritmo | Meta do dia e do mês | ✅ | `GET /metas/minhas` | E `metas.individuais` | Regra da meta diária (§D) |
| Meta de hoje | Realizado, falta | ✅ | `GET /metas/minhas` | C `hoje/mes.realizado` | — |
| Meta de hoje | Marcos 100/110/120/150 | ✅ | ledger `META_DIARIA_*` | — | — |
| Estimativas | Ticket/PA de referência | 🟡 | `realizado.ticketMedio/pa` | C `referencia` | Qual ticket (mês / 90 dias / loja) e mínimo de vendas |
| Estimativas (novo) | Ticket médio da loja | ❌ | — | C `referenciaOrigem=LOJA` | Agregado por loja |
| Indicadores | Nº de vendas | 🟡 | `realizado.numAtendimentos` | C `realizado.vendas` | Confirmar semântica |
| Indicadores | Pares | ❌ | — | C `realizado.pares` | Campo próprio |
| Indicadores | Período comparável | ❌ | — | C `comparavel` | Definir "comparável" |
| Indicadores · Histórico | Meses anteriores | ❌ | — | C `historico` | Endpoint mensal |
| Corrida / Meu ritmo | Dias válidos restantes | ❌ | — | E `calendario` | **Calendário operacional** (§D) |
| Corrida / Meu ritmo | Dias trabalhados pela vendedora | ❌ | — | C `diasTrabalhados` | Derivar das vendas do ERP |
| Ranking | Posição, valor, distância | ✅ | `GET /gamificacao/ranking` | C perfis | — |
| Ranking | Faturamento de colegas oculto | ✅ | `valor = null` | regra mantida | — |
| Ranking | Variação ↑↓ | ❌ | — | C `tendencia` | Snapshot de posição anterior |
| Ranking geral | Loja do vendedor na linha | 🟡 | `escopo=REDE` sem loja | E `vendedores.lojaId` | Incluir loja |
| Ranking | Consistência | ❌ | — | C perfis | Definir métrica |
| Ranking | Métricas liberadas / corrida | ❌ | — | E `rankings` | Config por empresa |
| Loja × Loja | Pontos por loja | ❌ | — | C `pontosLojas` | **Fórmula** (§D) |
| Próximo alvo / perto | Alvos priorizados | ❌ | — (derivado no front) | `alvos.ts` | Prioridade; mover para backend determinístico |
| Missões | Missões de venda | ❌ | `GET /missoes/ativas` só treinamento | E `missoes` | Critérios de venda + leitura de itens vendidos |
| Missões | Progresso | 🟡 | `progressoAtual/Alvo` | E `progressoDemo` + simulação | Contagem por item vendido |
| Competições | Lista, status, período | ✅ | `GET /competicoes` | E `competicoes` | — |
| Competições | Classificação | ✅ | `GET /competicoes/:id` | derivado | Nome na linha |
| Competições | Duelo, categoria | ❌ | — | E `tipo` | Novos tipos |
| Campanhas | Campanha com frentes | ❌ | (Temporada ≈) | E `campanhas` | **Entidade Campanha** |
| Campanhas | Resultado e ganhos | ❌ | — | E `resultado/meusGanhos` | Fechamento automático |
| Prêmios | Prêmio por frente/competição | 🟡 | `rewardXp/Moedas/Badge` | E `premios` | Prêmio empresarial descritivo |
| XP | Histórico por origem | ❌ | — | C `xpHistorico` | Extrato de XP |
| VendaCoins | Extrato | ✅ | `GET /gamificacao/extrato-moedas` | C `moedas.historico` | — |
| Sequência | Atual / maior | ✅ | `GET /gamificacao/streak` | C `sequencia` | Critério = meta batida |
| Conquistas | Conquistadas | ✅ | `GET /gamificacao/badges` | C `conquistas` | — |
| Conquistas | A conquistar + quanto falta | ❌ | — | C `falta/progresso` | Catálogo + progresso |
| Recordes | Recordes pessoais | ❌ | (só `maiorStreak`) | C `recordes` | Endpoint |
| Feed | Eventos | 🟡 | `GET /feed` | C `feed` + eventos do Admin | Eventos de performance; governança por tipo |
| Reconhecimentos | Lista | ✅ | `GET /reconhecimentos` | E `reconhecimentos` | Campo título/motivo |
| Celebrações | Eventos não vistos | ❌ | — | C `celebracoes` | Fila de eventos por vendedor |
| Status | Sync, atraso, ranking indisponível | 🟡 | `sincronizadoEm` | E `lojas.ultimaSync` | Limite (90 min proposto) |
| Status | Folga, loja fechada | ❌ | — | C / E `calendario` | Escala e calendário |

## B. Admin — leitura e ações

| Tela | Informação / ação | Backend | Endpoint atual | Mock | Regra pendente |
|---|---|---|---|---|---|
| Visão geral | KPIs, pendências | ❌ | — | `calcularPendencias` | Endpoint agregado |
| Prontidão | Checklist | ❌ | — | `calcularProntidao` | Critérios oficiais do piloto |
| Vendedores | Listar, cadastrar | ✅ | `GET/POST /admin/vendedores` | E `vendedores` | — |
| Vendedores | Bloquear / desbloquear / reativar | ✅ | `POST /admin/vendedores/:id/{bloquear,desbloquear,reativar}` | E `status` | — |
| Vendedores | Transferir de loja | ✅ | `POST /admin/vendedores/:id/realocar` | E `lojaId` | Efeito no ranking do período |
| Vendedores | Reemitir acesso | ✅ | `POST /admin/vendedores/:id/reemitir-acesso` | auditoria | — |
| Vendedores | Vínculo ERP | ✅ | `/admin/vendedores/:id/identidade-externa` | E `vinculoErp` | — |
| Vendedores | Desligar (com motivo) | 🟡 | `POST /admin/vendedores/:id/desligar` | E `DESLIGADO` | Motivo obrigatório (hoje não exige) |
| Vendedores | Detalhe (hoje, mês, rankings, XP…) | 🟡 | vários | derivado | Endpoint consolidado |
| Lojas | Listar, editar, inativar | ✅ | `GET/POST/PUT /admin/lojas`, `/admin/estrutura` | E `lojas` | — |
| Lojas | Meta da loja | ❌ | — | E `lojas.metaMes` | Meta de loja como entidade |
| Metas | Meta individual por período | ✅ | `GET/POST/PUT/DELETE /admin/metas` | E `metas.individuais` | — |
| Metas | Consistência loja × soma | ❌ | — | `consistenciaMetasLoja` | — |
| Meta diária | Regra de distribuição | ❌ | — | E `metas.distribuicao` | **Decidir regra** |
| Calendário | Domingos, feriados, especiais | ❌ | — | E `calendario` | Entidade calendário por loja |
| Rankings | Métricas ativas, corrida | ❌ | (regra ativa por empresa) | E `rankings` | Config versionada |
| Loja × Loja | Fórmula, lojas | ❌ | — | E `lojaXLoja` | Fórmula (opções fechadas) |
| Elegibilidade | Elegível + motivo + exceção | 🟡 | regra fixa | E `elegivel/motivoInelegivel/excecao` | Período de adaptação; exceção auditada |
| Indicadores | Fonte, visibilidade | ❌ | — | E `indicadores` | Catálogo de indicadores |
| Campanhas | CRUD + ciclo de vida + validação + preview | ❌ | — | E `campanhas` | Entidade; imutabilidade no backend |
| Missões | CRUD de missão de venda + templates | ❌ | (catálogo seed de treinamento) | E `missoes` | Motor de missões de venda |
| Produtos | Cadastro de demonstração | ❌ | — | E `produtos` | Catálogo do ERP (Linx, fora da Fase 1) |
| Competições | Criar, publicar, encerrar, cancelar | ✅ | `/admin/competicoes/*` | E `competicoes` | Duelo/categoria; prêmio descritivo |
| Premiações | Digital × empresarial | 🟡 | só digital em competição | E `premios` | Entidade Prêmio |
| XP / VendaCoins | Regras, lançamentos, saldos | 🟡 | régua v1 + ledger | `REGUA_V1` | Extrato de XP; ajuste por lançamento compensatório |
| Níveis / Conquistas | Curva, catálogo, distribuição | 🟡 | código (`niveis.ts`, `badges.service.ts`) | `NIVEIS_V1`, catálogo | Distribuição agregada |
| Reconhecimentos | Admin reconhece | ❌ | só GERENTE (`POST /equipe/:id/reconhecimentos`) | E `reconhecimentos` | Permissão ADMIN; motivo estruturado |
| Feed | Governança por tipo | ❌ | — | E `feedTipos` | — |
| Saúde dos dados | Sync por loja | 🟡 | snapshot do ERP | E `lojas.ultimaSync` | Endpoint de saúde |
| Auditoria | Log antes/depois/motivo | 🟡 | `GET /admin/auditoria` | E `auditoria` | Cobrir todas as ações novas |
| Uso do piloto | Abertura, telas, retorno | ❌ | — | constantes | Eventos anônimos agregados; política de privacidade |
| Ver como vendedora | Pré-visualização | ❌ | — | troca de perfil local | Impersonação somente leitura, auditada |

## C. O que já dá para conectar primeiro

Metas, ranking individual, carteira, extrato de moedas, streak, badges conquistadas, competições (lista/detalhe/admin), reconhecimentos (leitura), vendedores, lojas, realocação, reemissão de acesso, vínculo ERP, auditoria (leitura).

## D. Decisões de negócio que o backend precisa

1. Ticket de referência das estimativas.
2. Regra da meta diária (manual / uniforme / pelo que falta).
3. Calendário operacional por loja (domingos, feriados) — e se escala individual entra depois.
4. Métrica da corrida na Home.
5. Fórmula Loja × Loja (entre as opções fechadas).
6. Prioridade do Próximo Alvo.
7. Período de adaptação do vendedor novo.
8. Campanha como entidade própria (ou Temporada estendida).
9. Limite de "dado atrasado" (proposto 90 min).
10. Analytics do piloto: o que medir sem virar vigilância.
11. Badges propostas (110/120/150%, Número 1, Quebra-recorde).

## E. Ordem sugerida (depois da homologação)

1. Conectar o que está ✅ (§C) trocando `carregarEstado`/`montarCenario` por carregadores reais.
2. Fechar as decisões (§D).
3. Backend 🟡: nº de vendas/pares, loja no ranking, variação de posição, histórico mensal, extrato de XP, reconhecimento pelo Admin, auditoria das ações novas.
4. Backend ❌ do piloto: calendário, meta de loja, Campanha, missões de venda, Loja × Loja, recordes, prontidão/pendências agregadas.
