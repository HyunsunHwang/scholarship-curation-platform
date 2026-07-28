# Analysis Unit 3: evaluation, routing, and controlled automation

Unit 3 keeps normalized ingestion, semantic analysis, canonical Program/Cycle approval,
and the legacy scheduled ingest as separate boundaries. It does not activate a production
schedule or publish canonical Cycles automatically.

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
- adds `finalize_notice_analysis_routing` atomic persistence RPC
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
