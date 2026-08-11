#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

NEXT_PUBLIC_API_BASE_URL="${NEXT_PUBLIC_API_BASE_URL:-/api/v1}"
FRONTEND_DOCKER_IMAGE_TAG="${FRONTEND_DOCKER_IMAGE_TAG:-chikaima-frontend-prepush}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required for pre-push image builds but was not found."
  exit 1
fi

echo "Running app lint..."
(
  cd "$ROOT_DIR"
  pnpm lint
)

echo "Running app type checks..."
(
  cd "$ROOT_DIR"
  pnpm typecheck
)

echo "Running app unit tests..."
(
  cd "$ROOT_DIR"
  pnpm test:unit
)

echo "Running app build..."
(
  cd "$ROOT_DIR"
  env NEXT_PUBLIC_API_BASE_URL="$NEXT_PUBLIC_API_BASE_URL" pnpm build
)

echo "Building app Docker image..."
(
  cd "$ROOT_DIR"
  docker build \
    -f Dockerfile \
    --build-arg NEXT_PUBLIC_API_BASE_URL="$NEXT_PUBLIC_API_BASE_URL" \
    -t "$FRONTEND_DOCKER_IMAGE_TAG" \
    .
)

echo "Pre-push checks passed."
