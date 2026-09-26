# JorMall — Phase 4 waiting list and inventory implementation candidate

The existing internal staff application is continued from the uploaded Phase 3 ZIP. `JORMALL_REPLIT_SPEC.md` and `CODEX_PROMPT_PHASES_2-5.md` remain the binding product sources. Existing authentication, clinic isolation, manager setup, customer/staff records and scheduling modules are retained; shared scheduling helpers were extracted, not replaced with a second booking engine.

**This is not a verified release.** Phase 4 is implemented in source; full workspace typechecking, application builds, PostgreSQL/API tests, schema migration/snapshot generation and real-browser acceptance could not run in the editing environment. Earlier Phase 2–3 acceptance gaps remain unresolved. **Phase 5 has not been started.** See `PHASE4_HANDOFF.md` and the actual evidence under `verification/phase4/`.

## What Phase 4 adds

### Waiting list — inside Appointments

Staff with `appointments.manage` add an existing or inline-created customer, requested service/branch, optional preferred employee, preferred day or same-day time window, and a short note with its authoring language. A booking wizard link carries already chosen identifiers into the waiting form. The list is paginated, filterable by branch/status, and shows waiting, offered, booked, declined and expired records. Read-only appointment staff cannot make decisions.

Cancelling a booking calls the shared availability implementation inside the cancellation transaction and suggests the earliest compatible waiting request. Compatibility includes branch, the same requested service, preferred employee, current service duration, the complete requested interval, staff schedules/breaks/time off and a compatible available room. Ordering is creation time, then ID. A suggestion is **not a reservation, notification, or booking**. An authorized staff member must use the single **Confirm replacement** action. Confirmation rechecks availability, versions and current permissions under the clinic lock, then creates a new confirmed appointment and history atomically. The cancelled appointment remains in its own history.

Declining records the decision and offers the next eligible request. A stale confirmation returns a localized conflict; the invalidation and next-suggestion decision are committed rather than rolled back with the response. Previous suggestions are not repeatedly offered for the same cancellation. Every suggestion/decision is audited. Decision reasons are acknowledged in the audit without copying their potentially personal text into it; the original waiting note retains its selected language.

The manager home highlights up to five currently offered requests. Opening the waiting-list page as a manager checks suggestions once; explicit Refresh scans at most 100 upcoming cancellations. The per-cancellation Check again action handles a particular older/unscanned opportunity. These checks may expire requests or suggest replacements, **never book automatically**. No background worker, SMS, WhatsApp or automatic customer contact was added.

### Inventory — Business → Inventory

Items have a name/authoring language, branch and fixed unit. Supported units are piece, pair, box, ml, l, g and kg. Quantities are exact decimal strings with up to three decimal places; calculations use integer thousandths, not floating-point balance arithmetic. No unit conversion is inferred. The API input limit per movement/line is 9,000,000,000 units; zero adjustments and nonpositive receipts/consumption are rejected.

New items start at zero. Authorized `inventory.manage` staff record receipts or signed adjustments with a mandatory adjustment reason. Balance is derived from movement sums and cannot be edited as an item field. Item details show paginated movement history, timestamp in the branch time zone, actor, reason and permitted appointment navigation. The branch/unit identity cannot be changed to reinterpret old stock. There is no purchase-order, supplier, valuation, recipe, transfer or backdating module in this phase.

PostgreSQL guard definitions reject UPDATE, DELETE and TRUNCATE on the movement and actual-consumption ledgers, validate completed-appointment context, preserve item identity, reject negative balances and enforce the declared number of consumption lines at commit. These are required custom guards in addition to Drizzle table definitions. Database owners can still change database policies; the application does not bypass guards. Legitimate stock corrections are new signed adjustments, never edited history.

### Actual materials used

An assigned doctor/provider with `inventory.manage`, or an authorized appointment manager with that permission, can finish and record the **actual** materials in one transaction. All item references must belong to the same clinic and appointment branch. An insufficient item rolls back the entire completion, history and every deduction. An explicit no-materials checkbox creates a locked zero-line actual-use record; an omitted material report remains **not yet recorded**, never a fabricated zero.

Authorized staff can alternatively record actual materials once after completion. A unique appointment consumption header, semantic payload hash, unique item lines, durable command key and deferred line-count guards prevent repeated submissions from deducting twice or appending later lines. A different payload after recording is rejected. Service cards and details read real lifetime consumption totals grouped by item, unit and branch; receipts, adjustments and estimated recipes are excluded. A balance correction does not rewrite a historical service-use report.

## Running the project

Use the supplied Node 24/Replit runtime and pnpm lockfile. No application dependencies or existing lockfile entries were changed. The editing container used Node 22 only for dependency-free checks. Install with:

```bash
pnpm install --frozen-lockfile
```

Set `DATABASE_URL` and a long random `SESSION_SECRET` in environment secrets, not source files. Scripts do not automatically load a root `.env`. Configure database transport and privileges for the actual deployment. Choose the correct migration route in `lib/db/migrations/README.md` **before** any schema command.

