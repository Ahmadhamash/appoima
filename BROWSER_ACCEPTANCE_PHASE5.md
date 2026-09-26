# Phase 5 — real-browser acceptance (not yet executed here)

Use the real API, real PostgreSQL and real web app. Do not substitute static screenshots or mocked endpoints for acceptance. All fixtures must be synthetic; run on a dedicated disposable database, never production. The runner writes setup records, a cancelled appointment, a waiting offer, authentication/session state and audit records. It deliberately does not delete these records afterward.

## Prerequisites

Install the workspace from its lockfile. Verify the correct database migration/upgrade path and both custom guard sets first. Set `DATABASE_URL`, a random `SESSION_SECRET`, and `TEST_DATABASE_DISPOSABLE=1`; run `bash scripts/checks/verify-phase5.sh`. Resolve every failure before signing off. The optional provider remains `AI_ASSISTANT_ENABLED=false` for browser automation; local data tools must be enabled. No provider credential is required or used by this runner.

Start/restart the two workflows with those same environment secrets:

```bash
PORT=5000 pnpm --filter @workspace/api-server run dev
PORT=19880 BASE_PATH=/ pnpm --filter @workspace/jormall run dev
```

Use a disposable clinic manager with setup permissions for branches, services, employees and customers, as well as `appointments.manage`. Complete the initial-password change first. Store credentials only in environment variables. Prepare a browser runner that already has `puppeteer-core` and Chromium; neither is newly bundled as an application dependency. Set `PUPPETEER_MODULE` to an absolute installed package entry if ordinary module resolution cannot find it. The runner assumes the app is served at the origin root, as shown above.

```bash
# Set E2E_MANAGER_EMAIL and E2E_MANAGER_PASSWORD through environment secrets, not checked-in commands.
E2E_ALLOW_WRITE=1 E2E_BASE_URL=http://localhost:19880 CHROMIUM_PATH=/usr/bin/chromium node scripts/checks/phase5-browser.mjs
```

`E2E_NO_SANDBOX=1` is only for a properly isolated runner that explicitly requires it; it is not the default. `E2E_OUTPUT` can point to a protected local output folder; default is `verification/browser-phase5/` (gitignored). Screenshots show test display names; keep all involved accounts/records synthetic. Do not put real customer data into the test application.

## Automated coverage

The runner logs in through the real UI and uses the real API to create a synthetic branch, service, assigned doctor, customers, original bookings and a waiting offer. A separate browser context signs in the newly created doctor and completes their required password change. No network responses are intercepted, mocked or fulfilled by the runner.

It exercises English and Arabic at desktop width 1366 and mobile width 390, for manager and assigned doctor: open local help, role topic filtering, topic and typed local answers, Escape/close focus restoration, keyboard containment, RTL direction, horizontal overflow checks, authorized operational summary, unsent reply, slot suggestions, existing-appointment reuse and waiting explanation. It checks that the provider is disabled and the generation control is absent. It also opens the normal booking wizard from slot suggestions, chooses a synthetic customer, checks the existing branch/service/employee selections were carried over, and leaves without selecting a slot or submitting a booking.

Business-record snapshots before/after assistant use must agree for the test appointments, history and waiting entries/offers. The network monitor rejects unexpected non-read application calls while the assistant scenarios run; only the known local help/action POSTs are allowed. A provider `/generate` request would fail this suite. These are observations of this workflow, not a general proof that every database table is unchanged; the full API suite contains additional no-mutation and access-denial cases.

The runner writes `result.json` and screenshots only after/while actually running, or `failure.json` on failure. No successful browser result or screenshot is supplied in the delivery archive because the live app could not start in the editing environment. `node --check` only verifies runner syntax.

## Manual sign-off beyond the runner

Check an unprivileged staff account and a platform owner: local help remains available, but unauthorized clinic-data actions cannot appear or be invoked directly. Inspect keyboard labels and mobile scrolling with a real keyboard and screen reader; automated focus/overflow checks are not a full accessibility audit. Verify 401/403/error/retry feedback, expired sessions, wrong-tenant IDs and a feature flag switched off after a panel was opened. Close/reopen and switch language to verify no transcript persists. Verify copied text remains an unsent draft; there is no send endpoint.

After the disabled-provider suite, an administrator may separately approve synthetic live-provider testing using `docs/ASSISTANT_PHASE5.md`. Confirm the unchecked consent requirement, limited provider packet, token metadata when supplied, failure fallback, plain-text-only output, permission revocation during latency and stale-record rejection. Provider-generation behavior in the API suite is HTTP-stubbed, not a live integration certificate. A live smoke test is potentially paid and never automatically enabled by the browser runner.

Run the retained `phase3-browser.mjs` and `phase4-browser.mjs` and the earlier setup checklist as well. The new assistant runner does not replace full scheduling, rescheduling, waiting-confirmation or immutable inventory acceptance. Review the migration/snapshot gap separately; Phase 5 adds no schema migration.
