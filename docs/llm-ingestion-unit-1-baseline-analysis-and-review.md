# LLM Ingestion Unit 1 — Baseline Analysis and Semantic Review

Status: implemented locally; migrations not applied
Scope: durable Revision analysis, validated semantic result, admin review, gold export
Production cutover: not included

## Data flow

```text
ingestion_notice_revision
→ Phase 2 readiness/privacy gate
→ notice_analysis_job lease
→ deterministic analysis input + fingerprint
→ replay or Anthropic provider
→ JSON schema + lineage + field evidence validation
→ atomic run/result/evidence persistence
→ semantic admin review event
→ deterministic gold JSONL export
```

The analysis unit is the durable `ingestion_notice_revisions` row. Provider and model are run
provenance, not job identity. An approved semantic review means the analysis has been reviewed
for gold-quality evaluation only. It never creates a Program/Cycle, public scholarship, or
notification.

## Runtime policy

- Provider policy: `anthropic`
- Model policy name: `claude-sonnet-5`
- Runtime model identifier: `ANTHROPIC_MODEL`, then `LLM_MODEL`, then the policy name
- Prompt: `scholarship-analysis-prompt-v1`
- Schema: `scholarship-analysis-v1`
- `antropic` is not accepted.

The runtime model environment variable is the single replacement point when the provider API
uses an identifier different from the policy name.

## Commands

No-network replay:

```bash
npm run test:analysis-unit-1
node scripts/run-notice-analysis-worker.mjs --mode mock
```

Single live job for an existing ready Revision:

```bash
node scripts/run-notice-analysis-worker.mjs \
  --mode single-live \
  --revision-id <revision-id> \
  --allow-live-provider
```

Bounded queue consumer:

```bash
node scripts/run-notice-analysis-worker.mjs \
  --mode queue-consumer \
  --limit 3 \
  --allow-db-queue \
  --allow-live-provider
```

`queue-consumer` defaults to 3 and is capped at 10. Live and DB queue modes fail closed without
their separate flags. The Post-Phase L exact-target guard and service-role credential are also
required.

Gold export:

```bash
node scripts/export-analysis-gold-dataset.mjs \
  --out reports/analysis-gold-dataset.jsonl
```

Rows are sorted by Revision and review time. They contain the safe input snapshot, model
structured output, validated output, admin correction, field evidence, model provenance, and
review outcome. They do not contain credentials, cookies, or API headers.

## Environment variables

- `POST_PHASE_L_TARGET_PROJECT_REF`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` for worker/gold DB access
- `ANTHROPIC_API_KEY` for live mode
- `ANTHROPIC_MODEL` to map the `claude-sonnet-5` policy to an API model identifier

Do not log or track these values.

## Migrations

Apply in order to an explicitly verified non-production Post-Phase L environment:

1. `supabase/post-phase-l/004_notice_analysis_schema.sql`
2. `supabase/post-phase-l/005_notice_analysis_review_and_finalize.sql`

`005` adds:

- atomic success finalization with lease and lineage checks
- single-Revision claim RPC
- append-only `notice_analysis_review_events`
- admin-only semantic review RPC and RLS

No migration was applied during this implementation. Before applying, verify the target
environment guard and schema fingerprint using the existing Post-Phase L procedure.

## Admin review

Open `/admin/analysis-review`. Existing admin layout authentication and the database `is_admin()`
check are both retained. The list shows pending/failed/succeeded jobs, validated results, and the
latest review outcome. The detail page shows Revision text, structured output, field evidence,
editable JSON, and append-only decisions:

- `approve`
- `reject`
- `needs_revision`
- `reanalysis_requested`

The original result remains immutable. Corrections and effective reviewed output are stored on a
new review event.

## Safety guards

- `not_scanned` and `blocked` privacy states refuse provider calls.
- excluded notice types, poor text, and multiple-Program suspicion refuse provider calls.
- invalid JSON/schema/lineage/evidence never produces a validated result.
- success persistence and job completion are one transaction and require a current lease owner.
- failed provider attempts are recorded separately and cannot be reported as model success.
- scheduled legacy ingestion and public projection are unchanged.

## Known limits and Unit 2 entry checks

- No full PII detector is implemented; privacy status must be supplied by the existing contract.
- Live Claude and DB queue smoke tests require credentials and an applied non-production schema.
- This baseline intentionally handles only readiness-approved, single-Program recruitment
  notices. Program/Cycle identity proposals remain out of scope.
- Before Unit 2, apply `004` and `005` to the verified non-production target, run one queue smoke,
  confirm the configured Anthropic model identifier, and review an initial bounded gold cohort.
