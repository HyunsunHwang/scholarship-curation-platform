# Analysis Unit 3: evaluation, routing, and controlled automation

Unit 3 keeps normalized ingestion, semantic analysis, canonical Program/Cycle approval,
and the legacy scheduled ingest as separate boundaries. It does not activate a production
schedule or publish canonical Cycles automatically.

## Identity contract

Program identity is the SHA-256 fingerprint of the server-derived normalized canonical
name, normalized operating organization, and a minimal discriminator. A missing
organization uses the stable `organization-unknown` sentinel. The DB trigger recalculates
all derived fields on name or organization edits, takes an advisory transaction lock, and
enforces a unique identity key. A collision is a review conflict; it is never an automatic
merge.

Cycle identity has two guards: `(Program, source Revision)` is always unique, and a semantic
cycle fingerprint is unique only when year plus term or a complete application date range
makes the identity clear. Same-label ambiguous cases stay in review.

## Model and routing contract

Policy roles are stable names (`economy`, `baseline`, `escalation`) and are separate from
versioned provider model IDs. Pricing is stored with the policy. An unknown model/pricing
combination blocks before a provider call.

The economy role runs first. Schema/evidence failure, critical missing or low-confidence
fields, suspected multiple programs, attachment-heavy inputs, and retryable failures may
trigger one bounded escalation. Both runs and results remain addressable. The routing
decision records the selected run/result and reason codes. A failed escalation does not
replace an otherwise valid economy result.

Budgets are checked before each call: maximum jobs, runs, escalations, per-run cost, and
daily cost. The default routed worker is replay-only, performs no DB write and no live
provider call. `--live` requires `--allow-live-provider` and runs only the bounded fixture
path. `--db` requires `--allow-db-write`; persistence remains blocked until migration 007
is applied and a non-production pilot is explicitly approved.

## Commands

```bash
npm run test:analysis-unit-3
npm run analysis:routed-worker
npm run analysis:evaluate -- --gold reports/analysis-gold-dataset.jsonl
npm run analysis:evaluate -- --gold gold.jsonl --candidates replay.jsonl --name economy-v1
npm run analysis:operations -- --fixture reports/analysis-operations.json
```

`analysis:evaluate` reports field-level exact matches and missing values independently,
plus schema, evidence and lineage validity, token counts, estimated cost, latency, and
escalation count. It deliberately does not reduce quality to one “accuracy” number.

## Database rollout

Apply `004`, `005`, `006`, then
`007_analysis_routing_and_identity_hardening.sql` only to an explicitly guarded
Post-Phase-L non-production target. The migration enables RLS on routing decisions,
allows admin reads, grants service-role operation, and revokes public/anonymous access.
No production application or schedule change is part of this unit.
