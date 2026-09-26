# Prompt for Codex — JorMall Phases 2–5

You are continuing an existing project. Read these first, in order, and do not regenerate completed modules:

1. `JORMALL_REPLIT_SPEC.md` — the complete product specification (sections 2–10 are binding).
2. `replit.md` and `README.md` — how the project runs, where things live, and the architecture decisions already made.
3. Phase 1 code: `lib/db/src/schema/`, `artifacts/api-server/src/{domain,services,routes,middlewares,test}`, `artifacts/jormall/src/{App.tsx,lib,components,pages}`.

## Current state (Phase 1 is DONE and verified — do not rebuild it)

- pnpm monorepo, TypeScript. API: Express 5 + express-session (PostgreSQL store) + bcryptjs + Zod, port 5000 under `/api`. Web: React 19 + Vite + wouter + @tanstack/react-query + Tailwind v4 + shadcn/ui. DB: PostgreSQL + Drizzle (`lib/db`).
- Done: platform-owner setup, clinic creation with manager login (initial password, forced change at first sign-in), sign-in/sessions, role-based `home` and `nav` decided by the server, permission model (`artifacts/api-server/src/domain/permissions.ts`: ROLE_PRESETS, `hasPermission`, keys like `appointments.read|manage`, `customers.*`, `employees.*`, `services.*`, `rooms.*`, `inventory.*`, `settings.*`), audit_events table, full EN/AR with RTL, mobile bottom nav at 390px, login rate limiting, 12 API tests (vitest + supertest against the dev DB, `NODE_ENV=test`), seed script, README.
- Existing tables: `clinics`, `branches` (already has name, timeZone, opening hours JSON placeholder), `users` (role enum, permissions jsonb, mustChangePassword, isActive, branchId), `audit_events`, `session`.
- The web pages Appointments / Customers & Employees / Business currently show honest "next release" placeholders in `artifacts/jormall/src/pages/clinic/sections.tsx`. Replace them with real screens as each phase lands.

## Conventions you must keep

- Business rules live in `src/domain`, DB access in `src/services`, HTTP in `src/routes` with Zod validation. Every clinic route checks `req.user.clinicId` on the server; never trust a clinic id from the client.
- The server returns error codes (`{ error: "slot_taken" }`); the web app translates them in `artifacts/jormall/src/lib/i18n/{en,ar}.ts` (`dict.errors`). Every new UI string needs both languages. Never show technical status codes to users.
- User-entered names are stored with `nameLang` ('en' | 'ar') and rendered with matching `lang`/`dir`; never machine-translate.
- No OpenAPI/orval codegen: use the fetch wrapper in `artifacts/jormall/src/lib/api.ts` + react-query.
- No external fonts, no heavy animations, no fake features, no mocked data in the UI. One "Create appointment" action per page. Every form: visible labels, keyboard focus, useful validation errors, clear save result; never ask for the same information twice.
- Use `pnpm --filter @workspace/db run push` for schema changes in dev **and** add versioned Drizzle migrations (`drizzle-kit generate`) under `lib/db/migrations` so a fresh deployment is reproducible. Add `data-testid` attributes to interactive elements.
- After each phase: `pnpm run typecheck`, `pnpm --filter @workspace/api-server run test`, restart both workflows, and verify the main workflow in a real browser (EN and AR, desktop and 390px). Report in ≤ 8 lines: files, test results, next phase. **Stop after each phase and wait for my go-ahead before starting the next one.**

## Phase 2 — Manager setup

Build, in this order, for the clinic manager (and anyone with the matching `*.manage` permission):

1. **Branches** (`Business → Settings`): name, IANA time zone (select), weekly opening hours (per weekday, closed/open + ranges), optional rooms. A clinic can have several branches; every record below belongs to one branch or clinic.
2. **Services** (`Business → Services`): name (+ nameLang), duration in minutes, price + currency, category from a fixed list (Hair, Nails, Skin, Laser, Massage, Makeup, Other — a choice, not free text), active status, eligible employees, optional "requires room". Service card shows price, duration, and *actual recorded inventory use* (empty until Phase 4) — planned material requirements, if shown, must be labelled separately.
3. **Rooms** (`Business → Rooms`): name, branch, capacity, status (available / maintenance), compatible services. List shows these facts; maintenance and compatibility editing open inside room details.
4. **Staff accounts** (`Customers & Employees → Employees`): three-step form **Role → Person and login → Access review**. Manager enters name, email, initial password (≥ 10 chars, hashed immediately, never shown again), picks a preset role, then reviews/adjusts the exact permission checkboxes (read vs manage for appointments, customers, employees, services, rooms, inventory, settings). Managers can grant only permissions they hold themselves and can never create a platform owner. Extra fields: phone, job title, branch, active status, services performed, weekly working hours, breaks, time off. Manager can later deactivate, edit access, and set a new initial password (which re-enables forced change at next sign-in). Reuse `createStaffAccount` in `src/services/auth.ts`.
5. **Customers** (`Customers & Employees → Customers`): name (+ nameLang), at least one contact method (phone or email), optional notes, sensitive notes visible only to roles with `customers.manage` (or a dedicated permission), appointment history (empty until Phase 3). Search by name, phone, or email, paginated.
6. **Manager home checklist** wired to real data: Set branch hours → Add services and rooms → Add staff and their access → Review the first booking. Stays on the home screen until all four are done. Never show setup controls on secretary/doctor screens.

