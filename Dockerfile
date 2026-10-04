FROM node:24-bookworm-slim AS deps

WORKDIR /app

ARG NEXT_PUBLIC_API_BASE_URL=/api/v1
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV npm_config_python=/usr/bin/python3

RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN corepack enable && \
    corepack prepare pnpm@latest --activate && \
    pnpm install --frozen-lockfile

FROM node:24-bookworm-slim AS builder

WORKDIR /app

ARG NEXT_PUBLIC_API_BASE_URL=/api/v1
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

RUN corepack enable && \
    corepack prepare pnpm@latest --activate

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm --version
RUN pnpm build

FROM node:24-bookworm-slim AS runner

WORKDIR /app

ARG NEXT_PUBLIC_API_BASE_URL=/api/v1

ENV NODE_ENV=production
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

# git: AI teams branch, commit and merge in project folders.
# INSTALL_DOCKER_CLI: lets CHIKAIMA_COLLAB_EXEC=docker start per-project containers
#   through the host's Docker socket (mount /var/run/docker.sock).
# INSTALL_CHROMIUM: lets agents take screenshots of the live preview (adds ~300 MB).
ARG INSTALL_DOCKER_CLI=true
ARG DOCKER_CLI_VERSION=27.3.1
ARG INSTALL_CHROMIUM=false

RUN apt-get update && \
    apt-get install -y --no-install-recommends libstdc++6 git ca-certificates curl && \
    if [ "$INSTALL_CHROMIUM" = "true" ]; then apt-get install -y --no-install-recommends chromium; fi && \
    if [ "$INSTALL_DOCKER_CLI" = "true" ]; then \
      arch="$(uname -m)"; [ "$arch" = "arm64" ] && arch=aarch64; \
      curl -fsSL "https://download.docker.com/linux/static/stable/${arch}/docker-${DOCKER_CLI_VERSION}.tgz" | tar -xz -C /usr/local/bin --strip-components=1 docker/docker; \
    fi && \
    apt-get purge -y curl && apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

CMD ["node", "server.js"]
