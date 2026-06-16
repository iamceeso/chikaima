#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "$#" -ne 1 ]; then
  echo "Usage: ./version-patch.sh <version>"
  echo "Example: ./version-patch.sh v0.1.1"
  exit 1
fi

RAW_VERSION="$1"
VERSION="${RAW_VERSION#v}"
TAG="v$VERSION"

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z]+)*$ ]]; then
  echo "Invalid version: $RAW_VERSION"
  echo "Use a semantic version like 0.1.1 or v0.1.1"
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "This script must be run from inside the git repository."
  exit 1
fi

if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null 2>&1; then
  echo "Git tag already exists: $TAG"
  exit 1
fi

BACKEND_PYPROJECT="$ROOT_DIR/backend/pyproject.toml"
BACKEND_MAIN="$ROOT_DIR/backend/app/main.py"
BACKEND_UV_LOCK="$ROOT_DIR/backend/uv.lock"
FRONTEND_PACKAGE="$ROOT_DIR/frontend/package.json"

CURRENT_BACKEND_VERSION="$(sed -n 's/^version = "\(.*\)"$/\1/p' "$BACKEND_PYPROJECT" | head -n 1)"
CURRENT_FRONTEND_VERSION="$(sed -n 's/^  "version": "\(.*\)",$/\1/p' "$FRONTEND_PACKAGE" | head -n 1)"

if [ -z "$CURRENT_BACKEND_VERSION" ] || [ -z "$CURRENT_FRONTEND_VERSION" ]; then
  echo "Could not determine current versions from project files."
  exit 1
fi

export VERSION

perl -0pi -e 's/(\[project\]\nname = "olanma-backend"\nversion = ")[^"]+(")/$1$ENV{VERSION}$2/' "$BACKEND_PYPROJECT"
perl -0pi -e 's/(^\s*version=")[^"]+(",\s*$)/$1$ENV{VERSION}$2/m' "$BACKEND_MAIN"
perl -0pi -e 's/(\[\[package\]\]\nname = "olanma-backend"\nversion = ")[^"]+(")/$1$ENV{VERSION}$2/' "$BACKEND_UV_LOCK"
perl -0pi -e 's/("name": "olanma-frontend",\n  "version": ")[^"]+(")/$1$ENV{VERSION}$2/' "$FRONTEND_PACKAGE"

git tag "$TAG"

echo "Updated backend version: $CURRENT_BACKEND_VERSION -> $VERSION"
echo "Updated frontend version: $CURRENT_FRONTEND_VERSION -> $VERSION"
echo "Created git tag: $TAG"
echo "Synced files:"
echo "  - backend/pyproject.toml"
echo "  - backend/app/main.py"
echo "  - backend/uv.lock"
echo "  - frontend/package.json"
echo
echo "Next:"
echo "  ./pre-push.sh"
echo "  git push origin main"
echo "  git push origin $TAG"
