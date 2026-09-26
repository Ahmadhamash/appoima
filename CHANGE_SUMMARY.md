# Change summary

## Product changes

The delivered project personalizes the existing private appointment application, not a public website.
Implemented persistent tenant identity, private bilingual preview/editing, shared manual/local/voice/link
setup state, explicit source provenance and acceptance, exact service scopes/custom definitions,
service-derived internal sections, and reviewed transactional save with revision conflict handling.
Existing scheduling, patient access controls, business modules and the animated orb are retained.

## Preservation and verification

All six earlier migration SQL files (0000–0005), all original dependency manifests and `pnpm-lock.yaml`
are byte-identical to the uploaded archive. The existing migration journal entries are unchanged;
only migration 0006 is appended. No original project file was deleted. No new dependency was added.
Full details are in `verification/internal-workspace/archive-integrity.json` and `VERIFICATION.md`.

The full pnpm build and real PostgreSQL/API run remain unverified in this environment. The included
new real-DB acceptance suite is a release gate, not a reported pass. Component screenshots identify
their synthetic fixture scope. Older verification directories are historical evidence only.

## Modified original files

- `.gitignore`
- `CLINIC_WIZARD_README.md`
- `HANDOFF_PROMPT.md`
- `README.md`
- `VOICE_ONBOARDING_HANDOFF.md`
- `artifacts/api-server/src/concierge/beauty-context.ts`
- `artifacts/api-server/src/concierge/config.ts`
- `artifacts/api-server/src/concierge/providers.ts`
- `artifacts/api-server/src/domain/concierge-core.ts`
- `artifacts/api-server/src/domain/service-wizard.ts`
- `artifacts/api-server/src/routes/concierge.ts`
- `artifacts/api-server/src/routes/index.ts`
- `artifacts/api-server/src/services/concierge.ts`
- `artifacts/api-server/src/test/concierge.test.ts`
- `artifacts/jormall/src/components/app-shell.tsx`
- `artifacts/jormall/src/components/concierge/contract.ts`
- `artifacts/jormall/src/components/concierge/copy.ts`
- `artifacts/jormall/src/components/concierge/view.ts`
- `artifacts/jormall/src/components/services/definition-editor.tsx`
- `artifacts/jormall/src/components/services/service-card.tsx`
- `artifacts/jormall/src/components/services/service-wizard-panel.tsx`
- `artifacts/jormall/src/pages/clinic/home.tsx`
- `lib/db/migrations/README.md`
- `lib/db/migrations/meta/_journal.json`
- `lib/db/scripts/prepare-snapshots.mjs`
- `lib/db/src/schema/index.ts`
- `lib/service-definition/src/index.ts`
- `scripts/checks/service-wizard-browser.py`

## Added implementation, guides and verification files

- `.env.example`
- `INTERNAL_WORKSPACE_DELIVERY.md`
- `PROMPT_FOR_CHATGPT_PRO.md`
- `SETUP_GUIDE.md`
- `VERIFICATION.md`
- `artifacts/api-server/src/concierge/linked-clinic.ts`
- `artifacts/api-server/src/domain/local-concierge.ts`
- `artifacts/api-server/src/routes/workspace.ts`
- `artifacts/api-server/src/services/clinic-workspace.ts`
- `artifacts/api-server/src/test/internal-workspace.test.ts`
- `artifacts/jormall/src/components/workspace/identity-panel.ts`
- `artifacts/jormall/src/components/workspace/surface.ts`
- `artifacts/jormall/src/components/workspace/workspace-home.tsx`
- `artifacts/jormall/src/components/workspace/workspace.css`
- `docs/historical/SOURCE_HANDOFF_PROMPT.md`
- `docs/historical/SOURCE_README.md`
- `lib/db/migration-baseline/internal-workspace/index.ts`
- `lib/db/migration-baseline/internal-workspace/workspace.ts`
- `lib/db/migrations/0006_internal_clinic_workspace.sql`
- `lib/db/src/schema/workspace.ts`
- `lib/service-definition/src/workspace-profile.ts`
- `scripts/checks/build-workspace-ui-test.mjs`
- `scripts/checks/workspace-browser.py`
- `scripts/checks/workspace-offline.mjs`
- `scripts/checks/workspace-test-lib.mjs`
- `scripts/checks/workspace-typecheck.mjs`
- `scripts/checks/workspace-ui-fixture.js`
- `verification/internal-workspace/browser-results.json`
- `verification/internal-workspace/browser-run.txt`
- `verification/internal-workspace/offline-results.json`
- `verification/internal-workspace/offline-run.txt`
- `verification/internal-workspace/runtime-attempts.txt`
- `verification/internal-workspace/scheduling-rules.txt`
- `verification/internal-workspace/service-rules.txt`
- `verification/internal-workspace/typecheck-results.json`
- `verification/internal-workspace/typecheck.txt`

Seven component screenshots are under `verification/internal-workspace/screenshots/`.
