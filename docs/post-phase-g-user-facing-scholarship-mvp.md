# Post-Phase G - User-facing Scholarship MVP Foundation

Post-Phase G adds a read-only scholarship listing and detail experience backed by the deterministic Post-Phase F0 read-model. It does not connect the user-facing surface to Supabase, a production apply path, or live crawler output.

## Exposure policy

The public adapter is fail-closed. A candidate is visible only when all of the following are true:

- `source_key` resolved exactly to canonical `source_id`.
- The review state is `clean`, with no blocker and no admin review requirement.
- The duplicate state is `unique`.
- The quality state is accepted, body evidence is sufficient, and the batch is healthy and successful.
- Title, original URL, publication date, and a minimum body text threshold are present.

Unresolved identities, review-required rows, blocked rows, duplicate-risk rows, quality-risk rows, and rows without minimum evidence are hidden. F1 diagnostics remain an admin-only source of context; the public adapter does not show internal status, reviewer action, or remediation codes.

## User experience

- `/scholarships` offers deterministic search plus organization and category filters over the exposed subset.
- `/scholarships/[id]` supports only namespaced `public-...` identifiers through the static adapter before the existing numeric scholarship detail route runs.
- Public detail pages link to the original notice and state that final terms must be confirmed there.
- Attachment metadata is informational only. Downloads and attachment contents are explicitly unverified.

## Scope boundary

Post-Phase G exposes only a reviewed, policy-approved subset of scholarship data.
It does not claim complete source coverage, parser completeness, or national scholarship completeness.

The deterministic fixture is an adapter input, not a declaration that its notices are current live scholarships. No review decision is persisted, no database write is performed, and no source is automatically created or fuzzily matched.

## Verification

Run:

```powershell
node scripts/build-post-phase-g-user-facing-scholarship-mvp.mjs
node scripts/validate-post-phase-g-user-facing-scholarship-mvp.mjs
```

The validator writes `reports/post-phase-g-user-facing-scholarship-mvp.json` and the matching validation reports. It verifies two exposed items, eleven hidden items, policy scenarios, deterministic output, read-only boundaries, and complete next-phase ownership for the master risk register.
