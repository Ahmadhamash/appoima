# JorMall Phase 2 handoff

## Deliverable and stopping point

This is an updated source implementation for **Phase 2 — Manager setup only**. It preserves the supplied Phase 1 authentication/role/navigation foundation and adds the requested setup modules. It is an **implementation candidate, not a verified release**. Phase 3 and later work has not been started.

## Main changes

| Area | Files / result |
| --- | --- |
| Data | `lib/db/src/schema/setup.ts`, changes to branches/users/index; services, rooms, customers, staff/room assignments, schedules and tenant references |
| Rules | API `domain/setup-rules.ts`, `domain/setup-validation.ts`; hours, breaks, leave, permission ceilings, references and request validation |
| API | API `services/setup.ts`, `routes/setup.ts`; scoped CRUD, audit, reset/deactivation/session controls and note privacy |
| Staff | Reuses `services/auth.ts:createStaffAccount`; explicit initial-password and access-review workflow |
| Web | `components/setup/`, `pages/clinic/setup-page.tsx`, route/navigation/checklist changes, EN/AR strings and branch-local time conversion |
| Tests | `src/test/setup.test.ts` plus extended fixture cleanup; original Phase 1 test suite retained |
| Seed | Two sample clinics filled with branches, hours, services, rooms, customers and staff assignments; new passwords random and printed once |
| Migrations | Phase 1 baseline and Phase 2 hand-authored SQL, journal, explicit existing-Phase-1 adoption and snapshot-generation helpers |
| Handoff | README, replit notes, browser-acceptance checklist, offline checker and recorded verification evidence |

## Verification actually completed

See `verification/offline-checks.txt` for the source count and **36 passing offline checks** covering weekly-hour normalization, range/break/time-off validation, time zones, permission ceilings, branch compatibility, DST conversion and EN/AR dictionary/placeholder parity. See `verification/pure-typecheck.txt` for strict TypeScript checking of the dependency-free modules and dictionaries. These are limited checks and do not load the application, connect to PostgreSQL or validate rendered browser behavior.

## Blocked / unverified

The editing container has Node 22, no pnpm or project dependencies, no PostgreSQL executable or connection secrets, and package registry DNS failed. Full `pnpm run typecheck`, API integration tests, schema push/migrations, Drizzle CLI snapshot generation, seed execution, application builds, workflow restart and real-browser acceptance **did not pass because they could not run**. Actual command attempts are recorded in `verification/runtime-attempts.txt`. Runtime type errors, database defects and UI issues remain possible until the required checks run. The supplied Phase 1's prior acceptance was not independently reproduced here.

SQL migrations are explicitly **hand-authored**, not CLI-generated. Frozen schema baselines plus a CLI bootstrap script are included, but generated snapshots and migration reproducibility still require target-environment verification. Do not apply directly to production.

## Next actions on a provisioned development environment

1. Install the original lockfile under Node 24/pnpm and supply development `DATABASE_URL` / `SESSION_SECRET`.
2. Choose **one** database path in README: fresh migrations, reviewed existing-Phase-1 adoption followed by migration, or disposable-dev `push`. Do not combine them blindly.
3. Run snapshot preparation, typecheck, API tests, offline checks, seed and builds. Fix all errors. Verify fresh and existing-Phase-1 migration paths on separate databases.
4. Restart API and web workflows. Complete `BROWSER_ACCEPTANCE.md` in EN and AR on desktop and 390px against the real DB, including security/privacy scenarios.
5. Update acceptance evidence only after execution. Stop before Phase 3 and wait for the user's explicit go-ahead.

## Intentional boundaries

No appointment creation, conflict constraints, state transitions, waiting list, inventory movements, automatic consumption or AI integration were added. Customer history and actual inventory use are explicitly unavailable. The first-booking checklist step remains incomplete. Rooms are optional unless an active service requires one. Weekly ranges are same-day only, and time-off local times with ambiguous/nonexistent DST offsets are rejected rather than silently shifted. Existing users whose name language was never stored default to English on migration and should be reviewed when edited.

The ZIP contains source, migrations and handoff evidence. It excludes Git history, environment/IDE state, dependency directories, stale build output and credentials; install and build it in the target environment.
