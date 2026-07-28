# Non-Production L Sandbox Pilot

This is not a new Phase or Unit. It is the gated operational validation of Units 1–3
against the isolated `scholarship-curation-post-phase-l` project
(`hrayfvdggbhfmmzfblly`).

## Current gate result

The local Environment Gate stopped before any network or database connection. The explicit
target ref, non-production service-role credential, and Anthropic credential were not
available. The existing Supabase URL was not treated as an allowed fallback. Consequently,
no migration, DB smoke, or provider call was attempted.

The committed report contains only credential presence/absence, static inventory, model
identifiers, counters, and blockers. It contains no URL, key, connection string, notice
body, attachment text, or provider response.

## Runner

```bash
# Safe local preflight; never mutates the DB
npm run analysis:nonproduction-pilot -- --stage preflight

# Resume only after the exact target guard and migration transport are available
npm run analysis:nonproduction-pilot -- \
  --stage fixture-db-smoke \
  --allow-nonproduction-db-write

# Live gate requires all three explicit permissions and bounded limits
npm run analysis:nonproduction-pilot -- \
  --stage live-pilot \
  --limit 5 \
  --max-runs 10 \
  --max-escalations 5 \
  --pilot-budget-micros 500000 \
  --allow-nonproduction-db-write \
  --allow-db-queue \
  --allow-live-provider
```

Required local environment variable names are:

- `POST_PHASE_L_TARGET_PROJECT_REF`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `POST_PHASE_L_APPLY`
- `POST_PHASE_L_APPLY_CONFIRMATION`
- `ANTHROPIC_API_KEY` for the live gate

Secrets must remain in the existing local environment and must not be copied into reports
or commands. This workstation currently has neither `psql` nor Supabase CLI, so SQL
migrations still require an approved non-production SQL transport. The runner will not
claim that fixture or live gates ran until the environment and transport blockers are
removed.

No production schedule, semantic approval, canonical approval, projection, or publication
is activated by this work.
