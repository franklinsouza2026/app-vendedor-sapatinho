# Multi-stage build: imagem final pequena e segura, roda non-root.

FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:20-alpine AS ts-builder
WORKDIR /app
COPY package*.json tsconfig*.json ./
COPY src ./src
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine
RUN apk add --no-cache tini
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
