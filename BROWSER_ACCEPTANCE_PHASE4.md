# Phase 4 — real-browser acceptance (PENDING)

No app-backed browser run or successful screenshot was produced in the editing environment. This checklist is a release gate, not a completed report. Use a dedicated disposable database. The automated runner writes synthetic records, including irreversible append-only ledger entries; never point it at production.

## Prerequisites

Install dependencies, apply and inspect all four migrations/guards, run full workspace typecheck and all API tests, build API/web, then start both workflows. The manager account must be active, have completed its forced password change, and hold all required setup/appointments/customer/inventory permissions. Use environment secrets for credentials. Do not copy real customer data into screenshot fixtures.

Run on a machine/runner with Chromium and puppeteer-core; `PUPPETEER_MODULE` can be its absolute module path. Browser tooling is not added as an application dependency. Configure:

```bash
export E2E_ALLOW_WRITE=1
export E2E_BASE_URL=http://localhost:19880
export E2E_MANAGER_EMAIL='<test manager email>'
export E2E_MANAGER_PASSWORD='<test manager password>'
export CHROMIUM_PATH=/usr/bin/chromium
# Only when required by an isolated CI container: E2E_NO_SANDBOX=1
node scripts/checks/phase3-browser.mjs
node scripts/checks/phase4-browser.mjs
```

Avoid putting credentials in shell history on shared machines; runner-injected secret variables are preferable. Output goes to `verification/browser-phase4` unless E2E_OUTPUT is set. It writes a result only after assertions succeed, or a failure file on error. It does not alter any existing acceptance evidence. It creates an assigned provider with a random initial password and exercises the required first-login change without printing or saving that password.

## Automated Phase 4 path

For each combination of English/Arabic and desktop/390px, the runner creates an inventory item through the UI, records a real receipt and checks the resulting balance. It creates an original appointment through the API using actual availability and a required compatible room; adds the first waiting request in the UI with pre-populated customer data; prepares a second compatible request; cancels via UI; confirms that only a suggestion exists; declines the first suggestion in the UI; waits for the second; explicitly confirms a replacement; checks in; and completes as the assigned provider with actual materials.

It verifies the recorded consumption, locked reporting state, single movement and remaining stock, then opens the real service card's actual totals. It captures receipt, replacement-review, actual-consumption and service-total screens and checks horizontal overflow and uncaught browser exceptions. Both language/direction attributes are asserted. Synthetic data remains in the disposable database afterwards. The runner is included as source and has not run here.

## Additional manual checks before acceptance

- Keyboard-only navigation, focus restoration, labels, validation/error messages and all dialogs in EN and AR. Check 390px width, long Arabic names/notes, narrow keyboards and loading states; no unlabelled quantity inputs or untranslated codes.
- A second staff session takes the suggested employee or required room slot before confirmation. The old suggestion must fail cleanly, retain its decision audit, never create an overlap, and allow reviewing the next eligible request. Test stale service duration, disabled provider, maintenance room and expired window.
- Different clinic and read-only users cannot write/confirm, and assigned providers cannot consume for another provider merely because they have global appointment read. Revoking permissions must block a successful-command replay. Stock-only users must not gain patient notes or appointment-navigation access.
- Record two material lines when only one has enough stock: status/history and both balances must remain unchanged. Retry successful completion with the same key, record a semantically identical payload with another key, and confirm exactly one deduction. A changed payload is rejected. Explicit no materials is distinct from no report.
- Verify service totals by item/unit/branch and record a corrective adjustment: stock changes but the immutable historical service-consumption totals do not silently rewrite. Test pagination and empty inventory/waiting states.
- Sign out and sign in as a different user/clinic; no previous private query data should flash. Retest all retained Phase 3 booking/rescheduling/history flows. Complete snapshot/fresh-install/upgrade checks separately; a browser pass alone does not certify migrations.

Record date, commit/archive hash, environment, each command exit, fixture IDs, viewport/language, screenshots, and actual pass/fail findings. Keep the release candidate unverified until these checks pass. Stop before Phase 5.
