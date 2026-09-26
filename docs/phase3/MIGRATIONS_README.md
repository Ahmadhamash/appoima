# Migrations — Phases 1, 2 and 3

## Honest status

All three versioned SQL migrations are **hand-authored, not Drizzle-generated, and not executed in the editing container**. `_journal.json` is supplied. Generated snapshots remain pending; absence is not evidence of schema equivalence. Application startup now requires scheduling overlap guards.

## Choose the migration path

1. **Empty disposable database:** `pnpm --filter @workspace/db run migrate` applies 0000 baseline, 0001 setup, 0002 scheduling. Verify all three on PostgreSQL before deployment.
2. **Phase 2 database already using the supplied versioned migration history:** back up and verify applied journal entries/hashes; `migrate` should apply only 0002.
3. **Unchanged original Phase 1 push-managed database:** first review full schema equivalence; `CONFIRM_PHASE1_BASELINE=1 pnpm --filter @workspace/db run adopt-phase1`, then `migrate`. The adoption helper checks expected columns/enums and cross-clinic user/branch references but is not a complete type/default/index verifier. It refuses Phase 2 tables or an existing migration history.
4. **Phase 2/3 push-managed or modified database:** do not replay a fresh baseline or force adoption. Reconcile schema and migration history deliberately on a copy. Keep an empty database for independent migration testing.
5. **Disposable development with push:** `pnpm --filter @workspace/db run push` applies Drizzle changes and custom guards. It does not register migration history. Do not use `push-force` to bypass review.

## Phase 3 SQL

`0002_phase3_scheduling.sql` introduces appointments, appointment_status_history and scheduling_commands; UTC timestamps; duration/room-requirement snapshots; version checks; tenant-composite foreign keys; history indexes; and unique command keys per clinic/actor. It adds the customer clinic/id and room clinic/branch/id unique keys required by those FKs.

`../sql/scheduling-guards.sql` installs btree_gist and employee/room EXCLUDE USING gist constraints with half-open `tstzrange`. Only cancelled appointments are excluded from protection. Adjacent reservations can share a boundary; all other overlapping non-cancelled appointments conflict. There is no automatic cancellation, deletion, time shift or unsafe duplicate repair. Review existing conflicts manually if installation fails.

The same guard SQL is embedded in 0002 and invoked by the dev push wrapper. Ordinary Drizzle models do not express these custom constraints. After any migration affecting appointments, explicitly confirm both constraints, predicates, indexed columns and supporting indexes. Startup checks are a minimum safety check, not a complete schema-equivalence audit. Do not treat the mere presence of a correctly named constraint as proof that an externally modified definition is correct.

Database roles need privileges appropriate to install btree_gist and constraints. Restrict the runtime role according to the deployment's security policy after migration. No automatic production rollback/down migration is supplied or tested.

## Snapshot preparation and existing metadata

Frozen baselines: `../migration-baseline/phase1`, `phase2`, `phase3`. With no snapshots present:

```bash
pnpm --filter @workspace/db run prepare-snapshots
```

The helper runs the installed `drizzle-kit generate` in a temporary directory, once for each frozen schema, then copies 0000/0001/0002 snapshots. Shipped SQL and journal are not rewritten. This process remains unexecuted here; compare generated metadata and SQL before committing it.

**Partial chain:** automatic preparation refuses. Never erase applied migration metadata merely to satisfy the helper. Keep the existing chain, extend it with the installed Drizzle tool in a reviewed working copy, then reconcile the already-shipped 0002 SQL and custom guard additions. Metadata IDs and migration journal entries must remain consistent. Back up unapplied bootstrap metadata before a deliberate regeneration; do not overwrite applied history.

After a complete reviewed chain, a no-change `pnpm --filter @workspace/db run generate` should not produce an unexpected model diff. Investigate any diff rather than apply it blindly. Model snapshots alone do not capture or validate the explicit exclusion-constraint installation.

## Mandatory live checks

Apply migrations to an empty database; separately upgrade a copy of a correctly journaled Phase 2 database. Preserve prior users/password hashes, sessions, schedules, names, permissions and audit records. Do not infer preservation from source parsing.

Run full typecheck, all API tests and seed. Scheduling tests include two concurrent same-employee bookings, two same-room bookings with different employees, and independent direct inserts proving PostgreSQL—not just the service lock—rejects overlap. Also verify reschedule rollback/history, idempotent retries, invalid status changes, tenant FKs and doctor assignment scope.

For every push-based acceptance database, use the wrapper and inspect both exclusion definitions. Start both application workflows and complete real-browser EN/AR desktop/390px checks. Record exact command output and stop before Phase 4.
