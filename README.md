# JorMall — internal clinic workspace

## Binding scope for this delivery

**Personalization is inside the existing, authenticated appointment system.**
The latest Arabic correction supersedes the public-website paragraphs in the uploaded prompt.
This delivery does **not** introduce a public clinic site, anonymous booking, domains, or publication.
“Save clinic setup” applies reviewed identity/services to the existing private application; it is not publishing.
The existing appointments, people, business, staff, rooms, inventory and permissions remain in place.

## Start here

- `SETUP_GUIDE.md`: installation, safe migration, server/frontend startup and the provider-free path.
- `INTERNAL_WORKSPACE_DELIVERY.md`: implementation, boundaries, API additions and limitations.
- `VERIFICATION.md`: precise executed results and unexecuted release gates.
- `CHANGE_SUMMARY.md`: changed-file inventory and preservation checks.
- `PROMPT_FOR_CHATGPT_PRO.md` / `HANDOFF_PROMPT.md`: corrected direction for further work.

## Implemented in the existing workspace

Persistent per-clinic identity; private bilingual desktop/mobile preview; owner-editable names,
contact details, subtitles, raster logo and colors; scoped application branding; service-driven internal
home sections; shared revisioned setup across manual, local text, provider voice and explicit public links.
Public-source facts remain opt-in with provenance. Custom services retain the existing typed definition,
room/staff/branch choices and intake integration. Missing fields are not fabricated.

New database migration: `lib/db/migrations/0006_internal_clinic_workspace.sql`.
Earlier SQL migrations and the dependency lockfile are unchanged. There are no new package dependencies.

## Verification status — read before deployment

Executed: 30 provider-free application-service/contract tests, 22 production-component browser checks,
24 existing service tests, 90 existing scheduling/rule checks, and strict TypeScript over 12 selected
entry roots plus their local imports. Browser screenshots use synthetic fixtures and actual components.

**Not executed:** full pnpm install/typecheck/build, real PostgreSQL migrations/HTTP integration,
real booking concurrency, live source requests or live voice/provider sessions. The container could not
resolve the package registry, pnpm was unavailable and PostgreSQL was absent. This is updated source,
not a claim of a successfully deployed or fully end-to-end verified installation. Exact logs and gates
are in `VERIFICATION.md`.

Historical phase reports and screenshots elsewhere in this archive describe prior deliveries; they
are not current proof of execution. Original root README/handoff are retained under `docs/historical/`.
