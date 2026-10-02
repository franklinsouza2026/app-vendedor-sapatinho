# Fase 1 — Roteiro de homologação (Admin e Vendedor, A–Z)

> Para testar no navegador sem tocar em SQL, terminal, banco, seed ou código.
> Tudo é simulado e fica salvo **neste navegador**. Para começar do zero: no Admin, faixa azul do topo → **Restaurar dados de demonstração**.

## Como abrir

```bash
cd /Users/Franklin/app-vendedor-sapatinho/web
npm run dev
```

Abra **http://localhost:5173/fase1**. Não precisa de backend nem Docker. Não há senha: a entrada pergunta se você quer entrar como **Vendedora** ou como **Admin**.

Dica: no Chrome, ⌥⌘I → ⇧⌘M para ver o app da vendedora em tamanho de celular.

---

## ADMIN — configurar o jogo (≈ 10 min)

1. **Entrada → Entrar como Admin.** Você cai na **Visão geral**.
   - Veja o **% de prontidão** e os **bloqueios**.
   - Leia as **⚠️ Pendências**: Sofia sem meta, vínculos ERP pendentes, Difusora com dado atrasado, campanha sem premiação, Loja × Loja sem regra.
2. **Resolver pendências** (cada uma tem link):
   - *Metas e calendário* → dê uma meta à **Sofia Andrade** (Difusora) → **Salvar metas**. Observe "Soma individual" e o aviso de diferença em relação à meta da loja.
   - *Saúde dos dados* → **Simular sync agora** em Difusora.
   - *Vendedores* → Lucas → **Verificar vínculo ERP**.
   - Volte à Visão geral: as pendências somem e a prontidão sobe.
3. **Meta da Ana**: *Metas do mês* → Ana Beatriz Lima = **32000** → Salvar → **👁 Ver como a Ana recebe**. Na Home: "R$ 23.200 / R$ 32.000", "Faltam R$ 8.800", "≈ 36 vendas". **Voltar ao Admin** (faixa roxa).
4. **Meta diária**: aba *Meta diária* → compare as 3 regras → escolha **Distribuição uniforme** → 👁 → a Meta de hoje muda.
5. **Calendário**: aba *Calendário operacional* → adicione feriado em **28/10/2026** (todas as lojas) → 👁 → Desempenho › Meu ritmo › Mês: dias restantes **7** e mais vendas/dia. (Opcional: feriado em 22/10 para Caruaru → "A loja não abre hoje".)
6. **Indicadores**: oculte **Pares** → 👁 → a estimativa de pares some. Tente ligar **Conversão**: bloqueado (sem fonte).
7. **Rankings**: *Individual* → métrica da corrida = **% da Meta** → 👁 → "Sua posição" fala em p.p.
   - Volte e escolha **Vendas (R$)** de novo.
   - *Loja × Loja* → escolha uma regra → a pendência some.
   - *Elegibilidade*: veja motivos.
8. **Missão nova**: *Missões* → **Templates** → **Produto da Semana**:
   - Nome "Bota da semana", objetivo "Venda 2 pares…", meta **2**.
   - Marque um produto (filtre por categoria). Veja a **checagem** ficar verde e o **preview** na moldura de celular.
   - **Publicar agora**.
9. **Produtos**: aba *Produtos* → cadastre uma referência nova.
10. **Campanha nova**: *Campanhas* → **+ Nova campanha** → percorra as **10 etapas**:
    - Identidade → Período (01/11 a 30/11) → Participantes → Objetivo.
    - Mecânica: adicione "Top vendedor" e "Meta batida". Em "Top vendedor", escolha a competição **Aquecimento Black Friday**.
    - Recompensas: deixe "Meta batida" **sem prêmio**. Em Preview/Publicação aparece **"Não é possível publicar"** com o motivo exato.
    - Volte, escolha o prêmio, escreva as regras → **Publicar** → ela fica **Programada** (começa em novembro).
11. **Imutabilidade**: abra **Outubro Campeão** (ativa).
    - Veja o aviso **🔒 regras críticas bloqueadas**: o campo Período fica desabilitado.
    - Use **Duplicar** para criar uma substituta.
12. **Premiações**: cadastre um prêmio empresarial (ex.: "Vale R$ 200", categoria Vale) e veja **onde cada prêmio é usado**.
13. **Reconhecer**: *Reconhecimentos* → Ana → motivo **Iniciativa** → título e mensagem → Enviar.
14. **Gamificação**: *XP* e *VendaCoins* são **somente consulta** (nenhum saldo editável). *Níveis e conquistas*: distribuição e catálogo.
15. **Feed**: oculte "Mudança de posição" e veja o feed da Ana mudar ao lado.
16. **Auditoria**: tudo o que você fez está lá, com antes, depois e motivo (busque "meta").
17. **Prontidão** e **Uso do piloto**: confira.

## VENDEDORA — jogar o jogo (≈ 8 min)

Clique em **👁 Ver como vendedora** (ou saia e entre como Vendedora). A faixa azul tracejada do topo (**🧪 DEMO · B — trocar**) muda o **cenário**.

1. **Início (cenário B)**, em 10 segundos:
   - Meta de hoje 76%, "Faltam R$ 486 — ≈ 2 vendas" (com selo **est.**).
   - Você também está perto, Corrida do mês (≈ vendas, pares, vendas/dia).
   - Sua posição: #2 na loja ↑1, #7 geral ↑2, "Faltam R$ 320 para o #1".
2. **Reconhecimento**: o feed mostra "Você recebeu um reconhecimento" (se você fez o passo 13 do Admin). Perfil › Reconhecimentos.
3. **Ranking**:
   - Minha loja (faturamento das colegas oculto) → troque para **PA**: a distância fala em PA, não em R$.
   - Geral (com a loja de cada um) → **Loja × Loja**.
4. **Desempenho**: Meu ritmo (Hoje/Mês) → Indicadores (Hoje/Mês/Histórico) → Comparar (Eu × Loja, Eu × Empresa).
5. **Desafios**:
   - *Missões*: encontre **Bota da semana** e toque em **🧪 Simular um par vendido** até concluir → **celebração** → Perfil › VendaCoins mostra o crédito.
   - *Competições*: abra uma classificação.
   - *Campanha*: frentes, prêmios, regras e histórico ("Setembro em Dobro").
6. **Perfil**: nível e XP (faltam X para o próximo), VendaCoins (extrato), Conquistas (conquistadas / a conquistar), Recordes.
7. **Cenários** (DEMO → trocar):
   - **D/E/F/G**: meta batida, 110%, 120%, 150% e as celebrações.
   - **C**: quase #1. **H**: último no ranking, mas evoluindo. **I**: missão quase concluída.
   - **K**: novo nível. **L/M**: recorde próximo e recorde batido. **N**: loja quase #1.
   - **O**: vendedora nova. **P**: sem meta. **Q**: sem ticket. **R**: dado desatualizado.
   - **S**: campanha em destaque. **T**: campanha encerrada.
   - Estados: **X1–X6** (folga, loja fechada, erro, carregando, offline, vazio).
8. **Celebrações**: DEMO → "Experimentar celebrações" (10 tipos).

## O que observar (para criticar)

- A Home responde em 5–10 s "como estou, quanto falta, qual minha posição, o que conquistar"?
- As estimativas parecem promessa? (devem parecer estimativa)
- Algum estado humilha ou pressiona? (último no ranking, sem meta, folga)
- O Admin consegue operar sem ajuda? O que faltou para configurar algo?
- O "Ver como vendedora" deu confiança antes de publicar?
- A Home está longa demais? O que sairia?
