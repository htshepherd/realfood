ARG NODE_IMAGE=node:24-alpine
FROM ${NODE_IMAGE} AS dependencies
RUN corepack enable
WORKDIR /workspace/prototype-mobile
COPY prototype-mobile/package.json prototype-mobile/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM ${NODE_IMAGE} AS builder
ARG RUNTIME_BUNDLE_FILENAME
ARG RUNTIME_BUNDLE_SHA256
RUN corepack enable
WORKDIR /workspace
COPY --from=dependencies /workspace/prototype-mobile/node_modules ./prototype-mobile/node_modules
COPY prototype-mobile ./prototype-mobile
WORKDIR /workspace/prototype-mobile
RUN --mount=type=bind,from=runtime_bundle,source=.,target=/run/runtime-bundle,ro \
    REALFOOD_RUNTIME_BUNDLE_SHA256="${RUNTIME_BUNDLE_SHA256}" \
    node scripts/prepare-runtime-bundle.mjs "/run/runtime-bundle/${RUNTIME_BUNDLE_FILENAME}" && \
    pnpm build

FROM ${NODE_IMAGE} AS runner
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /workspace/prototype-mobile/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /workspace/prototype-mobile/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /workspace/prototype-mobile/public ./public
COPY --from=builder --chown=nextjs:nodejs /workspace/prototype-mobile/server-assets ./server-assets
COPY --from=builder --chown=nextjs:nodejs /workspace/prototype-mobile/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /workspace/prototype-mobile/src/server ./src/server
COPY --from=builder --chown=nextjs:nodejs /workspace/prototype-mobile/db ./db
USER nextjs
WORKDIR /app
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "scripts/start-production.mjs"]
