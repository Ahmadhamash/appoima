# Implementation notes — 24 September 2026

## Scope resolution

The user's latest Arabic correction is authoritative: make the existing appointment application feel
specific to each clinic, not a generated public site. No anonymous routes, public domain connection,
publication snapshots, published revision history or patient-verification bypass were introduced.
The uploaded public-site prompt is superseded; corrected handoff files are included.

## Data and application design

`@workspace/service-definition` owns a strict, versioned `WorkspaceProfile`, provenance records and
revisioned draft helpers. The existing `manager_onboarding.state` stores the owner's working identity
alongside the same service draft used by manual entry, link imports and conversations. The additive
`clinic_workspaces` table stores one active identity per tenant. Identity starts from the existing
clinic account name, not an invented clinic; optional facts remain unknown and color defaults are
labeled suggestions. Owner edits and source acceptance are distinct provenance types.

The existing concierge transaction and tenant advisory lock serialize reviewed service/identity apply.
An identity base revision prevents two managers overwriting one another. A stale conflict rolls back
service writes in the same transaction. Duplicate final confirmations retain the existing idempotent
result. Audit details record revisions/counts rather than logos/contact values/patient content.
A saved draft is durable; aged conversation messages/uploads are discarded without deleting that draft.

`GET /api/me/workspace` freshly validates the authenticated database actor and active clinic, then returns
only that tenant's identity and active permitted service groups. Branch-bound staff receive shared or
their own branch's services. No service permission means no service catalog. Query parameters cannot
select a different tenant. Management remains manager + `settings.manage`, with existing additional
permissions for services/resources. AppShell's theme is scoped to the signed-in shell, never globally
written by an unapproved draft; the user-specific query key and existing auth cache reset are retained.

New authenticated concierge mutations, under existing intent/CSRF/rate boundaries:

- `PUT /api/concierge/workspace-draft` — `{revision, profile}`.
- `POST /api/concierge/workspace-fact` — `{revision, id, accept}`.
- `POST /api/concierge/workspace-reload` — `{revision}`.

Unknown mutation keys are rejected. `workspace_stale`, `workspace_invalid` and migration failures are
mapped to recoverable UI states. Requests do not accept a caller-selected tenant ID.

## Input behavior

Explicit URL import reuses the existing DNS-pinned HTTPS reader, restricted public IP destinations,
redirect/byte/time limits and raster verification. Extraction uses supported structured facts and
records source URL, evidence and confidence. Multi-identity pages and inconsistent clinic identities
are not silently merged. Social platform colors are not taken as clinic branding. A name/logo/color
proposal does not automatically replace an owner value. Service proposals are individually accepted.
There is no autonomous authenticated social scraping or claim that every public page is extractable.

The deterministic local text interpreter provides a provider-free continuation path for explicit
identity fields, exactly named services and focused missing-field answers. It does not pretend to
understand unlimited natural language. Cloud model/realtime paths retain the existing server-side
provider architecture; the director may return validated identity facts, never executable UI code.
Service removal tombstones stop old assistant context from resurrecting a deleted service; explicit
manual/local re-addition can clear that exclusion. Manual service definitions and final review remain
authoritative business inputs, not automatically inferred facts.

## Actual UI integration

`components/workspace/surface.ts` is the same safe text-content renderer used in the private owner
preview and real React home integration. `identity-panel.ts` embeds into the existing orb wizard;
`workspace-home.tsx` fetches the authenticated identity and is mounted before the existing home content.
The original role navigation, task cards, schedule views and staff functions remain present.

There are still exactly three main setup cards. The native identity editor and existing React service
editor coordinate their dirty/busy state, retain failed-save input, stop competing voice changes during
manual edits and confirm discard. Direct source acceptance, desktop/mobile preview, RTL/LTR, logo errors,
loading/empty/error/retry states and contrast-aware brand foregrounds are implemented.

Service sections derive only from the active saved service definitions; no unrelated modules are
created. Section cards link into existing service management and `/appointments/new`; they do not
preselect a particular section/service. No invented KPI, review, doctor credential or treatment claim
is displayed. Reopening setup previews the new working service draft, not a bulk editor of every
existing saved service; edit already-existing services from the existing Services screen.

## Preserved scheduling and boundaries

The existing service definitions, required intake answers, timezone/availability rules, transactional
booking command logic, exclusion constraints and patient privacy mechanisms remain in place. This
change adds no parallel appointment database or fake booking endpoint. It also does not add automated
branch/staff/room provisioning to the service-only wizard. A service is bookable only after the existing
resources and working hours are actually configured. Full database booking behavior was not re-executed
in this container; see the release gates, not just the pure-rule test results.

## Known limitations / deployment requirements

Full dependency installation and React/Express/Drizzle typecheck/build remain unverified because pnpm
could not be fetched. PostgreSQL SQL execution, migration snapshot generation, HTTP authorization,
real booking contention and full-app navigation require a real disposable database and dependencies.
No live URL, provider call, microphone, voice timing or external hosting was validated. Component browser
screenshots are actual production components with explicitly synthetic storage/callbacks, not a running
full application. Manual/profile/local tests execute production service logic with a test-only memory
adapter; that adapter is never part of the production runtime.

Only structured/limited explicit metadata is imported without AI; unsupported source pages must be
completed manually. Public website functionality from the old brief is intentionally absent.
