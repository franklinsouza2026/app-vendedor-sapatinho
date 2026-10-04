# Fase 1 — Deploy do piloto (sem Linx)

Validado localmente em 2026-10-04 com `docker compose` (projeto separado,
segredos gerados só para o teste): build das 4 imagens, `migrate` aplicando
as 31 migrations, provisionamento de empresa, login pelo nginx, CSP/headers,
MOCK recusado em produção, rotas legadas 404, API e banco fora do host e os 5
serviços `healthy`. **Nenhum deploy externo foi feito.**

## 1. Topologia

```
Internet ──HTTPS──▶ Caddy (host, TLS automático) ──▶ web (nginx :8080, só 127.0.0.1)
                                                        ├─ /        PWA estático (CSP, sem cache do index/sw)
                                                        └─ /api/ ─▶ api :3000 (rede interna)
                                     worker ─┐
                    postgres, redis (rede interna, sem porta no host)
                    migrate (job de uso único: prisma migrate deploy)
```

Com Caddy no host à frente do nginx: **`TRUST_PROXY_HOPS=2`** (Caddy + nginx).
Sem proxy no host: 1. A API recusa subir em produção com 0.

## 2. Variáveis (arquivo `.env` no servidor, fora do Git, permissão 600)

| Variável | Como gerar / valor |
|---|---|
| `POSTGRES_PASSWORD`, `REDIS_PASSWORD` | `openssl rand -hex 24` |
| `JWT_SECRET`, `CPF_HASH_SECRET` | `openssl rand -hex 32` cada (diferentes) |
| `INTEGRATION_SECRETS_ENCRYPTION_KEY` | `openssl rand -hex 32` — **guardar cópia fora do servidor**: sem ela as credenciais de integração não abrem |
| `CORS_ORIGINS` | `https://app.seudominio.com.br` |
| `TRUST_PROXY_HOPS` | 2 com Caddy no host |
| `VITE_EMPRESA_ID` | só se houver mais de uma empresa no banco |

## 3. Primeira subida

```bash
docker compose build
docker compose up -d                # migrate roda antes de api/worker
docker compose ps                   # tudo healthy; migrate "exited (0)"

# provisionar a empresa (sem dado demo; senha não é impressa)
docker compose run --rm \
  -e PROV_EMPRESA_NOME="Sapatinho de Luxo" -e PROV_LOJA_NOME="…" -e PROV_LOJA_CODIGO="<código da loja no ERP>" \
  -e PROV_ADMIN_NOME="…" -e PROV_ADMIN_MATRICULA="…" -e PROV_ADMIN_SENHA="<12+ caracteres>" \
  migrate npx tsx scripts/provisionar-empresa.ts
```

Depois, pelo Admin: lojas restantes, vendedores (código de ativação),
metas e dias de trabalho, e **Configurações → Integrações**.

> Sem Linx ainda, o piloto não recebe vendas reais: a Saúde dos dados mostra
> FALHA ("Nenhuma integração de vendas ativa"). O simulador (MOCK) é recusado
> em produção de propósito. Essa é a pendência da etapa **Integração Linx**.

**Proibido em produção:** `prisma db push`, `npm run seed` e qualquer
`reset-*` (os scripts recusam com `NODE_ENV=production` / banco não descartável).

## 4. HTTPS (Caddy no host)

```caddy
app.seudominio.com.br {
    encode gzip
    reverse_proxy 127.0.0.1:8080
    header Strict-Transport-Security "max-age=31536000; includeSubDomains"
}
```

### HTTPS — validado em ambiente controlado (2026-10-04)

Executado com a stack de produção + Caddy (`local_certs`, CA local, sem domínio
nem DNS), cadeia Caddy → nginx → API, `TRUST_PROXY_HOPS=2`:

