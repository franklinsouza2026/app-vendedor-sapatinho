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

## 5. Backup e restauração

```bash
# backup diário (cron do host), retenção sugerida 14 dias
docker compose exec -T postgres pg_dump -U vendedor_app -Fc app_vendedor_sapatinho \
  > /backup/vendedor-$(date +%F).dump

# restauração (para um banco novo/vazio)
docker compose exec -T postgres pg_restore -U vendedor_app -d app_vendedor_sapatinho --clean --if-exists \
  < /backup/vendedor-AAAA-MM-DD.dump
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
