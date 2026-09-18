# App Vendedor Sapatinho de Luxo

App de frente de loja: cada vendedor acompanha meta/realizado em tempo real (via ERP Linx), compete em gamificação e treina vendas com um coach de IA. Arquitetura completa e decisões em `~/Documents/Obsidian/03 - Projetos/Arquitetura-App-Vendedor-Sapatinho-de-Luxo/`.

**Status:** Fatia 0/1 (fundação + MVP de metas), Fatia 2 (Gamification Engine determinístico) e Fatia 3 (PWA mobile-first do vendedor, em `web/`) implementadas. Coach IA e Treinador IA ainda não implementados (ver `docs/ARCHITECTURE.md`).

A especificação funcional detalhada a partir da Fatia 2 é `FONTE_DE_VERDADE_VENDEDOR_IA.md`.

## Setup local

```bash
npm install
cp .env.example .env
# gere um JWT_SECRET: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

docker compose -f docker-compose.dev.yml up -d   # sobe Postgres + Redis
npx prisma migrate dev
npm run seed                                      # cria empresa/loja/vendedor demo + régua de gamificação + catálogo de badges

npm run dev            # API em http://localhost:3000
npm run dev:worker      # worker de sync + gamificação + fechamento diário (outro terminal)
```

### Testes

Testes de integração usam um banco **dedicado** (`app_vendedor_sapatinho_test`, configurado em `.env.test`) — nunca o banco de dev. Crie-o uma vez:

```bash
docker exec app-vendedor-sapatinho-postgres-1 psql -U vendedor_app -d app_vendedor_sapatinho -c "CREATE DATABASE app_vendedor_sapatinho_test;"
DATABASE_URL="postgresql://vendedor_app:senha@localhost:5435/app_vendedor_sapatinho_test" npx prisma migrate deploy

npm test
```

Login de teste (após `npm run seed`):
```
POST /auth/login
{ "codigoErpLoja": "LOJA001", "matriculaErp": "VEND001", "senha": "vendedor123" }
```

## ERP

Por padrão (`ERP_MODE=mock`), os indicadores são gerados localmente para os vendedores já cadastrados — não depende de credenciais reais do Linx. Para apontar pro Linx de verdade, definir `ERP_MODE=linx` + `LINX_API_URL` + `LINX_API_KEY` — **a integração real ainda não foi validada contra o contrato de API do Linx** (ver TODO em `src/integracoes/erp/linx/linx-client.ts`).

## Frontend (PWA)

Ver `web/README.md`. Setup rápido: `cd web && npm install && cp .env.example .env && npm run dev`.

## Estrutura

Ver `docs/ARCHITECTURE.md`.

## Deploy

**Onde** ainda não foi definido (VPS própria, junto do Diretor Comercial IA, etc.). O **como** passou a existir na Fatia 9.7:

```bash
docker compose up -d   # postgres + redis + api + worker + web (nginx servindo o PWA)
```

O serviço `web` serve o build do frontend e faz proxy de `/api` pra API, de modo que
frontend e backend compartilhem a mesma origem.

Variáveis obrigatórias (ver `.env.example`): `JWT_SECRET`, `CPF_HASH_SECRET`,
`POSTGRES_PASSWORD`, `REDIS_PASSWORD` e, **em produção**, `CORS_ORIGINS` — sem ela o
processo recusa subir em vez de aceitar qualquer origem.

⚠️ Antes de publicar, conferir `TRUST_PROXY_HOPS` contra a topologia real: ele precisa
contar os saltos de proxy até a API. Errar pra menos joga todos os usuários no mesmo
bucket de rate limit (10 logins/min pra empresa inteira); errar pra mais deixa o cliente
forjar o IP de origem.

Nenhum provider de IA real foi validado contra API real até aqui — o produto roda em
`AI_PROVIDER=mock` por padrão.
