# Post-Phase G Runbook

## Local validation

Use a standard Node runtime. The scripts rely only on Node built-ins and repository JSON inputs.

```powershell
node --check scripts/build-post-phase-g-user-facing-scholarship-mvp.mjs
node --check scripts/validate-post-phase-g-user-facing-scholarship-mvp.mjs
node scripts/validate-post-phase-g-user-facing-scholarship-mvp.mjs
```

Expected result: `Post-Phase G validation PASS`, two public items, eleven hidden items, zero failed exposure scenarios, deterministic output, and no DB/Supabase access.

## Build verification closure

The verified G environment passed `npm ci`, the Next production build, `npx tsc --noEmit`, and changed-file ESLint. The `@next/env`, `sharp`, and `unrs-resolver` bootstrap risk is resolved for that environment.

The build warning for an absent `public.site_settings` schema-cache entry is non-blocking and deferred to Post-Phase J. Its next work unit is **Schema alignment and site settings migration planning**. Do not create or apply a migration as part of G.

## Safety boundary

- Do not treat the report as complete source coverage or an absence statement.
- Do not expose blocked, unresolved, duplicate-risk, review-required, or quality-risk candidates.
- Do not imply that attachment downloads or contents are verified.
- Do not add persistence, guarded apply, schema migrations, or crawler execution under this phase.

## Handoff

The next owner should review `reports/post-phase-master-risk-register.json` before starting a later phase. Risks for source coverage and keyword evidence are assigned to H; complex attachment parsing is assigned to I; schema alignment, review persistence, and guarded production apply are assigned to J.
