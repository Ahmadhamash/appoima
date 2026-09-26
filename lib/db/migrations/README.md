# Current addition — internal clinic workspace (0006)

`0006_internal_clinic_workspace.sql` adds the tenant-keyed `clinic_workspaces` identity table only.
Migration SQL 0000–0005 is unchanged, including 0005 service definitions/intake. The existing journal
entries are preserved and 0006 is appended. New frozen schema: `migration-baseline/internal-workspace`.
The snapshot helper includes all seven stages. SQL execution and snapshot generation were NOT performed
in the editing container; test both a clean disposable database and an upgrade copy before deployment.

On an exact migrated 0000–0005 database, `pnpm --filter @workspace/db run migrate` should apply only
0006. An empty disposable database applies 0000–0006. Divergent/push-managed schemas need deliberate
reconciliation, not a reset or forced push. Back up, preserve journal hashes/IDs, and verify existing
scheduling/inventory guards and all tenant data. Never run destructive migration commands on user data.

The current snapshot helper extends a contiguous prefix while preserving prior IDs; it rejects gaps.
Review generated metadata against the hand-authored SQL and custom guards. See root `SETUP_GUIDE.md`
and `VERIFICATION.md`. The following prior migration notes are historical, including their old counts.

---

# Current addition — manager onboarding

`0004_manager_voice_concierge.sql` adds only `manager_onboarding`: a clinic/user-scoped durable setup draft, consent/revision/budget fields and a composite user foreign key. No existing business table is rewritten. This migration is hand-authored and NOT executed in the editing container. A migrated Phase 5 database needs this additional migration; the historical “no Phase 5 migration” note is not the state of this new delivery.

The snapshot helper now includes a frozen `migration-baseline/concierge/` schema and expects 0000–0004 snapshots. Generation remains unverified. It refuses any partial chain rather than mixing IDs or overwriting existing metadata. On a deployment already holding four snapshots, reconcile/extend the chain deliberately; do not delete applied snapshots or blindly generate a duplicate table migration.

# Migrations — Phases 1–4 and manager voice onboarding

## Status and deployment gate

All five supplied versioned SQL migrations are **hand-authored, not Drizzle-generated, and not executed in the editing container**. The migration journal and frozen schema baselines are supplied. Generated snapshots remain pending. Source matching and trigger names are not proof of PostgreSQL behavior or schema equivalence. Prior 0000–0003 SQL files are unchanged.

Back up first. Work on a disposable copy; verify preservation and schema equivalence before touching an operational database. There is no tested down migration, automatic duplicate repair, or automatic production rollback.

## Select one path

| Database state | Required route |
|---|---|
| Empty disposable database | `pnpm --filter @workspace/db run migrate` applies 0000–0004. Verify all five. |
| Phase 5 with exact supplied 0000–0003 recorded | Verify journal hashes and schema; `migrate` should apply only 0004. Test a copied database first. |
| Phase 3 with exact supplied migrations recorded | Upgrade through 0003 and 0004 after copied-database validation. |
| Phase 2 with exact supplied journal | Upgrade through 0002, 0003 and 0004; verify earlier data and scheduling behavior. |
| Unchanged original Phase 1 push-managed database | After a full schema review, the existing `CONFIRM_PHASE1_BASELINE=1 ... adopt-phase1` helper may establish that baseline, then migrate. Its checks are not a complete schema equivalence proof. |
| Any modified or Phase 2–5 push-managed database | Reconcile schema/history deliberately. Do not replay a fresh baseline, force baseline adoption, erase metadata, or treat this as an automatic upgrade. |
| Disposable push-based development | `pnpm --filter @workspace/db run push` updates models and runs **both** custom guard installers. Push does not create a migration journal. |

Never use `push-force` to bypass discrepancy review. Bare `drizzle-kit push` does not install the custom protections. Migration privileges must support the schema operations, trigger functions and existing btree_gist setup. Restrict the runtime role separately according to the deployment policy.

## Phase 4 schema and SQL protections

`0003_phase4_waiting_inventory.sql` introduces four enums and five tables: `waiting_list_entries`, `waiting_list_offers`, `inventory_items`, `inventory_consumptions`, `inventory_movements`. Tables use tenant-composite references. Offers have partial unique indexes for one active offer per entry and one offered/booked replacement per cancellation. Quantities use NUMERIC(16,3); item balance is not stored as an editable field. Consumption is unique per clinic/appointment and per item line, with composite branch/service/appointment context.

`../sql/inventory-guards.sql` is embedded verbatim in 0003 and is also run by `scripts/install-inventory-guards.mjs`. The supplied definitions:

- Reject movement and consumption-header UPDATE, DELETE and TRUNCATE at statement level.
- Lock and validate an actual-consumption header against a completed appointment's clinic/branch/service.
- Preserve item identity/branch/unit, validate each movement's item context, serialize clinic stock writes and reject negative balance.
- Check consumption header line counts with deferred constraint triggers at commit, preventing missing initial lines and later extra deductions.

The API startup checks the presence, enabled state and selected definition fragments of seven inventory triggers, in addition to the existing employee/room scheduling exclusion definitions. It does **not** hash or fully validate function bodies, all indexes, every column/default, grants, or externally modified policies. Independently inspect actual definitions and execute the direct-SQL tests. Database owners can alter protections; no claim of tamperproof storage against administrative access is made.

The prior `../sql/scheduling-guards.sql` keeps btree_gist and half-open tstzrange exclusion constraints for all non-cancelled appointments. Adjacent reservations are allowed; overlapping employee/required-room appointments are not. Phase 4 does not change this predicate.

## Snapshots and future generation

Frozen schemas are under `../migration-baseline/phase1`, `phase2`, `phase3`, `phase4`.

```bash
pnpm --filter @workspace/db run prepare-snapshots
```

With **no** snapshots present, this helper runs the installed drizzle-kit sequentially over each frozen schema in a temporary directory and copies the four generated snapshots. It never rewrites the shipped SQL or journal. It was not run here. Review generated artifacts and SQL before treating metadata as accepted.

A **partial** chain causes the helper to refuse. An existing reviewed 0000–0002 snapshot chain must be extended with the installed Drizzle tool in a working copy; do not delete applied history to satisfy the bootstrap helper. Reconcile the existing hand-authored 0003 and its custom trigger SQL deliberately instead of recording a second duplicate schema migration. Snapshot metadata alone does not model or verify the custom exclusion/trigger logic.

After the full reviewed chain, `pnpm --filter @workspace/db run generate` should not report an unexplained model change. Investigate, do not apply blindly. Preserve migration IDs, journal timestamps and applied hashes.

## Live acceptance still required

Test an empty database and a separate upgrade copy. Preserve existing users/password hashes, sessions, clinic/branch data, schedules, customer notes, appointments/history and audit. Run full typecheck, every API test, builds and seed. Inspect the seven inventory trigger definitions and both scheduling exclusions. Test raw SQL ledger mutation rejection, stock contention, partial/late consumption-line rejection, and cross-tenant references.

Use TEST_DATABASE_DISPOSABLE=1 for the new integration suite. Ledger fixtures remain immutable and are not deleted; dispose of the test database afterwards through normal administration. Do not disable production guards for test cleanup. Restart API/web and complete EN/AR desktop/390px browser checks. Only then decide whether the phase meets the binding definition of done; Phase 5 remains unstarted.
