# Non-Production Analysis Pilot Control Plane

This runbook applies only to the isolated Post-Phase L sandbox
`hrayfvdggbhfmmzfblly`. The production ref `synwudnxdkybwihwmtak` is denied by the
target guard. Migration, registration, smoke, and expansion are operator actions; repository
tests do not connect to Supabase or Anthropic.

Migration 009 is still unapplied as of this repository revision. Database-native
verification and concurrency checks remain operator gates.

## Execution boundaries

- `bounded-db-consumer` remains the global analysis worker. Never use it for a pilot.
- `bounded-pilot-consumer` can claim only immutable members of one durable pilot run.
- `run-analysis-nonproduction-pilot.mjs` is report-only.
- Environment files are never auto-discovered. Every operator command explicitly uses
  `node --env-file=.env.post-phase-l.local`.
- The environment must contain the exact target ref and URL, apply confirmation for writes,
  and `POST_PHASE_L_ALLOW_DB_READ`, `POST_PHASE_L_ALLOW_DB_WRITE`, or
  `POST_PHASE_L_ALLOW_LIVE_PROVIDER` as appropriate.
- Existing five-case-v2 jobs are registered, not reseeded or reset.
- A live path requires both `--allow-live-provider` and
  `POST_PHASE_L_ALLOW_LIVE_PROVIDER=true`. Either one alone is rejected before DB client or
  provider construction. Fixture/replay paths do not require the live permission.

## 1. Apply migration 009

The operator applies
`supabase/post-phase-l/009_analysis_pilot_control_plane.sql` in the approved sandbox SQL
Editor or approved transaction transport. Codex must not apply it. Migration 009 adds the
pilot run, immutable member manifest, provider usage receipt, exact pilot claim, member
completion, and expansion approval contracts.

## 2. Read-only schema verification

Run `supabase/post-phase-l/verify_analysis_nonproduction_pilot.sql` in the same sandbox.
Every table/function presence, RLS, and privilege result must be true. It uses the actual
guard columns `id` and `automatic_public_publish_enabled`.

## 3. Preview and register the existing v2 cohort

```bash
node --env-file=.env.post-phase-l.local \
  scripts/register-analysis-live-pilot-v2.mjs \
  --allow-nonproduction-db-read
```

Review the exact five IDs, smoke job, revisions, input fingerprints, and manifest
fingerprint. Registration is the only allowed write:

```bash
node --env-file=.env.post-phase-l.local \
  scripts/register-analysis-live-pilot-v2.mjs \
  --allow-nonproduction-db-read \
  --allow-nonproduction-db-write \
  --register-pilot-run \
  --pilot-budget-micros 500000
```

The RPC refuses registration unless all five jobs are pending, attempt zero, unleased,
without runs or routing decisions, and match the namespace, revision, and input fingerprint.
It independently recalculates the canonical manifest fingerprint. An identical replay
returns the existing pilot; any namespace, version, member, policy, schema, prompt, budget,
metadata, or optional ID difference raises `pilot_registration_replay_conflict`. It never
modifies the analysis job rows.

## 4. One-case smoke

First run the report-only preflight with the explicit environment:

```bash
node --env-file=.env.post-phase-l.local \
  scripts/run-analysis-nonproduction-pilot.mjs --stage preflight
```

Then run exactly one smoke member:

```bash
node --env-file=.env.post-phase-l.local \
  scripts/run-routed-analysis-worker.mjs \
  --mode bounded-pilot-consumer \
  --pilot-run-id <PILOT_RUN_ID> \
  --pilot-stage smoke \
  --limit 1 \
  --max-runs 2 \
  --max-escalations 1 \
  --pilot-budget-micros 500000 \
  --allow-nonproduction-db-write \
  --allow-db-queue \
  --allow-live-provider
```

The worker reads the durable manifest before provider use. Its DB claim is
`claim_notice_analysis_pilot_job`; pilot mode never calls the global claim RPC. A provider
response is followed immediately by an idempotent usage receipt before JSON/schema,
lineage, evidence, and business-completeness processing. Missing usage remains `null` with
`usage_status=missing`, moves the pilot to reconciliation, and prevents the next claim.
The worker loads all five members—not only the requested stage—and verifies their
fingerprint before claim. The claim RPC repeats that verification before member status,
attempt, or lease mutation.

The live command is valid only when `.env.post-phase-l.local` also contains:

```text
POST_PHASE_L_ALLOW_LIVE_PROVIDER=true
```

## 5. Smoke verification and expansion

```bash
node --env-file=.env.post-phase-l.local \
  scripts/verify-analysis-live-pilot-v2.mjs \
  --allow-nonproduction-db-read \
  --pilot-run-id <PILOT_RUN_ID>
```

Confirm exactly one attempt, four untouched members, a recorded usage receipt with
reconciled actual cost, safe run audit, validated result, evidence, routing decision, and
cleared lease. Public, canonical, projection, and publication writes must remain zero.

Only then execute:

```sql
select public.approve_notice_analysis_pilot_expansion('<PILOT_RUN_ID>'::uuid);
```

The RPC independently checks smoke success, validated result, evidence, routing decision,
recorded usage, reconciled cost, and budget.

## 6. Four-case expansion and final verification

```bash
node --env-file=.env.post-phase-l.local \
  scripts/run-routed-analysis-worker.mjs \
  --mode bounded-pilot-consumer \
  --pilot-run-id <PILOT_RUN_ID> \
  --pilot-stage expansion \
  --limit 4 \
  --max-runs 8 \
  --max-escalations 4 \
  --pilot-budget-micros 500000 \
  --allow-nonproduction-db-write \
  --allow-db-queue \
  --allow-live-provider
```

Run the same verifier afterward. Expansion claims one exact member at a time.

## Diagnostics and reconciliation

Safe diagnostics include request ID, model, content block types, stop reason, response
fingerprint, JSON parse state, top-level keys, validation code/path, evidence count, token
usage, and usage status. They exclude API keys, prompts, notice/attachment bodies, and raw
provider responses.

If a provider response arrives but its usage receipt cannot be persisted, the outcome is
`provider_usage_persistence_failed`: no escalation call, routing decision, or finalization
is allowed. The member and pilot move to `reconciliation_required`, and the existing cost
reservation remains reserved. Missing provider usage follows the same conservative
no-escalation policy because its cost is unknown; actual cost remains `null`.

The canonical manifest starts with `pilot-manifest-v1`, sorts members by
`execution_order ASC`, and UTF-8 byte-length-prefixes these values in order:
`execution_order`, `stage`, `job_id`, `expected_revision_id`, and
`expected_input_fingerprint`. SHA-256 of that string is checked by the JS helper, SQL
registration helper, worker preflight, and claim boundary.

Stop on target mismatch, missing pilot ID, manifest/revision/input mismatch, unexpected job,
more than one smoke claim, unapproved expansion, missing or unreconciled usage, budget
exhaustion, audit/finalize failure, routing conflict, active lease, success replay conflict,
or any raw-response persistence attempt. Do not reset attempts or convert a failure to
success during reconciliation.

Repository tests validate a shared golden vector. The verifier contains the equivalent SQL
golden-vector query, which the operator must run after applying 009.

## Bounded rollback

If 009 must be removed, the operator may apply
`supabase/post-phase-l/909_analysis_pilot_control_plane_rollback.sql`. It drops only 009
functions and pilot-control-plane tables. It does not delete or modify analysis
jobs/runs/results/evidence/routing, v1/v2 audit data, canonical data, projections, or
production scheduling.
