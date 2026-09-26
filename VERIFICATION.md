# Exact verification results

Run date: **2026-09-24**. Updated source has not been deployed. This report does not equate syntax,
component fixtures or in-memory service tests with a running full PostgreSQL application.

## Executed successfully

| Check | Actual result | Boundary |
|---|---:|---|
| `node scripts/checks/workspace-offline.mjs` | 30 passed, 0 failed | Production profile/local parser/source extraction and application services; explicit test-only memory storage and source fixtures |
| `node scripts/checks/service-wizard-offline.mjs` | 24 passed | Existing service schemas/intake, source/merge rules and stream contracts; mocked transport |
| `node scripts/checks/phase3-offline.mjs` | 90 checks passed | Existing scheduling/access/timezone rules and source checks, not SQL booking |
| `node scripts/checks/workspace-typecheck.mjs` | Strict check passed | 12 listed entry roots plus their local imports; not all React/Express/Drizzle packages |
| `python scripts/checks/workspace-browser.py` | 22 passed, 0 failed; no JS errors | Actual production identity/surface components in Chromium with synthetic callbacks/store |

Reports/logs are in `verification/internal-workspace/`. The offline tests explicitly refuse to simulate
successful `concierge-setup` service creation; only actual identity-controller application is exercised
against the memory adapter. Required intake and conflict predicates are unit-tested, not a successful
real database booking. The browser fixtures do not substitute a fake backend into the delivered app.

Covered: manual/shared draft continuation, exact custom/beard-only service, missing metadata and owner
correction, provenance acceptance, identity-only confirmation/idempotency, manager revision conflict,
service tombstones, two clinics, permission/branch filtering, retained failed-save edits, literal-text
injection handling, logo validation, contrast, AR/EN and 390px/desktop component layouts.

## Browser screenshots

Seven PNG files under `verification/internal-workspace/screenshots/`:

- `owner-preview-en-desktop.png`, `owner-preview-ar-desktop.png`, `owner-editor-ar-mobile.png`.
- `internal-home-en-desktop.png`, `internal-home-ar-desktop.png`.
- `internal-home-en-mobile.png`, `internal-home-ar-mobile.png`.

These use real production components and visibly identify their synthetic component-test context.
There is no published-site screenshot because the corrected scope has no public site. Chromium could
not navigate to a local HTTP listener (`ERR_BLOCKED_BY_ADMINISTRATOR`); tests used an isolated page with
actual bundled modules injected. Thus they do not verify Vite routing, React lifecycle or cookies.

## Blocked / NOT verified

`verification/internal-workspace/runtime-attempts.txt` preserves the actual failed commands:

- `corepack pnpm --version`: failed with `EAI_AGAIN registry.npmjs.org`.
- `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm build`: pnpm unavailable, exit 127.
- `psql --version`: PostgreSQL client absent, exit 127; no server was available.

Consequently the full app build, full workspace typecheck, real migrations/Drizzle snapshots, real API
suite, successful database booking/slot contention, PostgreSQL tenant constraints, full-app owner flow,
live link fetching, OpenAI voice and actual deployment have **not** been validated. Offline passes do
not override these missing gates.

## Reproduce completed checks

After dependency installation, the scripts use the workspace's TypeScript normally:

```bash
node scripts/checks/workspace-typecheck.mjs
node scripts/checks/workspace-offline.mjs
node scripts/checks/service-wizard-offline.mjs
node scripts/checks/phase3-offline.mjs
node scripts/checks/build-workspace-ui-test.mjs
python scripts/checks/workspace-browser.py
```

The last command additionally requires Python Playwright and Chromium (testing tools only, not app
runtime dependencies). The browser script accepts `CHROMIUM_PATH`; its default is `/usr/bin/chromium`.
Generated component-harness files are intentionally excluded from the release ZIP; the builder
recreates them. In this container `TYPESCRIPT_PATH` pointed to global TypeScript, and `NODE_TYPES_ROOT`
to the available global Node declarations. Those machine-specific paths are not needed after normal
workspace installation.

## Required release gate on real infrastructure

Follow `SETUP_GUIDE.md`: install with the unchanged lockfile, run full typecheck/build, apply all needed
migrations to an empty disposable DB and a separately backed-up upgrade copy, then run the real API
suite with `TEST_DATABASE_DISPOSABLE=1`. The new `src/test/internal-workspace.test.ts` is included but
**not executed here**. It covers real HTTP authorization, internal identity apply races and two tenants.
Historical concierge fixtures were updated to explicitly exercise their legacy full-setup mode.

Run full-app AR/EN/mobile flows, create an actual custom service and resource assignment, submit a
booking with required intake, retry the same command, compete for a slot, verify branch timezone,
and attempt unauthorized/cross-tenant access. Finally configure and separately test real provider voice
and public link transport. Use only synthetic data for those tests; never disable production guards.

## Preservation

`verification/internal-workspace/archive-integrity.json` records comparison with the uploaded ZIP.
Original SQL migration files 0000–0005 and `pnpm-lock.yaml` must be byte-identical. The new migration is
0006; existing journal entries remain unchanged and one entry is appended. No migration was executed
against user data. No dependency trees, secrets, patient data or database dumps are included.
