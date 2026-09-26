# Setup and safe upgrade

This project extends the existing pnpm workspace; do not run a reference folder or create a second app.
Commands below use Bash (Linux/macOS, or Git Bash/WSL on Windows). Existing workspace lifecycle scripts
use `sh`/`export`, so plain Windows cmd is not sufficient for every script.

## 1. Prerequisites and configuration

Use Node 22 with pnpm 10, network access to the package registry, and a PostgreSQL database that can
install the existing `btree_gist` extension. Dependency installation and database behavior were not
verified in the editing container; run the gates below on a disposable environment first.

```bash
corepack enable
corepack prepare pnpm@10 --activate
pnpm install --frozen-lockfile
```

For an existing deployment, preserve its database, session secret, user accounts and tenant records.
For a NEW local environment, copy `.env.example` to `.env`, fill `DATABASE_URL`, and generate a session
secret locally with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
Use the generated value only in your local secret store. Do not commit it or send it to a browser.

The source does not auto-load root `.env`. Load only a local file you trust:

```bash
set -a
. ./.env
set +a
```

The provider-free path needs `CONCIERGE_ENABLED=true`. Keep both `OPENAI_API_KEY` and
`JORMALL_OPENAI_API_KEY` empty. Public URL reads additionally need outbound DNS and HTTPS, but no AI key.

## 2. Preserve and upgrade the database

Back up first; validate on a separate copy. Read `lib/db/migrations/README.md` before running anything.
The additive `0006_internal_clinic_workspace.sql` creates `clinic_workspaces`; it does not rewrite
patients, appointments, services or clinics. Migration 0000–0005 SQL files are unchanged.

```bash
# ONLY after comparing the copied database's existing journal and schema:
pnpm --filter @workspace/db run migrate
```

An empty disposable database receives 0000–0006. An installation with exact recorded migrations
0000–0005 should receive only 0006. A push-managed or divergent database needs deliberate schema/history
reconciliation. Do not reset a populated database, erase Drizzle metadata, replay a baseline, or use
`push-force`. Migration generation/snapshots and SQL execution remain release gates, not completed tests.

## 3. Build and run the existing application

```bash
pnpm typecheck
pnpm build
```

Terminal A, with server environment loaded:

```bash
PORT=5000 NODE_ENV=development pnpm --filter @workspace/api-server run start
```

Terminal B, from the same workspace root:

```bash
PORT=19880 pnpm --filter @workspace/jormall run dev
```

Open `http://localhost:19880`. Vite's existing development `/api` proxy targets port 5000 when not on
Replit. Do not set `REPL_ID` for this local setup. The server retains startup verification of scheduling
and inventory guards; an unprepared database should fail visibly rather than bypass protections.

For a new database, use the existing platform-owner initial setup, create the clinic and manager,
and complete mandatory password changes. Existing installations should use existing accounts.
`pnpm --filter @workspace/api-server run seed` is optional development-only fixture provisioning;
do not seed a real clinic. No sample account passwords are included in this archive.

Production needs HTTPS and a same-origin reverse proxy: serve the SPA build from
`artifacts/jormall/dist/public`, use history fallback to `index.html`, and forward `/api` to the running
API (port 5000). Do not buffer `/api/concierge/turn-stream`. The API does not serve the SPA itself;
`vite preview` alone is not a configured production backend proxy. Preserve secure cookies and the
existing trusted-proxy boundary. Microphone access requires a secure origin or localhost.

## 4. Complete the provider-free workflow

Sign in as the clinic manager with `settings.manage` and the relevant service permissions. Open the
existing orb or **Customize clinic / تخصيص العيادة**. The three entry cards remain manual, voice, links.

Choose manual. Edit clinic names/subtitles/contact/colors and upload a PNG/JPEG/WebP logo (up to 90 KB).
The private preview supports Arabic/English and desktop/mobile. Source/suggested values are labeled.
Save edits to the setup draft; that does not yet replace the active clinic identity.

Add only the services actually provided. Choose a known structure or a custom definition; explicitly
supply name, scope, duration, price/currency, branch, room/staff needs and intake questions where required.
Confirm the medical scope. Unimplemented requested capabilities block completion rather than masquerade
as working features. Branches, staff, rooms and working hours are managed in their existing sections;
this service wizard does not silently create them.

Text continuation is available without a provider. It is intentionally deterministic, not a general AI:

```text
service: Men's beard laser only
clinic name: Your clinic's actual name
اسم العيادة: اسم عيادتك الحقيقي
phone: +962790000000
```

The phone above is only an example; do not import it as a fact. Answer focused missing-field questions,
or use labels `duration:`, `price:`, `currency:`, `room:` and `scope: all branches`. Arabic digits and
corresponding Arabic labels are supported. Complex speech/prose should be completed in the manual
structured editor or with a configured provider. Arbitrary prose is not parsed as a completed service name.

For links, submit exact HTTPS public clinic URLs. The server reads supported structured metadata,
asks you to confirm clinic identity, then offers individual facts/services for explicit acceptance.
It does not infer treatment availability from generic page prose. Missing data, blocked/social pages,
ambiguous business directories and cross-host redirects require manual correction. Service names from
sources do not acquire invented price/duration/staff details.

Review and **Save clinic setup / حفظ إعداد العيادة**. This applies changes within the private system;
there is no public website or publishing step. Reopen later to edit. A concurrent manager's newer
identity causes a conflict; explicitly reload the active identity and reconcile edits instead of
overwriting it. Saved service drafts are retained during that recovery.

Use the existing **Book appointment** path (`/appointments/new`), branch timezone, real availability,
required intake and scheduling protections. Clinic personalization does not bypass login, patient
privacy or booking permissions, and does not add anonymous patient booking.

## 5. Optional voice/provider path

Configure a valid server-side `OPENAI_API_KEY` (or the existing `JORMALL_OPENAI_API_KEY` override), funded
API access and models available to that project. Existing model settings remain configurable via
`.env.concierge.example`. A subscription to a chat client does not configure server credentials here.
Allow outbound HTTPS to the provider, browser microphone permission and WebRTC connectivity. The owner
must accept cloud consent before voice/cloud processing. The existing orb, realtime transport and
text fallback are retained. Soniox is optional. No live provider, audio quality or account entitlement
was validated in this container.

## 6. Release gates

```bash
pnpm typecheck
pnpm build
# Point DATABASE_URL at a migrated DISPOSABLE database, never an operational clinic.
TEST_DATABASE_DISPOSABLE=1 pnpm --filter @workspace/api-server exec vitest run src/test/internal-workspace.test.ts
TEST_DATABASE_DISPOSABLE=1 pnpm --filter @workspace/api-server run test
```

The newly added `internal-workspace.test.ts` uses real Express/PostgreSQL, covers confirmation races,
tenant isolation, stale managers and authenticated local continuation, and is **not yet executed**.
Historical concierge fixtures explicitly select their retained legacy full-setup path rather than
assuming it is the new default. Do not disable immutable database guards for test cleanup. Fixtures
are synthetic; dispose of the test database through normal administration.

Finally run the full app in AR/EN at desktop and narrow mobile sizes, perform a real booking, retry the
same command, attempt a competing booking, omit a required intake answer, and verify staff/tenant access.
`VERIFICATION.md` distinguishes the checks already executed from these remaining deployment gates.
