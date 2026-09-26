# JorMall — Clinic Service Setup Wizard

**Start here: [دليل التشغيل والتحديث بالعربي](CLINIC_WIZARD_README.md).**

This delivery modifies the original appointment application. The existing manager orb is retained; the new service-only wizard shares one revisioned draft across manual, text, voice and public-link inputs. It uses a bounded medical-service definition, safe templates, live speculative previews, explicit publication, and actual appointment intake validation/snapshots. Core sections and existing operational records are retained.

## Current verification

47 focused checks passed: 24 shared/domain/stream/provider-adapter checks, 16 real-component Chromium checks with synthetic HTTP, and 7 API-schema checks. Syntax checks and strict checks of the provider-independent roots also passed. **A full workspace install/build, live PostgreSQL migration/auth integration, and live OpenAI/voice acceptance were not completed here.** Dependency installation was blocked by registry DNS. See `verification/service-wizard/` and the Arabic guide for exact scope.

## Upgrade

Keep your existing database/session secrets. Review the migration history on a backed-up DB copy, add server-side settings from `.env.concierge.example`, install with `pnpm install --frozen-lockfile`, apply `0005_clinic_service_wizard.sql` via the existing migration workflow, then run the project typecheck/build and API/web workflows. The Arabic guide contains commands and the push-managed database warning.

Old `dist` and TypeScript build caches were omitted so the previous application is not mistaken for this update. Build from source. The flat `JorMall-Clinic-Staff-App` folder is preserved only as an original historical reference; the runnable workspace is the root `artifacts/` + `lib/` tree.

## Historical reference

[Previous manager-voice README](docs/concierge/PREVIOUS_README.md), `VOICE_ONBOARDING_HANDOFF.md`, earlier phase documentation and their verification reports are retained. Their build/test counts are historical, not evidence of the current update. Original features include clinic/room/staff/customer management, scoped permissions, appointment availability and history, waiting-list decisions, inventory transactions and the separate staff assistant.
