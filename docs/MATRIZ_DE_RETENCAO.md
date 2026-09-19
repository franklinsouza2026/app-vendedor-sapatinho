# Matriz de Retenção de Dados — App Vendedor Sapatinho de Luxo

> **Status: AUDITORIA. Nenhuma política de retenção foi implementada.**
>
> Produzido na Etapa 2B.4. Este documento **não define prazos** e **não autoriza
> apagar nada**. Ele existe para que a decisão de retenção, quando for tomada,
> seja tomada sobre o que o sistema realmente guarda — e não sobre uma
> suposição.
>
> Data da auditoria: 2026-09-19. Schema: 76 models.

---

## 1. O achado principal

**O produto não tem nenhum mecanismo de retenção.** Nenhuma tabela expira,
arquiva ou é purgada por tempo. Varrendo todos os `delete`/`deleteMany` do
código de aplicação (fora de teste, seed e scripts de reset), existem exatamente
cinco categorias — e **nenhuma é retenção**:

| Local | O que é |
|---|---|
| `gamificacao/ranking.service.ts` | Recomputa: apaga o snapshot daquela chave e regrava. Substituição, não expurgo. |
| `ai-platform/admin-ai.service.ts` | Troca de credencial de provider pelo Admin. |
| `identidade/admin.service.ts` | Desvincula identidade externa (ERP). |
| `universidade/`, `academia/` | Substituição de filhos ao editar requisito/questão pelo Admin. |
| `services/metas-admin.service.ts` | Admin remove uma meta que cadastrou. |

Ou seja: **tudo que é histórico de pessoa cresce para sempre.** Isso é uma
decisão que nunca foi tomada — é o estado default de um produto que ainda não
precisou decidir. A 2B.2 já havia registrado retenção como decisão futura; esta
auditoria é o insumo dela.

Mitigação que já existe hoje, e que não é retenção: **toda leitura do
Conselheiro é bounded** (janela de conversa, teto de 3 intervenções, teto de 3
gaps, pendência viva de 30 dias). O dado continua no banco; ele só deixa de ser
trazido. Volume cresce; exposição não.

---

## 2. Por que uma regra global seria errada

Estes dados não têm a mesma natureza, e tratá-los igual produziria ou perda
indevida ou acúmulo indevido:

- **`SeasonPointLedger`/`XpTransacao`/`MoedaTransacao`** são ledger append-only.
  Apagar uma linha reescreve o saldo de alguém. Nunca podem ser purgados por
  idade sem uma política de fechamento contábil.
- **`AuditEvent`** existe justamente para sobreviver ao evento que registra.
  Retê-lo é a finalidade, não o efeito colateral.
- **`UserCertification`** é credencial da pessoa: vale enquanto a pessoa
  trabalhar ali, e provavelmente depois.
- **`CoachCheckIn`** é dado emocional diário. É o oposto: o risco cresce com o
  tempo de guarda, e a utilidade cai depois do dia.
- **`AIUsage`** é telemetria de custo. Útil agregada, quase inútil linha a linha
  depois do fechamento do mês.

---

## 3. Categorias propostas

Proposta de taxonomia, **sem prazo associado** — cada categoria é uma pergunta
diferente para o usuário, não uma resposta:

| Categoria | Pergunta que ela levanta |
|---|---|
| **OPERACIONAL CURTO PRAZO** | Depois de quanto tempo isto deixa de ter uso e vira só volume? |
| **RELACIONAL / CONVERSA** | Por quanto tempo o vendedor quer que o Conselheiro lembre — e por quanto tempo ele aceita que o sistema guarde? |
| **EMOCIONAL** | Isto deveria sequer ser histórico, ou só estado do dia? |
| **DESENVOLVIMENTO** | Evidência de competência envelhece? O motor já pondera por recência; a linha precisa existir depois disso? |
| **AUDITORIA / SEGURANÇA** | Qual o período de prova exigido, e por quem? |
| **FINANCEIRO / LEDGER** | Existe fechamento contábil? Sem ele, não há o que apagar. |
| **HISTÓRICO DE NEGÓCIO** | Serve a série temporal de gestão — apagar destrói comparação ano a ano. |
| **IDENTIDADE** | Existe obrigação legal (trabalhista, LGPD) que este produto ainda não mapeou? |

---

## 4. Matriz

