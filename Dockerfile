# ═══════════════════════════════════════════
# BudgetVault - Multi-stage Dockerfile
# ═══════════════════════════════════════════

# Stage 1: Build React frontend natively on host platform (fast, zero emulation overhead)
FROM --platform=$BUILDPLATFORM node:20-bookworm-slim AS frontend-build
WORKDIR /build/client
COPY client/package*.json ./
RUN npm ci --no-audit
COPY client/ ./
RUN npm run build

# Stage 2: Production server (Debian slim for rock-solid glibc & multi-arch compatibility)
FROM node:20-bookworm-slim AS production
WORKDIR /app

# Install server dependencies
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev --no-audit

# Copy server code
COPY server/ ./server/

# Copy built frontend
COPY --from=frontend-build /build/client/dist ./client/dist

# Create data directory
RUN mkdir -p /app/data/uploads

# Environment
ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

# Health check (uses lightweight wget built into Alpine Busybox)
HEALTHCHECK --interval=60s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --spider -q http://127.0.0.1:3001/api/health || exit 1

WORKDIR /app/server
CMD ["node", "index.js"]
