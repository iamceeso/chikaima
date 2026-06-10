#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_VENV_BIN="$BACKEND_DIR/.venv/bin"

port_owner() {
  local port="$1"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | tail -n +2 || true
}

ensure_port_available() {
  local port="$1"
  local service_name="$2"
  local owner
  owner="$(port_owner "$port")"

  if [[ -n "$owner" ]]; then
    echo "Cannot start $service_name on port $port because it is already in use."
    echo
    echo "$owner"
    echo
    echo "Stop the existing process using port $port, then run ./start-dev.sh again."
    exit 1
  fi
}

resolve_backend_command() {
  local command_name="$1"

  if command -v uv >/dev/null 2>&1; then
    echo "uv run $command_name"
    return 0
  fi

  if [[ -x "$BACKEND_VENV_BIN/$command_name" ]]; then
    echo "$BACKEND_VENV_BIN/$command_name"
    return 0
  fi

  echo "Cannot start backend services because neither 'uv' nor '$BACKEND_VENV_BIN/$command_name' is available." >&2
  echo "Install uv, or create the backend virtual environment and dependencies first." >&2
  echo "Expected setup commands:" >&2
  echo "  cd backend && python3 -m venv .venv" >&2
  echo "  source .venv/bin/activate" >&2
  echo "  pip install uv" >&2
  echo "  uv sync" >&2
  exit 1
}

cleanup() {
  local exit_code=$?

  if [[ -n "${BACKEND_PID:-}" ]]; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi

  if [[ -n "${CELERY_PID:-}" ]]; then
    kill "$CELERY_PID" 2>/dev/null || true
  fi

  if [[ -n "${FRONTEND_PID:-}" ]]; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi

  wait 2>/dev/null || true
  exit "$exit_code"
}

trap cleanup EXIT INT TERM

ensure_port_available 8000 "Olanma backend"
ensure_port_available 3000 "Olanma frontend"

BACKEND_SERVER_CMD="$(resolve_backend_command uvicorn)"
CELERY_CMD="$(resolve_backend_command celery)"

echo "Starting Olanma backend..."
(
  cd "$BACKEND_DIR"
  $BACKEND_SERVER_CMD app.main:app --reload --host 0.0.0.0 --port 8000
) &
BACKEND_PID=$!

echo "Starting Olanma Celery worker..."
(
  cd "$BACKEND_DIR"
  $CELERY_CMD -A app.workers.celery_app.celery_app worker --loglevel=info
) &
CELERY_PID=$!

echo "Starting Olanma frontend..."
(
  cd "$FRONTEND_DIR"
  pnpm dev
) &
FRONTEND_PID=$!

echo "Olanma is starting:"
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:8000"
echo "  Worker:   celery"
echo
echo "Press Ctrl+C to stop all services."

wait "$BACKEND_PID" "$CELERY_PID" "$FRONTEND_PID"
