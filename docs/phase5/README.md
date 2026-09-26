# JorMall — Phase 5 staff help and optional assistant candidate

Continues the supplied Phase 4 ZIP. The product sources remain `JORMALL_REPLIT_SPEC.md` and `CODEX_PROMPT_PHASES_2-5.md`. Existing authentication, role navigation, clinic isolation, manager setup, scheduling, waiting list and actual inventory workflows are retained. No business engine was replaced or rebuilt.

**Not a verified release.** Phase 5 is implemented in source, but full workspace typechecking/builds, PostgreSQL/API execution, real-browser acceptance and live-provider verification remain pending. Earlier migration/snapshot and runtime-acceptance gaps are not resolved by offline checks. See `PHASE5_HANDOFF.md` and `verification/phase5/summary.json` for actual evidence. Phase 5 is the last phase in the supplied continuation prompt; do not invent a Phase 6 or silently declare deployment acceptance complete.

## What is new

The bilingual **Staff help** panel provides role-aware local workflow answers without an AI account. Authorized staff can request live available-time suggestions, operational appointment summaries, unsent reply drafts and explanations of existing waiting suggestions. The panel cannot book, cancel, reschedule, deduct inventory or send messages. Existing staff confirmation screens remain authoritative. Previously selected slot-search branch/service/employee/date are carried into the normal booking wizard without selecting or reserving a time.

An optional bounded OpenAI Responses provider adapter is included, **disabled by default**, with required server-secret/model configuration and per-request consent. Only limited, freshly authorized operational facts are sent—never customer/employee/branch/service names, record IDs, contacts, free-text notes or clinical history. Provider output is plain reviewed wording, not a tool command. Access and data versions are checked again after provider latency. Audits omit chat/provider bodies and secrets. A configured status is not a verified live connection.

Read [the assistant setup and security guide](docs/ASSISTANT_PHASE5.md), the [browser acceptance instructions](BROWSER_ACCEPTANCE_PHASE5.md), and [the handoff](PHASE5_HANDOFF.md). `.env.assistant.example` documents opt-in settings and is not auto-loaded. Local FAQ and permitted local tools require no paid API.

## Retained functionality

Phase 2: branches/hours/time zones; services and rooms; three-step staff accounts, permissions, schedules and initial-password resets; customers and protected notes; real-data manager checklist. Phase 3: UTC appointments, schedule/room availability, database overlap guards, booking wizard, daily/calendar/history views, status changes and rescheduling with preserved history. Phase 4: explicit waiting-list replacement confirmation, stale/declined offer handling and auditing; branch stock, append-only receipts/adjustments/consumption; one-time actual material reporting with transactional stock checks.

The detailed Phase 4 behavior and previous deployment notes remain in `docs/phase4/README.md` and `docs/phase4/replit.md`; prior handoffs/evidence are preserved. No SMS, WhatsApp, email transport, AI medical advice, unrestricted SQL agent, supplier/purchase-order module or automatic replacement booking has been added.

## Run the project

Use the supplied Node 24/Replit runtime and the unchanged pnpm lockfile. No application dependency was added. The editing environment used Node 22 only for dependency-free verification.

```bash
pnpm install --frozen-lockfile
```

Set `DATABASE_URL` and a long random `SESSION_SECRET` in environment secrets. Scripts do not implicitly load a root `.env`. Read `lib/db/migrations/README.md` **before** any schema command. There is no Phase 5 schema change; a genuinely migrated Phase 4 database needs no extra Phase 5 migration.

For an empty disposable database, after choosing that documented path:

```bash
pnpm --filter @workspace/db run migrate
```

For disposable push-based development, use the wrapper that installs scheduling **and** inventory guards:

```bash
pnpm --filter @workspace/db run push
```

Do not replay baseline migrations against a push-managed existing database, erase migration history, disable ledger guards or use force to dismiss discrepancies. All four inherited SQL migrations are hand-authored; generated Drizzle snapshots and real-database verification remain pending. Back up and test an appropriate upgrade route on a separate database copy. API startup checks the required custom guards before listening.

