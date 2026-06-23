# syntax=docker/dockerfile:1
# Build from repository root: docker build -f docs/Dockerfile .
FROM --platform=linux/arm64 node:22-bookworm-slim AS build
WORKDIR /app
COPY docs/package.json docs/package-lock.json ./docs/
WORKDIR /app/docs
RUN npm ci
COPY docs ./
RUN npm run build

FROM --platform=linux/arm64 nginx:alpine
COPY --from=build /app/docs/dist /usr/share/nginx/html
COPY docs/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
