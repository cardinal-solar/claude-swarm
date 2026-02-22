# ---- Stage 1: Build ----
FROM node:20-slim AS builder

WORKDIR /app

# Install build tools for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Install root dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build TypeScript
COPY tsconfig.json ./
COPY src/ ./src/
COPY cli/ ./cli/
COPY sdk/ ./sdk/
RUN npm run build

# Install web dependencies and build dashboard
COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci
COPY web/ ./web/
RUN cd web && npm run build

# ---- Stage 2: Production ----
FROM node:20-slim

WORKDIR /app

# Install runtime deps: C++ build tools (for better-sqlite3) + WeasyPrint deps (for PDF generation)
RUN apt-get update && apt-get install -y \
    python3 python3-pip python3-venv make g++ curl \
    libpangocairo-1.0-0 libpango-1.0-0 libcairo2 \
    libgdk-pixbuf2.0-0 shared-mime-info libffi8 \
    && pip3 install --break-system-packages weasyprint \
    && rm -rf /var/lib/apt/lists/*

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Remove only C++ build tools — keep python3 + weasyprint for workspace PDF generation
RUN apt-get purge -y make g++ && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

# Copy compiled output from builder
COPY --from=builder /app/dist/ ./dist/
COPY --from=builder /app/web/dist/ ./web/dist/

# Create data directory and non-root user
RUN mkdir -p /app/data && \
    groupadd -r swarm && \
    useradd -r -g swarm -d /app swarm && \
    chown -R swarm:swarm /app

USER swarm

ENV NODE_ENV=production
ENV PORT=3030
ENV DATA_DIR=/app/data

EXPOSE 3030

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3030/api/health || exit 1

CMD ["node", "dist/src/index.js"]
