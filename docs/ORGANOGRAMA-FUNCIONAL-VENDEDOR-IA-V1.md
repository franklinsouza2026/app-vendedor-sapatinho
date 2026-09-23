# Organograma Funcional — Vendedor IA V1

Desenho conceitual. **Nada aqui está implementado.** Baseline `25691ac`.
Legenda de estado em todos os diagramas:

- **verde** = existe hoje e funciona
- **amarelo** = existe parcialmente, ou existe e está escondido
- **vermelho** = não existe

---

## 1. Hierarquia humana

```mermaid
flowchart TD
    A["ADMIN<br/><i>governa empresa, regras e conteúdo</i>"]:::ok
    C["COORDENADOR<br/><i>lidera Supervisores</i>"]:::novo
    S["SUPERVISOR<br/><i>lidera Gerentes</i>"]:::novo
    G["GERENTE DE LOJA<br/><i>lidera Vendedores</i>"]:::ok
    V["VENDEDOR<br/><i>executa e se desenvolve</i>"]:::ok
    P["PLATFORM_ADMIN<br/><i>só conhecimento global</i>"]:::parcial

    A --> C --> S --> G --> V
    A -.->|"fora da cadeia operacional"| P

    classDef ok fill:#d5f5e3,stroke:#1e8449,color:#0b3d22
    classDef parcial fill:#fdebd0,stroke:#b9770e,color:#5b3a06
    classDef novo fill:#fadbd8,stroke:#a93226,color:#641e16
```

**Leitura:** dos cinco níveis, dois não existem. E `PLATFORM_ADMIN` existe no enum
mas **não tem nenhuma rota HTTP** — está fora da cadeia de propósito (governa só
conhecimento global, nunca pessoas).

---

## 2. Módulos do produto

```mermaid
flowchart TB
    subgraph EXP["EXPERIÊNCIA INDIVIDUAL — toda pessoa tem"]
        H[Home]:::ok
        PF[Perfil]:::ok
        CO["Conselheiro<br/>EVOLUIR"]:::ok
    end

    subgraph TRAB["TRABALHO — o que eu faço e como estou"]
        MT[Metas]:::ok
        PE[Performance]:::ok
        RK[Ranking]:::ok
    end

    subgraph DES["DESENVOLVIMENTO — 4 verbos"]
        MI["Missões<br/>FAZER"]:::ok
        UN["Universidade<br/>APRENDER"]:::ok
        SI["Simulador<br/>PRATICAR"]:::ok
    end

    subgraph GAM["GAMIFICAÇÃO — reconhecer"]
        XP[XP e Níveis]:::ok
        VC[VendaCoins]:::ok
        BD[Badges]:::ok
        CP["Competições<br/>Temporadas · Ligas"]:::parcial
        FE["Feed e<br/>Reconhecimento"]:::ok
    end

    subgraph GES["GESTÃO — só para quem lidera"]
        EQ["Minha Equipe"]:::ok
        AL[Alertas]:::ok
        PA[Planos de Ação]:::ok
        UM["1:1 e Follow-ups"]:::ok
        RD["Reunião do Dia"]:::ok
        OP["Minha Operação<br/>(Supervisor/Coordenador)"]:::novo
    end

    subgraph GOV["GOVERNANÇA — Admin"]
        ES[Estrutura]:::parcial
        CN["Conteúdo<br/>(CMS)"]:::parcial
        RG[Regras e Recompensas]:::ok
        IA["AI Control Plane"]:::ok
        AU[Auditoria]:::ok
    end

    subgraph INT["INTELIGÊNCIA — invisível"]
        CM[Competências]:::ok
        EV[Evidências]:::ok
        PD[PDI]:::ok
        CE[Certificações]:::parcial
        KN["Knowledge<br/>do Conselheiro"]:::parcial
    end

    DES --> INT
    TRAB --> INT
    INT --> DES
    INT --> GES
    DES --> GAM

    classDef ok fill:#d5f5e3,stroke:#1e8449,color:#0b3d22
    classDef parcial fill:#fdebd0,stroke:#b9770e,color:#5b3a06
    classDef novo fill:#fadbd8,stroke:#a93226,color:#641e16
```

**Onde Treinador e Academia foram parar:** não estão no diagrama porque deixam de
ser módulo. O conteúdo da Academia entra em **Universidade**; o Playbook do Treinador
vira **conteúdo governado** consumido por Universidade, Simulador e Conselheiro.

---

## 3. Permissões — as quatro dimensões

