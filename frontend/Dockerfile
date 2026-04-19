FROM node:22-alpine AS builder

WORKDIR /app

ARG VITE_DEFAULT_CONCURRENCY=10
ARG VITE_FOLDER_IMPORT_MAX_CONCURRENCY=6
ENV VITE_DEFAULT_CONCURRENCY=${VITE_DEFAULT_CONCURRENCY}
ENV VITE_FOLDER_IMPORT_MAX_CONCURRENCY=${VITE_FOLDER_IMPORT_MAX_CONCURRENCY}

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

COPY . .
RUN pnpm build


FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
