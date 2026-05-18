# Multi-stage: build the SPA, then ship it inside the Caddy image so we don't
# need a shared volume between client-build and caddy services.

FROM node:20-alpine AS builder
WORKDIR /app
# Install build toolchain for native deps (bcrypt) — needed because the lockfile
# is shared across workspaces even though we only build the client here.
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* ./
COPY shared/package.json ./shared/
COPY client/package.json ./client/
COPY server/package.json ./server/
# Keep optional deps and postinstall scripts both: rollup's per-platform native
# bindings (@rollup/rollup-linux-x64-musl on alpine) are optional and wired
# through lifecycle scripts, so dropping either flag produces
# "Cannot find module @rollup/..." at vite build time. bcrypt's postinstall is
# harmless here — we already have python3/make/g++ in the builder stage.
RUN npm install

COPY tsconfig.base.json ./
COPY shared ./shared
COPY client ./client
RUN cd shared && npx tsc -b
RUN cd client && npx tsc -b && npx vite build

# ── runtime stage ────────────────────────────────────────────────────────
FROM caddy:2-alpine
COPY --from=builder /app/client/dist /srv
COPY caddy/Caddyfile /etc/caddy/Caddyfile
