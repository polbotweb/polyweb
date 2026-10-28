# ── Stage 1 : Install & Build ─────────────────────────────────────────
FROM node:22-slim AS builder

RUN corepack enable pnpm

WORKDIR /app

# Install dependencies first (layer cache)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

# Copy source and build
COPY . .

ARG SITE_URL
ARG BETTER_AUTH_URL

ENV SITE_URL=${SITE_URL}
ENV BETTER_AUTH_URL=${BETTER_AUTH_URL}

RUN pnpm build

# Prune dev dependencies after build
RUN pnpm prune --prod

# ── Stage 2 : Runtime ─────────────────────────────────────────────────
FROM node:22-slim AS runtime

# Security: run as non-root user
RUN groupadd --gid 1001 polyweb && \
    useradd --uid 1001 --gid polyweb --shell /bin/false --create-home polyweb

WORKDIR /app

# Copy only what's needed to run
COPY --from=builder --chown=polyweb:polyweb /app/dist ./dist
COPY --from=builder --chown=polyweb:polyweb /app/node_modules ./node_modules
COPY --from=builder --chown=polyweb:polyweb /app/package.json ./package.json

# Database migrations & infra scripts (needed for entrypoint)
COPY --from=builder --chown=polyweb:polyweb /app/src/database/migrations ./src/database/migrations
COPY --from=builder --chown=polyweb:polyweb /app/src/database/infra ./src/database/infra

# Create directories for uploads, private storage (FEC exports, never served) and logs with correct ownership
RUN mkdir -p /app/public/uploads /app/storage/private /app/logs && \
    chown -R polyweb:polyweb /app/public /app/storage /app/logs

# Switch to non-root
USER polyweb

# Astro standalone server
ENV HOST=0.0.0.0
ENV PORT=4321
ENV NODE_ENV=production

EXPOSE 4321

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:4321/api/health').then(r=>{if(!r.ok)throw r.status}).catch(()=>process.exit(1))"

CMD ["node", "./dist/server/entry.mjs"]
