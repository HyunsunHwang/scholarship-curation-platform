# Post-Phase H Runbook

Run the fixture builder and validator:

```powershell
node --check scripts/build-post-phase-h-bounded-coverage-expansion.mjs
node --check scripts/validate-post-phase-h-bounded-coverage-expansion.mjs
node scripts/build-post-phase-h-bounded-coverage-expansion.mjs
node scripts/validate-post-phase-h-bounded-coverage-expansion.mjs
```

Expected result: four targets, zero attachment download attempts, no DB/Supabase access or writes, no crawler execution, no public exposure change, zero blocking risks, and zero unassigned resolution phases.

Run the live closure only with the bounded public-source runner:

```powershell
node --check scripts/run-post-phase-h-live-bounded-source-verification.mjs
node --check scripts/validate-post-phase-h-live-bounded-source-verification.mjs
node scripts/run-post-phase-h-live-bounded-source-verification.mjs
node scripts/validate-post-phase-h-live-bounded-source-verification.mjs
```

The runner uses the existing crawler fetch/list helpers and existing detail extractor, but does not execute the operational crawler workflow, write crawler state, or persist raw HTML. If a write-only finalization fails after observations are already saved, use `--from-existing-report`; it does not make network requests.

For the application checks, use the installed Node runtime directly when `npm` is absent from PATH. The H baseline recorded seven pre-existing ESLint errors and five warnings outside H files; the two H scripts pass direct ESLint, TypeScript no-emit, and the production build.
