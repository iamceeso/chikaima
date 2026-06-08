#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

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

echo "Starting Olanma backend..."
(
  cd "$BACKEND_DIR"
  uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
) &
BACKEND_PID=$!

echo "Starting Olanma Celery worker..."
(
  cd "$BACKEND_DIR"
  uv run celery -A app.workers.celery_app.celery_app worker --loglevel=info
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
