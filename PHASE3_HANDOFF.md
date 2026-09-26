# JorMall Phase 3 handoff

## Status

**Implementation candidate; live acceptance pending.** Continued the supplied Phase 2 ZIP into Phase 3 scheduling following the user's “continue”. Phase 1 and Phase 2 were retained. Phase 2's unverified database/browser acceptance remains outstanding. **No Phase 4 waiting list/inventory or Phase 5 assistant work was started.**

## Implemented

Customer search/inline add → service/branch → eligible employee → real availability → review/book; compatible-room reservation; appointment daily/month/history views and filters; status lifecycle, cancellation/no-show reasons, rescheduling, appointment notes and complete status/slot history; doctor/provider own schedules and next customer; real customer appointment history and manager first-booking checklist.

Server-side scope/permissions, transactional shared setup/scheduling locks, version checks, durable idempotency command keys, UTC instants/branch-local display, and PostgreSQL employee/room exclusion constraints are implemented in source. A guarded startup refuses missing/invalid overlap constraints. Private query caches are cleared on logout/account switch. Detail permissions and sensitive data reads coordinate with reassignment/setup in one locked transaction.

EN/AR copy, RTL layouts, stored-name language and data-testid controls accompany the new screens. Original stack and lockfile are retained. No new application package dependency was introduced.

## Verification actually performed

| Check | Result |
| --- | --- |
| Phase 3 dependency-light rules/source suite | **90 passed** |
| Retained Phase 2 rules/translation suite | **36 passed** |
| TypeScript/TSX source syntax parsing | **197 files passed** in the Phase 3 scanner |
| Strict TypeScript: dependency-free rules/time helpers/dictionaries | **Passed**, exact command in evidence |
| JavaScript/shell/JSON checks | See `verification/phase3/package-checks.json` |
| Full workspace typecheck and application builds | **Not run: prerequisites unavailable** |
| New Phase 3 PostgreSQL/API tests | **33 cases added, not run** |
| Existing Phase 1/2 API tests | **Not rerun** |
| SQL migrations, push, snapshot generation, seed | **Not executed** |
| Workflow restart and real browser acceptance | **Not executed** |

Evidence: `verification/phase3/offline-checks.txt`, `phase2-regression.txt`, `pure-typecheck.txt`, `runtime-attempts.txt`, and `package-checks.json`. No fabricated browser screenshots or live-database results are included. Original Phase 2 evidence is retained separately.

Container: Node 22.16.0 instead of the declared Node 24 target; no pnpm/app dependencies, no PostgreSQL client/server/connection variables, and registry DNS failure. Browser script invocation refused its required explicit write opt-in; this is not a UI test result. Do not mark this candidate as a verified release.

## Database cautions

`0000` and `0001` remain unchanged from the supplied Phase 2 package. The new `0002_phase3_scheduling.sql` is hand-authored and unexecuted. Generated Drizzle snapshots are not supplied. Frozen phase baselines and the snapshot helper are included, but generated model/SQL equivalence and the custom PostgreSQL guards need live review.

Fresh empty DB: use `migrate` for all three. Correctly journaled Phase 2 DB: back up and use `migrate` for 0002. Push-managed Phase 2 DB: do not apply the fresh baseline or force the old Phase 1 adoption helper; reconcile history or use the reviewed development push wrapper on a disposable copy. Read `lib/db/migrations/README.md` first.

The push wrapper installs `btree_gist` overlap constraints. Bare Drizzle push is insufficient. Extension privileges are required; overlapping existing records cause a deliberate failure, not silent deletion. API startup refuses missing guards. A database operator must still verify exact definitions and schema equivalence; the startup check is not a complete migration audit.

## Target-environment acceptance

1. Back up, use a disposable PostgreSQL database, install the locked dependencies in Node 24 and supply DATABASE_URL / SESSION_SECRET.
2. Review the selected migration path, apply schema and verify the exact employee/room exclusion definitions. Generate/review snapshots without overwriting applied migration metadata.
3. Run `bash scripts/checks/verify-phase3.sh`: complete workspace typecheck, both offline suites, all real-DB API tests and both builds. Fix any failures; do not skip failed gates.
4. Run the development seed; verify random initial passwords print only for new accounts. Restart API and web.
5. Run `phase3-browser.mjs` with disposable manager credentials and E2E_ALLOW_WRITE=1. Complete the broader `BROWSER_ACCEPTANCE_PHASE3.md` matrix and original Phase 2 checklist in EN/AR, desktop/390px.
6. Separately verify fresh migration reproducibility and upgrade of a correctly journaled Phase 2 clone. Preserve existing users/passwords/permissions/schedules/session/audit data. Record evidence, then stop before Phase 4.

## Explicit operating decisions

- New doctor/provider presets are assigned-only. Existing stored global appointment grants are not silently revoked; review them deliberately. A global read grant permits other employees' appointments, not unrestricted operational notes.
- 15-minute start grid, same-day hour ranges, no overnight/24:00 ranges; DST ambiguous/missing or duration-altering times are omitted, not guessed. Branch time zone is authoritative.
- All non-cancelled appointments retain historical employee/room reservations, including completed/no-show. Room capacity is not group-booking support.
- Booked duration/room requirement are snapshots. Rescheduling preserves the old history and returns the appointment to Pending; service/customer/branch stay fixed.
- The clinic-level lock favors correctness; concurrency/load throughput has not been benchmarked. Idempotency records store result IDs and request hashes, not replayable private response bodies. The browser keeps retry keys in memory for the current command; full page reload does not persist form contents/PHI.
- General-read users do not receive operational notes; customer contact/general notes require customers.read, sensitive notes require customers.manage and audited reads.
- No waiting-list automation, actual inventory deduction, assistant, SMS or external messaging integration is included in this phase.

## Source review navigation

Start with `domain/scheduling-rules.ts` → `scheduling-time.ts` → `scheduling-validation.ts`; then `services/scheduling.ts`, `routes/scheduling.ts`, `test/scheduling.test.ts`. Database models: `lib/db/src/schema/scheduling.ts`; guards: `lib/db/sql/scheduling-guards.sql`. UI pages: booking-page, appointments-view, appointment-detail, reschedule-page; shared scheduling components and the EN/AR p3 dictionaries. Phase 2 docs are archived under `docs/phase2/`.

The following phase remains **Phase 4 — waiting list and inventory**, but only after acceptance and a new user go-ahead.
