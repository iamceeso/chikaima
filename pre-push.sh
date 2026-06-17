#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

UV_CACHE_DIR="${UV_CACHE_DIR:-/tmp/uv-cache}"
JWT_SECRET_KEY="${JWT_SECRET_KEY:-change-me-development-secret}"
JWT_REFRESH_SECRET_KEY="${JWT_REFRESH_SECRET_KEY:-change-me-too-development-secret}"
PROVIDER_SECRET_KEY="${PROVIDER_SECRET_KEY:-replace-with-32-char-secret-key}"
NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-/api/v1}"
FRONTEND_DOCKER_IMAGE_TAG="${FRONTEND_DOCKER_IMAGE_TAG:-chikaima-frontend-prepush}"
BACKEND_DOCKER_IMAGE_TAG="${BACKEND_DOCKER_IMAGE_TAG:-chikaima-backend-prepush}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required for pre-push image builds but was not found."
  exit 1
fi

echo "Running backend lint..."
(
  cd "$BACKEND_DIR"
  env \
    UV_CACHE_DIR="$UV_CACHE_DIR" \
    JWT_SECRET_KEY="$JWT_SECRET_KEY" \
    JWT_REFRESH_SECRET_KEY="$JWT_REFRESH_SECRET_KEY" \
    PROVIDER_SECRET_KEY="$PROVIDER_SECRET_KEY" \
    uv run ruff check .
)

echo "Running backend tests..."
(
  cd "$BACKEND_DIR"
  env \
    UV_CACHE_DIR="$UV_CACHE_DIR" \
    JWT_SECRET_KEY="$JWT_SECRET_KEY" \
    JWT_REFRESH_SECRET_KEY="$JWT_REFRESH_SECRET_KEY" \
    PROVIDER_SECRET_KEY="$PROVIDER_SECRET_KEY" \
    uv run pytest
)

echo "Running frontend lint..."
(
  cd "$FRONTEND_DIR"
  pnpm lint
)

echo "Running frontend type checks..."
(
  cd "$FRONTEND_DIR"
  pnpm typecheck
)

echo "Running frontend unit tests..."
(
  cd "$FRONTEND_DIR"
  pnpm test:unit
)

echo "Running frontend build..."
(
  cd "$FRONTEND_DIR"
  env NEXT_PUBLIC_API_BASE_URL="$NEXT_PUBLIC_API_BASE_URL" pnpm build
)

echo "Building backend Docker image..."
(
  cd "$ROOT_DIR"
  docker build -f backend/Dockerfile -t "$BACKEND_DOCKER_IMAGE_TAG" backend
)

echo "Building frontend Docker image..."
(
  cd "$ROOT_DIR"
  docker build \
    -f frontend/Dockerfile \
    --build-arg NEXT_PUBLIC_API_BASE_URL="$NEXT_PUBLIC_API_BASE_URL" \
    -t "$FRONTEND_DOCKER_IMAGE_TAG" \
    frontend
)

echo "Pre-push checks passed for backend and frontend."
