# syntax=docker/dockerfile:1
# Build from repository root: docker build -f webui/server/Dockerfile .
FROM --platform=linux/arm64 node:22-bookworm-slim
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
ENV DATABASE_URL=file:./prisma/akira.db
RUN npm ci && npx prisma generate

COPY webui/server ./webui/server
WORKDIR /app/webui/server
RUN npm ci

WORKDIR /app
ENV NODE_ENV=production
ENV WEBUI_SERVER_PORT=3333
EXPOSE 3333
CMD ["./webui/server/node_modules/.bin/tsx", "webui/server/src/index.ts"]
