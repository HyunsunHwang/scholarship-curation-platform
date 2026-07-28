# Phase 2 — Analysis Schema and Durable Queue

Status: Phase 2-C entry-gate hardened contracts + pure logic (not applied to DB, no worker)
Depends on: Phase 0 identity gate, Phase 1 shadow parity gate
Safety: no migration apply, no DB write, no Claude/LLM call, no scheduled cutover

## Data flow

```text
Notice
→ durable Revision (+ Assets)
→ readiness evaluator (fail-closed)
→ job reconciliation planner
→ notice_analysis_jobs
→ (Phase 3) Claude worker claim/lease
→ notice_analysis_runs
→ validated notice_analysis_results
→ notice_analysis_evidence
→ admin semantic review
→ later Program/Cycle proposal only
```

Phase 3 completion order:

```text
store run (status=succeeded, validation_status=validated, finished_at set)
→ store validated result (+ evidence)
→ complete_notice_analysis_job
```

Completion requires both a validated result and a matching successful validated run. Missing result and incomplete/non-validated run are distinct rejection errors.

## Revision readiness

Pure module: `lib/analysis/analysis-readiness.mjs`

Statuses:

```text
ready
waiting_for_assets
excluded_not_candidate
excluded_notice_type
excluded_result_or_roster
excluded_multiple_programs
excluded_low_text_quality
excluded_privacy_risk
blocked_missing_revision
blocked_invalid_payload
budget_deferred
```

### Positive candidate gate

Eligible only when:

```text
candidate_classification = candidate
OR
source is scholarship_dedicated
```

Missing/unknown candidate without dedicated source → `excluded_not_candidate` / `CANDIDATE_NOT_CONFIRMED`.

### New recruitment only

Initial pilot allows `ready` only for:

```text
notice_type = new_recruitment
```

Other types (correction, extension, cancellation, unknown, …) → `excluded_notice_type` / `NOTICE_TYPE_NOT_NEW_RECRUITMENT`.

### Attachment quality

Readiness evaluates attachment extracted text length, replacement-character ratio, and usable Korean text. Body-only or attachment-only can be ready when usable; broken/short attachment-only inputs are not ready.

### Privacy fail-closed

```text
not_scanned → provider blocked
clear → provider allowed
redacted → provider allowed
blocked → provider blocked
```

### Reconciler defaults (Phase 2-C)

Reconciler does **not** invent missing fields:

```text
missing notice_type → unknown → excluded_notice_type
missing privacy_status → not_scanned → excluded_privacy_risk
```

Phase 3 workers must pass explicit `notice_type` and privacy `clear|redacted` evidence.

## Job / run / result / evidence roles

| Table | Role |
| --- | --- |
| `notice_analysis_jobs` | Durable queue item for one analysis contract on one Revision |
| `notice_analysis_runs` | Append-only provider attempt history (provider/model/tokens/cost/latency) |
| `notice_analysis_results` | Validated structured semantic output (not raw response) |
| `notice_analysis_evidence` | Field-level locators into revision/asset text |

SQL: `supabase/post-phase-l/004_notice_analysis_schema.sql`
Wrapped in `begin` / environment guard / dependency checks / `commit`.

## Logical uniqueness

Job uniqueness:

```text
revision_id
+ analysis_kind
+ prompt_version
+ schema_version
+ input_fingerprint
```

Also unique `idempotency_key` and composite `(id, notice_id, revision_id)` for result lineage FKs.

Runs unique `(id, job_id)`. Results enforce:

```text
(run_id, job_id) → runs(id, job_id)
(job_id, notice_id, revision_id) → jobs(id, notice_id, revision_id)
```

Input fingerprint lives on the job. Reconciler completed-result checks join `result → job.input_fingerprint` (option B; results do not store input_fingerprint).

## Retry policy

```text
retryable_failed + attempt_count < max_attempts → retry_existing_job
attempt_count >= max_attempts → mark_terminal_max_attempts
succeeded same contract → no_action_completed
claim requires attempt_count < max_attempts
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
- auto-claim statuses: `pending`, `retryable_failed` only
- `budget_deferred` is never auto-claimed; must be explicitly released to `pending`
- expired leased/running rows are reclaimable when `attempt_count < max_attempts`
- complete/fail require matching owner, status leased/running, and `lease_expires_at > now()`
- complete additionally requires:
  - validated result with matching job/notice/revision lineage
  - linked run with `status=succeeded`, `validation_status=validated`, and `finished_at` set
- completed/terminal/cancelled/superseded are not reclaimable

Pure simulator: `lib/analysis/analysis-job-lease.mjs` (parity with SQL claimable statuses).

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

`budget_deferred` is a job/readiness status. Reconciler returns `defer_budget`. Auto claim does not include it. Enforcement/release belongs after Phase 3.

## Privacy state

Contract: `lib/analysis/analysis-privacy-contract.mjs`

Full detector/masking is deferred to the analysis input builder phase.

## Gold dataset / admin review relationship

Gold unit remains:

```text
Revision + attachment text + AnalysisResult + admin corrections + field evidence
```

Review decision events stay human-only (`actor_type=admin_user`). Model output never writes review decision events.

## Phase 3 worker entry conditions

Enter Phase 3 only after remote verification of:

- migration DDL, uniqueness, lineage FKs
- lease RPCs including expiry and validated-result completion
- fail-closed readiness fixtures green
- local JSON/normalized graph evidence worker path preferred before admin UI

## Provider contract note

Code/SQL accept `anthropic` only (not `antropic`).  
Baseline model policy default: `claude-sonnet-5` (documented intent; Phase 2 does not validate live API model IDs).
