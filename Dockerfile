# ─── Stage 1: Build frontend ──────────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm install

COPY frontend/ ./
RUN npm run build
# Result: /build/frontend/dist

# ─── Stage 2: Production server ───────────────────────────────────────────────
FROM node:20-alpine AS server

RUN apk add --no-cache dumb-init

WORKDIR /app

# Backend deps only
COPY package*.json ./
RUN npm install --omit=dev

# Source files
COPY server.js ./

# Built frontend assets
COPY --from=frontend-builder /build/frontend/dist ./frontend-dist

# Non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

# dumb-init handles signals properly (cron jobs get SIGTERM)
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]