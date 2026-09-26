#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${DATABASE_URL:?Use a dedicated development/test PostgreSQL database}"
: "${SESSION_SECRET:?Set a random test session secret}"
pnpm run typecheck
pnpm --filter @workspace/api-server run test
node scripts/checks/phase2-offline.mjs
pnpm --filter @workspace/api-server run build
PORT=19880 BASE_PATH=/ pnpm --filter @workspace/jormall run build
printf '\nAutomated checks finished. Real browser acceptance is still required; see BROWSER_ACCEPTANCE.md.\n'
