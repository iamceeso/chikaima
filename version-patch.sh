#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PYPROJECT="$ROOT_DIR/backend/pyproject.toml"
BACKEND_MAIN="$ROOT_DIR/backend/app/main.py"
FRONTEND_PACKAGE="$ROOT_DIR/frontend/package.json"
UV_CACHE_DIR="${UV_CACHE_DIR:-/tmp/uv-cache}"

if [ "$#" -gt 1 ]; then
  echo "Usage: ./version-patch.sh [version]"
  echo "Example: ./version-patch.sh v0.1.1"
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "This script must be run from inside the git repository."
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Working tree is not clean. Commit or stash existing changes before running this script."
  exit 1
fi

CURRENT_BACKEND_VERSION="$(sed -n 's/^version = "\(.*\)"$/\1/p' "$BACKEND_PYPROJECT" | head -n 1)"
CURRENT_FRONTEND_VERSION="$(sed -n 's/^  "version": "\(.*\)",$/\1/p' "$FRONTEND_PACKAGE" | head -n 1)"

if [ -z "$CURRENT_BACKEND_VERSION" ] || [ -z "$CURRENT_FRONTEND_VERSION" ]; then
  echo "Could not determine current versions from project files."
  exit 1
fi

if [ "$#" -eq 0 ]; then
  if [[ "$CURRENT_BACKEND_VERSION" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
    VERSION="${BASH_REMATCH[1]}.${BASH_REMATCH[2]}.$((BASH_REMATCH[3] + 1))"
    RAW_VERSION="$VERSION"
  else
    echo "Current backend version is not a simple semantic version: $CURRENT_BACKEND_VERSION"
    echo "Pass an explicit version like ./version-patch.sh v0.1.1"
    exit 1
  fi
else
  RAW_VERSION="$1"
  VERSION="${RAW_VERSION#v}"
fi

TAG="v$VERSION"

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z]+)*$ ]]; then
  echo "Invalid version: $RAW_VERSION"
  echo "Use a semantic version like 0.1.1 or v0.1.1"
  exit 1
fi

if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null 2>&1; then
  echo "Git tag already exists: $TAG"
  exit 1
fi

export VERSION

perl -0pi -e 's/(\[project\]\nname = "olanma-backend"\nversion = ")[^"]+(")/$1$ENV{VERSION}$2/' "$BACKEND_PYPROJECT"
perl -0pi -e 's/(^\s*version=")[^"]+(",\s*$)/$1$ENV{VERSION}$2/m' "$BACKEND_MAIN"
perl -0pi -e 's/("name": "olanma-frontend",\n  "version": ")[^"]+(")/$1$ENV{VERSION}$2/' "$FRONTEND_PACKAGE"

if command -v corepack >/dev/null 2>&1; then
  PNPM_CMD=(corepack pnpm)
elif command -v pnpm >/dev/null 2>&1; then
  PNPM_CMD=(pnpm)
else
  echo "Could not find pnpm or corepack to refresh frontend lockfile."
  exit 1
fi

if ! command -v uv >/dev/null 2>&1; then
  echo "Could not find uv to refresh backend lockfile."
  exit 1
fi

(
  cd "$ROOT_DIR/frontend"
  "${PNPM_CMD[@]}" install --lockfile-only
)

(
  cd "$ROOT_DIR/backend"
  env UV_CACHE_DIR="$UV_CACHE_DIR" uv lock
)

git add \
  "$BACKEND_PYPROJECT" \
  "$BACKEND_MAIN" \
  "$ROOT_DIR/backend/uv.lock" \
  "$FRONTEND_PACKAGE" \
  "$ROOT_DIR/frontend/pnpm-lock.yaml"

git commit -m "chore: bump version to $TAG"
git tag "$TAG"

echo "Updated backend version: $CURRENT_BACKEND_VERSION -> $VERSION"
echo "Updated frontend version: $CURRENT_FRONTEND_VERSION -> $VERSION"
echo "Created git commit: chore: bump version to $TAG"
echo "Created git tag: $TAG"
echo "Synced files:"
echo "  - backend/pyproject.toml"
echo "  - backend/app/main.py"
echo "  - backend/uv.lock"
echo "  - frontend/package.json"
echo "  - frontend/pnpm-lock.yaml"
echo
echo "Next:"
echo "  ./pre-push.sh"
echo "  git push origin HEAD"
echo "  git push origin $TAG"
