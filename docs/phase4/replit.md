# JorMall staff app — Phase 4 continuation

Status: source implementation candidate, **not runtime-verified**. The user authorized Phase 4 after the Phase 3 ZIP. Earlier acceptance gaps remain open. Do not start Phase 5 without another user instruction.

## Read first

Read `JORMALL_REPLIT_SPEC.md`, `CODEX_PROMPT_PHASES_2-5.md`, `README.md`, `PHASE4_HANDOFF.md`, and `lib/db/migrations/README.md`. Keep the implemented modules; do not regenerate Phase 1–3 or substitute fake UI/data for API integration.

## Existing architecture

pnpm monorepo, Node 24 in Replit, Express 5 API on port 5000 under `/api`, React 19/Vite web on port 19880, PostgreSQL/Drizzle, server sessions and server-controlled navigation. Business rules: API `src/domain`; DB access: `src/services`; Zod/HTTP: `src/routes`. Keep clinic scoping and permission rechecks on the server. Do not trust a supplied clinic ID. Use the existing fetch wrapper, no OpenAPI/orval regeneration. No new paid API dependency.

Keep EN/AR dictionaries and RTL; every new visible string needs both languages. Names and notes retain author-selected language. Keep labelled forms, keyboard focus, test IDs, honest loading/empty/error feedback, and one Create appointment action per page. Sensitive notes and provider assignment permissions remain restricted.

## Phase 4 modules

Waiting entries/offers, inventory items/append-only movements, and one-time actual-consumption records are in `lib/db/src/schema/operations.ts`. Service implementation is `services/waiting-list.ts`, `services/inventory.ts`, and common `services/operations-context.ts`. Availability and appointment history were extracted from existing scheduling into `scheduling-slots.ts` and `scheduling-history.ts` for reuse; do not add a parallel availability engine.

Waiting replacement is **staff-confirmed, never auto-booked or messaged**. Cancellation can suggest, declining moves to the next compatible request, confirmation rechecks availability transactionally, and stale offers persist an audit/queue update before returning 409. Refresh is bounded to 100 cancellations; specific cancellation refresh remains available.

Inventory balances are derived, quantities exact thousandths, units/branches fixed. Receipts and adjustments are explicit movements. Actual material completion is atomic, once per appointment, with semantic replay protection and deferred SQL line-count guards. Missing actual reporting is not zero reporting. Service totals exclude recipes/receipts/adjustments and never mix units.

## Required environment

Set DATABASE_URL and SESSION_SECRET in secrets. Scripts do not implicitly load `.env`. Run `pnpm install --frozen-lockfile`. No dependencies were added; pnpm lockfile is unchanged. Choose a safe migration path on a backed-up copy. The API requires both scheduling and inventory guards before it listens. The dev push wrapper installs both; bare drizzle-kit push is insufficient.

## Validation before release

All four SQL migrations are hand-authored; generated snapshots and real-DB verification remain pending. Do not erase applied journals/snapshots or apply a fresh baseline to a push-managed existing DB. Test both empty migration and an upgrade from a verified, journaled Phase 3 database.

On a dedicated migrated disposable database, set TEST_DATABASE_DISPOSABLE=1 and run `bash scripts/checks/verify-phase4.sh`. There are 39 new real-PostgreSQL/API tests. Immutable ledger fixtures are deliberately retained and their accounts deactivated. Run tests nowhere near production. Do not disable guards for cleanup.

Restart API and web, run `scripts/checks/phase3-browser.mjs` and `phase4-browser.mjs` as documented in `BROWSER_ACCEPTANCE_PHASE4.md`. The new runner covers EN/AR desktop and 390px with real API-backed workflows. It requires explicit E2E_ALLOW_WRITE=1, an appropriate browser runner, and environment-only test credentials.

Actual editing checks: 219 offline checks, parsing of 214 active TS/TSX sources, and strict dependency-free subset checks passed. No full workspace typecheck, build, SQL migration, API test, workflow restart or real-browser acceptance passed here; pnpm/dependencies and PostgreSQL were absent. Keep this distinction in any release report. Report files/results/next phase in at most eight lines; stop before Phase 5.
