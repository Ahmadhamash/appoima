# JorMall — Phase 2 implementation candidate

Internal staff application for beauty and wellness clinics. Each person signs into the same app and lands on a role-specific screen. The binding product specification is `JORMALL_REPLIT_SPEC.md`.

**Status: Phase 2 code is implemented, but full acceptance is pending.** Phase 1 was the supplied foundation; it has not been rebuilt. Phase 3 scheduling, Phase 4 waiting list/inventory, and Phase 5 assistant were not started. Do not mark Phase 2 complete or continue to Phase 3 until the verification below passes and the user authorizes it.

## What changed

- **Business → Settings:** branches, explicit name language, IANA time zone and per-day opening hours, including multiple same-day ranges.
- **Business → Services:** fixed categories, duration, price/currency, active status, eligible staff and optional room requirement. Actual inventory usage is explicitly unavailable until Phase 4; no planned quantities are passed off as actual use.
- **Business → Rooms:** branch, capacity, available/maintenance state and compatible services. Changes are made from room details.
- **Customers & Employees → Employees:** Role → Person and login → Access review; named permission checkboxes, service assignments, working hours, breaks and time off. Initial-password resets force another change and invalidate sessions; deactivation also invalidates sessions.
- **Customers & Employees → Customers:** name/phone/email search and pagination, at least one contact method, general notes, restricted sensitive notes. Appointment history is explicitly unavailable until Phase 3.
- **Manager home:** data-backed setup checklist. Step four remains incomplete because appointments have not been implemented. Secretary/doctor home screens do not receive manager setup controls.

Every new record/form message has English and Arabic text. Stored names retain their selected language and direction and are never machine-translated. Both API-side and database-side tenant protections were added. These are implementation statements, **not a claim that live acceptance has passed**.

## Requirements and environment

Use the repository's Node 24 environment, pnpm, and a PostgreSQL database. The original dependency versions and lockfile are retained; no new package dependencies were introduced.

Set these environment variables using your shell or Replit Secrets:

```text
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<database>
SESSION_SECRET=<a-long-random-secret>
```

Do not put real credentials into source control. Scripts do not automatically load a root `.env` file. Generate a session secret locally, for example with `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"`. Configure database connection security for your hosting environment.

```bash
pnpm install --frozen-lockfile
```

## Database setup — choose one path

Back up an existing database before schema changes. Use a disposable development/test database for acceptance.

### A. Fresh database (versioned migrations)

```bash
pnpm --filter @workspace/db run migrate
```

This applies `0000_phase1_baseline.sql`, then `0001_phase2_manager_setup.sql`. **These are hand-authored versioned SQL migrations, not CLI-generated or live-tested migrations.** Review and test them on an empty disposable database before using them for deployment.

### B. Existing, unchanged Phase 1 database created with `push`

Do this **before** applying the Phase 2 schema with `push`. Review the database against the supplied Phase 1 baseline, back it up, and then run:

```bash
CONFIRM_PHASE1_BASELINE=1 pnpm --filter @workspace/db run adopt-phase1
pnpm --filter @workspace/db run migrate
```

The adoption script records the existing Phase 1 baseline in Drizzle's migration journal; it does not recreate application tables or overwrite application records. It checks expected columns/enums and invalid cross-clinic user/branch references, and refuses an existing migration history or Phase 2 tables. It is **not** a complete schema-type/default/index equivalence checker. A changed Phase 1 schema needs manual reconciliation, not a forced adoption.

### C. Disposable development database using the requested `push` workflow

```bash
pnpm --filter @workspace/db run push
```

Do not use `push-force` to bypass a warning. `push` does not record the versioned migration history. Do not subsequently run baseline adoption or fresh migrations on an already Phase 2 push-managed database without reconciling that history. Use a separate empty database for testing migration reproducibility.

### Drizzle snapshot generation

SQL migrations and the migration journal are included, but generated snapshot metadata could not be produced in the editing environment because pnpm/dependencies were unavailable. Frozen copies of the original and updated schemas are included so snapshots can be generated without guessing the historical schema:

```bash
pnpm --filter @workspace/db run prepare-snapshots
# For a later deliberate schema change:
pnpm --filter @workspace/db run generate
```

The first command invokes the installed `drizzle-kit generate` twice against the frozen baselines and copies the two snapshots. It never overwrites the shipped SQL or journal. Review the generated snapshots and the shipped SQL for equivalence; this generation step remains **unverified**. Commit generated metadata after successful verification. Do not edit already-applied migrations. More detail is in `lib/db/migrations/README.md`.

## Run

After the database is ready, run these in separate terminals with the same required environment:

```bash
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/jormall run dev
```