```mermaid
flowchart LR
    subgraph DIM["Dimensões"]
        direction TB
        VER["VER<br/><i>consultar dado</i>"]
        OPE["OPERAR<br/><i>agir sobre o próprio trabalho</i>"]
        COM["COMANDAR<br/><i>atribuir/decidir para outro</i>"]
        GOV["GOVERNAR<br/><i>mudar a regra do sistema</i>"]
    end

    subgraph ESC["Escopos"]
        direction TB
        OWN["OWN<br/><i>só eu</i>"]
        DIR["DIRECT_REPORTS<br/><i>um nível abaixo</i>"]
        SUB["SUBTREE<br/><i>toda a árvore abaixo</i>"]
        CMP["COMPANY<br/><i>a empresa inteira</i>"]
    end

    DIM --- ESC
```

**Regra congelada (§6 da etapa):**

```mermaid
flowchart LR
    A["VER: SUBTREE<br/><i>enxergo toda a árvore</i>"] -->|"NÃO implica"| B["COMANDAR: SUBTREE"]
    A --> C["COMANDAR: DIRECT_REPORTS<br/><i>comando só o nível imediato</i>"]

    style A fill:#d5f5e3,stroke:#1e8449
    style B fill:#fadbd8,stroke:#a93226
    style C fill:#d5f5e3,stroke:#1e8449
```

**E a regra de falha:**

```mermaid
flowchart TD
    X["Papel desconhecido<br/>chega numa rota"] --> Y{"Modelo de escopo"}
    Y -->|"HOJE — lojaRestritaDe"| Z["undefined → COMPANY<br/><b>FALHA ABERTO</b>"]:::bad
    Y -->|"DESENHO V1"| W["NONE<br/><b>DENY BY DEFAULT</b>"]:::good

    classDef bad fill:#fadbd8,stroke:#a93226,color:#641e16
    classDef good fill:#d5f5e3,stroke:#1e8449,color:#0b3d22
```

---

## 4. Fluxo de desenvolvimento — o loop

```mermaid
flowchart LR
    N["Necessidade<br/>identificada"]:::ok
    A["APRENDER<br/>Universidade"]:::ok
    Q["VALIDAR<br/>Quiz 10q · 70%"]:::parcial
    P["PRATICAR<br/>Simulador"]:::ok
    E["EXECUTAR<br/>Missões"]:::ok
    EV["Evidência de<br/>competência"]:::ok
    R["Reconhecer<br/>XP · Moeda · Badge · Certificado"]:::ok
    S["Recomendar<br/>próximo passo"]:::ok

    N --> A --> Q --> P --> E --> EV --> R --> S --> N
    C(("CONSELHEIRO<br/>acompanha<br/>transversalmente")):::ok
    C -.-> N
    C -.-> A
    C -.-> P
    C -.-> E
    C -.-> R

    classDef ok fill:#d5f5e3,stroke:#1e8449,color:#0b3d22
    classDef parcial fill:#fdebd0,stroke:#b9770e,color:#5b3a06
```

**Freio deliberado (§51 da etapa):** nem todo gap vira curso + simulação + missão +
alerta. A regra de desenho é:

```mermaid
flowchart LR
    G["Gap detectado"] --> D{"Quem decide<br/>o que fazer?"}
    D -->|"A pessoa"| SU["SUGERIR<br/><i>aparece no 'Para você'</i>"]:::good
    D -->|"O líder"| AT["ATRIBUIR<br/><i>vira missão/PDI com autor</i>"]:::warn
    D -->|"O sistema sozinho"| NO["NUNCA<br/><i>automação opressiva</i>"]:::bad

    classDef good fill:#d5f5e3,stroke:#1e8449,color:#0b3d22
    classDef warn fill:#fdebd0,stroke:#b9770e,color:#5b3a06
    classDef bad fill:#fadbd8,stroke:#a93226,color:#641e16
```

---

## 5. Fluxo de gestão

