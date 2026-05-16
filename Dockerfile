# ═══════════════════════════════════════
# BudgetVault - Multi-stage Dockerfile
# ═══════════════════════════════════════

# Stage 1: Build React frontend
FROM node:20-alpine AS frontend-build
WORKDIR /build/client
COPY client/package*.json ./
RUN npm ci --no-audit
COPY client/ ./
RUN npm run build

# Stage 2: Production server
FROM node:20-alpine AS production
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

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

WORKDIR /app/server
CMD ["node", "index.js"]
