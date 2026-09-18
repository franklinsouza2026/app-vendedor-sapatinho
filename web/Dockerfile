# Build do PWA + nginx estático (Fatia 9.7).
#
# Até aqui o frontend não tinha caminho de publicação nenhum: o docker-compose
# subia api, worker, postgres e redis, e nada servia `web/dist`.
#
# Contexto de build é a RAIZ do repo (ver docker-compose.yml) pra que o
# Dockerfile enxergue `web/`.

FROM node:20-alpine AS builder
WORKDIR /app/web

COPY web/package*.json ./
RUN npm ci --no-audit --no-fund

COPY web/ ./
# `VITE_API_URL` é embutido no bundle em tempo de build (Vite substitui em
# tempo de compilação, não em runtime).
#
# `/api` (caminho relativo, não URL absoluta) de propósito: o bundle chama a
# MESMA origem e o nginx faz proxy de /api/ → api:3000/ (o `/` final do
# proxy_pass remove o prefixo). Assim a imagem não fica amarrada a um domínio
# — que ainda não foi decidido — e o CORS nem entra em jogo em produção.
#
# NÃO usar "" aqui: `client.ts` faz `VITE_API_URL ?? 'http://localhost:3000'`,
# e `??` não cai no fallback com string vazia — o bundle sairia chamando
# /auth/login na raiz, que o nginx serve como index.html (HTML, não JSON).
ARG VITE_API_URL="/api"
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/web/dist /usr/share/nginx/html

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost/ || exit 1

EXPOSE 80
