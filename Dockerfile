# syntax=docker/dockerfile:1
# One image for the Pi: the Discord bot and the WebUI API.
# GitHub Actions builds it for arm64 and amd64 and pushes it to GHCR.

FROM node:22-bookworm-slim AS build
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    pkg-config \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json prisma.config.ts tsconfig.json ./
COPY prisma ./prisma
COPY webui/server/package.json webui/server/package-lock.json ./webui/server/

ENV DATABASE_URL=file:/data/akira.db
RUN npm ci
WORKDIR /app/webui/server
RUN npm ci
WORKDIR /app

COPY src ./src
COPY webui/server/src ./webui/server/src
COPY webui/server/tsconfig.json ./webui/server/tsconfig.json
COPY input ./input
RUN npx prisma generate
COPY docker/start.sh /start.sh
RUN chmod +x /start.sh

FROM node:22-bookworm-slim
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
    fonts-liberation \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV DATABASE_URL=file:/data/akira.db
ENV WEBUI_SERVER_PORT=3333
ENV AKIRA_INTERNAL_PORT=3847
ENV BOT_INTERNAL_URL=http://127.0.0.1:3847

COPY --from=build /app /app
COPY --from=build /start.sh /start.sh

EXPOSE 3333
HEALTHCHECK --start-period=180s --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3333/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["/start.sh"]
