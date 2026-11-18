# syntax=docker/dockerfile:1

# Kanso ships as one Node process: Next.js server + SQLite file on a mounted disk.
# Build:  docker build -t kanso .
# Run:    docker run -p 3000:3000 -v kanso-data:/var/data -e GROQ_API_KEY=... kanso

# --- dependencies + native build tools -------------------------------------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# --- production build ------------------------------------------------------
FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The build must not touch real data, but it needs a migrated schema available
# to any server module that opens the database while collecting page data.
RUN DATABASE_PATH=/tmp/build.db node scripts/migrate.mjs && rm -f /tmp/build.db /tmp/build.db-wal /tmp/build.db-shm
RUN npm run build

# --- runtime ---------------------------------------------------------------
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    DATABASE_PATH=/var/data/kanso.db

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates util-linux \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system kanso \
  && useradd --system --gid kanso --create-home --home-dir /home/kanso kanso

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
# Dev dependencies (Playwright, Vitest, TypeScript tooling) are not needed to serve.
RUN npm prune --omit=dev && npm cache clean --force

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/next.config.mjs ./next.config.mjs
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/scripts ./scripts
COPY docker/entrypoint.sh /usr/local/bin/kanso-entrypoint
RUN chmod +x /usr/local/bin/kanso-entrypoint && mkdir -p /var/data

# Render (and Docker volumes) mount disks as root, so the entrypoint fixes
# ownership and then drops privileges before the server starts.
ENTRYPOINT ["/usr/local/bin/kanso-entrypoint"]

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
