# Phase 5 — built-in help and optional provider

## Delivery status

Implemented in source, not a verified release. Review `PHASE5_HANDOFF.md` and `verification/phase5/summary.json` for the checks actually run. Full application typechecking/builds, PostgreSQL/API tests and real-browser acceptance remain mandatory. No provider account, API secret or live model was configured/tested in the editing environment. There is no default model name and no claim of live integration.

## Staff experience

**Staff help** opens a panel from the desktop sidebar or mobile header. It follows English/Arabic, the current role and text direction. It is not an extra navigation section. Escape/Close returns keyboard focus to the opener. Only one panel pane is mounted at a time. The conversation is held in component memory, capped at 16 question/answer pairs, and cleared on close, language change, user change or sign-out; switching between help/tools also clears that pane. No transcript database or browser-storage history was added.

**Guided help** works without any external account. A local bilingual FAQ covers navigation, booking, check-in, cancellation, rescheduling, waiting-list confirmation, actual material recording, assigned work, manager setup, people and stock. Only topics appropriate to current permissions are offered. A free-text question is matched against local keywords; it is not sent to an AI provider and cannot execute a command. Unknown questions receive an honest local fallback. The UI warns staff not to enter customer identities, contact details, allergies or private notes. Questions are limited to 600 characters.

**Appointment tools** show only server-permitted actions. The open appointment is reused when the panel starts on its detail/reschedule page; otherwise an authorized, paginated selector offers minimal appointment data, with an optional branch-local date filter. Every request still rechecks access. Results contain a timestamp and are snapshots, not reservations or confirmations.

| Allowlisted action | Required server access | Behavior |
|---|---|---|
| `suggest_slots` | `appointments.manage` | Reuses existing schedules, breaks, leave, duration, overlaps and room-compatibility logic. Returns at most eight live suggestions, not reservations. |
| `summarize_appointment` | `appointments.read`/`manage`, or an assigned doctor/service provider | Operational status, time and duration plus minimal local display names. No customer/contact/clinical notes are selected. |
| `draft_reply` | `appointments.manage` | Status-specific, unsent local wording. A pending booking is not described as confirmed. Copying does not send anything. |
| `explain_waiting` | `appointments.manage` | Explains the existing offered/booked suggestion for a cancelled appointment. Does not scan the queue, refresh suggestions or claim current eligibility. |

The booking link transfers previously chosen branch/service/employee/date through a one-use, five-minute, user-and-clinic-bound in-memory hint. It does not transfer a selected/reserved slot, create a customer, advance past review or submit a booking. The existing wizard validates the choices through its real catalog and availability APIs; the staff member still selects a current slot and confirms. No identifiers are accepted as authorization. The hint is discarded on consumption, expiry or a different user's attempted consumption.

Doctor/provider roles without broad appointment permission can summarize only their assigned appointments and do not gain manager setup, cancellation or queue tools. A platform owner gets local owner guidance, never a clinic-data tool through this panel. The existing permission vocabulary, clinic classification and workflow terminology are unchanged.

## Optional generation is wording assistance, not an autonomous agent

The optional provider receives a server-created packet for an already authorized action. It may rewrite the operational text; it does not receive a staff question, a transcript, a database handle or executable tools. The four read actions are selected by staff through validated API requests, not invented by a model. Provider output is displayed as plain text with a review warning, never as HTML, a link, SQL or a command. There is no assistant endpoint for booking, cancellation, rescheduling, stock changes or message sending.

Booking, cancellation and rescheduling remain in their existing explicit staff-confirmation screens. Waiting replacement still requires **Confirm replacement**. No SMS, email, WhatsApp or other message transport was added: a reply remains an unsent draft to review and use through the organization's approved communication process outside this app.

## Environment configuration

The root `.env.assistant.example` is documentation, not an automatically loaded configuration file. Put values in **server environment secrets**. Never expose a key in the browser, a `VITE_` variable, source control, a test screenshot or a support log.

