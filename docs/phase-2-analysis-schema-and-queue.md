# Phase 2 — Analysis Schema and Durable Queue

Status: implemented as contracts + pure logic (not applied to DB, no worker)  
Depends on: Phase 0 identity gate, Phase 1 shadow parity gate  
Safety: no migration apply, no DB write, no Claude/LLM call, no scheduled cutover

## Data flow

```text
Notice
→ durable Revision (+ Assets)
→ readiness evaluator
→ job reconciliation planner
→ notice_analysis_jobs
→ (Phase 3) Claude worker claim/lease
→ notice_analysis_runs
→ validated notice_analysis_results
→ notice_analysis_evidence
→ admin semantic review
→ later Program/Cycle proposal only
```

## Revision readiness

Pure module: `lib/analysis/analysis-readiness.mjs`

Statuses:

```text
ready
waiting_for_assets
excluded_not_candidate
excluded_result_or_roster
excluded_multiple_programs
excluded_low_text_quality
excluded_privacy_risk
blocked_missing_revision
blocked_invalid_payload
budget_deferred
```

Default ready requires scholarship candidate/dedicated source, new recruitment, usable body or attachment text, acceptable Korean quality, no multi-program suspicion, no roster/result, no privacy block.

## Job / run / result / evidence roles

| Table | Role |
| --- | --- |
| `notice_analysis_jobs` | Durable queue item for one analysis contract on one Revision |
| `notice_analysis_runs` | Append-only provider attempt history (provider/model/tokens/cost/latency) |
| `notice_analysis_results` | Validated structured semantic output (not raw response) |
| `notice_analysis_evidence` | Field-level locators into revision/asset text |

SQL: `supabase/post-phase-l/004_notice_analysis_schema.sql`

## Logical uniqueness

Job uniqueness:

```text
revision_id
+ analysis_kind
+ prompt_version
+ schema_version
+ input_fingerprint
```

Reason: analysis contract identity belongs on the job. Provider/model belong on runs so Claude baseline and later low-cost shadow attempts can share one job contract history.

Also unique `idempotency_key` derived from the same fields.

## Retry policy

```text
retryable_failed + attempt_count < max_attempts → retry_existing_job
attempt_count >= max_attempts → terminal, no auto retry
succeeded same contract → no_action_completed
```

## Lease policy

RPC contracts (service_role only):

```text
claim_notice_analysis_jobs(worker_id, limit, lease_seconds)
complete_notice_analysis_job(job_id, worker_id)
fail_notice_analysis_job(job_id, worker_id, error_code, error_message, retryable, retry_delay_seconds)
```

Rules:

- claim uses `FOR UPDATE SKIP LOCKED`
- expired leased/running rows are reclaimable
- completed/terminal/cancelled/superseded are not reclaimable
- wrong lease owner cannot complete/fail

Pure simulator: `lib/analysis/analysis-job-lease.mjs`

## Raw response retention

`notice_analysis_runs.raw_response` is nullable and non-canonical.  
`raw_response_retention_until` records purge eligibility.  
Validated semantics live only in `notice_analysis_results`.

## Cost metadata

Runs store:

```text
input_token_count
output_token_count
cached_input_token_count
estimated_cost_micros
currency_code
latency_ms
request_id
```

`budget_deferred` is a future-compatible job/readiness status. Enforcement is not implemented in Phase 2.

## Privacy state

Placeholder contract: `lib/analysis/analysis-privacy-contract.mjs`

```text
not_scanned | clear | redacted | blocked
```

Full detector/masking is deferred to the analysis input builder phase.

## Gold dataset / admin review relationship

Gold unit remains:

```text
Revision + attachment text + AnalysisResult + admin corrections + field evidence
```

Review decision events stay human-only (`actor_type=admin_user`). Model output never writes review decision events.

## Phase 3 worker entry conditions

Enter Phase 3 only after verifying on the remote branch:

- migration DDL and uniqueness
- lease RPCs
- readiness/reconcile fixtures green
- no desire to call Claude until queue contracts are accepted

## Provider contract note

Code/SQL accept `anthropic` only (not `antropic`).  
Baseline model policy default: `claude-sonnet-5` (documented intent; Phase 2 does not validate live API model IDs).