```mermaid
flowchart TD
    ERP["ERP (Linx)<br/>sync horário"]:::parcial --> IND["IndicadorRealizado"]:::ok
    IND --> MOT["Motor determinístico<br/>metas · baseline · score"]:::ok
    MOT --> AT["Attention Engine<br/>100% determinístico"]:::ok
    AT --> ALE["Alertas gerenciais"]:::ok
    ALE --> INB["Pendências<br/>(inbox do líder)"]:::ok
    INB --> ACAO{"Líder decide"}
    ACAO --> PLA["Plano de ação"]:::ok
    ACAO --> UM["1:1"]:::ok
    ACAO --> MIS["Atribuir missão"]:::novo
    ACAO --> REC["Reconhecer"]:::ok
    ACAO --> FUP["Follow-up"]:::ok
    MOT --> RDD["Reunião do Dia"]:::ok
    IA(("IA de gestão<br/>resume e prioriza<br/><i>nunca decide</i>")):::ok
    IA -.-> RDD
    IA -.-> INB

    classDef ok fill:#d5f5e3,stroke:#1e8449,color:#0b3d22
    classDef parcial fill:#fdebd0,stroke:#b9770e,color:#5b3a06
    classDef novo fill:#fadbd8,stroke:#a93226,color:#641e16
```

---

## 6. Arquitetura de IA

```mermaid
flowchart TB
    subgraph USO["IA que conversa com a pessoa"]
        CO["Conselheiro<br/><i>1 agente, N conhecimentos</i>"]:::ok
        PC["Personagem do Simulador<br/><i>interpreta, não ensina</i>"]:::ok
        AV["Avaliador do Simulador<br/><i>avalia, não interpreta</i>"]:::ok
        AG["Assistente de Gestão<br/><i>resume, não decide</i>"]:::ok
    end

    subgraph BACK["IA que trabalha para o Admin — offline"]
        RE[Research]:::ok
        CU[Curator]:::ok
        ID[Instructional Designer]:::ok
        QA[Quiz Agent]:::ok
        SD[Simulation Designer]:::ok
        GO[Governance]:::ok
        CUP[Content Update]:::ok
    end

    subgraph DET["Determinismo — IA proibida"]
        GT["Gate de pertinência"]:::det
        KR["Knowledge Router"]:::det
        NT["Nota do Simulador"]:::det
        GB["Gabarito do Quiz"]:::det
        LD["Ledger XP/Moeda"]:::det
        RB["RBAC e escopo"]:::det
    end

    GW["AI GATEWAY<br/>provider · modelo · credencial<br/>budget · ledger · saúde"]:::gate
    USO --> GW
    BACK --> GW
    GW --> PR["Provider real<br/><i>nenhum configurado hoje</i>"]:::parcial

    KN[("Knowledge<br/>governado")]:::ok
    KN -.-> CO
    PB[("Playbook<br/>oficial")]:::ok
    PB -.-> PC
    PB -.-> ID

    HU{{"HUMANO PUBLICA<br/><i>IA nunca publica sozinha</i>"}}:::gate
    BACK --> HU

    classDef ok fill:#d5f5e3,stroke:#1e8449,color:#0b3d22
    classDef parcial fill:#fdebd0,stroke:#b9770e,color:#5b3a06
    classDef det fill:#d6eaf8,stroke:#1f618d,color:#0b2e4f
    classDef gate fill:#e8daef,stroke:#6c3483,color:#3d1e4f
```

---

## 7. Integração entre módulos — o grafo que importa

```mermaid
flowchart LR
    ERP[ERP]:::ok -->|"indicadores"| PERF[Performance]:::ok
    META[Metas]:::ok --> PERF
    PERF -->|"atingimento"| XP[XP/Moeda]:::ok
    PERF -->|"snapshot"| RANK[Ranking]:::ok
    PERF -->|"critério"| MIS[Missões]:::ok

    UNI[Universidade]:::ok -->|"aula concluída"| XP
    UNI -->|"quiz aprovado"| EVI[Evidências]:::ok
    UNI -->|"quiz aprovado"| XP
    SIM[Simulador]:::ok -->|"score final"| EVI
    SIM -->|"sessão ≥3 turnos"| XP
    MIS -->|"missão concluída"| EVI
    MIS -->|"recompensa"| XP
    GES[Gestão]:::ok -->|"avaliação do líder"| EVI

    EVI --> SCORE["Score de<br/>competência"]:::ok
    SCORE --> GAP["Gap Engine"]:::ok
    GAP --> PDI[PDI]:::ok
    GAP --> PARA["'Para você'"]:::ok
    EVI --> CERT[Certificação]:::parcial

    XP --> FEED[Feed]:::ok
    CERT --> FEED
    MIS --> FEED

    CONS[Conselheiro]:::ok -.->|"lê, nunca escreve"| PERF
    CONS -.->|"lê"| GAP
    CONS -.->|"lê"| KN[(Knowledge)]:::ok

    classDef ok fill:#d5f5e3,stroke:#1e8449,color:#0b3d22
    classDef parcial fill:#fdebd0,stroke:#b9770e,color:#5b3a06
```