| Variable | Default / purpose |
|---|---|
| `AI_ASSISTANT_ENABLED` | Unset/`false`: no external AI. Only literal `true` enables consideration of the configured provider. |
| `AI_ASSISTANT_ACTIONS_ENABLED` | Unset/`true`: local guarded tools available to permitted staff. `false` disables data tools and generation, not the built-in FAQ. Invalid values disable data tools. |
| `AI_ASSISTANT_PROVIDER` | `disabled`. The only implemented non-disabled adapter is `openai`. |
| `OPENAI_API_KEY` | No default. Must be a server secret for the enabled provider. |
| `AI_ASSISTANT_MODEL` | No default. Required; select a Responses-compatible model actually available to your account, then test it. |
| `AI_ASSISTANT_TIMEOUT_MS` | 12,000 ms; clamped to 1,000–30,000 ms. |
| `AI_ASSISTANT_MAX_OUTPUT_TOKENS` | 600; clamped to 128–1,200. This is a per-request cap, not a purchased token allowance. |
| `AI_PROVIDER_SMOKE_ALLOW` | Normally unset. Set to `1` only for the explicitly invoked, potentially paid synthetic smoke test below. |

A key alone never activates AI. Enablement requires the literal enabled flag, `openai`, a nonempty secret and a nonempty model. Restart the API after changing deployment secrets. UI status distinguishes `disabled`, `not_configured` and `configured_not_verified`; this configuration check is not a health probe, and no persistent verified flag is fabricated. A successful request verifies only that request.

To leave all paid behavior off, use the default template. To deliberately configure generation, an administrator must set `AI_ASSISTANT_ENABLED=true`, `AI_ASSISTANT_PROVIDER=openai`, and the two required secret/model values. Review your provider's data handling, model capability and budget first. Each generation request also needs an unchecked-by-default staff consent control; the server requires literal `consent: true`, not a truthy string or a prior consent cached elsewhere.

## Data boundaries and provider behavior

The browser's permitted local result can include customer, service, employee and branch **display names**, because staff need to recognize the record. The provider packet deliberately excludes these names, all record/user/clinic identifiers, contact details, service labels, free-text notes, allergies and sensitive history. It contains only language/action, approved operational wording, times/time zone, status/duration and, where applicable, limited slot or waiting-window facts. These facts can still be sensitive in context; do not call them anonymous or risk-free.

Transport is pinned to `https://api.openai.com/v1/responses`; client input cannot select a host. There are no external tools, previous response IDs, conversations, uploaded documents or background requests. HTTP redirects are rejected. Response JSON is bounded to 64 KiB, text to 6,000 characters, and the serialized packet to 12,000 characters. These character limits are not measured token estimates. The parser accepts only a completed response containing assistant output text, ignores reasoning items and rejects executable tool output, incomplete output and refusals. Errors are mapped to localized unavailable/rate-limit codes; vendor error bodies and secrets are not logged or returned.

The request sets `store: false` to disable response storage for that API feature. **This is not a guarantee of zero provider retention**, an approved data-processing agreement or legal compliance. Consult the provider's current data-control policy and the organization's privacy obligations before enabling. No real clinic data was sent during this work.

A clinic transaction/lock is used to prepare the authorized facts, then released **before** the network call. After a successful response, the server rechecks active user/clinic, password-change requirement, feature flags, assignment, permissions and the relevant record/version facts. Changed data suppresses stale generated output with `assistant_context_changed`; revoked access is denied. Existing database-backed availability and final booking checks remain authoritative.

## Abuse and usage controls

Limits are implemented per API process: 120 assistant requests per user/minute; at most two concurrent provider requests; six provider calls per user/minute; 60 per clinic/hour; 240 per instance/hour. The in-memory limiter resets on restart and is not shared across replicas. Reserve attempts can consume a narrower counter even when a later, broader quota denies the attempt; this is intentionally conservative. Use a shared limiter before scaling across processes. These controls reduce bursts; they do not provide a monetary spend cap or a customer billing system.

Successful provider responses display input/output token counts only when the provider supplies valid counters; no counts are invented. Audits keep those reported counters. Retries are explicit staff requests and may be billed separately; there are no automatic provider retries/fallbacks.