API: port 5000 under `/api`. Web: port 19880, base path `/` by default. Outside Replit, Vite proxies `/api` to the local API server. Inside Replit, existing routing is preserved. Restart both workflows after schema/code changes.

First start remains the Phase 1 flow: create the single platform owner, create a clinic with its manager, sign in as that manager and change the initial password before clinic access is permitted.

## Sample data

```bash
pnpm --filter @workspace/api-server run seed
```

The seed creates or fills the two original sample clinics, each with manager/secretary/doctor/provider accounts, a branch with opening hours, a service, a compatible room and a sample customer. Records are examples for development, not production clinic data. Existing sample account passwords are never reset or reprinted. **New account passwords are randomly generated and printed once**, and first login requires a change. If there is no owner, explicitly provide `SEED_OWNER_EMAIL` and `SEED_OWNER_PASSWORD`; otherwise the existing owner is reused. Avoid retaining seed output in shared logs.

## Verification status and required commands

Completed in the editing container:

- Source syntax parsing and 36 offline business-rule/translation checks. Exact output: `verification/offline-checks.txt`.
- Strict TypeScript checking of the dependency-free rules, time conversion helper and both dictionaries. Exact command/output: `verification/pure-typecheck.txt`.
- JavaScript/shell/JSON syntax and archive integrity checks as listed in the handoff.

**Not completed:** full workspace typecheck, API integration tests, application builds, migration execution, schema push, snapshot generation, seed execution, workflow restart, or real-browser acceptance. The container had Node 22 rather than the requested Node 24, no pnpm/application dependencies, no PostgreSQL server/connection variables, and package registry DNS failed. Original Phase 1 test results were not re-verified. `verification/runtime-attempts.txt` records the actual failed attempts; it is not an application test failure log.

Once dependencies and a disposable real database are available:

```bash
pnpm run typecheck
pnpm --filter @workspace/api-server run test
node scripts/checks/phase2-offline.mjs
pnpm --filter @workspace/api-server run build
PORT=19880 BASE_PATH=/ pnpm --filter @workspace/jormall run build
```

Or run `bash scripts/checks/verify-phase2.sh` after applying the schema. Run from the root so the offline checker can resolve TypeScript. It also accepts `TYPESCRIPT_PATH` when needed. These offline checks do not replace API tests or full typechecking.

Complete `BROWSER_ACCEPTANCE.md` in English and Arabic, on desktop and at 390px, against the real database. Resolve any defects found before declaring Phase 2 complete. Test migration reproducibility separately on both a fresh database and a clone of Phase 1.

## Architecture and security boundaries

| Path | Responsibility |
| --- | --- |
| `lib/db/src/schema/` | Drizzle models, tenant-scoped references, services/rooms/customers and assignments |
| `lib/db/migrations/` | Phase 1 baseline + Phase 2 versioned SQL and migration journal |
| `artifacts/api-server/src/domain/setup-*.ts` | Permission ceilings, schedule/reference rules and strict Zod request validation |
| `artifacts/api-server/src/services/setup.ts` | Tenant-scoped reads, transactional writes, audit, staff-access and note protection |
| `artifacts/api-server/src/routes/setup.ts` | `/api/clinic/*` routes; authenticated clinic and matching read/manage permission |
| `artifacts/api-server/src/test/setup.test.ts` | Real-database regression tests to run in the target environment |
| `artifacts/jormall/src/components/setup/` | Shared form controls and staff-account wizard |
| `artifacts/jormall/src/pages/clinic/setup-page.tsx` | API-backed lists, detail dialogs and editing |
| `artifacts/jormall/src/lib/branch-time.ts` | Explicit branch-local ↔ UTC conversion for staff leave |

Server routes never take a trusted clinic identifier from the client. Resource references are validated in the same clinic; write transactions re-check the actor and use a clinic-scoped advisory lock. Manage access implies read access. Managers can grant only effective permissions they already hold and cannot create platform owners. Editing/resetting/deactivating a more-privileged account is refused; self-admin changes use the existing own-password flow instead. Sensitive customer notes are omitted, not merely hidden, from read-only responses; sensitive-note reads are audited without logging note contents.

Opening/working-hour ranges must finish on the same day and cannot overlap (up to eight ranges per day); overnight ranges are not supported in this phase. Breaks must fit within a working range. Time off is stored as UTC instants and edited in the selected branch's zone (UTC when clinic-wide). Nonexistent or ambiguous daylight-saving local times are rejected rather than guessed. Original existing user-name language metadata defaults to English on migration; review it when editing legacy accounts instead of inferring or translating names automatically.

**Stop here: scheduling and all later phases require explicit user authorization.**
