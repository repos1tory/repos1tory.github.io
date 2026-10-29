#!/bin/sh
# verify-repo.sh — full local/CI verification of the signed APT repository.
set -eu

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

node scripts/repo.mjs check
node scripts/verify-repo.mjs

if command -v gpgv >/dev/null 2>&1; then
  gpgv --keyring docs/repos1tory.gpg docs/InRelease
  gpgv --keyring docs/repos1tory.gpg docs/Release.gpg docs/Release
else
  echo "warning: gpgv not found; OpenPGP checks used the bundled library only" >&2
fi

echo "PASS: repository verification complete"
