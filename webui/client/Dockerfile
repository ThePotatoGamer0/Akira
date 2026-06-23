# syntax=docker/dockerfile:1
# Build from repository root: docker build -f webui/client/Dockerfile .
FROM --platform=linux/arm64 node:22-bookworm-slim AS build
WORKDIR /app
COPY webui/client/package.json webui/client/package-lock.json ./client/
WORKDIR /app/client
RUN npm ci
COPY webui/client ./
ARG VITE_API_URL=
ARG VITE_DISCORD_CLIENT_ID=
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_DISCORD_CLIENT_ID=$VITE_DISCORD_CLIENT_ID
RUN npm run build

FROM --platform=linux/arm64 nginx:alpine
COPY --from=build /app/client/dist /usr/share/nginx/html
COPY webui/client/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
