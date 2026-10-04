# Linx — Auditoria e Descoberta (pré-implementação)

Data: 2026-10-04 · Base: `restore/pre-linx-fase1` = `e4bca55` · **Nenhum código alterado.**

Legenda de evidência usada em todo o documento:

| Selo | Significado |
|---|---|
| **[C]** COMPROVADO | verificado nesta rodada em dado/artefato real |
| **[D]** DOCUMENTAÇÃO/CÓDIGO | lido na especificação oficial Linx ou no nosso código |
| **[I]** INFERIDO | conclusão razoável a partir de [C]/[D], não verificada |
| **[?]** NÃO CONFIRMADO | precisa de acesso real ou decisão |

---

## 1. Veredito executivo

- O ERP das lojas é o **Linx Microvix** **[C]**: ERP MCX FULL + PDV/POS, migração do ERP anterior ("SERVER") em **01/10/2025**.
- O caminho oficial de integração é o **WebService de Saída Padrão do Microvix** **[D]**.
  - Requisição: XML/HTTP POST, autenticada por **chave de acesso** (GUID) + portal + CNPJ.
  - Sincronização **incremental por `timestamp`**, um rowversion do SQL Server.
- Esse mecanismo **resolve o gap conhecido** (`LINX-INTEGRATION-DECISION`): toda alteração em um registro gera um timestamp novo, inclusive cancelamento.
  - Basta pedir "maior que o último timestamp salvo", com a janela de datas obrigatória cobrindo o período em que vendas ainda podem mudar.
  - Venda atrasada ou cancelada dias depois **não se perde**.
- O contrato de eventos do Vendedor IA (VENDA / CANCELAMENTO / DEVOLUCAO) **comporta o Microvix sem mudar o núcleo**. Precisam de ajuste:
  - **cursor persistente** (timestamp por método/CNPJ) no sync;
  - **cache de produtos** (código → referência/cor/tamanho/categoria);
  - **regra de pares** (decisão de negócio + amostra real);
  - campos de configuração (portal) na tela de Integrações.
- **Bloqueio externo:** não existe chave do WebService configurada em lugar nenhum **[C]**. É preciso **ativar o WebService de Saída** para o portal das lojas junto à Linx (ou confirmar com a franqueadora como obter a chave).

**Prontidão para implementar Linx: 720/1000.** A arquitetura e o mapeamento estão definidos. Faltam a chave de acesso e uma amostra real para fechar valores, pares e vendedor por item.

## 2. Produto Linx identificado

| Fato | Evidência |
|---|---|
| Produto: **Linx Microvix** | **[C]** Proposta comercial "Solução Linx Microvix – Arquitetura e franquias" (v1 22/04 e v2 29/04); arquivos "Formulário de Parametrização – Implantação Microvix", "Produtos Cadastrados – Microvix ERP", "Planilhas Implantação Microvix.zip" |
| Módulos: ERP MCX FULL, PDV/POS, emissor NFC-e/NF-e, TEF, Reshop (CRM/fidelidade), Equals (conciliação) | **[C]** proposta |
| A franqueadora contrata **"Webservice de saída (para enviar as informações para o Prisma BI)"** por CNPJ e um "Portal BD franqueador em rede" | **[C]** proposta, itens da franqueadora |
| Migração SERVER → LINX em **01/10/2025**; histórico anterior não está no Microvix | **[C]** dados do Prisma (auditoria anterior, `~/prisma-etapa0`) |
| Portal Microvix das lojas: **`24084`**, empresas `1..4` (ex.: `24084_2` = Caruaru Shopping) | **[C]** mapa de lojas do Prisma · **[I]** que `24084` é o "portal" e o sufixo é o "id da empresa no portal" (padrão Microvix) |
| Versão do WebService: especificação oficial **v209 (30/07/2025)**, 166 páginas | **[D]** share.linx.com.br |

Não foi possível confirmar a versão exata do ERP instalado nem se o portal `24084` pertence ao franqueado ou à rede **[?]**.

## 3. Fonte de dados disponível

| Fonte | Situação |
|---|---|
| **Microvix WebService de Saída Padrão** (API oficial, só leitura) | existe e está documentada **[D]**; **sem chave para o nosso portal [C]** |
| **Prisma BI** (iPrisma, BI da franqueadora alimentado pelo WebService) | dados reais item a item com vendedor, situação e cancelamento **[C]**. API interna usada antes só por sessão logada; não é integração oficial nossa |
| Relatórios do Microvix ("Faturamento por Período", "Movimento Diário") | existem **[D]** (manual de terceiro NAPP); só por tela/exportação |
| Banco Microvix | SaaS Linx (SQL Server). **Não há acesso a banco [I]** |

