# JorMall staff app — Phase 5 continuation

Status: **source candidate, not runtime-verified**. User authorized continuation after the Phase 4 ZIP. Phase 5 is the optional assistant from the supplied prompt, and the last specified phase. Earlier acceptance gaps remain open. Do not rebuild completed modules or add an unrequested Phase 6.

## Read first

Read `JORMALL_REPLIT_SPEC.md`, `CODEX_PROMPT_PHASES_2-5.md`, `README.md`, `PHASE5_HANDOFF.md`, `docs/ASSISTANT_PHASE5.md`, and `lib/db/migrations/README.md`. Prior documentation is archived in `docs/phase4/`; Phase 2–4 handoffs/evidence are kept intact.

## Architecture to preserve

pnpm monorepo, Node 24 in Replit, Express 5 API on port 5000 under `/api`, React 19/Vite web on port 19880, PostgreSQL/Drizzle, sessions and server-controlled navigation. Rules live in API `src/domain`, database work in `src/services`, HTTP/Zod in `src/routes`. Clinic and permission decisions are server-side. Existing generated API clients are not being used for these modules; keep the fetch wrapper, no OpenAPI/orval regeneration. No dependency or pnpm lockfile change was required.

Keep English/Arabic dictionaries and RTL; all user-entered names retain author-selected language/direction. Preserve labels, keyboard focus, data test IDs, one Create appointment action per page, real API data and honest unavailable/error states. Doctor/provider assignment limits and sensitive-note permissions remain unchanged.

## Phase 5

`src/ai/` has a provider interface, default-disabled adapter and an optional OpenAI Responses adapter. Environment flags/secrets/model are required; no model or live integration is assumed. The local FAQ is always available to signed-in, password-complete users, and the four local operational tools are individually permission-checked. The assistant has no mutation/send endpoint and the provider has no database/tools. Staff confirm changes in the existing normal screens, not in model text. Reply drafts are unsent; no communication transport was added.

Provider packets exclude names, IDs, contacts, free-text notes and clinical data. Only limited operational facts are sent after explicit consent. They are not claimed anonymous. Network calls run outside the clinic transaction. Fresh user/permissions, assignment, flags and record/version facts are rechecked afterward; stale output is discarded. Audit records contain metadata and usage/failure categories, not chat or provider bodies. `store:false` is not a zero-retention guarantee. See the guide before enabling.

Panel help/tools are ephemeral and role-aware. Slot-search branch/service/employee/date can transfer to the normal wizard through a short-lived, one-use, user/clinic-bound memory hint. The wizard still selects a valid slot and requires final staff confirmation. Keep this small integration; do not create a parallel booking engine.

## Retained Phase 4 rules

Replacement booking is explicit staff confirmation, never automatic. Inventory is derived from append-only movements, uses exact thousandths and fixed units/branches, and actual consumption is linked once to completed appointments. Missing actual reporting is not zero. Do not disable SQL guards for cleanup. Keep the existing shared operations lock, scheduling availability and history services.

## Environment and migration

Set DATABASE_URL and SESSION_SECRET in secrets; scripts do not load `.env` automatically. Install with `pnpm install --frozen-lockfile`. Paid AI is off by default; `.env.assistant.example` is only a safe template. Enablement/model choices need explicit administrator setup/testing. Never put provider secrets into VITE_ variables.

There is no Phase 5 schema migration. Four inherited migrations are hand-authored and generated snapshots/real-DB validation remain pending. Read the migration guide, back up, and test both an empty fresh install and an appropriate upgrade route. Never replay baseline migrations on a push-managed live DB or erase applied history. The API checks scheduling/inventory guards at startup; the dev push wrapper installs both.

## Validation and stopping point

Read `verification/phase5/summary.json` for actual passed/blocked checks. On a dedicated migrated disposable database set TEST_DATABASE_DISPOSABLE=1, then run `bash scripts/checks/verify-phase5.sh`. All API tests run against PostgreSQL; the new provider HTTP cases are explicitly stubbed, not live integration tests. Fixtures are synthetic and may be retained/deactivated; never run against production.

Restart both workflows, then run the new `scripts/checks/phase5-browser.mjs` following `BROWSER_ACCEPTANCE_PHASE5.md`, plus the retained Phase 3/4 browser runners and setup acceptance. New automation covers manager/doctor local help and read tools in EN/AR at desktop/390px, modal focus, no assistant writes and existing-selection handoff. An optional `assistant:smoke` command sends one synthetic request only with explicit opt-in; it may cost money and is not part of normal validation.

No full workspace typecheck/build, PostgreSQL/API suite, migration, running-app browser check or live provider request passed in the editing environment. Preserve that distinction. Report files/results/next step in at most eight lines. Next step is environment-backed release acceptance, not another feature phase.
