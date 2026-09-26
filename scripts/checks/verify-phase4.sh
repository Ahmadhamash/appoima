#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${DATABASE_URL:?Use an already migrated, dedicated disposable PostgreSQL DATABASE}"
: "${SESSION_SECRET:?Set a random test session secret}"
if [[ "${TEST_DATABASE_DISPOSABLE:-}" != "1" ]]; then
  echo 'Refusing: TEST_DATABASE_DISPOSABLE=1 is required. Phase 4 tests retain append-only synthetic ledgers.' >&2
  exit 1
fi
pnpm run typecheck
node scripts/checks/phase2-offline.mjs
node scripts/checks/phase3-offline.mjs
node scripts/checks/phase4-offline.mjs
pnpm --filter @workspace/api-server run test
pnpm --filter @workspace/api-server run build
PORT=19880 BASE_PATH=/ pnpm --filter @workspace/jormall run build
printf '\nRestart API/web and run phase3-browser.mjs and phase4-browser.mjs separately. No browser acceptance is implied by this script.\n'