Legenda de sensibilidade: **A** = alta (dado pessoal/emocional/financeiro
individual), **M** = média (desempenho individual), **B** = baixa (catálogo,
configuração, telemetria).

### 4.1 Conversa e relação (Conselheiro / Treinador / Simulador)

| Dado | Finalidade | Sujeito | Sens. | Mutável | Quem acessa | Usado por IA | Mecanismo hoje | Decisão necessária |
|---|---|---|---|---|---|---|---|---|
| `CoachConversation` | agrupar a conversa | vendedor | A | status | só o próprio | sim (janela) | nenhum | por quanto tempo uma conversa encerrada precisa existir |
| `CoachMessage` | transcrição original | vendedor | **A** | **não** | só o próprio | sim (janela bounded + **filtro de autorização**, 2B.4) | nenhum | **a mais importante**: transcrição de desabafo guardada indefinidamente |
| `CoachCheckIn` | humor do dia | vendedor | **A** | 1×/dia | só o próprio | sim (pertinência) | nenhum | ver §5 |
| `CoachIntervention` | continuidade relacional | vendedor | M | status | só o próprio | sim (teto 3, 30 dias) | leitura bounded | linha antiga tem valor depois de sair da janela? |
| `ProfessionalMemory` | memória profissional derivada | vendedor | M | sim (1 linha) | só o próprio | sim | sobrescrita | nenhuma — não acumula |
| `TrainerConversation` / `TrainerMessage` | treino de abordagem | vendedor | M | não | só o próprio | sim | nenhum | mesma pergunta da conversa do Conselheiro |
| `SimulationSession` / `SimulationMessage` / `SimulationEvaluation` | prática e avaliação | vendedor | M | status | próprio (+ gestor vê avaliação) | sim | nenhum | a transcrição da simulação precisa durar tanto quanto a nota? |

### 4.2 Desenvolvimento

| Dado | Finalidade | Sujeito | Sens. | Mutável | Mecanismo hoje | Decisão necessária |
|---|---|---|---|---|---|---|
| `CompetencyEvidence` | alimentar a matriz | vendedor | M | não | nenhum (motor pondera recência) | evidência muito antiga deve sumir ou só pesar menos? |
| `ManagerAssessment` | avaliação do gestor | vendedor | M | versão | nenhum | quanto tempo uma avaliação continua justa? |
| `DevelopmentPlan` / `DevelopmentPlanItem` | PDI | vendedor | M | sim | nenhum | PDI concluído é histórico ou arquivo? |
| `AcademyProgress` | progresso e quiz | vendedor | B/M | sim | nenhum | guarda a tentativa ou só o resultado? |
| `UserCertification` | credencial | vendedor | M | status | nenhum | **provável: manter sempre** |
| `ReviewSchedule` | agenda de revisão | vendedor | B | sim | nenhum | operacional, expira sozinho de fato |

### 4.3 Desempenho e gamificação

| Dado | Finalidade | Sens. | Append-only | Mecanismo hoje | Decisão necessária |
|---|---|---|---|---|---|
| `IndicadorRealizado` | snapshot horário do ERP | M | sim | nenhum | **maior volume do sistema** — granularidade horária precisa durar anos? |
| `Meta` | meta cadastrada | M | não | delete pelo Admin | histórico de meta é série de negócio |
| `XpTransacao` / `MoedaTransacao` | ledger | **A** | **sim** | nenhum | **não purgar sem fechamento contábil** |
| `BaselinePessoal` | baseline de 14 dias | M | recomputado | sobrescrita | nenhuma |
| `RankingSnapshot` | ranking por período | M | recomputado | substituição por chave | snapshot de período fechado é histórico de negócio |
| `StreakVendedor` / `StreakChecagem` | consistência | B | checagem é append | nenhum | checagem diária antiga tem uso? |
| `BadgeConcessao` | conquista | M | sim | nenhum | provável: manter sempre |
| `SeasonPointLedger` / `CompetitionResult` | temporada e competição | M | **sim** | nenhum | resultado de temporada fechada = histórico de negócio |
| `MissionAssignment` / `ChallengeAssignment` | missões | B | não | nenhum | missão de meses atrás tem uso? |

### 4.4 Gestão

