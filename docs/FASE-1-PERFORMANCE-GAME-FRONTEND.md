# Fase 1 — Performance & Game: protótipo de frontend (Admin + Vendedor)

> **Status:** protótipo navegável com **estado mockado persistente**. **Nenhum backend novo foi implementado.**
> Objetivo: **VER → USAR → TESTAR → CRITICAR → CORRIGIR → HOMOLOGAR** antes do gap analysis de backend.
> Docs irmãos: [`FASE-1-MAPA-FRONTEND-BACKEND.md`](./FASE-1-MAPA-FRONTEND-BACKEND.md) (ponte para o backend) · [`FASE-1-JORNADAS-HOMOLOGACAO.md`](./FASE-1-JORNADAS-HOMOLOGACAO.md) (roteiro A–Z).

## 1. Visão

**ACOMPANHAR → COMPARAR → COMPETIR → CONQUISTAR.** O Vendedor IA transforma números em **posição, distância, oportunidade e conquista**. Toda tela tenta responder: como estou, quanto falta, qual minha posição, qual a distância do próximo objetivo, o que preciso fazer (aproximadamente) e o que posso conquistar agora.

Duas jornadas conectadas:

```
ADMIN configura o jogo  →  estado da demonstração muda  →  VENDEDOR joga o jogo
```

## 2. Escopo

| Dentro | Fora (no código, intocado, fora da navegação da Fase 1) |
|---|---|
| **Vendedor**: Home, Meu ritmo, Indicadores, Comparativos, Rankings (loja / geral / loja × loja), Próximo alvo, Missões, Competições, Campanhas (ativas + histórico), XP/nível, VendaCoins, Conquistas, Recordes, Feed, Reconhecimentos, Perfil, Celebrações, estados especiais | Gerente (papel existe; sem experiência nova), Supervisor, Coordenador, Conselheiro, Universidade, Academia, Treinador, Quiz, Certificação, Simulador, Linx real, IA conversacional, Fase 2 |
| **Admin**: Visão geral + pendências, Vendedores, Lojas, Metas (loja × individual), Meta diária, Calendário, Rankings, Elegibilidade, Indicadores, Campanhas (assistente em 10 etapas), Missões (+ templates + produtos), Competições, Premiações, XP, VendaCoins, Níveis/Conquistas, Reconhecimentos, Feed, Saúde dos dados, Auditoria, Prontidão, Uso do piloto, **Ver como vendedora** | Backend, endpoint, schema, migration, motor novo, auth, pagamento, conversão de VendaCoins em dinheiro |

## 3. Isolamento da demonstração

- Tudo em `web/src/fase1/`, montado em `/fase1/*` como **chunk lazy**; o Admin é **outro chunk lazy** (`admin/AdminRotas.tsx`) — a vendedora no celular não baixa a central de comando.
- Gate: `import.meta.env.DEV || VITE_FASE1_DEMO === 'true'`. Build de produção comum **não registra a rota, não gera os chunks e não inclui as classes CSS** da demo (`tailwind.config.js`). Medido: JS de produção 369,08 kB (baseline 369,05 kB); CSS 15,92 kB (baseline 15,70 kB — link no Login).
- Build de homologação: `VITE_FASE1_DEMO=true npm run build` → Fase1App 148 kB (41 kB gzip) + AdminRotas 108 kB (29 kB gzip).
- **Não usa AuthContext nem API.** A entrada `/fase1` escolhe o perfil (Vendedora / Admin). Perfil e cenário ficam em `sessionStorage`; **o estado do Admin fica em `localStorage`** (persiste entre recarregamentos; "Restaurar dados de demonstração" volta ao início).
- Fora de `fase1/`: rota lazy no `App.tsx`, link no `Login.tsx` (só com a flag), `vite-env.d.ts`, `test-setup.ts` (`scrollTo`), `tailwind.config.js`.

## 4. Arquitetura do mock (o que é o "MOCK STATE")

```
demo/estado.ts      EstadoDemo  ← tudo que o ADMIN configura (persistido)
                    vendedores, lojas, metas, calendário, indicadores, rankings,
                    produtos, missões, competições, campanhas, prêmios,
                    reconhecimentos, governança do feed, auditoria, simulação
        │
        ▼  montarCenario(cenario, estado)
demo/cenarios.ts    situação do cenário (vendas, hora, colegas, celebrações)
        │           + configuração do estado  → Fase1Dados
        ▼
telas/*             app da vendedora (só lê Fase1Dados)
admin/*             central de comando (lê e altera EstadoDemo via alterar())
```

