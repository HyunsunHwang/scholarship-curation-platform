# Analysis Unit 3: evaluation, routing, and controlled automation

Unit 3 keeps normalized ingestion, semantic analysis, canonical Program/Cycle approval,
and the legacy scheduled ingest as separate boundaries. It does not activate a production
schedule or publish canonical Cycles automatically.

## Official stage model

Foundation (complete):

```text
Phase 0 — Notice identity and URL alias alignment
Phase 1 — legacy/normalized shadow parity
Phase 2 — analysis schema, readiness, durable queue and lease
```

Integrated implementation:

```text
Unit 1 = baseline analysis worker + semantic review + gold dataset (former Phase 3–4)
Unit 2 = Program/Cycle proposal + canonical domain + scholarships projection (former Phase 5–7)
Unit 3 = gold evaluation + model policy + economy routing + escalation + bounded DB consumer (former Phase 8)
```

There is no Phase 3-A, Unit 3-A, or Unit 4 in the official roadmap.

## Active model policy

Policy file: `config/analysis-model-policy-v1.json`

| Role | Model | Pricing version |
| --- | --- | --- |
| economy | `claude-haiku-4-5-20251001` | `anthropic-public-pricing-2026-07` |
| baseline | `claude-sonnet-4-6` | same |
| escalation | `claude-sonnet-4-6` | same |

Retired identifiers (`claude-3-5-haiku-20241022`, `claude-sonnet-4-20250514`) are removed.
Unknown model overrides fail before provider calls. Pricing-unknown models are never treated as zero cost.

## Identity canonical string contract

JS (`lib/analysis/scholarship-identity.mjs`) and SQL (`007_analysis_routing_and_identity_hardening.sql`) share:

```text
v1|program|<normalized_name>|<normalized_organization>|<discriminator>
v1|cycle-revision|<program_id>|<revision_id>
v1|cycle-clear|<program_id>|<cycle_year>|<term>|<start>|<end>
```

Normalization removes whitespace/punctuation and lowercases. Missing organization uses `organization-unknown`.

## Migration compatibility

Apply order on guarded Post-Phase-L non-production targets:

```text
004 → 005 → 006 → 007
```

007 changes:

- `notice_analysis_runs` unique key → `(job_id, attempt_number, run_role)`
- replaces `finalize_notice_analysis_success` with run_role-aware conflict target
- adds `finalize_notice_analysis_routing` with replay idempotency before lease validation
- adds `defer_notice_analysis_job_for_budget` for budget-blocked jobs
- adds `notice_analysis_routing_decisions`

DB smoke skipped when credentials are unavailable; static/in-memory contract tests still run.

## Routed persistence flow

```text
claim job → lease
→ economy run/result/evidence
→ optional escalation run/result/evidence
→ routing decision
→ job succeeded (only when selected validated run/result exists)
```

In-memory contract: `lib/analysis/analysis-routed-persistence.mjs`
DB RPC: `finalize_notice_analysis_routing`
Bounded consumer: `lib/analysis/analysis-db-consumer.mjs`

### Routed DB replay semantics

RPC order:

```text
job row lock
→ existing routing decision lookup
→ matching logical request → replay success (replayed: true)
→ mismatch → routing_decision_conflict
→ no existing decision → active lease validation → new persistence
```

Matching replay fields: `job_id`, `decision_fingerprint`, `selected_run_id`,
`selected_result_id`, `economy_run_id`, `escalation_run_id`, `policy_version`.
Replay creates no duplicate run/result/evidence/decision rows.
Baseline `finalize_notice_analysis_success` lease contract is unchanged.

## Budget deferral

Budget-blocked routed jobs use `defer_notice_analysis_job_for_budget`, not `fail_notice_analysis_job`.

Stored state:

```text
status = budget_deferred
last_error_code = budget_deferred
leased_by = null
lease_expires_at = null
completed_at = null
```

`budget_deferred` jobs are excluded from automatic claim. No auto-resume scheduler in this closeout;
operators release jobs explicitly after budget review.

## Bounded DB consumer preflight

`bounded-db-consumer` requires before DB client/claim:

```text
--allow-live-provider
or
--fixture <valid replay fixture with provider_response>
```

Missing both → `bounded_db_consumer_requires_live_provider_or_fixture`.
Invalid fixture (missing file, bad JSON, missing `provider_response`) fails before claim.
Live mode validates Anthropic credentials and active model policy/pricing before claim.

## Commands

```bash
npm run test:analysis-unit-3

node scripts/run-routed-analysis-worker.mjs \
  --mode mock \
  --fixture fixtures/analysis-unit-1/eligible-analysis.json

node scripts/run-routed-analysis-worker.mjs \
  --mode bounded-live-fixture \
  --fixture fixtures/analysis-unit-1/eligible-analysis.json \
  --allow-live-provider

node scripts/run-routed-analysis-worker.mjs \
  --mode bounded-db-consumer \
  --limit 3 \
  --daily-budget-micros 2000000 \
  --allow-db-queue \
  --allow-live-provider

node scripts/run-routed-analysis-worker.mjs \
  --mode bounded-db-consumer \
  --limit 3 \
  --allow-db-queue \
  --fixture fixtures/analysis-unit-1/eligible-analysis.json
```

`--allow-db-queue` and `--allow-live-provider` are explicit. Default mock/replay performs no DB writes.

## Budget and evaluation

Budget guard reserves estimated cost before calls and records actual token-based cost after calls.
Evaluation (`analysis-evaluation.mjs`) reports schema, lineage, evidence validation rate, token/cost/latency metrics.

## Production cutover blockers

- migration 007 not applied on target
- no production schedule activation
- no automatic canonical approval/publication
- admin review remains human-only
- budget_deferred jobs require operator release before re-queue
