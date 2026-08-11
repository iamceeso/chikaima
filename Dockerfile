FROM cgr.dev/chainguard/node:latest-dev AS deps

USER root
WORKDIR /app

ARG NEXT_PUBLIC_API_BASE_URL=/api/v1
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV npm_config_python=/usr/bin/python3

RUN apk update && \
    apk add --no-cache python3 build-base

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN corepack enable && \
    corepack prepare pnpm@latest --activate && \
    pnpm install --frozen-lockfile

FROM cgr.dev/chainguard/node:latest-dev AS builder

USER root
WORKDIR /app

ARG NEXT_PUBLIC_API_BASE_URL=/api/v1
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

RUN corepack enable && \
    corepack prepare pnpm@latest --activate

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm --version
RUN pnpm build

FROM cgr.dev/chainguard/node:latest AS runner

WORKDIR /app

ARG NEXT_PUBLIC_API_BASE_URL=/api/v1

ENV NODE_ENV=production
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

CMD ["server.js"]
