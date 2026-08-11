#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_PACKAGE="$ROOT_DIR/package.json"

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

CURRENT_FRONTEND_VERSION="$(sed -n 's/^  "version": "\(.*\)",$/\1/p' "$FRONTEND_PACKAGE" | head -n 1)"

if [ -z "$CURRENT_FRONTEND_VERSION" ]; then
  echo "Could not determine current version from project files."
  exit 1
fi

if [ "$#" -eq 0 ]; then
  if [[ "$CURRENT_FRONTEND_VERSION" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
    VERSION="${BASH_REMATCH[1]}.${BASH_REMATCH[2]}.$((BASH_REMATCH[3] + 1))"
    RAW_VERSION="$VERSION"
  else
    echo "Current frontend version is not a simple semantic version: $CURRENT_FRONTEND_VERSION"
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

perl -0pi -e 's/("name": "chikaima-frontend",\n  "version": ")[^"]+(")/$1$ENV{VERSION}$2/' "$FRONTEND_PACKAGE"

if command -v corepack >/dev/null 2>&1; then
  PNPM_CMD=(corepack pnpm)
elif command -v pnpm >/dev/null 2>&1; then
  PNPM_CMD=(pnpm)
else
  echo "Could not find pnpm or corepack to refresh frontend lockfile."
  exit 1
fi

(
  cd "$ROOT_DIR"
  "${PNPM_CMD[@]}" install --lockfile-only
)

git add \
  "$FRONTEND_PACKAGE" \
  "$ROOT_DIR/pnpm-lock.yaml"

git commit -m "chore: bump version to $TAG"
git tag "$TAG"

echo "Updated frontend version: $CURRENT_FRONTEND_VERSION -> $VERSION"
echo "Created git commit: chore: bump version to $TAG"
echo "Created git tag: $TAG"
echo "Synced files:"
echo "  - package.json"
echo "  - pnpm-lock.yaml"
echo
echo "Next:"
echo "  ./pre-push.sh"
echo "  git push origin HEAD"
echo "  git push origin $TAG"
