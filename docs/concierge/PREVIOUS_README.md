# JorMall — manager voice onboarding

Continues the supplied **Phase 5 project**, implementing the manager's newly requested central, animated voice concierge. This is code integrated into the actual application, not a mockup image or replacement app. Existing modules and the old read-only Staff help remain in place.

**Start here: [دليل التشغيل بالعربي](docs/concierge/SETUP.md) · [Delivery handoff](VOICE_ONBOARDING_HANDOFF.md).** Add the server settings from `.env.concierge.example`, validate migration 0004 on a database copy, then run the normal API/web workflows below. `node scripts/concierge-preflight.mjs` checks presence only, without exposing secrets or making provider requests.

## What changed

A manager-only native full-screen dialog obscures the app while a blue/white liquid orb floats in the center. The name field appears only in its step and disappears after acceptance. Manual/text/voice choices, quiet-place advice, cloud consent, contextual upload, editable review and confirmed save appear progressively. Canvas2D is a genuinely animated fallback when WebGL is unavailable; no image assets or external fonts are required.

OpenAI Realtime over WebRTC now handles the live spoken conversation; OpenAI TTS handles fixed prompts, and OpenAI Responses prepares structured setup drafts. The default voice is `marin`, guided toward Jordanian colloquial Arabic; a native Jordanian accent is not guaranteed. Real end-to-end microphone acceptance is still required. The cloud director can propose drafts only; authenticated server validation and explicit review control actual branch/service/room/staff writes. It cannot send messages, book/cancel appointments or deduct stock. Initial staff passwords are entered separately at confirmation and never sent to the model.

**Current verification:** the API and web production builds pass, the web TypeScript check passes, and 79 concierge offline checks pass. API TypeScript still reports two existing cast errors in setup validation and a scheduling test. The live microphone/WebRTC provider flow has not been exercised, so this is not a certified production release. Earlier evidence in `verification/concierge/summary.json` predates the OpenAI Realtime switch.

New source: API `src/{concierge,domain/concierge-core.ts,services/concierge*.ts,routes/concierge.ts}`, web `src/components/concierge/`, DB `src/schema/concierge.ts` and migration 0004. No new application dependencies; lockfile unchanged. Historical Phase 5 README/replit are in `docs/phase5/`. The original product spec remains binding except where this explicitly requested manager onboarding adds its controlled setup writes and motion UI.

## Retained functionality

Phase 2: branches/hours/time zones; services and rooms; three-step staff accounts, permissions, schedules and initial-password resets; customers and protected notes; real-data manager checklist. Phase 3: UTC appointments, schedule/room availability, database overlap guards, booking wizard, daily/calendar/history views, status changes and rescheduling with preserved history. Phase 4: explicit waiting-list replacement confirmation, stale/declined offer handling and auditing; branch stock, append-only receipts/adjustments/consumption; one-time actual material reporting with transactional stock checks.

The detailed Phase 4 behavior and previous deployment notes remain in `docs/phase4/README.md` and `docs/phase4/replit.md`; prior handoffs/evidence are preserved. No SMS, WhatsApp, email transport, AI medical advice, unrestricted SQL agent, supplier/purchase-order module or automatic replacement booking has been added.

## Run the project

Use the supplied Node 24/Replit runtime and the unchanged pnpm lockfile. No application dependency was added. The editing environment used Node 22 only for dependency-free verification.

```bash
pnpm install --frozen-lockfile
```

Set `DATABASE_URL` and a long random `SESSION_SECRET` in environment secrets. Scripts do not implicitly load a root `.env`. Read `lib/db/migrations/README.md` **before** any schema command. This delivery adds `0004_manager_voice_concierge.sql` after the four inherited migrations. Select the appropriate migration history path before running it.

For an empty disposable database, after choosing that documented path:

```bash
pnpm --filter @workspace/db run migrate
```

For disposable push-based development, use the wrapper that installs scheduling **and** inventory guards:

```bash
pnpm --filter @workspace/db run push
```

Do not replay baseline migrations against a push-managed existing database, erase migration history, disable ledger guards or use force to dismiss discrepancies. All five SQL migrations are hand-authored; generated Drizzle snapshots and real-database verification remain pending. Back up and test an appropriate upgrade route on a separate database copy. API startup checks the required custom guards before listening.

Run API and web as separate workflows:

```bash
PORT=5000 pnpm --filter @workspace/api-server run dev
PORT=19880 BASE_PATH=/ pnpm --filter @workspace/jormall run dev
```

The web retains the existing `/api` proxy. For all paid generation to stay off, leave `AI_ASSISTANT_ENABLED` unset/false and do not configure the new concierge provider keys (or set `CONCIERGE_ENABLED=false`). Configuration details, limitations and the explicitly opt-in synthetic provider smoke command are in `docs/ASSISTANT_PHASE5.md`.

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
node scripts/checks/concierge-offline.mjs
```

When TypeScript is only globally installed, the scripts accept `TYPESCRIPT_PATH="$(npm root -g)/typescript"`. Current editing-run counts and limitations are in `verification/concierge/summary.json`; historical Phase 5 results are preserved; do not substitute syntax parsing for full workspace typechecking.

On a correctly migrated **disposable** PostgreSQL database with all dependencies installed, set `TEST_DATABASE_DISPOSABLE=1` and run:

```bash
bash scripts/checks/verify-concierge.sh
```

This runs full workspace typecheck, all five offline suites, all API tests and both builds, stopping on failure. It does not migrate automatically, restart workflows, run a live provider call or certify browser acceptance. New assistant API tests cover permissions/tenant scope, disabled-provider behavior, consent, no mutation endpoints, audit redaction and permission/data changes during stubbed provider latency. These are written for real PostgreSQL but have not run here.

Restart both workflows and follow `BROWSER_ACCEPTANCE_PHASE5.md` for the real manager/doctor EN/AR desktop/390px runner, then run the retained Phase 3/4 browser runners and setup checks. Synthetic fixtures remain in the disposable database. Current component-only Chromium screenshots with synthetic transport are in `verification/concierge/`; they are not full-application/real-database acceptance. `assistant:smoke` is separate, explicitly opt-in and potentially paid; it uses fixed synthetic data and was not run here.

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
