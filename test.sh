#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

echo "Running backend tests..."
(
  cd "$BACKEND_DIR"
  uv run python -m unittest discover -s tests -p 'test_*.py'
)

echo "Running frontend tests..."
(
  cd "$FRONTEND_DIR"
  npm test
)

echo "All backend and frontend tests passed."
