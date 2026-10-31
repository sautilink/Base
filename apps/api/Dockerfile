# Build with: docker build -f apps/api/Dockerfile .
# This image contains only SautiLink Base's API; never include real .env files.
FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN npm install --global pnpm@9.15.4
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile
COPY apps/api/ apps/api/
RUN pnpm --filter @base/api build

FROM node:22-bookworm-slim
ENV NODE_ENV=production
ENV PORT=3001
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
# SUPABASE_DB_CA_CERT is provided as the official PEM via Render settings.
USER node
EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]
