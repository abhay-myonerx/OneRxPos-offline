# ── Stage 1: build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

# Accept DATABASE_URL from the build environment (e.g. Railway --build-arg).
# `prisma generate` only needs a parseable URL, not a reachable database, so a
# harmless placeholder default keeps the build working when no value is passed.
# The real DATABASE_URL is injected at runtime and overrides this.
ARG DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public"
ENV DATABASE_URL=$DATABASE_URL

# Install dependencies first so Docker can cache this layer between builds.
COPY package.json package-lock.json ./
RUN npm ci

# Copy the rest of the source and produce the compiled output.
COPY . .
RUN npx prisma generate \
  && npm run build

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# A tiny init process so signals (Ctrl+C / docker stop) are handled cleanly.
RUN apk add --no-cache tini

# Bring over the installed dependencies and build artefacts from the builder.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/prisma ./prisma
COPY package.json package-lock.json prisma.config.ts tsconfig.json ./
COPY docker-entrypoint.sh ./
RUN chmod +x ./docker-entrypoint.sh

# The backend listens on this port inside the container (overridable via PORT).
EXPOSE 5000

ENTRYPOINT ["/sbin/tini", "--", "./docker-entrypoint.sh"]