# Dockerfile - builds the TaskVault app image in TWO stages.
# Stage 1 (deps): install production dependencies.
# Stage 2 (runtime): copy only what is needed -> small, clean image.

# ---------- Stage 1: install dependencies ----------
FROM node:26.13.1-alpine AS deps
WORKDIR /app

# Copy only the dependency files first -> "npm ci" is cached until they change.
COPY package.json package-lock.json ./

# Install EXACTLY the versions from package-lock.json, without dev packages.
RUN npm ci --omit=dev

# ---------- Stage 2: runtime image ----------
FROM node:26.13.1-alpine
ENV NODE_ENV=production
WORKDIR /app

# Take only node_modules from stage 1 (no npm cache or leftovers).
COPY --from=deps /app/node_modules ./node_modules

# App files stay owned by root -> the app user can read but not modify them.
COPY package.json ./
COPY src ./src
COPY public ./public

# Run as the unprivileged "node" user, not root.
USER node

# Documentation only - does NOT publish the port.
EXPOSE 3000

# Start node directly (it is PID 1) so it receives SIGTERM -> graceful shutdown.
CMD ["node", "src/server.js"]
