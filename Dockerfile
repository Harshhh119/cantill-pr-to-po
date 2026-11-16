# Multi-stage Dockerfile for Corvo PR-to-PO Platform

# Stage 1: Build Frontend
FROM node:24-alpine AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# Stage 2: Production Server
FROM node:24-alpine
WORKDIR /app

# Install server dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy server code and master data
COPY server/ ./server/
COPY data/ ./data/
COPY submission/ ./submission/
COPY DECISIONS.md APPROACH.md ./

# Copy built frontend from Stage 1 into server's static directory
COPY --from=client-builder /app/client/dist ./client/dist

# Expose port (default 5000)
ENV PORT=5000
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/policies || exit 1

# Start server
CMD ["node", "server/index.js"]
