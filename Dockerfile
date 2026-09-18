# Multi-stage build: imagem final pequena e segura, roda non-root.

# Dependências de runtime + Prisma Client GERADO.
#
# Fatia 9.7: este estágio rodava `npm ci --omit=dev` e nada mais, enquanto o
# `prisma generate` acontecia só no `ts-builder`. Como a imagem final copia o
# node_modules DAQUI, o client gerado nunca chegava nela e o container morria
# no boot com "@prisma/client did not initialize yet" — ou seja, a imagem de
# produção nunca subiu. Só apareceu quando o stack foi executado de verdade.
#
# Instala tudo (o CLI do Prisma é devDependency), gera o client e só então
# remove as dev deps — o client gerado sobrevive ao prune.
FROM node:20-alpine AS builder
WORKDIR /app
# `openssl` explícito: o engine do Prisma é uma lib nativa ligada ao OpenSSL, e
# a imagem base do node não o traz. Sem isso o `generate` escolhe um alvo
# errado e o runtime falha com "Error loading shared library libssl".
RUN apk add --no-cache openssl
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund
RUN npx prisma generate
RUN npm prune --omit=dev

FROM node:20-alpine AS ts-builder
WORKDIR /app
COPY package*.json tsconfig*.json ./
COPY src ./src
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine
# `openssl` também aqui: é a lib que o engine do Prisma carrega em runtime.
RUN apk add --no-cache tini openssl
WORKDIR /app

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=ts-builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=ts-builder --chown=nodejs:nodejs /app/prisma ./prisma
COPY --chown=nodejs:nodejs package*.json ./

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+process.env.PORT+'/health',(r)=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

USER nodejs
EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]