Tests to add: cross-clinic denial for every new resource (a manager of clinic A gets 403/404 on clinic B's branch, service, room, employee, customer), permission escalation blocked (manager cannot grant a permission they lack, cannot create platform_owner), initial-password reset re-forces password change. Extend the seed with branches, services, rooms, and customers for both sample clinics.

## Phase 3 — Scheduling

1. **Data model**: `appointments` (clinic, branch, customer, service, employee, optional room, startsAt/endsAt in UTC, status, notes, createdBy), `appointment_status_history` (appointment, from, to, actor, at, reason), rescheduling keeps the original history. Statuses: Pending, Confirmed, Checked in, In service, Completed, Cancelled, No-show. Define the allowed transitions in `src/domain` and expose only valid next actions per status.
2. **Conflict prevention in the database**: use PostgreSQL exclusion constraints (btree_gist, `tstzrange`) so an employee and a required room can never have overlapping non-cancelled appointments. Booking, cancellation, and rescheduling run in one transaction and are safe to retry (idempotency key or equivalent). Map the constraint violation to a plain-language error ("That time was just taken").
3. **Availability**: a service that computes valid slots from branch opening hours, employee working hours/breaks/time off, service duration, existing appointments, and room availability when the service requires a room (reserve a compatible room with the appointment). Store instants in UTC; display in the branch time zone.
4. **Secretary booking wizard**: Customer (find or add inline) → Service → Employee → Date and time (only valid slots) → Review → Book. Exactly one "Create appointment" action per page.
5. **Appointments section**: two clear choices, View appointments and Create appointment. Daily view shows time, customer, service, employee, status, and next action (Confirm, Check in, Start, Finish, Cancel, No-show, Reschedule) with plain-language labels. Calendar/full history/filters live inside the section.
6. **Role homes**: secretary home shows today's appointments; doctor/service-provider homes show their own appointments, next customer, and permitted customer details, with Start service / Finish and record notes. Doctors and providers see only their assigned appointments unless they hold `appointments.read`.
7. Manager checklist step 4 ("Review the first booking") completes when the clinic has its first appointment.

Tests to add (required by the spec): two concurrent bookings for the same employee/room slot — exactly one succeeds; rescheduling preserves history; invalid status transitions are rejected; a doctor cannot open another employee's appointment without permission; Arabic mobile navigation at 390px (Playwright or puppeteer-core if available — see `.agents/memory/browser-e2e.md` for how browser checks were run here).

## Phase 4 — Waiting list and inventory

1. **Waiting list** (inside Appointments): entry = customer, requested service, optional preferred employee, preferred day or time window, short note, status (waiting / offered / booked / declined / expired). When a booking is cancelled, find compatible entries (service, employee preference, duration, branch, requested window) and show the earliest as a suggestion with a single **Confirm replacement** action. Never book automatically. Re-check availability inside the confirmation transaction; if declined or no longer eligible, show the next compatible entry. Record every suggestion/decision in `audit_events`.
2. **Inventory** (`Business → Inventory`): items with name, unit, branch, current balance; append-only `inventory_movements` (receipt, adjustment, consumption) with actor, timestamp, and optional link to appointment + service. Authorized staff record receipts and adjustments. Balance is derived from movements (or maintained transactionally with them) — never edited directly.
3. **Actual service consumption**: when an appointment is completed, the doctor/provider records the actual quantity used per item. Deduct exactly once in a transaction (guard against double submission), link the movement to the appointment and service, and show the recorded total by item and unit on the service card. Never sum incompatible units and never turn an estimated recipe into actual consumption.

Tests to add (required by the spec): waiting-list confirmation books the entry and re-checks availability (fails cleanly if the slot was taken in between); declined suggestion moves to the next entry; inventory deduction happens exactly once even when the completion request is retried; movements are immutable.

## Phase 5 — Optional assistant

1. **Built-in help panel** (works with no AI account): a staff chat-style panel with role-aware guided answers for navigation and the common workflows (book, check in, cancel, waiting list, record consumption), driven by a local rules/FAQ table in both languages. Clearly show when generative AI is unavailable.
2. **Provider adapter + feature flags**: `src/ai/` with a provider interface, a "disabled" implementation by default, and an implementation that activates only when the provider secret is present in environment secrets (read via env, never hard-coded). Never claim a provider is integrated before it is configured and tested.
3. **Guarded actions**: the assistant may only call an allowlist of server actions (suggest slots, summarize permitted appointment data, draft a reply, explain a waiting-list suggestion). Each action independently re-checks clinic, user, permission, and input on the server. Booking, cancellation, rescheduling, and sending messages always require explicit staff confirmation in the UI. AI never queries the database directly or mutates appointments directly. Log AI actions and failures to `audit_events`.

Tests to add: assistant actions are denied for users without the underlying permission; the disabled provider returns a clear "unavailable" response; no action mutates appointments without a confirmation step.

## Definition of done (every phase)

Sign-in, navigation, forms, saved records, appointment state changes, waiting-list staff confirmation, and inventory movements work against the real database, in English and Arabic, on desktop and at 390px. A beautiful static UI or a fake integration is not a completed phase. Update `README.md` and `replit.md` at the end of each phase, and keep the seed script producing useful sample data with randomly generated initial passwords printed once.

**Start with Phase 2 now. Do not start Phase 3 until I say so.**
