#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${DATABASE_URL:?Point DATABASE_URL at an already migrated, disposable test database}"
: "${SESSION_SECRET:?SESSION_SECRET is required}"
pnpm run typecheck
node scripts/checks/phase2-offline.mjs
node scripts/checks/phase3-offline.mjs
pnpm --filter @workspace/api-server run test
pnpm --filter @workspace/api-server run build
PORT=19880 BASE_PATH=/ pnpm --filter @workspace/jormall run build
printf '\nRestart API and web, then run browser acceptance separately; this script does not assert that it passed.\n'
