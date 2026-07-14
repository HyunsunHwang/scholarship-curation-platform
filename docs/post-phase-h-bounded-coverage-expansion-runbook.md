# Post-Phase H Runbook

Run the fixture-only builder and validator:

```powershell
node --check scripts/build-post-phase-h-bounded-coverage-expansion.mjs
node --check scripts/validate-post-phase-h-bounded-coverage-expansion.mjs
node scripts/build-post-phase-h-bounded-coverage-expansion.mjs
node scripts/validate-post-phase-h-bounded-coverage-expansion.mjs
```

Expected result: four targets, zero attachment download attempts, no DB/Supabase access or writes, no crawler execution, no public exposure change, zero blocking risks, and zero unassigned resolution phases.

Do not run `scripts/crawl-scholarship-notices.mjs` as part of this phase. It remains the existing operational crawler and is listed in the reuse matrix only to document that H did not duplicate it.

For the application checks, use the installed Node runtime directly when `npm` is absent from PATH. The H baseline recorded seven pre-existing ESLint errors and five warnings outside H files; the two H scripts pass direct ESLint, TypeScript no-emit, and the production build.
