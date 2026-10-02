# Fase 1: Performance & Game (protótipo de frontend para homologação)

> **Status:** protótipo navegável com dados simulados. **Nenhum backend novo foi implementado.**
> O objetivo é responder: *"É assim que queremos que a Fase 1 funcione?"* antes de construir o resto.
> Ponte para a próxima etapa: [`FASE-1-MAPA-FRONTEND-BACKEND.md`](./FASE-1-MAPA-FRONTEND-BACKEND.md).

## 1. Visão

> Veja seu desempenho. Entenda quanto falta. Compare sua evolução. Compita. Conquiste. Seja reconhecido.

Todo número importante vira **posição, distância, oportunidade ou conquista**. Toda tela tenta responder:
onde estou, quanto falta, qual a minha posição, qual a próxima oportunidade e o que posso conquistar agora.

## 2. Escopo

| Dentro | Fora (não construído, não exibido na navegação da Fase 1) |
|---|---|
| Vendedor: Home, Meu Ritmo, Indicadores, Comparativos, Rankings (loja / geral / loja × loja), Missões, Competições, Campanha, XP/Nível, VendaCoins, Conquistas, Recordes, Feed, Reconhecimentos, Perfil, Celebrações, estados especiais | Gerente (papel existe no código, sem experiência nova), Supervisor, Coordenador, Conselheiro, Universidade, Quiz, Certificação, Simulador, Treinador, Academia, integração Linx, qualquer IA |
| Admin: auditoria do Admin real + UX simulada do que falta | Backend, schema, migration, motor novo, alteração de auth |

As telas antigas (Coach, Treinador, Simulador, Academia, Universidade, Equipe...) **não foram tocadas nem removidas**. Continuam nas rotas originais.

## 3. Como a demonstração é isolada

- Tudo vive em `web/src/fase1/` e é montado em `/fase1/*` como **chunk lazy**.
- Gate: `import.meta.env.DEV || VITE_FASE1_DEMO === 'true'` (no `App.tsx` e em `fase1/flags.ts`).
  - Em `npm run dev` → disponível.
  - Em `npm run build` comum → **a rota nem é registrada**, o chunk não é gerado e as classes CSS da demo são excluídas (`tailwind.config.js`). Verificado: JS de produção 369,08 kB (baseline 369,05 kB); CSS 15,9 kB (baseline 15,7 kB, a diferença é o link no Login).
  - Para publicar uma homologação: `VITE_FASE1_DEMO=true npm run build`.
- A demo **não usa o AuthContext nem a API**. A "entrada" (`/fase1`) só escolhe o perfil (Vendedora ou Admin), guardado em `sessionStorage`.
- Única alteração fora de `fase1/`: rota lazy no `App.tsx`, link "Abrir demonstração da Fase 1" no `Login.tsx` (só com a flag), tipo da env em `vite-env.d.ts`, `window.scrollTo` no `test-setup.ts` e a exclusão condicional no `tailwind.config.js`.

## 4. Navegação (proposta implementada)

Barra inferior com **5 itens**, mobile first:

| Item | Rota | Conteúdo |
|---|---|---|
| 🏠 Início | `/fase1/inicio` | Cabeçalho (nível, XP, VendaCoins), Meta de hoje, ⚡ Próximo alvo, Você também está perto, Corrida do mês, Sua posição, Missões, Campanha, Acontecendo agora |
| 📊 Desempenho | `/fase1/desempenho` | Abas **Meu ritmo** (Hoje/Mês) · **Indicadores** (Hoje/Mês/Histórico) · **Comparar** (Eu × Loja / Eu × Empresa) |
| 🏆 Ranking | `/fase1/ranking` | Abas **Minha loja** · **Geral** · **Loja × Loja** + filtro de indicador |
| 🔥 Desafios | `/fase1/desafios` | Abas **Missões** · **Competições** (Ativas/Próximas/Encerradas) · **Campanha** |
| 👤 Perfil | `/fase1/perfil` | Nível, VendaCoins, sequência, links para Conquistas, Recordes, Reconhecimentos e Feed |

