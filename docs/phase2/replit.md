# JorMall

Internal staff application for beauty and wellness clinics. Product specification: `JORMALL_REPLIT_SPEC.md`. The supplied foundation was Phase 1. **Phase 2 implementation candidate is now present; full typecheck, real-database/API and browser acceptance remain pending. Phase 3 has not been started.** Do not interpret this document as a passing test report.

## Run and verify

Use Node 24 and the existing pnpm lockfile. Required environment secrets: `DATABASE_URL` and `SESSION_SECRET`. Install with `pnpm install --frozen-lockfile`.

- API workflow: `pnpm --filter @workspace/api-server run dev`, port 5000 under `/api`.
- Web workflow: `pnpm --filter @workspace/jormall run dev`, Vite port 19880 and base `/` by default.
- Replit routes `/api` as before. Outside Replit, Vite has a local `/api` proxy to port 5000.
- Development schema: `pnpm --filter @workspace/db run push`.
- Fresh deployment: `pnpm --filter @workspace/db run migrate`. For an existing push-managed Phase 1 database, read the separate adoption flow in `README.md` **before** pushing Phase 2.
- `pnpm --filter @workspace/db run prepare-snapshots` generates missing Drizzle snapshots from frozen schema baselines. This generation was not possible in the editing container. Shipped SQL is hand-authored and requires live verification.
- `pnpm run typecheck`; `pnpm --filter @workspace/api-server run test` (real disposable DB); `bash scripts/checks/verify-phase2.sh`.
- `pnpm --filter @workspace/api-server run seed` fills both sample clinics. Only newly generated passwords are printed, once.

Restart both workflows after changes, then complete `BROWSER_ACCEPTANCE.md` in EN/AR, desktop and 390px. Exact verification evidence is under `verification/`; unresolved limitations are in `PHASE2_HANDOFF.md`.

## Stack and structure

Keep pnpm/TypeScript, Express 5 + PostgreSQL session store + bcryptjs + Zod, PostgreSQL/Drizzle, React 19/Vite/wouter/react-query/Tailwind/shadcn. No new package dependencies were added.

- `lib/db/src/schema/`: Phase 1 tables plus services, rooms, customers, service-employees and room-services; composite tenant references; staff schedules/name language.
- `src/domain/permissions.ts`: original role presets, `hasPermission`, server-defined home and navigation.
- API `src/domain/setup-rules.ts` / `setup-validation.ts`: pure rules and strict request validation.
- API `src/services/setup.ts`: scoped DB access, transaction locks, reference validation, audit and staff protection.
- API `src/routes/setup.ts`: `/api/clinic/*` endpoints. Existing auth/owner routes remain.
- Web `src/lib/{setup-api,branch-time}.ts`, `components/setup/`, `pages/clinic/setup-page.tsx`: Phase 2 forms/lists/details and local-time conversion.
- EN/AR dictionaries remain the only UI translation source. Record names retain `nameLang` and matching `dir`/`lang`.
- No OpenAPI/orval codegen, external fonts or heavy animation. Existing fetch wrapper and react-query remain.

## Phase 2 behavior

Managers and matching permission holders manage branches/hours, services, rooms, staff access/schedules, and customers. The staff wizard is Role → Person/login → Access review. Manage grants include read; managers cannot grant permissions they lack, take over stronger accounts, or create platform owners. Password resets force a change and revoke sessions. Sensitive customer notes require `customers.manage` and are omitted from other responses.

Manager checklist comes from real records; the first-booking step stays incomplete until Phase 3. Secretary/doctor homes have no manager setup controls. Service actual consumption and customer appointment history are explicitly unavailable, not fabricated. Appointments, waiting list, inventory and assistant are not implemented.

## Rules to preserve

Every clinic route uses the authenticated server user; never trust a client clinic ID. Rules live in domain, DB operations in services, validation/HTTP in routes. Server returns error codes and the client translates them. Every new UI string needs both languages. Initial passwords are hashed and never returned. Data-testid selectors accompany interactive controls. Avoid self-admin account edits through staff management.

## Acceptance state and user preference

Only dependency-free syntax/business-rule checks were executed in the editing container. No pnpm/app dependencies or PostgreSQL were available, and registry DNS failed. Do not claim migrations, API tests or the browser workflow passed. Run the complete checklist on provisioned infrastructure, fix defects, report in at most eight lines, and stop before Phase 3 until explicitly authorized.