## Audit and API contracts

Every authenticated assistant operation is wrapped in requested/completed/failed audit events. Provider requests/completions/failures have separate metadata records. Logs contain request/operation metadata, permitted action names where applicable, provider, consent flag, normalized failure category and reported usage—not questions, results, contacts, notes, authorization headers or provider bodies. Unauthenticated HTTP denial occurs in the existing auth middleware, before assistant audit entry. A database/audit failure fails the request closed; it does not silently return unlogged data. Audit insertion is the assistant's only intended database write.

All endpoints live under `/api/assistant`, require a valid signed-in session and completed initial-password change, and return `Cache-Control: no-store, private`:

- `GET /bootstrap?language=en|ar`: role FAQ topics, available actions and configuration status.
- `POST /help`: exactly one local `question` or allowed `topic`, plus language.
- `GET /appointments?page=1&date=YYYY-MM-DD`: authorized minimal choices; date optional, 20 rows/page.
- `POST /actions`: one of the four strict action shapes.
- `POST /generate`: `{ "consent": true, "request": <the same strict action input> }`.

Extra fields such as `clinicId`, SQL, tools or `confirmed` are rejected. The source appointment is read through tenant-scoped joins; a doctor without broad permission cannot infer another employee's appointment from a guessable ID. A request for an unsupported assistant write route is not implemented and returns 404.

Example read request (no changes are made):

```json
{"action":"summarize_appointment","language":"en","appointmentId":123}
```

## Verification commands

On a migrated **disposable** database with Node/pnpm/dependencies installed:

```bash
# DATABASE_URL and SESSION_SECRET must already be configured for this test environment.
export TEST_DATABASE_DISPOSABLE=1
bash scripts/checks/verify-phase5.sh
```

This runs full typecheck, all four offline suites, all API tests and builds. Database-backed Phase 5 tests use explicit HTTP stubs for provider responses: they test authorization, data changes during latency and transaction state, not a live OpenAI account. The test fixture never needs your API secret. Follow `BROWSER_ACCEPTANCE_PHASE5.md` after restarting both workflows.

For an explicitly authorized **one-request synthetic** live provider smoke, only after real credentials/model configuration:

```bash
AI_PROVIDER_SMOKE_ALLOW=1 pnpm --filter @workspace/api-server run assistant:smoke
```

This command is never run by application startup, offline checks or the API test suite. It may incur a provider charge and was **not run here**. It sends a fixed synthetic pending-appointment packet, with no database access, and reports success/failure and usage without printing the key or raw provider text. Passing proves neither content quality nor full app acceptance; perform a reviewed synthetic UI request in each language afterward. Do not use real patient data to test a connection.

## Source map

`src/ai/`: provider interface, environment flags, disabled adapter and bounded OpenAI adapter. API `domain/assistant-*`: pure permissions/help/format/budget and strict Zod input. API `services/assistant-context.ts`: minimal tenant-scoped reads and stamps; `services/assistant.ts`: auth refresh, consent, auditing and post-network rechecks. `routes/assistant.ts`: HTTP wiring. Web `components/assistant/`, `lib/assistant-api.ts`, `lib/assistant-booking-context.ts`: local panel/tools and one-use wizard hints. The app shell and booking page have small integration patches; completed scheduling/inventory implementations are retained.

## Provider references reviewed for the implementation

Official provider documentation reviewed September 21, 2026 (not proof of a configured account or live adapter test):

- OpenAI text generation / Responses request and output format: https://developers.openai.com/api/docs/guides/text
- OpenAI data controls and retention distinctions: https://developers.openai.com/api/docs/guides/your-data

## Remaining limits

No unrestricted AI chat, clinical advice, autonomous booking, direct SQL generation, messaging integration, new inventory feature, transcript retention, distributed budget store or model chooser was added. No Phase 5 database migration is needed. The inherited four hand-authored migrations, missing generated snapshots and earlier runtime-acceptance gaps remain unresolved until verified against PostgreSQL. Do not equate source completeness with the product's database/browser definition of done.
