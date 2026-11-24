#!/usr/bin/env bash
#
# Runs the Playwright acceptance suite with the environment produced by
# `npm run e2e:setup` (Chromium libraries and fonts on Linux). Without that
# setup the suite still runs, using the system libraries.
#
# Usage:  npm run test:e2e            (all specs)
#         npm run test:e2e -- -g lifecycle
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PREFIX="${KANSO_E2E_DEPS:-$HOME/.cache/kanso-e2e-deps}"

if [ -f "$PREFIX/env.sh" ]; then
  # shellcheck disable=SC1090
  . "$PREFIX/env.sh"
fi

cd "$ROOT"
exec npx playwright test "$@"