**O que esse grafo revela:** **Evidência é o barramento central do produto.** Quatro
fontes escrevem nela (quiz, simulação, missão, avaliação do líder) e três consumidores
leem (score/gap, PDI, certificação). Ela já existe e já está ligada — e é por isso que
"Inteligência de Desenvolvimento" não precisa virar módulo visível.

---

## 8. Fronteiras de privacidade

```mermaid
flowchart TB
    subgraph PRIV["PRIVADO INDIVIDUAL — ninguém acima lê"]
        CV["Conversa do Conselheiro"]:::priv
        CH["Check-in de humor"]:::priv
        MP["Memória profissional"]:::priv
        IN["Intervenções do Conselheiro"]:::priv
        TR["Transcript do Simulador"]:::priv
    end

    subgraph SEMI["SEMI-PRIVADO — a pessoa e seu líder direto"]
        PD["PDI"]:::semi
        AV["Avaliação do líder"]:::semi
        NO["Notas do 1:1"]:::semi
        SC["Score de competência"]:::semi
    end

    subgraph OPER["OPERACIONAL — a árvore acima vê"]
        MT["Meta e realizado"]:::oper
        KP["PA · Ticket · Faturamento"]:::oper
        MI["Missões e progresso"]:::oper
        CU["Conclusão de curso"]:::oper
        CE["Certificações"]:::oper
    end

    subgraph PUB["VISÍVEL AOS PARES"]
        RK["Ranking<br/><i>sem faturamento alheio</i>"]:::pub
        FD["Feed e badges"]:::pub
    end

    subgraph GOVN["GOVERNANÇA — Admin"]
        AD["Auditoria · regras<br/>conteúdo · estrutura"]:::gov
    end

    ADMIN["ADMIN"] --> GOVN
    ADMIN -.->|"NÃO alcança"| PRIV
    LID["LÍDER (qualquer nível)"] --> OPER
    LID -.->|"NÃO alcança"| PRIV

    classDef priv fill:#fadbd8,stroke:#a93226,color:#641e16
    classDef semi fill:#fdebd0,stroke:#b9770e,color:#5b3a06
    classDef oper fill:#d5f5e3,stroke:#1e8449,color:#0b3d22
    classDef pub fill:#d6eaf8,stroke:#1f618d,color:#0b2e4f
    classDef gov fill:#e8daef,stroke:#6c3483,color:#3d1e4f
```

**A travessia legítima da fronteira** — a pessoa leva, o sistema não relata:

```mermaid
sequenceDiagram
    participant V as Vendedor
    participant C as Conselheiro
    participant G as Gerente
    V->>C: desabafa sobre uma dificuldade
    C->>V: "isso parece assunto pro seu 1:1 —<br/>quer ajuda pra organizar o que falar?"
    V->>G: leva, por decisão própria
    Note over C,G: Nenhum relatório automático atravessa.
```

**O Simulador tem um trade-off aberto:** hoje a transcrição é do usuário. Se a
liderança passar a ver o transcript, o espaço de prática vira vigilância. Recomendação
de desenho: o líder vê **conclusão, score e competência**; o **feedback detalhado e o
transcript ficam com quem praticou**. Decisão humana no Decision Board (D-07).

---

## 9. Governança do Admin

```mermaid
flowchart TB
    AD(("ADMIN")):::gov

    subgraph EST["ESTRUTURA"]
        E1[Lojas]:::ok
        E2[Pessoas e papéis]:::ok
        E3["Árvore organizacional"]:::novo
        E4["Vínculo pessoa ↔ loja(s)"]:::novo
    end

    subgraph CONT["CONTEÚDO"]
        C1["Cursos, aulas, questões"]:::ok
        C2["13 Mandamentos"]:::parcial
        C3["Certificações"]:::parcial
        C4["Playbook oficial"]:::novo
        C5["Cenários do Simulador"]:::novo
        C6["KnowledgeCards"]:::novo
        C7["Catálogo de missões"]:::novo
    end

    subgraph REG["REGRAS"]
        R1["XP · Moeda · Score"]:::ok
        R2["Metas"]:::ok
        R3["Competições e ligas"]:::ok
        R4["Limiares de alerta"]:::ok
        R5["Recompensa de missão"]:::parcial
    end

    subgraph INT["INTELIGÊNCIA"]
        I1["Provider e modelo"]:::ok
        I2[Budget]:::ok
        I3["Uso e custo"]:::ok
        I4["Jobs de geração por IA"]:::ok
    end

    subgraph AUD["GOVERNANÇA"]
        A1["Auditoria append-only"]:::ok
        A2["Auditoria de plataforma"]:::ok
    end

    AD --> EST & CONT & REG & INT & AUD

    classDef ok fill:#d5f5e3,stroke:#1e8449,color:#0b3d22
    classDef parcial fill:#fdebd0,stroke:#b9770e,color:#5b3a06
    classDef novo fill:#fadbd8,stroke:#a93226,color:#641e16
    classDef gov fill:#e8daef,stroke:#6c3483,color:#3d1e4f
```

