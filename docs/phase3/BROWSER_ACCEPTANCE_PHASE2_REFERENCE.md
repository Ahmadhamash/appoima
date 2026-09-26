# Phase 2 — real-browser acceptance (not yet executed)

**All cells below are pending.** Test the running API and web app against a disposable real PostgreSQL database, not mocked endpoints or static screenshots. Use the current Node 24/pnpm environment and run full typecheck/API tests first. Record the build revision, browser, database path (no credentials), date and screenshots with each result.

| Workflow | EN desktop | AR desktop / RTL | EN 390px | AR 390px / RTL |
| --- | --- | --- | --- | --- |
| Owner setup, manager sign-in and forced password change | Pending | Pending | Pending | Pending |
| Branch hours, time zone and reload persistence | Pending | Pending | Pending | Pending |
| Services and staff eligibility | Pending | Pending | Pending | Pending |
| Room capacity/status/compatibility from details | Pending | Pending | Pending | Pending |
| Staff wizard, permissions, work hours/breaks/time off | Pending | Pending | Pending | Pending |
| Password reset, first-login change, session invalidation | Pending | Pending | Pending | Pending |
| Staff deactivation and denied access | Pending | Pending | Pending | Pending |
| Customer contacts/search/pagination/notes | Pending | Pending | Pending | Pending |
| Read-only access and protected customer notes | Pending | Pending | Pending | Pending |
| Checklist updates; role homes remain appropriate | Pending | Pending | Pending | Pending |
| Keyboard/focus, validation, save/cancel and error states | Pending | Pending | Pending | Pending |

## Main workflow

1. Start API and web. Sign in to a sample clinic manager, changing its initial password if required. Switch to the language/viewport being tested; use a second clinic and a separate browser context for boundary checks.
2. Open Business → Settings. Add a named branch, explicitly choose the name's language and `Asia/Amman`, set a closed day and split hours (for example 09:00–12:00 and 13:00–17:00). Save, reload, inspect details and edit. Verify invalid and overlapping ranges produce readable errors.
3. Open Services. Create a room-required service with category Skin, duration 45, JOD price and a branch. Save and reload. The card must show real price/duration and state that actual inventory usage is not available; it must not show invented consumption.
4. Open Rooms. Create a room in that branch with capacity 1 and a compatible service. Open its details to change maintenance/availability and compatibility. Save, reload and check the list facts. Attempt an incompatible cross-branch assignment; the API must reject it without partial saves.
5. Open Employees. Complete Role → Person/login → Access review. Choose explicit name language and a randomly chosen test-only password of at least 10 characters; review exact read/manage permissions, branch, services, working ranges, contained breaks and leave. Confirm the password is never visible after save or returned in API responses.
6. Sign in as that employee in a separate session; change the initial password. Return as manager and reset it. Existing employee sessions must lose access; the new password must force another change. Deactivate the account and verify session revocation and denied sign-in. Reactivate it and confirm normal access with the expected password-change state. Do not use real staff accounts for this test.
7. Create a customer with a name language, phone and/or email, general notes and sensitive notes. Reload and search by each supported field. Verify at least one contact method is required and pagination does not lose search terms. Appointment history must be explicitly unavailable until Phase 3.
8. Use a read-only customer account. Its API response must omit sensitive notes, and the UI must not reveal them. It may not save any customer change. Verify the lookup API does not disclose unrelated staff logins/permissions. Check sensitive-note read auditing without copying note contents into audit details.
9. Use a limited staff manager. Permission choices must not exceed their actual grantable permissions; stronger accounts cannot be edited, reset or deactivated. Attempts to submit a platform-owner role or extra permission through HTTP must be rejected. Cross-clinic record IDs must return 403/404 and never leak data.
10. Return to the manager home. Branch-hours, services/rooms and staff steps should update from saved records. The booking step must stay incomplete. Secretary and doctor home screens must not expose manager setup controls. No appointment booking, waiting list, inventory transaction or assistant must appear to be working.

## Interaction and persistence checks

Use keyboard only for a pass through navigation and a form: every input has a visible label, focus is visible, dialogs trap focus appropriately and errors are understandable. At 390px there should be no horizontal overflow or inaccessible save buttons. Confirm bottom navigation remains usable in RTL, mixed Arabic/English names have their own direction, and stored names do not change when switching the interface language.

Exercise initial loading, failed API response/retry, empty list, no search results, save success, validation failure and cancel-with-unsaved-changes. Reload the page after saves to demonstrate real persistence. Inspect the console/network for unhandled errors and record any defects rather than marking a pass from a screenshot alone.

## Completion gate

Attach completed outcomes and evidence, rerun full typecheck and the API suite after fixes, update README/replit status only once acceptance passes, and **stop before Phase 3**. This checklist is a test plan, not a passing browser-test report.