Telas de segundo nível: `/fase1/progresso` (XP e níveis), `/fase1/moedas`, `/fase1/conquistas`, `/fase1/recordes`, `/fase1/feed`, `/fase1/reconhecimentos`. Admin: `/fase1/admin` (desktop first, sem barra inferior).

Por que "Desafios" e não "Missões": reúne três coisas diferentes com explicação na própria tela:
**Missão** = objetivo individual · **Competição** = disputa · **Campanha** = programa que agrupa mecanismos.

## 5. Componentes

| Arquivo | Conteúdo |
|---|---|
| `componentes/ui.tsx` | `Painel`, `TituloSecao`, `CabecalhoTela`, `SeloEstimativa`, `Variacao` (↑↓ com texto para leitor de tela), `Tendencia`, `BarraMeta` (marcos 100/110/120/150 quando passa de 100%), `BarraSimples`, `Abas` (WAI-ARIA, setas/Home/End), `Vazio`, `Carregando` (skeleton), `Erro`, `Avatar`, `Medalha`, `Pilula`, `AvisoProvisorio` |
| `componentes/blocos.tsx` | `CardMetaHoje`, `CorridaMes`, `MinhaCorrida`, `ProximoAlvo`, `VocePerto`, `CardMissao` |
| `componentes/Celebracao.tsx` | Sobreposição de celebração (7 tipos), `role=dialog`, foco no botão, Esc fecha, sem animação com `prefers-reduced-motion` |
| `demo/SeletorCenario.tsx` | Faixa "🧪 DEMO" no topo: troca de cenário + "experimentar celebrações" |
| `Fase1Layout.tsx` | Shell: banners de offline/dado atrasado, faixa demo, barra inferior |

Parte do design system atual (slate escuro + âmbar, `surface`, `surfaceRaised`, toque ≥ 44px) e sobe um degrau: hierarquia mais forte, números tabulares, gradiente sutil no card principal, verde só para "batido/acima", nenhuma informação dependente só de cor.

## 6. Cálculos simulados (regra **não congelada**)

Todos em `dominio/estimativas.ts`, `dominio/alvos.ts` e `dominio/proximoAlvo.ts`. Cada função documenta a decisão aberta.

| Cálculo | Regra provisória | Exemplo (cenário B) |
|---|---|---|
| % da meta | realizado ÷ meta; exibido arredondado, **mas 99,6% nunca vira "100%"** | 1.514 / 2.000 → 76% |
| Falta | max(0, meta − realizado) | R$ 486 |
| Vendas estimadas | ⌈falta ÷ ticket de referência⌉ (para cima: nunca promete menos esforço) | 486 / 249 → ≈ 2 |
| Pares estimados | round(vendas estimadas × PA) | 28 × 1,8 → ≈ 50 |
| Vendas por dia | ⌈vendas estimadas ÷ dias de trabalho restantes⌉ | 28 / 8 → ≈ 4 |
| Projeção do mês | média por dia trabalhado × total de dias de trabalho; só com ≥ 3 dias | — |
| Próximo marco | primeiro de 100/110/120/150% ainda não atingido | 2.180 → R$ 20 para 110% |
| Ticket de referência | ticket médio **do mês** do vendedor; vendedor novo usa o ticket médio da loja; sem base → nenhuma estimativa | R$ 249 |
| Distância no ranking | diferença para a posição imediatamente acima, **na unidade da métrica**; só Vendas (R$) converte em vendas | R$ 320 → ≈ 2 vendas |
| Próximo Alvo | menor esforço em vendas primeiro; alvos sem conversão (XP, dias) valem 2,5; empate → meta do dia, missão, ranking, desafio, nível, recorde, meta do mês | meta do dia |
| Você está perto | até 2–3 itens após o Próximo Alvo, **no máximo um por tipo** | missão diária, #1 da loja |
| Elegibilidade | vendedor novo fica fora dos rankings no período de adaptação | cenário L |

Toda estimativa aparece com "≈" e selo **est.** ("Estimativa baseada no seu ticket médio do mês (R$ 249). Não é garantia.").

## 7. Mocks

Único lugar com números escritos à mão: `web/src/fase1/demo/cenarios.ts`.

