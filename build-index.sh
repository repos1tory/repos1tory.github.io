#!/usr/bin/env bash
# Legacy entry point. The repo is generated from packages.json now:
#
#   node scripts/repo.mjs add --deb <file> [--repo owner/name --tag v1.2.3 \
#        --url https://github.com/owner/name/releases/download/v1.2.3/<file>.deb]
#   node scripts/repo.mjs render
#
# `render` regenerates docs/Packages, Packages.gz, Release, downloads.json and
# the listing inside docs/index.html. A .deb dropped into pool/ on its own is
# NOT picked up any more — add it to packages.json first.
set -euo pipefail
exec node "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/scripts/repo.mjs" render
