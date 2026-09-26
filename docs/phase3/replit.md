# JorMall — current continuation state

Binding product spec: `JORMALL_REPLIT_SPEC.md`. Supplied Phase 1 foundation + Phase 2 setup + **Phase 3 scheduling implementation candidate**. The user said “continue” after Phase 2; scheduling was added only. **Phase 4 and Phase 5 were not started. This is not a verified release.**

## Start here

Read `README.md`, `PHASE3_HANDOFF.md`, `lib/db/migrations/README.md` and `BROWSER_ACCEPTANCE_PHASE3.md`. Do not rebuild completed auth/setup modules or assume source-only tests prove live acceptance.

## Runtime

Node 24, pnpm monorepo, Express 5 / PostgreSQL sessions / bcryptjs / Zod, PostgreSQL + Drizzle; React 19 / Vite / wouter / react-query / Tailwind / shadcn. Original lockfile retained; no new application dependencies.

Secrets: `DATABASE_URL`, `SESSION_SECRET`. Install: `pnpm install --frozen-lockfile`.

- API: `pnpm --filter @workspace/api-server run dev`, port 5000 under `/api`.
- Web: `pnpm --filter @workspace/jormall run dev`, port 19880, default base `/`.
- Keep existing Replit routing. Vite proxies `/api` locally outside Replit.
- Requested development schema flow: `pnpm --filter @workspace/db run push`. Wrapper installs required exclusion constraints after Drizzle push. Do not use bare push or suppress warnings.
- Fresh/appropriately journaled deployment: `pnpm --filter @workspace/db run migrate`. Read the database decision paths first; never replay a baseline over existing push-managed tables.
- All migration SQL is hand-authored and unexecuted here. Generated Drizzle metadata is pending. `prepare-snapshots` handles an entirely absent three-phase snapshot chain; partial metadata is refused for manual review.
- API startup checks for the named employee/room overlap exclusions. `btree_gist` must be available with suitable database permissions.
- Seed: `pnpm --filter @workspace/api-server run seed`; random new account passwords printed once, existing passwords unchanged, real sample appointments only when availability permits.

## Current implementation

Phase 2: branch time zones/hours, services, rooms, staff-account Role → Person/login → Access review wizard, exact grants, work/breaks/leave, customers and restricted sensitive notes.

Phase 3: customer/service/employee/slot/review booking wizard, daily/month/history views and filters; UTC appointments + branch-local display; lifecycle, reasons, reschedule history, optimistic versions and durable command keys. Services calculate real availability and re-check it during the transaction. Required compatible rooms are assigned by the server. Appointment/status history/audit/idempotency commit together. Customer history and the manager's first-booking checklist are backed by real appointments.

Provider/doctor accounts have assigned-only appointment access unless explicitly granted global read/manage. New presets omit those global permissions; existing persisted grants are not silently rewritten. Provider homes show own work and next customer. Assigned providers can Start/Finish and record notes. Global read alone does not expose operational notes; sensitive customer notes require customers.manage and audited access. Detail permission/data reads coordinate with setup/reassignment via shared clinic lock. Logout clears private query caches.

Rules live in API domain, DB operations in services, validated HTTP in routes. Clinic ID always derives from the authenticated actor. Keep request schemas strict; deny platform owner operational access and forced-password sessions. Server errors are codes; UI translates them. EN/AR dictionaries, RTL and nameLang conventions remain. No OpenAPI/orval generation, no external fonts, no fake frontend data, no AI or messaging integrations.

Time policy: 15-minute start grid; same-day hour ranges; conservative DST gap/fold handling. Existing appointment duration/room requirement are snapshots. All non-cancelled statuses retain reservations. Capacity does not allow parallel room appointments. No scheduling throughput claim has been tested.

## Evidence and next action

Passed: 90 Phase 3 offline checks + 36 retained checks; 197 TS/TSX source parses; strict dependency-free TypeScript checks. See `verification/phase3/` for evidence.

Not run: full workspace typecheck, 33 new real-PostgreSQL API cases and existing API suites, migrations/push/snapshot generation, seed/builds, workflow restarts, and actual browser acceptance. Container lacks pnpm/dependencies/PostgreSQL/connection secrets; registry DNS failed; local Node is 22, not target 24.

On provisioned infrastructure: run `bash scripts/checks/verify-phase3.sh`, restart API and web, run `phase3-browser.mjs` with disposable credentials and explicit E2E_ALLOW_WRITE=1, and complete the manual checklist in EN/AR on desktop and 390px. Test a fresh database and a correctly journaled Phase 2 upgrade separately. Fix defects, preserve evidence, report at most eight lines, then stop. **No Phase 4 until acceptance and explicit user approval.**