## 4. Forma de acesso (WebService de Saída) **[D]**

- `POST https://webapi.microvix.com.br/1.0/api/integracao`, corpo XML:
  `<LinxMicrovix><Authentication user=… password=…/><ResponseFormat>xml</ResponseFormat><IdPortal>…</IdPortal><Command><Name>LinxMovimento</Name><Parameters>…</Parameters></Command></LinxMicrovix>`.
- Existe ambiente de homologação ("aceitação") com URL própria.
- Usuário e senha são **padrões fixos publicados pela Linx**. O segredo real é a **chave de acesso (GUID)**, entregue na ativação, junto com o nome do grupo.
- Toda consulta é **por CNPJ da loja** (`cnpjEmp`). A chave dá acesso às lojas do portal/grupo (`LinxGrupoLojas`, `LinxLojas`).
- A Linx faz 30 dias de acompanhamento de homologação após a entrega da chave.
- Regra de uso: o consumidor **deve ter base local** e consultar só o incremental. "Consumo indevido… resultará na desativação da chave… sem prévio aviso."

## 5. Contrato atual do ERP Adapter (o que uma fonte precisa entregar) **[D]**

`src/integracoes/erp/erp-adapter.interface.ts` — `ErpAdapter.buscarEventos(consulta)` devolve uma lista de eventos validados por zod.

| Evento | Campos obrigatórios |
|---|---|
| **VENDA** | `idExterno` (chave de idempotência, único por empresa); `lojaExterna` (código externo da loja, casado por `IntegracaoLoja.codigoExterno`); `vendedorExterno` (casado por `matriculaErp` na loja, `ExternalIdentity.externalSellerId` ou matrícula única na empresa); `ocorridoEm` (ISO com offset); `valor` (R$ da venda); `itens[]` = `referencia`, `descricao`, `categoria?`, `quantidade` (inteiro), **`pares`** (inteiro, 0 para bolsa), `valor` (total do item já com desconto) |
| **CANCELAMENTO** | `idExterno`, `vendaIdExterno`, `ocorridoEm` |
| **DEVOLUCAO** | `idExterno`, `vendaIdExterno`, `ocorridoEm`, `itens[]` (mesmo formato; casados por `referencia` na venda original) |

Entrada da consulta: `integracaoId`, `empresaId`, `lojasExternas[]`, `desde`, `ate`, `credencial` (decifrada só em memória) e `configuracao`.

Tratamento a jusante:
- `sync.service` usa janela `desde/ate`: na primeira vez 48 h, depois `cursorSync − 30 min` (**um `Date`, não um cursor da fonte**).
- `ingestao.service` grava `Venda`/`VendaItem`/`VendaAjuste` de forma idempotente por `(empresaId, idExterno)`, processando vendas antes de ajustes.
- Cancelamento e devolução são gravados na mesma transação.
- Motivos de descarte: evento inválido, loja/vendedor sem vínculo, venda desconhecida, venda já cancelada.
- O motor reconcilia meta, ranking, missões, XP e recordes a partir dos fatos.

## 6. Mapa Microvix → Vendedor IA