- Elenco fixo: 3 lojas (Caruaru Shopping, Santa Cruz, Difusora) e 15 vendedores; a persona é **Ana Beatriz Lima** (Caruaru Shopping).
- Data fixa: **quinta-feira, 22/10/2026, 15:20**, para a corrida do mês fazer sentido (R$ 23.200 de R$ 30.000 com 8 dias de trabalho restantes) e a campanha "Outubro Campeão" estar em andamento.
- Coerência por construção: o faturamento do mês da Ana alimenta os rankings (`finalizar()`), e posições, distâncias, Próximo Alvo e recordes "em disputa" são **derivados**, não digitados. `demo/cenarios.test.ts` trava as histórias de cada cenário.
- `Fase1Dados` (`dominio/tipos.ts`) é o contrato. Na conexão, troca-se `montarCenario()` por um carregador da API; as telas não mudam.

## 8. Cenários demonstráveis

| | Cenário | O que demonstra |
|---|---|---|
| A | Começando o dia (09:20) | Meta sem vendas, "≈ 9 vendas", Próximo alvo = 1ª venda do dia |
| B | 76% da meta do dia | Situação típica: faltam R$ 486 ≈ 2 vendas, #2 na loja ↑1 a R$ 320 do #1, #7 geral ↑2 |
| C | Quase assumindo o #1 | Próximo alvo = R$ 90 para o #1 (≈ 1 venda) |
| D | Meta do dia batida (109%) | Celebração, marcos, "faltam R$ 20 para 110%" |
| E | Acima da meta: 123% | 100/110/120 ✓, próximo 150% |
| E+ | Todos os marcos: 152% | Todos os marcos, novo recorde de dia, badge 150% |
| F | Último no ranking, perto do recorde | 5º na loja, mas R$ 860 do melhor mês (Próximo alvo) |
| G | Missão quase concluída | "1 venda para concluir Oito no dia" |
| H | Missão concluída | Celebração + XP/VendaCoins no extrato |
| I | Novo nível | Ouro → Platina, celebração |
| J | Novo recorde | Melhor dia superado, "NOVO RECORDE!" |
| K | Loja quase na liderança | Ana #1 na loja; loja a 24 pontos da líder |
| L | Vendedora nova | Sem histórico, fora do ranking, estimativa pelo ticket da loja, "80 XP para Prata" |
| M | Sem meta cadastrada | Vendas e posição sem meta |
| N | Sem dados para estimar | Falta em R$ sem conversão em vendas |
| O | Dia de folga | Sem cobrança, sem missão diária, sem Próximo alvo |
| P | Loja fechada | Feriado, sem meta do dia |
| Q | Ranking indisponível + dado desatualizado | Banner de sync atrasado, ranking suspenso |
| R | Erro ao carregar | Erro neutro com "Tentar de novo" |
| S | Carregando (rede lenta) | Skeleton de 2,5 s em cada tela |
| T | Offline | Banner "Sem conexão. Mostrando seus últimos dados" (também reage ao `offline` real do navegador) |
| U | Sem missões nem competições | Estados vazios |

Celebrações (todas podem ser disparadas a qualquer momento pela faixa DEMO): meta do dia, #1, recorde, novo nível, VendaCoins, missão e badge. Cada celebração aparece **uma vez por seleção de cenário**; recarregar não repete.

## 9. Reaproveitamento

| Existia | Como foi usado |
|---|---|
| Paleta, `surface`/`accent`/`accentSoft`, toque ≥ 44px, safe-area | Base visual de toda a Fase 1 |
| `LoadingState` | Fallback do chunk lazy |
| Curva de níveis `NIVEL_XP_V1` (Bronze → Elite) | Espelhada em `dominio/niveis.ts`, **sem renomear** |
| Marcos de meta do ledger (`META_DIARIA_100/110/120/150`) | Marcos da barra de meta |
| Regra de privacidade do ranking (faturamento de colegas oculto, Fatia 7.5A §30) | Mantida: só a distância aparece |
| Tipos de ranking (`SCORE_GERAL`, `FATURAMENTO`, `PERCENTUAL_META`, `PA`, `TICKET`, `EVOLUCAO`) | Filtros do ranking |
| Catálogo de badges (`badges.service.ts`) | Conquistas "catálogo"; as novas estão marcadas "proposta" |
| Conceitos de Competição/Temporada/Feed/Reconhecimento | Mesma semântica; UX nova |
| Admin real (usuários, estrutura, metas, gamificação) | Linkado na auditoria do Admin; nada reconstruído |
| Frescor do ERP ("Dados do ERP de 15:00 · atualiza a cada hora", Fatia 9.7) | Rodapé da Home e banner de atraso |

