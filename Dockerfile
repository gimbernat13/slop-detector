FROM node:20-alpine AS base

# 1. Prune dependencies
FROM base AS prune
WORKDIR /app
RUN npm install -g turbo
COPY . .
RUN turbo prune @slop-detector/web @slop-detector/jobs --docker

# 2. Install dependencies and build
FROM base AS builder
WORKDIR /app

COPY --from=prune /app/out/json/ .
COPY --from=prune /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN corepack enable
RUN pnpm install --frozen-lockfile

# Copy source code
COPY --from=prune /app/out/full/ .
COPY turbo.json turbo.json

# Build the project
RUN pnpm turbo build --filter=@slop-detector/web... --filter=@slop-detector/jobs...

# 3. Production runner
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files for standalone mode
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "apps/web/server.js"]

# 4. Worker runner
FROM builder AS worker
WORKDIR /app
# No build step needed for dev mode worker, source is already there
CMD ["pnpm", "--filter", "@slop-detector/jobs", "dev"]