- **Toda alteração do Admin** passa por `alterar(mutação, registroDeAuditoria)` (`demo/Fase1Contexto.tsx`): aplica, grava no log de auditoria (antes/depois/motivo) e persiste.
- **Cenário descreve situação; estado descreve configuração.** Um cenário só força configuração quando é o próprio objeto da demonstração (ex.: P "sem meta").
- Valores derivados (falta, %, vendas/pares estimados, ritmo, posição, distância, Próximo Alvo, pendências, prontidão) **nunca** são digitados — são calculados em `dominio/`.
- Para conectar: trocar `carregarEstado()`/`alterar()` por chamadas de API e `montarCenario()` por um montador de `Fase1Dados` a partir dos endpoints. As telas não mudam.

## 5. Vendedor — telas e navegação

Barra inferior (5 itens): **Início · Desempenho · Ranking · Desafios · Perfil**.

| Rota | Conteúdo |
|---|---|
| `/fase1/inicio` | Saudação, data, empresa • loja; atalhos ⭐ nível, XP, 🪙. Meta de hoje (marcos 100/110/120/150%), ⚡ Próximo alvo (ou selo no card de meta quando o alvo é a própria meta), Você também está perto (≤ 2, um por tipo), campanha em destaque (cenário S), Corrida do mês (≈ vendas, ≈ pares, ≈ vendas/dia), Sua posição (loja + geral, distância na unidade da métrica escolhida pelo Admin), missões (com "simular venda" da demo), campanha, Acontecendo agora |
| `/fase1/desempenho` | **Meu ritmo** (Hoje/Mês: plano, ticket usado, dias válidos do calendário, ritmo, projeção) · **Indicadores** (Hoje/Mês/Histórico; só indicadores liberados pelo Admin; conversão nunca inventada) · **Comparar** (Eu × Loja, Eu × Empresa sem R$ entre lojas) |
| `/fase1/ranking` | Minha loja · Geral · Loja × Loja; métricas liberadas pelo Admin; faturamento de colegas oculto |
| `/fase1/desafios` | Missões · Competições (ativas/próximas/encerradas) · Campanha (ativa + histórico com resultado e ganhos) |
| `/fase1/perfil` | Nível, VendaCoins, sequência, links: Conquistas, Recordes, Reconhecimentos, Feed |
| `/fase1/progresso`, `/moedas`, `/conquistas`, `/recordes`, `/feed`, `/reconhecimentos` | Telas de segundo nível |

Faixa roxa **"Pré-visualização do Admin — Voltar ao Admin"** aparece quando o Admin entra pelo 👁.

## 6. Admin — central de comando

Menu (7 grupos, como proposto): **Visão geral · Pessoas (Vendedores, Lojas) · Performance (Metas e calendário, Rankings e elegibilidade, Indicadores) · Incentivos (Campanhas, Missões, Competições, Premiações) · Gamificação (XP, VendaCoins, Níveis e conquistas) · Comunicação (Reconhecimentos, Feed) · Operação (Saúde dos dados, Auditoria, Prontidão do piloto, Uso do piloto)**. Ajuste feito: Elegibilidade foi para dentro de Rankings, e Meta diária + Calendário para dentro de Metas — menos itens de menu.