## 10. Itens novos (só frontend)

Meu Ritmo (plano de hoje/mês), Próximo Alvo + Você está perto, Corrida do mês com vendas/pares/vendas por dia, barra com marcos, Ranking geral com recorte (pódio + vizinhança), Loja × Loja, Comparativos Eu × Loja / Eu × Empresa (sem R$ entre lojas), Indicadores com tendência, Histórico mensal com tabela, Missões de venda (diária, semanal, categoria, performance, consistência, Produto da Semana, ponta de estoque), competições por tipo (individual, semanal, categoria, loja × loja, evolução, duelo), Campanha unificada, XP por origem, VendaCoins com vitrine "em breve", Conquistas conquistadas/a conquistar com "quanto falta", Recordes com "perto"/"NOVO RECORDE!", Feed sem interação social, Reconhecimentos, Celebrações, estados especiais, Admin (auditoria + simulações).

## 11. Decisões ainda abertas

1. **Ticket de referência** das estimativas: mês do vendedor, últimos 90 dias ou loja?
2. **Métrica da "corrida" na Home**: Vendas (R$) (hoje) ou Score Geral?
3. **Fórmula Loja × Loja** (soma? média? % da meta coletiva?).
4. **Prioridade do Próximo Alvo** (proposta no §6).
5. **Dias de trabalho**: sem cadastro de escala no backend, não há "dias restantes" real.
6. **Elegibilidade de vendedor novo**: prazo do período de adaptação.
7. **Campanhas**: virar entidade própria ou continuar como Temporada + Competições?
8. **Missões de venda**: quais critérios o motor precisa suportar (categoria, referência, PA, ticket, consistência)?
9. **Premiação e VendaCoins**: catálogo, preços e resgate (sem conversão em dinheiro).
10. **Badges propostas** (110/120/150%, Número 1, Quebra-recorde): entram no catálogo?
11. **Média da loja em R$** no comparativo: com 5 vendedores, ela aproxima o faturamento das colegas. Manter?

## 12. Dependências futuras de backend

Resumo: escala/dias de trabalho, contagem de vendas e pares por período, histórico mensal, posição anterior (↑↓), ranking Loja × Loja, missões de venda, entidade Campanha, prêmio descritivo, recordes pessoais, feed de eventos de performance, reconhecimento pelo Admin, ajuste manual de XP/VendaCoins, período de adaptação na elegibilidade. Detalhe campo a campo em `FASE-1-MAPA-FRONTEND-BACKEND.md`.

## 13. Explicitamente fora da Fase 1

Gerente (sem nova experiência), Supervisor, Coordenador, Conselheiro, Universidade, Quiz, Certificação, Simulador, Treinador, Academia, Linx, chamadas de IA (Anthropic/OpenAI/Gemini), conversão de VendaCoins em dinheiro, **taxa de conversão** (não existe denominador de atendimentos sem venda, então não é exibida), rede social (comentários, curtidas, postagem, chat).

## 14. Testes

- `fase1/dominio/estimativas.test.ts`: estimativas, marcos, percentual, ranking, níveis e prioridade do alvo.
- `fase1/demo/cenarios.test.ts`: cada cenário demonstra o que promete; mock determinístico e coerente.
- `fase1/Fase1App.test.tsx`: entrada, Home (B), navegação sem fases futuras, celebração (D), sem estimativa (N), folga (O), privacidade do ranking, unidade do PA, Loja × Loja (K), teclado nas abas, erro (R) e Admin.