| Vendedor IA | Microvix (método.campo) | Evidência |
|---|---|---|
| Empresa | portal (`IdPortal`) + grupo da chave; CNPJs via `LinxGrupoLojas` | **[D]** |
| Loja / `lojaExterna` | `cnpj_emp` (CNPJ, 14 dígitos), que é o parâmetro de toda consulta. Alternativa estável: `empresa`/`loja` (id no portal) | **[D]** |
| Vendedor / `vendedorExterno` | `LinxMovimento.cod_vendedor` (INT) ↔ `LinxVendedores.cod_vendedor` (também tem `matricula`, `ativo`, `data_admissao`, `data_saida`) | **[D]** |
| Venda / `idExterno` | `identificador` (GUID que agrupa o documento fiscal) | **[D]** |
| `ocorridoEm` | `data_documento` (ou `data_lancamento`) + `hora_lancamento` (HH:MM), hora local da loja → ISO −03:00 | **[D]**; qual das duas datas é a venda: **[?]** |
| Item / `referencia` | `cod_produto` → `LinxProdutos.referencia` (referência comercial, ex. "SUNNY") | **[D]**/**[C]** (referência é a chave estável entre eras) |
| `descricao`, `categoria` | `LinxProdutos.nome`, `desc_setor`/`desc_linha`/`desc_classificacao` | **[D]**; qual campo é a categoria desta rede: **[?]** |
| `quantidade` | `quantidade` (FLOAT) | **[D]** |
| `pares` | **não existe no Microvix**: derivado de `quantidade` × regra por produto | ver §13 |
| `valor` (item) | `valor_total`/`valor_liquido` − `desconto_total_item` (+ `acrescimo`) | **[D]** campos; fórmula **[?]** |
| Cancelamento | mesmo `identificador` reaparece com `cancelado='S'` (ou `excluido='S'`) e **timestamp novo** | **[D]** + **[C]** (Prisma: `LINX/CANCELADO`) |
| Devolução | documento `operacao='DE'` + `LinxMovimentoDevolucoesItens` (`identificador_venda` ↔ `identificador_devolucao`, `codigoproduto`, `qtde_devolvida`) | **[D]** |

## 7. Empresas

- A chave do WebService dá acesso ao portal/grupo. `LinxGrupoLojas` devolve CNPJ, nome, `id lojas rede`, portal e nome do portal **[D]**.
- Mapeamento proposto: **1 Empresa Vendedor IA ↔ 1 portal Microvix** (configuração da Integração), com a chave como credencial.
- Uma credencial acessa as várias lojas (CNPJs) do mesmo portal **[D]**. Se a franqueadora tiver uma chave "de rede", ela enxergaria outros franqueados: **não usar** (menor privilégio) **[I]**.

## 8. Lojas

- Hoje: 3 lojas ativas (SDL 153 Caruaru Shopping = `24084_2`; SDL 146 Difusora = `24084_1`; SDL 147 Santa Cruz = `24084_4`) e SDL 148 Duque (`24084_3`, inativa) **[C]**.
- Código estável proposto para `IntegracaoLoja.codigoExterno`: **CNPJ da loja**, porque é o parâmetro obrigatório das consultas.
- O id no portal (`empresa`/`loja`) fica guardado como metadado **[I]**.
- Nada é fixo no código: o Admin vincula cada loja ao CNPJ na tela de Integrações. Opcional: um botão "buscar lojas do portal" via `LinxGrupoLojas`/`LinxLojas`.

## 9. Vendedores

- `LinxVendedores` (por CNPJ) tem `cod_vendedor`, nome, tipo (V/C/A), `ativo`, `data_admissao`, `data_saida`, **`matricula`** e `timestamp`. Também traz CPF, que **não será usado** como identificador **[D]**.
- Mapeamento proposto: `Vendedor.matriculaErp` ou `ExternalIdentity.externalSellerId` = **`cod_vendedor`** do Microvix.
  - O Admin informa no cadastro ("Matrícula no ERP").
  - A ingestão já procura nesses dois pontos **[D]** (nosso código).
- **[?]** Se `cod_vendedor` é único no portal (vale entre lojas) ou por loja. Isso define como tratar transferência e o vendedor que vende em mais de uma loja. A ingestão já aceita matrícula única na empresa como fallback.
- **[?]** Um mesmo documento pode ter **vendedores diferentes por item** (`cod_vendedor` está na linha do item).
  - Nosso contrato tem um vendedor por venda.
  - Solução no adapter, sem mudar o contrato: dividir o documento em uma VENDA por `(identificador, cod_vendedor)`, com `idExterno = identificador:cod_vendedor`.
- Desligamento e transferência continuam governados pelo Admin no Vendedor IA. `data_saida`/`ativo` servem só como alerta na Saúde dos Dados.

## 10. Vendas

`LinxMovimento` traz uma linha por item de documento **[D]**. Filtros para "venda que conta":
- `operacao = 'S'` (saída);
- `tipo_transacao` de venda (`V`, ou `S`/`P`/`A`/`M` segundo a OBS3 da v209 — **[?]** quais valem nesta rede);
- `soma_relatorio = 'S'`;
- `excluido = 'N'`.

Ficam de fora transferências (`T`), ajustes (`J`), reservas (`R`) e movimentos neutros (`N`).

Campos úteis: `documento`, `serie`, `chave_nf`, `modelo_nf`, `data_documento`, `data_lancamento`, `hora_lancamento`, `dt_insert`, `dt_update`, `timestamp`, `cancelado`, `cod_sefaz_situacao`.

O identificador estável para idempotência é o **`identificador` (GUID)** **[D]**, com fallback `cnpj + série + documento + modelo_nf` **[I]**.

## 11. Itens

`cod_produto` (SKU técnico), `cod_barra`, `quantidade`, `preco_unitario`, `preco_tabela_epoca`, `valor_total`, `valor_liquido`, `desconto`, `desconto_item`, `desconto_total_item`, `acrescimo`, `deposito` **[D]**. Tamanho e cor vêm do cadastro do produto (§12).

## 12. Produtos e referências

| Necessidade | Campo | Evidência |
|---|---|---|
| Identificador técnico estável | `cod_produto` (BIGINT, um por variante) | **[D]**; granularidade (cor×tamanho) **[I]** |
| Referência que o Admin reconhece (Produto da Semana) | `referencia` (VARCHAR 20) | **[D]** + **[C]** (relatórios usam "Referencia: SUNNY") |
| Cor / tamanho | `desc_cor`/`id_cor`, `desc_tamanho`/`id_tamanho` | **[D]** |
| Categoria | `desc_setor`, `desc_linha`, `desc_classificacao`, `desc_colecao`, `desc_marca` | **[D]**; qual equivale a CALÇADOS/BOLSAS **[?]** |
| Ativo | `desativado` | **[D]** |

- `LinxProdutos` exige uma faixa de `dt_update`, mas aceita filtro por `cod_produto`/`referencia` e por `timestamp` **[D]**.
- Proposta: cache local de produtos, alimentado por timestamp, com busca sob demanda do `cod_produto` ainda desconhecido.
- Fato importante **[C]**: entre as eras SERVER e LINX o id do produto e o nome da cor mudaram. **A referência é a chave estável**, e é ela que o Produto da Semana já usa.

## 13. Pares

O Microvix **não tem campo "pares"** **[D]**. Regra proposta, a ser confirmada:
- pares do item = `quantidade` quando o produto é calçado;
- 0 para bolsa e acessório;
- kit: a definir.

A classificação "calçado" deve vir de um campo do cadastro (setor/linha/classificação/unidade) que ainda **não foi confirmado [?]**. O Prisma usa uma categoria `CALCADOS` e há exports "Estoque Completo Calçados/Kits" **[C]**.

- Devolução parcial: `qtde_devolvida` por produto **[D]** → pares devolvidos pela mesma regra.
- **Cancelamento parcial de item: não há evidência de que exista**. O cancelamento é do documento (`cancelado` no documento) **[I]**.
- **Decisão de negócio pendente:** quais setores/linhas contam pares; como contar kit (1 par? n pares?).

## 14. Valores

Campos **[D]**:
- `valor_total` ("valor total do item");
- `valor_liquido` ("valor líquido do produto");
- `desconto` (desconto total da **venda**, repetido);
- `desconto_item` (desconto aplicado no item; vazio em NF-e);
- `desconto_total_item` (rateio proporcional do desconto da venda no item);
- `acrescimo`, `frete`, `preco_tabela_epoca`.

Proposta: faturamento do item = valor efetivamente pago pelo item (item líquido de desconto de item e de rateio, com acréscimo), sem frete.
- **Não está confirmado [?]** se `valor_liquido` já desconta `desconto_total_item` nem se é unitário ou total.
- Fechar com uma amostra real conciliada contra o relatório "Faturamento por Período" do Microvix de um mesmo dia.
- Meta, ranking e ticket médio usam esse faturamento. Ticket = faturamento ÷ vendas (documentos).

Cancelado ⇒ 0. Devolvido ⇒ desconta pelo valor do documento de devolução.

## 15. Cancelamentos (P0)

- Cancelar um documento muda `cancelado` para `'S'` no mesmo registro. Toda alteração gera **timestamp novo**, então a consulta incremental devolve o documento de novo, mesmo dias depois **[D]**.
- Os dados reais mostram documentos LINX com situação CANCELADO no Prisma **[C]**.
- O adapter emite `CANCELAMENTO{idExterno: identificador+':cancelamento', vendaIdExterno: identificador}`.
- Se a venda e o cancelamento chegarem juntos (cancelada antes do primeiro sync), o adapter emite VENDA e CANCELAMENTO no mesmo lote. A ingestão já processa a venda antes.
- `excluido='S'` recebe o mesmo tratamento.
- Requisito: a **janela `data_inicial`/`data_fim`** (obrigatória e baseada na data de lançamento) precisa incluir a data da venda original (ver §17).

## 16. Devoluções

- Devolução de cliente = documento próprio `operacao='DE'` (devolução de entrada), com `identificador` próprio **[D]**.
- O vínculo com a venda original vem de `LinxMovimentoDevolucoesItens`: `identificador_venda`, `identificador_devolucao`, `codigoproduto`, `qtde_devolvida`, `timestamp` **[D]**.
  - Também há `LinxMovimentoOrigemDevolucoes` (nota/série de origem).
- Evento: `DEVOLUCAO{idExterno: identificador_devolucao, vendaIdExterno: identificador_venda, itens: produto → referência, quantidade, pares, valor}`.
- Troca: devolução que gera vale (`LinxMovimentoTrocas`) mais uma venda nova que usa o vale como pagamento.
  - Para o Vendedor IA, a devolução desconta da venda original e a venda nova conta como venda.
  - **[?]** Política: quem recebe o crédito da venda nova é o vendedor que atendeu a troca.
- Devolução de venda anterior ao backfill: a venda é desconhecida e o evento é ignorado. A ingestão já conta isso e a Saúde dos Dados deve mostrar.

## 17. Sync incremental — o problema principal

Mecanismo oficial **[D]**: `timestamp` (rowversion, contador do banco, único, **por método**). Funciona assim:
- consulta com `timestamp=0` na carga inicial;
- depois, com o **maior timestamp já recebido**;
- volta só o que foi incluído **ou alterado** depois disso.
- Também existem `dt_insert`/`dt_update`, mas a Linx avisa que "nem todas as rotinas atualizam a data de update". **Usar timestamp, não datas.**

Proposta de sync:
1. Cursor persistente por **(integração, método, CNPJ)** = maior `timestamp` processado com sucesso.
2. Consulta `LinxMovimento` com `timestamp=cursor` **e** janela de lançamento `[hoje − H, hoje]`. H = horizonte de reabertura; sugestão: início do mês anterior, ou pelo menos 45 dias. O timestamp mantém o volume pequeno mesmo com janela larga.
3. Paginação: repetir com o maior timestamp do lote até vir vazio ou abaixo do limite. Alguns métodos limitam a 1.000 ou 10.000 registros por consulta **[D]**; `LinxMovimento` não declara limite próprio **[?]**.
4. **Avançar o cursor só depois da ingestão confirmada** (gravação idempotente). Falhas reprocessam o mesmo lote, sem perda nem duplicação.
5. Agrupar linhas por `identificador` antes de virar evento. Um documento pode atravessar a fronteira de um lote, então juntar no lote seguinte pelo `identificador`.

Resultado: venda que entra tarde no Microvix (PDV offline, sincronização do POS) chega com timestamp novo e é capturada, porque a data de lançamento está dentro da janela. **Zero perda dentro do horizonte H, zero duplicação** pela idempotência já existente.

## 18. Vendas atrasadas

Cobertas pelo item 17, desde que a data de lançamento caia no horizonte H. Venda lançada com data anterior ao horizonte (raro) só entra na **reconciliação periódica** (§19). Teste obrigatório na implementação.

## 19. Reconciliação

- **Incremental** a cada 15 min (o cron atual já existe).
- **Reconciliação diária**, de madrugada: compara totais por loja e dia com o Microvix nos últimos N dias (sugestão: mês corrente + anterior). Duas opções:
  1. reconsultar `LinxMovimento` com `timestamp=0` só para a janela curta, por CNPJ e por dia, e comparar contagem e soma;
  2. comparar com `LinxMovimento` filtrado por `dt_update`.
- Divergência gera alerta na Saúde dos Dados e reprocessamento idempotente daquela janela. Nunca apaga fato: só acrescenta o que faltou ou aplica o cancelamento.
- Respeitar a regra Linx de não "retornar toda a base": a reconciliação é sempre por janela curta.

## 20. Backfill

- O histórico no Microvix começa em **01/10/2025** (antes era o SERVER) **[C]**.
- Fluxo proposto:
  1. **BACKFILL**: `timestamp=0` com janela fixa, por CNPJ, mês a mês, a partir de uma data de corte (sugestão: início do mês anterior ao go-live, o que basta para baseline de 14 dias, recordes recentes e meta do mês); paginar por timestamp; guardar o cursor.
  2. **CATCH-UP**: a partir do cursor, até zerar.
  3. **LIVE**: cron de 15 min.
- Volume estimado: as 3 lojas tiveram cerca de 60 mil linhas de item LINX em 12 meses **[C]** (dataset Prisma). Isso é pequeno: algumas dezenas de chamadas por loja.
- Limites de taxa: não há número publicado. Existe o risco de **desativação da chave por consumo indevido** **[D]**. Fazer chamadas sequenciais por CNPJ, com backoff e pausa entre páginas.

## 21. Multiempresa

Encaixe natural, sem mudar a arquitetura:
- **Empresa ↔ portal** (1 Integração LINX por empresa, com chave própria);
- **Loja ↔ CNPJ** (vínculo `IntegracaoLoja`);
- **Vendedor ↔ cod_vendedor**.

Cada empresa usa a própria chave, de modo que uma empresa nunca consulta CNPJ de outra. A ingestão já recusa loja de outra empresa **[D]**.

## 22. Segurança

- Autenticação: usuário e senha padrões fixos + **chave GUID** por ativação + IdPortal **[D]**. Não há OAuth, scopes nem refresh.
- Rotação: só pela Linx (nova chave). A expiração não está documentada **[?]**.
- O WebService de Saída é **só leitura** por natureza **[D]**, o que cumpre a preferência de menor privilégio.
- Allowlist de IP: não documentada para o WebService **[?]**. Existe para usuários do ERP (manual NAPP).
- No Vendedor IA: a chave fica no campo de credencial da Integração, cifrada (AES-256-GCM, chave mestra fora do banco), mascarada, nunca devolvida nem logada **[D]**. O portal vai na configuração não sensível.
- Nunca usar chave "de rede" da franqueadora.
- **Não usar** o caminho de "usuário do ERP + relatórios de tela" (manual NAPP). Ele exige criar usuário com acesso "de qualquer IP" e depende de raspar a interface.

## 23. Rate limits e performance

- Sem limite numérico publicado para `LinxMovimento`. Alguns métodos: 1.000 ou 10.000 registros por consulta **[D]**.
- A carga prevista é baixa: 3–4 CNPJs × 3–4 métodos a cada 15 min.
- Timeout padrão de 30 s, retry com backoff exponencial e circuit breaker por integração (registrar ERRO na execução) **[I]**.

## 24. Data Health (mínimo necessário)

**Já existe:** status da integração, última sincronização e último sucesso, última venda, worker, fila, execuções (recebidos, vendas novas, ajustes novos, ignorados com motivo) e erro sanitizado **[D]**.

**Acrescentar:**
1. contagem de **cancelamentos** e **devoluções** por execução;
2. **classificação do erro**: autenticação/chave inválida, fonte indisponível, mapping;
3. **pendências de mapping**: CNPJ sem loja, `cod_vendedor` sem vendedor, produto sem referência;
4. **atraso do cursor** (idade do último timestamp com dado);
5. resultado da **reconciliação diária**.

Nada além disso.

## 25. Central de Integrações (Admin → Configurações → Integrações)

| Capacidade | Estado |
|---|---|
| Integração por empresa, provedor LINX | **PRONTO** |
| Credencial cifrada e mascarada (para a chave GUID) | **PRONTO** |
| Configuração da URL base | PRONTO (default do WebService) |
| Campo **portal (IdPortal)** e grupo | **PRECISA AJUSTE** (hoje a configuração é `urlBase`/`observacao`) |
| Vínculo de lojas por código externo (CNPJ) | **PRONTO** (validação de 14 dígitos: ajuste pequeno) |
| Ativar/desativar, sincronizar agora, última sync, última venda, erros | **PRONTO** |
| Testar conexão | **PRECISA AJUSTE** (implementar: `LinxGrupoLojas` ou `LinxLojas` com a chave) |
| Mapping de vendedores | PRONTO via "Matrícula no ERP"; **conveniência**: listar `LinxVendedores` para ajudar o Admin |

## 26. Caminhos avaliados

| | Caminho | Disponível? |
|---|---|---|
| A | **Microvix WebService de Saída Padrão** (API oficial, timestamp) | sim, mediante ativação da chave para o portal |
| B | API interna do **Prisma BI** (franqueadora) | dados existem; não é oficial, sessão de usuário, latência de processamento, depende da franqueadora |
| C | Acesso read-only ao banco Microvix | não (SaaS) |
| D | **Exportação de relatório Microvix** (Movimento Diário / Faturamento por Período) importada pelo adapter CONTROLADO | sim, manual ou semiautomática |
| E | Linx Microvix WebApi / WS B2C | voltado a e-commerce/entrada; não serve para sell-out de loja |
| F | Planilha manual | último recurso |

## 27. Pontuação (0–1000)

| Critério | A WS Saída | B Prisma | D Export relatório | F Planilha |
|---|---|---|---|---|
| Confiabilidade | 900 | 550 | 600 | 400 |
| Segurança | 900 | 400 | 650 | 500 |
| Completude (vendedor, item, cancel., devol.) | 900 | 800 | 550 | 400 |
| Latência | 900 | 400 | 300 | 200 |
| Cancelamentos | 950 | 650 | 400 | 300 |
| Devoluções | 850 | 650 | 400 | 300 |
| Manutenção | 850 | 400 | 500 | 400 |
| Observabilidade | 850 | 500 | 500 | 400 |
| Custo | 700 (licença) | 800 | 900 | 900 |
| Risco | 850 | 350 | 600 | 400 |
| Escalabilidade | 900 | 500 | 400 | 200 |
| Multiempresa | 900 | 500 | 600 | 500 |
| **Média** | **≈ 870** | ≈ 540 | ≈ 530 | ≈ 410 |

**PLANO A: Microvix WebService de Saída Padrão.**

**PLANO B: exportação estruturada de relatório do Microvix** ("Movimento Diário"/movimento por documento), ingerida pelo adapter **CONTROLADO** já existente, como contingência temporária enquanto a chave não sai. O Prisma (B) fica descartado como integração: não é oficial, depende de sessão de usuário e da franqueadora.

## 28. Teste de conectividade

**Não executado.** Não existe configuração válida e autorizada para o nosso portal **[C]**:
- banco de dev só com integração MOCK;
- `.env` com `LINX_API_URL`/`LINX_API_KEY` vazios;
- nenhuma chave em projetos relacionados.

O ambiente público de homologação da Linx não foi usado (não autorizado). **ACESSO LINX NECESSÁRIO.**

## 29. Gaps

| # | Gap | Natureza |
|---|---|---|
| G1 | Cursor persistente por timestamp (método × CNPJ) | **necessidade real** (código + migration) |
| G2 | Janela de reabertura H no lugar de `desde/ate` de 30 min | **necessidade real** (sync) |
| G3 | Cache de produtos (`cod_produto` → referência/cor/tamanho/categoria) | **necessidade real** |
| G4 | Regra de pares (calçado × bolsa × kit) | **decisão de negócio + amostra** |
| G5 | Fórmula do valor do item (líquido × rateio × acréscimo) | **amostra real + conciliação** |
| G6 | Vendedor por item × por documento | **amostra real** (adapter resolve sem mudar o contrato) |
| G7 | `tipo_transacao` que contam como venda nesta rede | amostra real |
| G8 | `data_documento` × `data_lancamento` como data da venda | amostra real |
| G9 | Escopo de `cod_vendedor` (portal × loja) | amostra real |
| G10 | Portal/grupo na configuração da Integração; testar conexão | ajuste pequeno |
| G11 | Data Health: cancelamentos, devoluções, classe de erro, pendências de mapping | ajuste pequeno |
| G12 | Reconciliação diária | **necessidade real** |

## 30. Bloqueios externos

1. **Chave do WebService de Saída Padrão** para o portal das lojas (`24084`):
   - quem pede: o titular do portal, à Linx (comercial/suporte Microvix);
   - a proposta da rede mostra o item "Webservice de saída" a R$ 400 por CNPJ para a franqueadora;
   - verificar se o franqueado contrata o próprio ou se a franqueadora libera.
2. Confirmar se o portal `24084` é do franqueado e quais CNPJs ele contém.
3. Uma **amostra real** (homologação de 30 dias com a Linx) para fechar G4–G9.

## 31. Mudanças necessárias no código (quando autorizado)

**Necessidade real:**
- `ErpAdapter` aceitar e devolver um **cursor opaco** (`buscarEventos(consulta + cursor) → { eventos, cursor }`). O contrato de eventos **não muda**.
- Persistir o cursor (coluna JSON na `Integracao` ou tabela `IntegracaoCursor`) → **1 migration aditiva**.
- `sync.service` avança o cursor só após a ingestão e usa a janela H.
- `LinxErpAdapter`:
  - cliente XML;
  - métodos `LinxGrupoLojas`, `LinxLojas`, `LinxMovimento`, `LinxMovimentoDevolucoesItens`, `LinxProdutos`, `LinxVendedores`;
  - agrupamento por documento;
  - tradução para eventos.
- Cache de produtos (tabela por empresa) → migration aditiva.
- Job de reconciliação diária.

**Conveniência:**
- campos de portal/grupo na tela de Integrações;
- validação de CNPJ;
- "buscar lojas" e "listar vendedores do ERP";
- contadores extras na Saúde.

**Não muda:** eventos VENDA/CANCELAMENTO/DEVOLUCAO, ingestão idempotente, motor de reconciliação, metas, ranking, gamificação, multiempresa, segurança de credencial, telas da vendedora.

## 32. Testes da futura implementação

Fixtures XML gravadas a partir da documentação e da amostra real, com servidor HTTP falso que simula o WebService:

1. venda nova
2. venda repetida no lote seguinte (duplicada)
3. venda atrasada: timestamp novo, lançamento antigo dentro de H
4. vários itens
5. vários vendedores (inclusive no mesmo documento)
6. várias lojas (CNPJs)
7. várias empresas (chaves diferentes)
8. cancelamento dias depois
9. cancelamento duplicado
10. devolução total
11. devolução parcial
12. devolução dias depois
13. Produto da Semana por referência
14. desconto de venda e de item (rateio)
15. vendedor sem mapping
16. loja sem mapping
17. produto sem mapping
18. fonte indisponível (5xx)
19. timeout
20. chave inválida ou revogada
21. limite ou bloqueio por consumo
22. paginação por timestamp com documento cortado entre páginas
23. restart no meio do lote (cursor não avança)
24. replay da janela
25. reconciliação diária encontrando o que faltou
26. fuso: `hora_lancamento` 23:59 × 00:00 em America/Sao_Paulo

## 33. Plano de implementação em ondas

| Onda | Escopo | Pré-requisito |
|---|---|---|
| L0 | Obter a chave e o ambiente de homologação; amostra real de 1 dia por loja | bloqueio externo |
| L1 | Fechar G4–G9 com a amostra e conciliação contra "Faturamento por Período" | L0 |
| L2 | Cursor no adapter + migration + sync com janela H | — |
| L3 | Cliente XML + `LinxMovimento` → VENDA/CANCELAMENTO, cache de produtos, regra de pares | L1 |
| L4 | Devoluções (`DE` + `DevolucoesItens`) | L3 |
| L5 | Integrações (portal, testar conexão, buscar lojas/vendedores) + Data Health | L3 |
| L6 | Reconciliação diária | L3 |
| L7 | Backfill desde a data de corte + catch-up, em homologação | L3–L6 |
| L8 | E2E com fixtures + piloto com uma loja; liga as demais | L7 |

## 34. Rollback

- O código fica isolado no `LinxErpAdapter` e nas migrations aditivas.
- Desligar = **desativar a integração** no Admin; os dados recebidos permanecem.
- Voltar código = checkout de `restore/pre-linx-fase1`, com as migrations aditivas inofensivas.
- Dados: `pg_dump` antes de cada onda (procedimento validado em `docs/FASE-1-DEPLOY.md`).
- Backfill errado: as vendas LINX são identificáveis por `integracaoId` e removíveis em transação, num banco de homologação antes do piloto.

## 35. Nota 0–1000

**Prontidão para implementar Linx: 720/1000.**

| Componente | Nota |
|---|---|
| Produto e mecanismo de acesso identificados | 950 |
| Mapeamento de eventos e solução do gap de atraso | 900 |
| Nosso lado (contrato, ingestão, segurança, multiempresa) | 900 |
| Acesso real (chave) | 0 (bloqueio) |
| Regras dependentes de amostra (pares, valor, vendedor por item) | 500 |

Dá para implementar L2 (cursor e janela) já. L3 em diante depende da chave e da amostra.

## 36. Honestidade

**COMPROVADO:**
- Linx Microvix;
- migração em 01/10/2025;
- portal `24084` e mapa das lojas;
- documentos LINX com situação VALIDO/CANCELADO e itens com quantidade/valor/desconto/devolução no Prisma;
- volume aproximado;
- inexistência de chave configurada;
- proposta com "Webservice de saída" para a franqueadora.

**DOCUMENTAÇÃO/CÓDIGO:**
- endpoint, autenticação e chave;
- timestamp incremental;
- campos de `LinxMovimento`, `LinxVendedores`, `LinxProdutos` e `LinxMovimentoDevolucoesItens`;
- limites por método;
- risco de desativação da chave;
- contrato e ingestão do Vendedor IA.

**INFERIDO:**
- `24084` = portal e sufixo = empresa;
- cancelamento é sempre do documento inteiro;
- `cod_produto` por variante;
- sem acesso a banco;
- política de timeout e backoff.

**AINDA NÃO CONFIRMADO:**
- titular do portal e como obter a chave;
- data da venda (`data_documento` × `data_lancamento`);
- fórmula do valor;
- campo de categoria e regra de pares/kits;
- vendedor por item;
- escopo do `cod_vendedor`;
- `tipo_transacao` válidos;
- limite de registros do `LinxMovimento`;
- expiração da chave e allowlist de IP.

**Não lido:** um documento pessoal "Informações Linx" (pode conter dados de acesso). A leitura foi bloqueada pela permissão automática e não foi tentada de outra forma.

### Fontes
- Especificação Web Service de Saída Padrão Linx Microvix v209 (30/07/2025) — share.linx.com.br, página 168641333
- Standard Webservice API Linx Microvix — v100, English translation (2022) — mesma página
- Proposta comercial "Solução Linx Microvix – Arquitetura e franquias" (arquivo local do usuário)
- Auditoria de dados do Prisma (`~/prisma-etapa0/RELATORIO_ETAPA_0.md`, mapa de lojas e catálogo)
