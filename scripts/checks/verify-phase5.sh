#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${DATABASE_URL:?Use an already migrated dedicated disposable PostgreSQL database}"
: "${SESSION_SECRET:?Set a random test session secret}"
if [[ "${TEST_DATABASE_DISPOSABLE:-}" != "1" ]]; then
  echo 'Refusing: TEST_DATABASE_DISPOSABLE=1 required. All suites can write synthetic records/immutable ledgers.' >&2
  exit 1
fi
# Test AI HTTP is stubbed; these suites never require provider secrets.
export AI_ASSISTANT_ENABLED=false
pnpm run typecheck
node scripts/checks/phase2-offline.mjs
node scripts/checks/phase3-offline.mjs
node scripts/checks/phase4-offline.mjs
node scripts/checks/phase5-offline.mjs
pnpm --filter @workspace/api-server run test
pnpm --filter @workspace/api-server run build
PORT=19880 BASE_PATH=/ pnpm --filter @workspace/jormall run build
printf '\nRestart API/web, then run phase3/4/5 browser runners separately. This script does not migrate or certify real-browser/live-provider acceptance.\n'
