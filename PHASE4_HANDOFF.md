# JorMall Phase 4 handoff

## Delivery status

Phase 4 source implementation candidate, continued from `JorMall-Clinic-Staff-App-Phase3(1).zip`. **Not a verified release. Phase 5 was not started.** Previous phase acceptance gaps remain open; no running application/database was available here.

## Added

Waiting-list requests inside Appointments, optional employee/day/window, FIFO compatible cancellation suggestions, explicit Confirm replacement, decline-next, transactional availability/permission/version rechecks, stale-offer conflict handling, audit trails, paginated filters and manager-home offered-request links. A suggestion does not reserve the slot or notify/book the customer automatically. Refresh is bounded to 100 upcoming cancellations; a particular cancelled appointment also has Check again.

Branch inventory items and read-only derived balances, exact decimal quantities, receipts and reasoned signed adjustments, paginated immutable ledger history, and restricted appointment links. Unit and branch identities cannot change. Negative stock is rejected. No purchase orders, suppliers, unit conversions or estimated recipes are added.

Actual materials may be recorded together with provider completion in one transaction, or once afterwards by authorized staff. Retry protection covers both transport keys and semantically identical material lists. Missing actual reporting stays unrecorded; explicit zero-material reporting is recorded and locked. Service cards/details show actual totals grouped by item, unit and branch. Corrective adjustments do not edit historical service-use figures.

All new UI text has EN/AR entries. Customer selection and existing scheduling/room availability are reused rather than independently rebuilt. Runtime permission checks and clinic-scoped references remain on the server.

## Actual checks versus pending acceptance

| Check | Result in editing environment |
|---|---|
| Retained Phase 2 offline rules/source | 36 passed |
| Retained Phase 3 offline rules/source | 90 passed |
| New Phase 4 offline rules/translation checks | 73 passed |
| New Phase 4 source assertions | 20 passed |
| Active TypeScript/TSX syntax parsing | 214 files passed |
| Strict dependency-free TypeScript | Seven domain/time/translation files passed; application dependencies excluded |
| New PostgreSQL/API tests | 39 cases written, **not run** |
| Full workspace typecheck; API/web builds | **Not run**: pnpm/application dependencies absent |
| SQL migrations, generated snapshots, seed | **Not run**: dependencies/database absent |
| API/web workflow restart and real-browser acceptance | **Not run**; runner included, no app-backed screenshots |

There are **219 offline checks** in total. They do not prove migrations, transactional behavior, live permissions or browser usability. Detailed outputs and actual command attempts are in `verification/phase4/`. The new browser runner targets English and Arabic at both desktop and 390px. Its presence is not a passing result.

## Deployment and validation order

1. Back up the database and work first on a disposable copy. Keep the unchanged pnpm lockfile and use the supplied Node 24 runtime. Configure DATABASE_URL and SESSION_SECRET securely and install the workspace dependencies.
2. Read `lib/db/migrations/README.md`. All four SQL migrations are hand-authored. For a correctly journaled Phase 3 database, verify history/schema before applying only 0003. For an empty test database apply all four. Never replay a fresh baseline over push-managed data, erase applied snapshots/journals, or force through a schema difference.
3. Generate and review the Drizzle snapshots with the installed tool. The helper supports an empty chain; it deliberately refuses a partial chain. Existing applied chains require deliberate extension/reconciliation, not deletion. Custom SQL protections also need separate review.
4. Verify both scheduling exclusions and all seven inventory triggers, including function bodies and direct-SQL behavior. Startup checks selected names/definition fragments/enabled states but do not prove complete schema equivalence. A normal dev `push` uses the wrapper to install both guard sets.
5. On a dedicated, migrated test database, set TEST_DATABASE_DISPOSABLE=1 and run `bash scripts/checks/verify-phase4.sh`. The 39 new API cases retain immutable ledger fixtures and deactivate their users. Dispose of the database administratively afterwards; do not disable guards merely to remove rows. Retained API tests run in the same suite.
6. Restart API/web; run both Phase 3 and Phase 4 browser runners and the manual checklist in `BROWSER_ACCEPTANCE_PHASE4.md`. Capture actual outputs/screenshots and separately test migration on an empty database plus upgrade/preservation on a Phase 3 copy. The definition of done remains pending until these pass.

## Important operational decisions

Supported units: piece, pair, box, ml, l, g, kg. Quantities allow at most three decimal places; no implicit conversion. Item/branch identity is fixed. There is no UI to edit balances or ledger records. New adjustments correct stock; they do not rewrite recorded actual consumption. This phase has no amendments workflow for correcting the original service-use report itself.

Only the same requested service can replace a cancellation, and its current full duration must fit the old vacancy and the requested interval. An invalidated entry may remain waiting for a different cancellation but is not re-suggested repeatedly for the same source. No promise of background expiry, messaging, automatic booking, high-volume throughput or guaranteed performance is made; load testing is pending.

Seed creates labelled synthetic opening receipts and a waiting customer when a future sample appointment exists, only once per sample clinic. It does not invent actual use. Existing sample credentials are retained; new passwords are randomly generated and printed once, with forced first-login change.

## Files

Core additions: `lib/db/src/schema/operations.ts`; `lib/db/sql/inventory-guards.sql`; migration `0003_phase4_waiting_inventory.sql`; API `domain/operations-*`, `services/{operations-context,waiting-list,inventory,scheduling-slots,scheduling-history}.ts`, `routes/operations.ts`, `test/operations.test.ts`, `scripts/seed-operations.ts`; web `lib/operations-api.ts`, `components/operations/`, waiting/inventory pages and scheduling/setup integrations. Journal, push/install/snapshot scripts, README, replit and verification instructions are updated. Earlier schema migrations, lockfile, project specifications and handoffs are preserved.

The archive's detailed change manifest is `verification/phase4/changes-from-phase3.json`. Use the current README and handoff; historical notes in `docs/phase3/` describe the earlier candidate and may intentionally say Phase 4 had not started.
