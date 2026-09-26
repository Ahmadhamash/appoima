#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${DATABASE_URL:?Set a dedicated, migrated DISPOSABLE database}"
: "${SESSION_SECRET:?Set a random test session secret}"
[[ "${TEST_DATABASE_DISPOSABLE:-}" == 1 ]] || { echo 'Refusing without TEST_DATABASE_DISPOSABLE=1'; exit 1; }
# Provider HTTP is explicitly stubbed by tests. No live calls are needed.
pnpm run typecheck
for phase in 2 3 4 5; do node "scripts/checks/phase${phase}-offline.mjs"; done
node scripts/checks/concierge-offline.mjs
pnpm --filter @workspace/api-server run test
pnpm --filter @workspace/api-server run build
PORT=19880 BASE_PATH=/ pnpm --filter @workspace/jormall run build
printf '\nNow run real authenticated browser acceptance and the separate opt-in live voice check in docs/concierge/SETUP.md.\n'
