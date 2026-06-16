#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
UV_CACHE_DIR="${UV_CACHE_DIR:-/tmp/uv-cache}"

echo "Running backend tests..."
(
  cd "$BACKEND_DIR"
  env UV_CACHE_DIR="$UV_CACHE_DIR" uv run pytest
)

echo "Running frontend tests..."
(
  cd "$FRONTEND_DIR"
  npm test
)

echo "All backend and frontend tests passed."
