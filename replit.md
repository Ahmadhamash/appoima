> **Historical setup notes. For the current service-wizard update and migration 0005, use the root `CLINIC_WIZARD_README.md`. Earlier test/build claims below are not current verification.**

# JorMall — manager voice onboarding continuation

Read `README.md`, `docs/concierge/SETUP.md`, `VOICE_ONBOARDING_HANDOFF.md`, the original `JORMALL_REPLIT_SPEC.md` / `CODEX_PROMPT_PHASES_2-5.md`, and `lib/db/migrations/README.md`. The user explicitly requested this addition after Phase 5; do not replace the existing app with a demo or an image.

## Runtime

Keep the pnpm monorepo, Node 24/Replit, Express 5 at port 5000 under `/api`, React 19/Vite at port 19880, PostgreSQL/Drizzle, existing session/forced-password-change/role navigation. Install `pnpm install --frozen-lockfile`. Provider env variables are server-only; see `.env.concierge.example`. The root `.env` is not implicitly loaded. Never use VITE_ secrets. `node scripts/concierge-preflight.mjs` prints presence, not values, and does not test a connection.

Run separately:

```bash
PORT=5000 pnpm --filter @workspace/api-server run dev
PORT=19880 BASE_PATH=/ pnpm --filter @workspace/jormall run dev
```

Keep same-origin `/api` proxy. Real microphone use requires HTTPS/localhost and permission. Autoplay may require the displayed sound-enable button. No credentials are included. Choose a licensed Jordanian female ElevenLabs voice ID; dialect quality is unverified until tested.

## New feature boundary

`components/concierge/manager-concierge.tsx` mounts the production `ConciergeView` through the existing AppShell, only for managers with settings.manage. The native modal blocks background interaction. Liquid canvas orb, one-step name capture, progressively shown choices/consent/upload/review, reduced-motion support, Arabic/English, desktop/mobile. No sidebar card; no fake successful file read. The actual UI is also exercised separately by component tests without rebuilding React.

The API uses `domain/concierge-core.ts` closed draft schema, `concierge/providers.ts` fixed provider endpoints, `services/concierge.ts` revision/lease/consent/budgets, `services/concierge-setup.ts` validated atomic writes, `routes/concierge.ts` authenticated scoped HTTP, and a durable `manager_onboarding` table. Recheck fresh permissions after provider latency. No network inside the setup transaction. Provider output proposes data, not arbitrary tool commands or SQL. Staff password inputs are not model data; hash through existing createStaffAccount.

Existing branch edits require version/fingerprint checks. New services/rooms/staff resolve references in the same clinic. Keep permission ceilings, cross-clinic protection, confirmed apply, idempotent retries and redacted audits. Retain the old Staff help untouched for its narrower read-only appointment assistance. It is not made a write-capable agent by this feature. No auto-booking, auto-stock deduction, messaging transport or clinical advice.

## Migration

This delivery adds hand-authored `0004_manager_voice_concierge.sql`. Empty DB applies 0000–0004; a matching migrated Phase 5 DB applies only 0004. Push-managed databases require deliberate reconciliation, not replayed baseline migrations. Back up and verify copies first. Do not use push-force or remove applied journals/snapshots. Existing scheduling and inventory guards remain authoritative. Dev `@workspace/db run push` installs both custom guard sets.

The frozen concierge schema is included for a five-snapshot chain. Generator is not executed here and intentionally rejects partial chains. Do not delete existing snapshots just to make the helper continue. No production migration acceptance is implied.

## Actual verification / release gate

See `verification/concierge/summary.json`. Retained 331 checks; new 78 (59 pure, 13 simulated HTTP, 6 source); 33 actual Chromium component checks with synthetic API transport. Dependency-free UI/core/provider strict TypeScript passed. WebGL was unavailable, so Canvas2D animation was tested instead. The component browser fixture is not a production server, not real PostgreSQL and not the full React application.

24 PostgreSQL/Express tests were added but not run. Full dependencies, pnpm and PostgreSQL were unavailable. No live ElevenLabs/Soniox/OpenAI calls, real microphone test, full build, migrations or application-level acceptance passed here. Historical evidence is preserved and must not be re-labelled as current runtime validation.

With installed dependencies, a migrated disposable database, DATABASE_URL, SESSION_SECRET and TEST_DATABASE_DISPOSABLE=1: run `bash scripts/checks/verify-concierge.sh`. Then perform the real authenticated browser/provider acceptance in `docs/concierge/SETUP.md`, plus retained scheduling/waiting/inventory checks. Resolve failures before release. Provider calls may cost money; synthetic offline tests do not use real providers.
