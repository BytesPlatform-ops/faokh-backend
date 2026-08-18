# syntax=docker/dockerfile:1.7

# =============================================================================
# Foakh Booking & CRM API
#
# Multi-stage so the runtime image carries no compiler, no dev dependencies and
# no source. Prisma needs its generated client and its engine binaries at
# runtime, so those are copied forward explicitly rather than regenerated.
# =============================================================================

ARG NODE_VERSION=22-alpine

# --- deps: full install, cached on the lockfile alone -------------------------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app

RUN corepack enable

# Copied before the source so a code change does not invalidate the dependency
# layer — the slowest step in the build.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile

# --- build: compile TypeScript and generate the Prisma client -----------------
FROM node:${NODE_VERSION} AS build
WORKDIR /app

RUN corepack enable

COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.build.json nest-cli.json ./
COPY prisma ./prisma
COPY src ./src

RUN pnpm prisma generate && pnpm build

# Drops dev dependencies in place, so the runtime stage copies a tree that is
# already production-only.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm prune --prod

# --- production ---------------------------------------------------------------
FROM node:${NODE_VERSION} AS production
WORKDIR /app

ENV NODE_ENV=production \
    PORT=4000 \
    # Surfaces OOM as a clear failure rather than as mysterious latency.
    NODE_OPTIONS=--max-old-space-size=512

# `dumb-init` gives the process a real PID 1, so SIGTERM reaches Node and
# Nest's shutdown hooks run — draining in-flight requests and closing the
# database pool instead of being killed mid-transaction.
RUN apk add --no-cache dumb-init

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json
# Migrations ship with the image so `prisma migrate deploy` can run from the
# exact artefact being deployed, not from a separately-checked-out repository.
COPY --from=build --chown=node:node /app/prisma ./prisma

# Never run as root.
USER node

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/v1/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