Run API and web as separate workflows:

```bash
PORT=5000 pnpm --filter @workspace/api-server run dev
PORT=19880 BASE_PATH=/ pnpm --filter @workspace/jormall run dev
```

The web retains the existing `/api` proxy. For paid generation to stay off, leave `AI_ASSISTANT_ENABLED` unset or false. Configuration details, limitations and the explicitly opt-in synthetic provider smoke command are in `docs/ASSISTANT_PHASE5.md`.

## Seed

The existing seed is retained unchanged. Complete platform-owner setup first, or supply the documented `SEED_OWNER_EMAIL` and `SEED_OWNER_PASSWORD` (at least ten characters). On a dedicated development database:

```bash
pnpm --filter @workspace/api-server run seed
```

New account passwords are randomly generated and printed once, are not checked into the project and require a first-sign-in change. Existing credentials are not reset. Both sample clinics retain useful setup/scheduling data; Phase 4 adds labelled synthetic inventory receipts and a future waiting example when an appropriate booking exists. It never fabricates actual service consumption. Phase 5 uses these same records for help/tools; it does not seed fake AI conversations or generated answers.

## Verify before release

Offline checks run executable pure code, simulated provider HTTP contracts and explicitly labelled source assertions—not a live server/database/provider/browser:

```bash
node scripts/checks/phase2-offline.mjs
node scripts/checks/phase3-offline.mjs
node scripts/checks/phase4-offline.mjs
node scripts/checks/phase5-offline.mjs
```

When TypeScript is only globally installed, the scripts accept `TYPESCRIPT_PATH="$(npm root -g)/typescript"`. Actual editing-run counts and limitations are in `verification/phase5/summary.json`; do not substitute syntax parsing for full workspace typechecking.

On a correctly migrated **disposable** PostgreSQL database with all dependencies installed, set `TEST_DATABASE_DISPOSABLE=1` and run:

```bash
bash scripts/checks/verify-phase5.sh
```

This runs full workspace typecheck, all four offline suites, all API tests and both builds, stopping on failure. It does not migrate automatically, restart workflows, run a live provider call or certify browser acceptance. New assistant API tests cover permissions/tenant scope, disabled-provider behavior, consent, no mutation endpoints, audit redaction and permission/data changes during stubbed provider latency. These are written for real PostgreSQL but have not run here.

Restart both workflows and follow `BROWSER_ACCEPTANCE_PHASE5.md` for the real manager/doctor EN/AR desktop/390px runner, then run the retained Phase 3/4 browser runners and setup checks. Synthetic fixtures remain in the disposable database. No live screenshots or successful runtime results are invented. `assistant:smoke` is separate, explicitly opt-in and potentially paid; it uses fixed synthetic data and was not run here.

## Source map

| Area | Location |
|---|---|
| AI interface/config/disabled/OpenAI adapter | `artifacts/api-server/src/ai/` |
| Local help, pure rules, strict inputs, formatting/budget | API `src/domain/assistant-*` |
| Minimal scoped facts, authorization, audit, provider orchestration | API `src/services/assistant*.ts` |
| HTTP wiring | API `src/routes/assistant.ts`, `src/routes/index.ts` |
| Bilingual help/tools and app-shell entry | Web `src/components/assistant/`, `src/components/app-shell.tsx`, EN/AR dictionaries |
| One-use booking selection handoff | Web `src/lib/assistant-booking-context.ts`, `src/pages/clinic/booking-page.tsx` |
| API tests / optional synthetic live smoke | API `src/test/assistant.test.ts`, `src/scripts/verify-assistant-provider.ts` |
| Offline and real-browser acceptance | `scripts/checks/phase5-*`, `scripts/checks/verify-phase5.sh` |
| Evidence, file diff and next steps | `verification/phase5/`, `PHASE5_HANDOFF.md` |