| Área | O que demonstra |
|---|---|
| Visão geral | Prontidão (%), KPIs (lojas, ativos, com/sem meta, campanhas, missões, competições, pendências), ⚠️ Pendências calculadas com link para resolver, saúde dos dados, últimas ações |
| Vendedores | Lista com filtros; cadastro (entra "aguardando ativação" e fora do ranking); detalhe (status, meta, hoje, mês, rankings, XP, VendaCoins, missões, campanhas, pendências); ações: ativar, bloquear, desligar (motivo), transferir (motivo, sai do ranking), reemitir acesso, verificar vínculo ERP, exceção de elegibilidade (motivo); 👁 Ver como Ana |
| Lojas | Lista e detalhe: meta, realizado, %, vendedores, com meta, campanhas, missões, Loja × Loja, última atualização |
| Metas | Meta da loja × metas individuais com **soma e consistência** ao vivo (✓ / ⚠️ diferença) |
| Meta diária | 3 regras lado a lado (definida pelo Admin, uniforme, pelo que falta nos dias válidos) — a escolhida vale para o app |
| Calendário | Domingos, feriados (por loja), datas especiais. Feriado hoje → "loja não abre"; feriado no fim do mês → menos dias, mais vendas/dia |
| Rankings | Métricas ativas, métrica da corrida (Home), Loja × Loja com **fórmula escolhida entre opções fechadas** (sem fórmula livre), lojas participantes |
| Elegibilidade | Elegível/não elegível + motivo (novo, desligado, transferido, período insuficiente, exceção) |
| Indicadores | Fonte (confiável / parcial / sem fonte); só libera ao vendedor o que tem fonte. Conversão bloqueada |
| Campanhas | Lista (ativas e programadas / rascunhos / histórico), **assistente em 10 etapas** (Identidade → Período → Participantes → Objetivo → Mecânica → Recompensas → Premiação → Regras → Preview → Publicação), checagem "Não é possível publicar" com o motivo exato, **preview na moldura de celular**, ciclo de vida (rascunho, programada, ativa, encerrada, arquivada, cancelada), **bloqueio de regra crítica após o início**, duplicar |
| Missões | Lista por situação, **7 templates**, editor com produtos por categoria, preview com o **componente real do app**, checagem, publicar/programar, encerrar, cancelar (motivo), duplicar, bloqueio após início; cadastro de **produtos de demonstração** |
| Competições | Lista com classificação, criar (individual / evolução / loja × loja; % meta, evolução, score, PA, ticket), publicar/encerrar/cancelar |
| Premiações | Digital (XP, VendaCoins, badge) × Empresarial (dinheiro, vale, produto, experiência, outro — informativo); onde cada prêmio é usado |
| XP / VendaCoins | **Somente consulta**: régua v1, lançamentos, saldos. Nada editável |
| Níveis e conquistas | Curva v1, distribuição por nível, catálogo (catálogo atual × proposta) |
| Reconhecimentos | Motivos estruturados; chega à vendedora e ao feed; sem XP automático |
| Feed | Governança dos tipos de evento + feed atual da vendedora. Sem CMS, sem rede social |
| Saúde dos dados | Sync por loja (🟢/🟡/🔴), simular sync/atraso, vínculos, metas, inconsistências |
| Auditoria | Log com usuário, data/hora, ação, entidade, antes, depois, motivo; busca |
| Prontidão | Checklist calculado (11 áreas), % pronto, bloqueios |
| Uso do piloto | Números agregados (sem rastreio individual) — simulados |

## 7. Fluxos Admin → Vendedor demonstráveis

| Fluxo | Como |
|---|---|
| Meta | Metas → muda a meta da Ana → Salvar → 👁 → Home mostra novo "/ R$" e "Faltam" |
| Meta diária | Meta diária → escolhe "Uniforme" → 👁 → Meta de hoje muda |
| Calendário | Feriado em 22/10 para Caruaru → 👁 → "A loja não abre hoje" |
| Missão | Missões → template → publicar → 👁 → aparece em Desafios → "Simular" até concluir → celebração → VendaCoins no extrato |
| Campanha | Campanhas → nova (10 etapas) → preview → publicar → 👁 → Desafios › Campanha |
| Premiação | Premiações → cadastrar → usar em campanha → vendedora vê "🎁" na frente |
| Reconhecimento | Reconhecer Ana → 👁 → feed "Você recebeu um reconhecimento" e Perfil › Reconhecimentos |
| Indicador | Ocultar Pares/Ticket → 👁 → estimativas somem |
| Ranking | Métrica da corrida = % Meta → 👁 → "Sua posição" passa a falar em p.p. |
| Elegibilidade | Tirar Ana do ranking (exceção + motivo) → 👁 → "Você está fora do ranking neste período" |
| Dados | Saúde → simular atraso em Caruaru → 👁 → banner de dado atrasado |

## 8. Componentes

| Arquivo | Conteúdo |
|---|---|
| `componentes/ui.tsx` | Painel, TituloSecao, CabecalhoTela, SeloEstimativa, Variacao, Tendencia, BarraMeta (marcos), BarraSimples, Abas (WAI-ARIA + teclado), Vazio, Carregando, Erro, Avatar, Medalha, Pilula, AvisoProvisorio |
| `componentes/blocos.tsx` | CardMetaHoje, CorridaMes, MinhaCorrida, ProximoAlvo, VocePerto, CardMissao (reaproveitado no preview do Admin) |
| `componentes/Celebracao.tsx` | 7 tipos; `role=dialog`; foco; Esc; sem animação com reduced-motion |
| `admin/ui.tsx` | TituloPagina, Bloco, Kpi, StatusCicloPill, Selo, Botao, Campo, ChecklistValidacao, MolduraCelular, TabelaResponsiva (tabela no desktop, cartões no celular), Feedback |
| `demo/SeletorCenario.tsx` | Faixa 🧪 DEMO: cenários + experimentar celebrações |

