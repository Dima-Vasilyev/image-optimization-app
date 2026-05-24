# ── Stage 1: install deps (needs build tools for sharp's native module) ─────
FROM node:20-alpine AS deps

WORKDIR /app

# python3/make/g++ are needed only if sharp falls back to compiling from source
# (Sharp 0.33+ ships prebuilt musl binaries so this is usually a no-op)
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --only=production

# ── Stage 2: lean runtime image ──────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Copy pre-built node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY . .

# Create writable directories that are needed at runtime
RUN mkdir -p temp logs

EXPOSE 3000

ENV NODE_ENV=production

# pm2-runtime is pm2's Docker-native entrypoint: forwards OS signals properly
CMD ["./node_modules/.bin/pm2-runtime", "ecosystem.config.js", "--env", "production"]
