# =============================================================================
# Dockerfile - builds the TaskVault app image in TWO stages.
#   Stage 1 (deps):    install production dependencies.
#   Stage 2 (runtime): copy only what is needed to run -> small, clean image.
# Base image: official Node.js LTS on Alpine Linux, version PINNED so every
# build uses exactly the same base (reproducible, no silent upgrades).
# Alpine = very small Linux -> fewer packages -> fewer vulnerabilities (CVEs).
# =============================================================================

# ---------- Stage 1: install dependencies ----------
FROM node:26.13.1-alpine AS deps

# All following commands run inside /app (created automatically).
WORKDIR /app

# Copy ONLY the dependency files first. Docker caches each step ("layer"):
# as long as these two files don't change, the slow "npm ci" step is reused
# from cache, even when the source code changes.
COPY package.json package-lock.json ./

# npm ci = "clean install": installs EXACTLY the versions in package-lock.json
# and fails if it doesn't match package.json (reproducible builds).
# --omit=dev = skip development-only packages.
RUN npm ci --omit=dev

# ---------- Stage 2: runtime image ----------
FROM node:26.13.1-alpine

# Tells Express and libraries to run in production mode (less debug output, faster).
ENV NODE_ENV=production

WORKDIR /app

# Take the installed node_modules from stage 1. The npm cache and any other
# leftovers of the install stay behind in stage 1 and are NOT in the final image.
COPY --from=deps /app/node_modules ./node_modules

# Copy the application itself. Files stay owned by root, so the app user
# below can READ them but cannot modify its own code if it is compromised.
COPY package.json ./
COPY src ./src
COPY public ./public

# Run as the unprivileged "node" user that the official image already provides,
# NOT as root. If an attacker breaks into the app, they are not root in the container.
USER node

# Documentation only: the app listens on 3000. It does NOT publish the port -
# in docker-compose.yml only nginx can reach it over the internal network.
EXPOSE 3000

# Start node DIRECTLY (exec form, no shell, no "npm start"), so node is PID 1
# and receives Docker's SIGTERM -> our graceful shutdown in server.js runs.
CMD ["node", "src/server.js"]