## 9. Cálculos simulados (regra **não congelada**)

`dominio/estimativas.ts`, `dominio/alvos.ts`, `dominio/proximoAlvo.ts`, `dominio/admin.ts`.

| Cálculo | Regra provisória |
|---|---|
| % da meta | arredondado, mas 99,6% nunca vira "100%" |
| Vendas estimadas | ⌈falta ÷ ticket de referência⌉ |
| Pares estimados | round(vendas × PA) — some se Pares/PA ocultos |
| Vendas por dia | ⌈vendas ÷ dias válidos restantes⌉ (calendário do Admin) |
| Ticket de referência | ticket do mês; vendedor novo → ticket da loja; sem base ou Ticket oculto → nenhuma estimativa |
| Meta diária | regra escolhida pelo Admin (manual / uniforme / pelo que falta) |
| Distância no ranking | na unidade da métrica; só Vendas (R$) converte em vendas |
| Próximo Alvo | menor esforço em vendas; sem conversão = 2,5; empate por tipo |
| Pendências / prontidão | regras em `calcularPendencias` / `calcularProntidao` (sync > 90 min = atrasado) |
| Validação de publicação | `validarCampanha`, `validarMissao`, `validarCompeticao` |
| Imutabilidade | regra crítica editável só em Rascunho/Programada |

## 10. Cenários (faixa 🧪 DEMO → "trocar")

| | Cenário | | Cenário |
|---|---|---|---|
| A | Início do dia | K | Novo nível |
| B | 76% da meta do dia | L | Recorde próximo (R$ 860 do melhor mês) |
| C | Quase #1 (R$ 90) | M | Recorde batido |
| D | Meta batida (109%) | N | Loja quase #1 (31 pts) |
| E | 110% | O | Vendedora nova |
| F | 120% | P | Sem meta |
| G | 150% (+ badge, recorde de dia) | Q | Sem ticket suficiente |
| H | Último no ranking, evoluindo | R | Dado desatualizado |
| I | Missão quase concluída (simular → concluir) | S | Campanha ativa (em destaque) |
| J | Missão concluída | T | Campanha encerrada (resultado + ganhos) |

Estados especiais: **X1** folga · **X2** loja fechada · **X3** erro · **X4** carregando · **X5** offline · **X6** vazio. Cada celebração aparece uma vez por seleção do cenário; 10 celebrações podem ser disparadas a qualquer momento (meta, 110, 120, 150, #1, recorde, nível, missão, badge, VendaCoins).

## 11. Reaproveitamento

Paleta e componentes base; `LoadingState`; curva de níveis v1 (sem renomear); **régua v1 de XP/VendaCoins** (`REGUA_V1`, espelhada para o mock ficar coerente com o backend); marcos `META_DIARIA_100/110/120/150`; privacidade do ranking (Fatia 7.5A §30); tipos de ranking; catálogo de badges; Temporada/Competição/Liga/Feed/Reconhecimento (mesma semântica); conceitos do Admin real (status de conta, realocação, reemissão de acesso, vínculo ERP, metas por período). Telas antigas do Admin real continuam em `/admin/*`, intocadas.

## 12. Decisões abertas

Ver relatório final e `FASE-1-MAPA-FRONTEND-BACKEND.md` §"Decisões". Resumo: ticket de referência; regra da meta diária; métrica da corrida; fórmula Loja × Loja; prioridade do Próximo Alvo; adaptação do vendedor novo; Campanha como entidade; limite de sync atrasado; política de privacidade do uso do piloto; badges propostas.

## 13. Testes

- `dominio/estimativas.test.ts` (10), `dominio/admin.test.ts` (calendário, meta diária, consistência, pendências, prontidão, validação, ciclo de vida), `demo/cenarios.test.ts` (A–T + Admin → vendedora), `Fase1App.test.tsx` (vendedora + jornadas do Admin em tela).
- Jornada em navegador real (Playwright, script de verificação local): Admin publica missão → altera meta → reconhece → 👁 → vendedora recebe meta, reconhecimento e missão → simula → celebração → extrato → auditoria registra.