| Verificação | Resultado |
|---|---|
| Certificado | cadeia validada contra a CA (`curl --cacert`, `openssl s_client`: *Verify return code 0*), SAN `localhost`; sem a CA o cliente recusa |
| HTTP → HTTPS | 308 |
| Headers do PWA | HSTS, CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`; `index.html`/`sw.js` sem cache |
| Manifest | `application/manifest+json` (corrigido nesta rodada; antes `octet-stream`) |
| API via proxy | `/api/health`, `/api/health/deep` 200; login devolve token no corpo, **nenhum cookie** |
| CORS | origem estranha sem `Access-Control-Allow-Origin`; origem do app permitida |
| IP real | o Caddy descarta `X-Forwarded-For` forjado e envia o IP do cliente; com 2 saltos o Express chega ao cliente; 12 logins com XFF forjados → 429 a partir do 10º (o forjado não cria balde novo) |
| Serviços internos | api, postgres, redis e worker sem porta no host |
| PWA sob HTTPS | contexto seguro, service worker controlando, login, reload, sem conteúdo misto, sem erro no console (Chromium confiando só na chave deste certificado) |

Depende do servidor real: certificado público (Let's Encrypt via Caddy) e DNS.

## 5. Backup e restauração

```bash
# backup diário (cron do host), retenção sugerida 14 dias
docker compose exec -T postgres pg_dump -U vendedor_app -Fc app_vendedor_sapatinho \
  > /backup/vendedor-$(date +%F).dump

# restauração (para um banco novo/vazio)
docker compose exec -T postgres pg_restore -U vendedor_app -d app_vendedor_sapatinho --clean --if-exists \
  < /backup/vendedor-AAAA-MM-DD.dump
```

**Procedimento validado (2026-10-04, banco controlado na stack de produção):**
banco carregado com dados conhecidos (2 empresas, 4 lojas, 10 pessoas, 23 vendas,
4 cancelamentos, metas, ledger de XP/VendaCoins, campanhas, missão, competições,
auditoria) → impressão digital (contagem + hash do conteúdo de 15 tabelas,
saldos do ledger, 165 constraints, 267 índices, 30 migrations) → `pg_dump -Fc` →
(a) corrupção parcial e (b) `DROP DATABASE` → `pg_restore --clean --if-exists` →
impressão **idêntica** nos dois casos. Banco restaurado utilizável:
`prisma migrate status` "up to date", unique de idempotência do ledger recusando
duplicata e o painel de uma vendedora montado pela aplicação com hash idêntico
ao do banco original.

Verificar um backup sem tocar no banco de produção:

```bash
docker compose exec -T postgres psql -U vendedor_app -d postgres -c "CREATE DATABASE restore_teste"
docker compose exec -T postgres pg_restore -U vendedor_app -d restore_teste < /backup/vendedor-AAAA-MM-DD.dump
docker compose exec -T postgres psql -U vendedor_app -d restore_teste -c "select count(*) from venda"
docker compose exec -T postgres psql -U vendedor_app -d postgres -c "DROP DATABASE restore_teste"
```

Guardar junto (fora do servidor): o `.env` (principalmente
`INTEGRATION_SECRETS_ENCRYPTION_KEY`). O Redis guarda fila e bloqueios de
login (AOF ligado); perdê-lo não perde dado de negócio — o próximo sync refaz.
Teste de restauração: restaurar o dump num banco `_restore` e abrir o Admin.

## 6. Atualização e rollback

```bash
git fetch && git checkout <tag-nova>
docker compose exec -T postgres pg_dump -U vendedor_app -Fc app_vendedor_sapatinho > /backup/antes-<tag>.dump
docker compose build && docker compose up -d       # migrate aplica só o que falta
```

Rollback:
1. `git checkout <tag-anterior> && docker compose build && docker compose up -d`.
2. As migrations da Fase 1 são **aditivas**; o código anterior convive com as
   colunas novas. Se a versão nova tiver feito migração destrutiva (nenhuma
   até aqui), restaurar o dump `antes-<tag>`.
3. Nunca editar `_prisma_migrations` à mão.

## 7. Operação diária

- **Admin → Saúde dos dados**: integração, último sync, última venda, worker,
  fila e erros recentes (🟢🟡🔴).
- `docker compose logs -f api worker` (JSON, sem token/senha/CPF/credencial).
- `/api/health` (vivo) e `/api/health/deep` (banco + Redis, só booleanos).
