FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
COPY prisma ./prisma
COPY scripts/setup-env.ts ./scripts/setup-env.ts
COPY .env.example ./.env.example
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Provide a cloak key for the build process only. It will be replaced at runtime.
RUN \
    PRISMA_FIELD_ENCRYPTION_KEY="k1.aesgcm256.yKonbLb0dxoz-FWSKu6menHRgKA-s5i07p6jWMU6L8Q=" \
    npm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV="production"

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

RUN mkdir .next
RUN chown nextjs:nodejs .next

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY scripts/start.sh ./start.sh

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["./start.sh"]
CMD ["node", "server.js"]
