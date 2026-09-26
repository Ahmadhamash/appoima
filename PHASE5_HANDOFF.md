# JorMall — Phase 5 handoff

**Delivery:** source implementation candidate, not a verified release. Continues the supplied Phase 4 archive and implements the optional assistant from the attached Phases 2–5 prompt. No later feature phase was started. Release acceptance is the next step.

## Added

Bilingual English/Arabic **Staff help** is available in the desktop sidebar and mobile header. It includes local role-aware guided answers with no AI account, a chat-style help pane, accessible modal controls and short-lived in-memory conversation state. It does not expose manager workflows to a doctor without those permissions.

Four allowlisted, server-validated read tools cover available-time suggestions, permitted appointment summaries, unsent reply drafts and existing waiting-suggestion explanations. Each request refreshes authorization, tenant scope and relevant assignment. Summary queries omit notes and contact/clinical fields. The open appointment is reused; branch/service/employee/date from a slot search can transfer to the normal wizard without re-entering those choices. No slot is reserved or booking submitted by this transfer.

`src/ai/` contains an interface, a default-disabled provider and an optional bounded OpenAI Responses adapter. Actual enablement needs environment flags, a server secret, a configured available model and explicit staff consent per request. No model is assumed, no secret is included, and no live integration is claimed. The optional model only rewrites a minimal server-built operational packet; it has no database/tool access. Plain-text output requires review, and permissions/data are rechecked after network latency before any generated result is returned.

The assistant cannot book, cancel, reschedule, record stock or send messages. Staff continue through existing explicit confirmation screens, including **Confirm replacement**. Reply drafts remain unsent; no messaging transport was added. Successful/failed assistant operations are audited with metadata, not chat/clinical/provider bodies.

## Verification actually completed

| Check | Actual result |
|---|---|
| Retained Phase 2 offline suite | 36 passed |
| Retained Phase 3 offline suite | 90 passed |
| Retained Phase 4 offline suite | 93 passed |
| New Phase 5 offline suite | 112 passed: 92 pure checks, 11 stubbed HTTP contracts, 9 source assertions |
| Total offline checks | **331 passed**; not real database/browser/live-provider acceptance |
| TypeScript/TSX syntax | **265** active source files parsed, no syntax diagnostics |
| Strict dependency-free TypeScript | Passed; 17 explicit entry files plus imports, excludes dependency-bearing API/database/React application |
| JavaScript / shell / JSON syntax | 12 JavaScript, 5 shell and 21 JSON files passed preflight |
| New database/API test cases | **37 written, not executed**; provider HTTP is explicitly stubbed in those tests |
| Browser acceptance runner | Added for real EN/AR manager/doctor desktop and 390px workflows; syntax checked only, not run |
| Optional live provider smoke | Added; **not run**, explicitly opt-in and potentially paid |

Actual command logs are in `verification/phase5/`. Full workspace typecheck, all PostgreSQL/API tests and builds were attempted but could not start because pnpm was absent; project dependencies/PostgreSQL were unavailable and the package registry failed DNS resolution. API/web workflows were not running, so no real-browser test or screenshot is supplied. These restrictions do not certify that the unexecuted checks would pass.

## Files and preserved scope

New API modules are `domain/assistant-*`, `services/assistant.ts`, `services/assistant-context.ts`, `routes/assistant.ts`, `ai/*`, `test/assistant.test.ts` and the synthetic provider smoke script. Web changes add the assistant panel/tools, mirrored API types, the one-use booking-context helper, a small app-shell/booking-page integration and EN/AR strings. Documentation and acceptance scripts are included; current README/replit instructions are updated. Prior README/replit are archived in `docs/phase4/`.

The pnpm lockfile and dependency declarations, DB schema, four versioned migrations/journal, SQL guard definitions, seed, prior API tests and scheduling/inventory business services are retained unchanged. No file was removed from the Phase 4 baseline. One obsolete Phase 4 offline stopping assertion was updated from “no AI module exists” to “the assistant is opt-in,” because this continuation explicitly authorizes Phase 5; its substantive business-rule checks remain unchanged. See the hash-based change manifest.

## Database caution — inherited, not newly solved

**There is no Phase 5 schema migration.** A genuinely migrated Phase 4 database needs no additional table/column change for this assistant. However, all four inherited SQL migrations remain hand-authored; Drizzle snapshot generation and verification of both fresh-install/upgrade paths are still pending. Read `lib/db/migrations/README.md` before any DB command. Do not replay a baseline onto a push-managed database, erase migration journals/snapshots or disable append-only guards. Validate on backed-up disposable copies, never directly on production.

## Acceptance sequence

1. Open the archive in the supplied Node 24/Replit-compatible environment and install `pnpm install --frozen-lockfile`. Configure a dedicated disposable `DATABASE_URL` and random `SESSION_SECRET`; choose and validate the documented migration/upgrade path. Keep the optional provider disabled.
2. Set `TEST_DATABASE_DISPOSABLE=1`, then run `bash scripts/checks/verify-phase5.sh`. This must pass full typecheck, all API suites and builds, not only the offline scripts. Resolve every failure before release.
3. Restart API and web using README instructions. Run `scripts/checks/phase5-browser.mjs` as documented in `BROWSER_ACCEPTANCE_PHASE5.md`, with environment-only synthetic credentials and `E2E_ALLOW_WRITE=1`. Also run the retained Phase 3/4 browser runners and prior setup acceptance. Test records/ledgers remain in the disposable database.
4. Optional AI is a separate administrator decision. Read `docs/ASSISTANT_PHASE5.md`, configure an available Responses-compatible model and server secret, review privacy/budget controls, and explicitly authorize the synthetic `assistant:smoke` request. It may incur a charge. Then test consent, review warnings and failure fallback with synthetic UI data in both languages. No real customer data is needed for a connection check.

The sample `.env.assistant.example` is not automatically loaded. Never place API keys in browser/VITE variables or source files. A configured flag is not a verified live connection, and `store:false` is not a guarantee of zero provider retention. In-memory limits reset on restart and are per process, not a distributed or monetary billing cap.

**Stopping point:** all five requested phases now have source implementations in the project. The database/browser definition of done is still pending; the next work is full environment-backed acceptance, not an unrequested new feature phase.
