# syntax=docker/dockerfile:1
FROM --platform=linux/arm64 node:22-bookworm-slim AS base
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
ENV DATABASE_URL=file:./prisma/akira.db
RUN npm ci

FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npx prisma generate && npx tsc

FROM base AS runtime
ENV NODE_ENV=production
ENV DATABASE_URL=file:./prisma/akira.db
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci --omit=dev && npm rebuild better-sqlite3
COPY --from=build /app/src/generated ./src/generated
COPY --from=build /app/dist ./dist
