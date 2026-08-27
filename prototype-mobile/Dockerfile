FROM node:24-alpine AS dependencies
RUN corepack enable
WORKDIR /workspace/prototype-mobile
COPY prototype-mobile/package.json prototype-mobile/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:24-alpine AS builder
RUN corepack enable
WORKDIR /workspace
COPY --from=dependencies /workspace/prototype-mobile/node_modules ./prototype-mobile/node_modules
COPY prototype-mobile ./prototype-mobile
WORKDIR /workspace/prototype-mobile
RUN pnpm build

FROM node:24-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /workspace/prototype-mobile/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /workspace/prototype-mobile/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /workspace/prototype-mobile/public ./public
COPY --from=builder --chown=nextjs:nodejs /workspace/prototype-mobile/server-assets ./server-assets
COPY --from=builder --chown=nextjs:nodejs /workspace/prototype-mobile/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /workspace/prototype-mobile/db ./db
USER nextjs
WORKDIR /app
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "scripts/start-production.mjs"]