**As cinco superfícies vermelhas em CONTEÚDO são o trabalho real de "Admin governa sem
terminal".** Hoje playbook, cenários, missões e conhecimento só existem via seed ou script.

---

## 10. Jornada por papel — navegação proposta

```mermaid
flowchart TB
    subgraph VEND["VENDEDOR — 5 itens"]
        V1[Início]:::ok --> V2[Performance]:::ok --> V3[Evoluir]:::ok --> V4[Ranking]:::ok --> V5[Perfil]:::ok
        V3 -.-> VA[Missões]:::ok
        V3 -.-> VB[Universidade]:::ok
        V3 -.-> VC[Simulador]:::ok
        V1 -.-> VD[Conselheiro]:::ok
    end

    subgraph GER["GERENTE — 5 itens"]
        G1[Início]:::ok --> G2["Minha Equipe"]:::ok --> G3[Evoluir]:::ok --> G4["Pendências"]:::ok --> G5[Perfil]:::ok
        G2 -.-> GA["Reunião do Dia"]:::ok
        G2 -.-> GB["1:1 · Planos"]:::ok
        G3 -.-> GC["Meu desenvolvimento<br/><i>igual ao vendedor</i>"]:::ok
    end

    subgraph SUP["SUPERVISOR — 5 itens"]
        S1[Início]:::novo --> S2["Meus Gerentes"]:::novo --> S3[Evoluir]:::parcial --> S4[Pendências]:::novo --> S5[Perfil]:::ok
    end

    subgraph COO["COORDENADOR — 5 itens"]
        C1[Início]:::novo --> C2["Minha Operação"]:::novo --> C3[Evoluir]:::parcial --> C4[Prioridades]:::novo --> C5[Perfil]:::ok
    end

    subgraph ADM["ADMIN — nav lateral"]
        A1[Estrutura]:::parcial
        A2[Pessoas]:::ok
        A3[Metas]:::ok
        A4[Conteúdo]:::parcial
        A5[Gamificação]:::ok
        A6[Inteligência]:::ok
        A7[Auditoria]:::ok
    end

    classDef ok fill:#d5f5e3,stroke:#1e8449,color:#0b3d22
    classDef parcial fill:#fdebd0,stroke:#b9770e,color:#5b3a06
    classDef novo fill:#fadbd8,stroke:#a93226,color:#641e16
```

**Princípio de desenho:** todo papel tem **Início · [seu escopo] · Evoluir · [suas
pendências] · Perfil**. Cinco itens, sempre. O que muda entre papéis são os itens 2 e 4,
nunca a quantidade.

E **"Evoluir" é igual para todos** — porque todo mundo, inclusive o coordenador, é uma
pessoa em desenvolvimento. É a diferença entre um app de gestão e um sistema de trabalho.

---

## 11. Estado atual × desenho, em um diagrama

```mermaid
flowchart LR
    subgraph HOJE["HOJE — hub Evoluir"]
        H1[Treinador]:::parcial
        H2[Simulador]:::ok
        H3[Academia]:::parcial
        H4[Universidade]:::ok
    end

    subgraph V1["V1 — hub Evoluir"]
        F1["Missões<br/>FAZER"]:::ok
        F2["Universidade<br/>APRENDER"]:::ok
        F3["Simulador<br/>PRATICAR"]:::ok
        F4["Conselheiro<br/>EVOLUIR"]:::ok
    end

    H3 -->|"conteúdo e CMS"| F2
    H1 -->|"Playbook oficial"| F2
    H1 -->|"modos e personagem"| F3
    H1 -->|"objeções como conhecimento"| F4
    H2 --> F3
    H4 --> F2

    classDef ok fill:#d5f5e3,stroke:#1e8449,color:#0b3d22
    classDef parcial fill:#fdebd0,stroke:#b9770e,color:#5b3a06
```

**Nenhuma seta aponta para o lixo.** Essa é a leitura que este organograma existe
para provar.
