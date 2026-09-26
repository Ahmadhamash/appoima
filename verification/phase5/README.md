# Phase 5 editing evidence

This folder records what ran in the editing container, not a successful deployment. Current source passed 331 offline checks across Phases 2–5, syntax parsing of 265 TypeScript/TSX sources under artifacts/lib/scripts (including retained/generated sources), a strict dependency-free subset check, and syntax/JSON preflight. The earlier phase scripts parse narrower source sets; their lower per-suite syntax counts are not conflicting full-workspace counts.

Phase 5 adds 112 offline checks: 92 executable pure behavior checks, 11 explicitly stubbed HTTP contract checks, and nine labelled source assertions. Stubbed HTTP is not live OpenAI, and text/source assertions are not database security proofs. The 37 new PostgreSQL/API cases and the real-browser runner were written but not executed. Existing API suites remain part of release acceptance.

`command-results.json` and individual logs include actual attempts at workspace commands. They exited 127 because pnpm was missing. `environment.json` records only presence flags, versions and local port availability, never secret values. The registry probe failed DNS. No database migrations, app/workflow restart, live provider request or real-browser UI acceptance ran. Do not treat shell/JavaScript parsing or global TypeScript subset checks as substitutes.

`changes-from-phase4.json` lists source/documentation changes and protected-file digest comparisons; `source-sha256.json` inventories source/doc content outside the evidence folder. The archive inspection and SHA-256 are in the adjacent delivered packaging report, which is written after the ZIP exists to avoid a self-referential hash.

The only edited prior offline-suite assertion is the Phase 4 stopping check that previously required `src/ai` not to exist. After explicit Phase 5 authorization it now checks that the optional assistant remains opt-in. Prior substantive scheduling/inventory tests and all database files are unchanged. Historical evidence under the older folders is retained, not relabelled as a current runtime pass.
