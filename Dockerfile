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

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "const http=require('http');const r=http.get('http://localhost:3001/api/health',{timeout:4000},res=>{process.exit(res.statusCode===200?0:1)});r.on('error',()=>process.exit(1));r.on('timeout',()=>{r.destroy();process.exit(1)})"

WORKDIR /app/server
CMD ["node", "index.js"]