| Dado | Finalidade | Sens. | Mecanismo hoje | Decisão necessária |
|---|---|---|---|---|
| `ManagerAlert` | alerta de atenção | M | nenhum | alerta resolvido vira histórico ou some? |
| `ManagerActionPlan` / `ManagerActionItem` / `ManagerFollowUp` | acompanhamento | M | nenhum | idem |
| `OneOnOne` | registro de 1:1 | **A** | nenhum | conversa de 1:1 é o dado mais sensível do lado do gestor |
| `Recognition` | reconhecimento público | B | nenhum | provável: manter |
| `FeedEvent` | mural | B/M | nenhum | feed cresce sem teto; o app só lê o recente |

### 4.5 Plataforma, identidade e auditoria

| Dado | Finalidade | Sens. | Mecanismo hoje | Decisão necessária |
|---|---|---|---|---|
| `AIUsage` | custo e telemetria | B | nenhum | linha a linha depois do fechamento do mês tem uso? |
| `AIProviderHealth` | saúde do provider | B | nenhum | claramente OPERACIONAL CURTO PRAZO |
| `AuditEvent` | prova de ação administrativa | M | nenhum | **período de prova exigido** — pergunta jurídica, não técnica |
| `ActivationToken` | ativação de conta | **A** (hash) | `expiresAt` + `usedAt`, **sem expurgo** | token consumido/expirado deveria ser removido |
| `ExternalIdentity` | vínculo com ERP | M | delete no desvínculo | nenhuma |
| `Vendedor` | identidade | **A** (`cpfHash`) | **nunca hard delete**, só `OFFBOARDED` | desligado há anos: anonimizar? obrigação legal? |
| `TrainingIntelligenceJob` / `TrainingSource` / `TrainingGovernanceFinding` / `TrainingScenarioDraft` | pipeline de conteúdo por IA | B | nenhum | rascunho rejeitado precisa durar? |
| Catálogo (`Competency`, `AcademyTrack`, `Badge`, `Playbook`, `MandamentoOficial`, `SimulationScenario`, …) | conteúdo | B | lifecycle editorial (`ARCHIVED`) | nenhuma — já tem arquivamento |

---

## 5. `CoachCheckIn` — atenção especial

Auditado, **não alterado**, por pedido explícito da etapa.

- **É o dado mais sensível do produto.** Não é desempenho: é como a pessoa disse
  que estava, num dia específico, identificada.
- **Hoje ninguém além do próprio vendedor acessa** — nenhuma rota de gerente ou
  admin lê a tabela, e existe teste que varre `src/manager/` e as rotas
  administrativas para garantir isso.
- **Nunca vira score, ranking, recompensa ou penalidade** (Constituição). O
  check-in só inclina a pertinência do turno.
- **Uma linha por dia, para sempre.** Um ano de uso = 365 registros do estado
  emocional de uma pessoa, identificados, sem expiração.

**O risco não é de exposição hoje — é de acúmulo.** A base cresce um dataset
emocional longitudinal que nenhuma funcionalidade pede. A pergunta para o
usuário é direta: *o check-in precisa ser histórico, ou basta ser estado do
dia?* Se bastar o dia, esta é a tabela com a melhor relação
risco-removido/funcionalidade-perdida do sistema inteiro.

**Nada foi feito.** Apagar, agregar ou anonimizar check-in é decisão humana.

---

## 6. O que esta auditoria NÃO fez

- Não implementou purga, job, TTL, cron ou arquivamento.
- Não definiu nenhum prazo — nem 30 dias, nem 1 ano, nem nenhum outro.
- Não mapeou obrigação legal (LGPD, trabalhista). **Isso precisa de quem
  responde pelo negócio**, e várias linhas acima dependem disso.
- Não alterou permissão, acesso ou visibilidade de nada.

## 7. Decisões humanas necessárias, em ordem de peso

1. **`CoachCheckIn`**: histórico ou estado do dia? (maior risco, menor custo)
2. **`CoachMessage`**: por quanto tempo guardar transcrição de conversa pessoal?
3. **`IndicadorRealizado`**: granularidade horária precisa durar anos? (maior volume)
4. **`AuditEvent`**: qual o período de prova exigido?
5. **Ledger financeiro**: existe fechamento contábil? Sem ele, não se purga.
6. **`Vendedor` desligado**: anonimizar depois de quanto tempo?
7. **`ActivationToken`** consumido: remover é seguro e provavelmente desejável.
