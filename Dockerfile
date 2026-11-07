# ── build stage: install everything, compile, generate prisma client ──────────
FROM node:22-slim AS build
WORKDIR /app
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true

# openssl is required by Prisma engines on debian-slim
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --include=dev --no-audit --no-fund

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/server/prisma apps/server/prisma
COPY apps/server apps/server
COPY apps/web apps/web

RUN npm run build -w @mg/shared \
 && npm run build -w @mg/server \
 && npm run build -w @mg/web

# ── prod deps stage: only runtime dependencies ───────────────────────────────
FROM node:22-slim AS prod-deps
WORKDIR /app
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/server/prisma/schema.prisma apps/server/prisma/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --no-audit --no-fund \
 && npx --yes prisma generate --schema apps/server/prisma/schema.prisma

# ── runtime stage ─────────────────────────────────────────────────────────────
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# su-exec lets the entrypoint chown the mounted volume, then drop to the nodejs user
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl su-exec && rm -rf /var/lib/apt/lists/* \
 && groupadd -r nodejs && useradd -r -g nodejs nodejs

COPY --from=prod-deps /app/node_modules node_modules
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/server/prisma apps/server/prisma
COPY --from=build /app/apps/server/package.json apps/server/package.json
COPY --from=build /app/apps/web/dist apps/web/dist

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Start as root: fix the mounted volume ownership (Railway volumes mount as root),
# run migrations, then drop privileges to the unprivileged nodejs user for the server.
# Optional one-time repair: set MIGRATE_RESET_ONCE=1 to wipe & replay migrations (empty/dev DBs only!)
CMD ["sh", "-c", "mkdir -p /data/uploads && chown -R nodejs:nodejs /data; if [ \"$MIGRATE_RESET_ONCE\" = \"1\" ]; then echo 'MIGRATE_RESET_ONCE is set — resetting database (drops all data!)'; ./node_modules/.bin/prisma migrate reset --force --schema apps/server/prisma/schema.prisma || exit 1; fi; ./node_modules/.bin/prisma migrate deploy --schema apps/server/prisma/schema.prisma && exec su-exec nodejs node apps/server/dist/index.js"]
