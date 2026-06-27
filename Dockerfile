FROM node:20-alpine

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package manifests and install production deps
COPY package*.json ./
RUN npm ci --production --ignore-scripts

# Rebuild native modules (better-sqlite3) for Alpine Linux
RUN npm rebuild better-sqlite3

# Copy application source
COPY server/ ./server/
COPY shared/ ./shared/
COPY tsconfig.json ./tsconfig.node.json* ./

# Expose API port
EXPOSE 3131

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3131/health || exit 1

CMD ["npx", "tsx", "server/index.ts"]