For an empty disposable database only:

```bash
pnpm --filter @workspace/db run migrate
```

For disposable push-based development, use the wrapper, which installs both scheduling and inventory guards:

```bash
pnpm --filter @workspace/db run push
```

Do not replay baseline migrations on a push-managed existing database. Do not use force to dismiss a schema discrepancy. The API startup checks both guard sets before listening; missing/disabled guards fail startup. This is not a complete schema or stored-function audit.

Run API and web in separate workflows with the same environment configuration:

```bash
PORT=5000 pnpm --filter @workspace/api-server run dev
PORT=19880 BASE_PATH=/ pnpm --filter @workspace/jormall run dev
```

The web uses the existing `/api` proxy. The package retains the same Express 5, React 19, Drizzle/PostgreSQL, session, permissions and EN/AR architecture; no assistant/API provider is introduced.

## Development seed

Complete platform-owner setup in the app first, or supply `SEED_OWNER_EMAIL` and `SEED_OWNER_PASSWORD` (at least 10 characters). Then run the seed against a dedicated development database:

```bash
pnpm --filter @workspace/api-server run seed
```

Existing credentials are not reset. New sample-account passwords are randomly generated, printed once, never stored in the repository and require a first-sign-in change. Both sample organizations retain their Phase 2/3 setup. Phase 4 adds labelled synthetic gel/glove receipts and, when a future sample booking exists, a waiting customer for that booking. It does not cancel or replace a booking or invent actual service consumption. A clinic audit marker makes Phase 4 sample creation idempotent. Never seed real operational stock.

## Verification and safety

Offline checks execute pure domain code and inspect source; they are not PostgreSQL, integration or browser tests:

```bash
node scripts/checks/phase2-offline.mjs
node scripts/checks/phase3-offline.mjs
node scripts/checks/phase4-offline.mjs
```

The editing run passed 36 retained Phase 2 checks, 90 retained Phase 3 checks and 93 Phase 4 checks (73 executable rule/translation checks and 20 source assertions): **219 offline checks**. Parsing passed for **214 active TypeScript/TSX files**. A strict no-emit check passed for seven dependency-free domain/time/translation files; this excludes the dependency-bearing application and database. JavaScript, shell, JSON, migration embedding and archive checks are recorded separately.

There are **39 new Phase 4 PostgreSQL/API cases**, in addition to existing tests, covering explicit/stale/concurrent replacement confirmation, decline-next, access isolation, transactional completion rollback, semantic retries, stock contention and raw SQL immutability/context guards. They have not run here. Because an append-only ledger cannot be safely deleted by a fixture cleanup, these tests retain synthetic ledger records and deactivate their test users. They require an explicit disposable-database flag. Destroy the disposable database afterwards with normal administration; never disable application guards merely to clean test rows.

After applying reviewed migrations to a dedicated test database:

```bash
export TEST_DATABASE_DISPOSABLE=1
bash scripts/checks/verify-phase4.sh
```

This runs full workspace typecheck, the retained/new offline suites, **all** API tests, and API/web builds. It stops on failure. It does not migrate automatically or certify browser acceptance. Repeat fresh-install and Phase 3 upgrade tests on separate database copies. Snapshot generation is pending; follow the migration notes without erasing applied history.

Restart both workflows. Run `phase3-browser.mjs` for retained scheduling behavior and `phase4-browser.mjs` for new behavior, using a browser runner with puppeteer-core/Chromium and environment-only credentials. See `BROWSER_ACCEPTANCE_PHASE4.md`. The new runner covers EN and AR at both desktop and 390px, and leaves synthetic records in the test database. No browser screenshots or successful browser result are supplied because the app could not start here.

## Source map

| Area | Paths |
|---|---|
| Data and custom guards | `lib/db/src/schema/operations.ts`, `lib/db/sql/inventory-guards.sql`, migration `0003_phase4_waiting_inventory.sql` |
| Pure rules / request validation | `artifacts/api-server/src/domain/operations-{rules,validation}.ts` |
| Shared transaction/auth/idempotency | `artifacts/api-server/src/services/operations-context.ts` |
| Waiting and inventory services | `services/waiting-list.ts`, `services/inventory.ts` |
| Shared existing availability/history | `services/scheduling-slots.ts`, `services/scheduling-history.ts` |
| HTTP and completion integration | `routes/operations.ts`, `routes/index.ts`, `services/scheduling.ts` |
| Pages and components | web `pages/clinic/{waiting-list-page,inventory-page,appointment-detail,booking-page,setup-page}.tsx`, `components/operations/` |
| Tests, browser, seed | API `test/operations.test.ts`, `scripts/seed-operations.ts`, root `scripts/checks/phase4-*` |

Prior README/replit/migration notes are retained under `docs/phase3/`; previous handoffs and evidence remain in the archive. Phase 5 assistant work is outside this delivery.
