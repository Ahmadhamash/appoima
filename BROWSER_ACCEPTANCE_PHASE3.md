# Phase 3 real-browser acceptance — NOT executed here

Use a disposable real PostgreSQL database with all three migrations or the reviewed dev push wrapper. Do not test on customer/clinic production data. Install dependencies, run the full typecheck/API/build suite, then restart both API and web. Retest `BROWSER_ACCEPTANCE.md` for Phase 2 regressions as well.

## Automated runner

`node scripts/checks/phase3-browser.mjs` requires Puppeteer available in the runner, a Chromium binary, running API/web, and environment-only credentials for a fully authorized disposable clinic manager who has already changed their password. No API responses or UI data are mocked.

```bash
E2E_ALLOW_WRITE=1 \
E2E_BASE_URL=http://localhost:19880 \
E2E_MANAGER_EMAIL='<test-manager>' \
E2E_MANAGER_PASSWORD='<changed-password>' \
CHROMIUM_PATH=/usr/bin/chromium \
node scripts/checks/phase3-browser.mjs
```

Use `PUPPETEER_MODULE` for an existing module path if needed; Replit Chromium may be `/repl/tools/bin/chromium`. Only explicitly set `E2E_NO_SANDBOX=1` when the disposable runner requires it. `E2E_OUTPUT` changes the default `verification/browser-phase3` output directory.

The runner creates synthetic branch/service/room/customer/doctor records through real authenticated APIs. It books and reschedules through the UI, verifies history through the real API, confirms/checks in as the manager, and starts/finishes with notes through a separate doctor browser context. It covers EN desktop and AR 390px navigation, horizontal-overflow checks, and absence of sensitive-note/reschedule controls for the assigned-only doctor. It creates screenshots/results only when actually run. Random doctor credentials are not written to logs/files. Synthetic records remain for inspection in the disposable database; no broad deletion/cleanup endpoint is used.

## Manual acceptance matrix

Repeat all applicable workflows in **English and Arabic**, at **desktop width and 390px**, with keyboard navigation and visible labels/focus. Automated results do not replace visual review or the checks below. Mark each item only after observing it against real persisted records.

- [ ] Owner/setup/login/forced-password/logout work as before; no clinic operational controls appear for the platform owner.
- [ ] Secretary home shows today's real appointments. Doctor/provider home shows own appointments and next customer, with no manager setup controls.
- [ ] Appointments has View and Create choices; exactly one Create appointment action on each relevant page. Assigned-only provider has View, not Create.
- [ ] Wizard searches by name, phone, email; inline customer creation requires a contact method and name language. Back/forward retains entered data and does not ask for it again.
- [ ] Changing service/employee clears an old slot; inactive/ineligible employees/services cannot be booked. No compatible room produces an honest empty availability state.
- [ ] Slots respect branch hours, staff work/breaks/time off, duration, occupied rooms and an employee's bookings across branches. Device time zone differing from branch does not change displayed branch times.
- [ ] Review shows the selected customer/service/employee/time and branch time zone. Book persists once. Retry after a dropped response reuses a command key; taken slots show a translated error.
- [ ] Two sessions try the same slot: one commits, the other fails cleanly. Repeat with different employees competing for the same required room. Confirm with real API tests as well.
- [ ] Daily view, status/branch/service/employee/mine filters, pagination and full history load real data. Month counts are not limited to a single page of results; selecting a day opens that day.
- [ ] Confirm → Check in → Start → Finish records history. Invalid transitions do not appear and are rejected by API. Cancelling/no-show requires a reason; future no-show is rejected.
- [ ] Cancel frees the reservation; no waiting-list suggestion/automatic replacement is claimed in Phase 3. Duplicate cancel retry does not affect a later replacement booking.
- [ ] Reschedule review requires explicit confirmation, retains original status/slot history, moves the reservation atomically and returns status to Pending. A conflicting move leaves the original booking/history intact.
- [ ] Stale expectedVersion shows a useful reload message; notes and status changes do not silently overwrite newer edits.
- [ ] Assigned provider can Start/Finish and save notes; cannot open another employee's appointment without an explicit global read grant. Read-only global access does not permit changing others' operational notes.
- [ ] Customer general/contact details require customer-read; sensitive notes require customer-manage. Check API bodies as well as UI. No technical error/status codes appear as visible labels.
- [ ] Customer details show real appointment history with correct scope; first committed booking completes manager checklist step four.
- [ ] Sign out and sign in as another tenant/provider: no prior user's customer, sensitive-note, appointment or setup cache is displayed.
- [ ] Arabic pages are RTL, preserve mixed-language names/numbers, have no horizontal overflow or covered controls at 390px, and all forms show a clear saved/error result.

## Sign-off record

Record runtime/dependency versions, migration path, database type, test command output, screenshots, EN/AR viewport matrix, tester and unresolved defects. Keep production information out of artifacts. **This file is a checklist, not a claim of completion. Phase 4 remains stopped.**
