# Non-Production L Sandbox Live-Pilot Remediation

This is not a new Phase or Unit. It remediates defects found after Units 1–3 were exercised
against the isolated `scholarship-curation-post-phase-l` project
(`hrayfvdggbhfmmzfblly`). Production (`synwudnxdkybwihwmtak`) remains denied.

## Observed defects and root causes

The first five-case pilot eagerly leased five jobs and incremented all five attempts before
the sequential worker started the first provider call. A process stop therefore consumed
attempts for four untouched jobs. The first provider response also failed the strict
schema/evidence contract. The prompt described JSON informally, while the Messages request
did not use Anthropic structured outputs. Finally, the both-invalid routing path called the
job failure RPC without first persisting its failed provider runs.

The remediation makes `limit=5` a total processing ceiling: the consumer claims exactly one
job, renews only its own finite lease before each provider run, finishes that job, then
claims the next. A crash can therefore leave at most one leased attempt.

Anthropic requests now use `output_config.format` with the repository JSON Schema, supported
by the active Claude Haiku 4.5 and Sonnet 4.6 models. The prompt names the required semantic
and evidence paths, while the local validator remains strict. Safe parsing additionally
accepts a JSON code fence or explanatory wrapper for stored/replay outputs; malformed,
missing, unsupported, or ungrounded content still fails validation. See the
[official structured outputs contract](https://platform.claude.com/docs/en/build-with-claude/structured-outputs).

## Failed-run and lease audit

Migration `008_live_pilot_failed_run_and_lease_hardening.sql` adds:

- `record_notice_analysis_run_audit`: idempotently records every completed provider run by
  `(job_id, attempt_number, run_role)` before the job failure transition;
- `renew_notice_analysis_job_lease`: lets only the current, unexpired lease owner extend a
  lease, bounded to 60–600 seconds.

Failed audit rows retain model, status, validation status, token counts, cost, latency,
fingerprint, error code, missing paths, top-level response keys, and evidence count. They
never retain the prompt, safe input body, API key, or raw provider response. A conflicting
replay raises `failed_run_audit_conflict`.

The provider timeout is 45 seconds. The worker renews to at least 180 seconds immediately
before economy and escalation calls. A crash does not create an infinite lease; normal
expiry and reclaim behavior remains intact.

## Operator sequence

The preflight runner is report-only. It does not apply SQL, seed a cohort, consume the
queue, or call Anthropic.

```bash
npm run analysis:nonproduction-pilot -- --stage preflight
```

Apply migration 008 through the approved non-production SQL transport, then run the
read-only verification SQL:

```text
supabase/post-phase-l/008_live_pilot_failed_run_and_lease_hardening.sql
supabase/post-phase-l/verify_analysis_nonproduction_pilot.sql
```

Seed a new deterministic synthetic namespace. This does not modify or reset the original
failed jobs:

```bash
npm run analysis:pilot-v2:seed -- --allow-nonproduction-db-write
```

Run the bounded live consumer manually:

```bash
npm run analysis:routed-worker -- \
  --mode bounded-db-consumer \
  --limit 5 \
  --max-runs 10 \
  --max-escalations 5 \
  --run-budget-micros 500000 \
  --pilot-budget-micros 500000 \
  --allow-nonproduction-db-write \
  --allow-db-queue \
  --allow-live-provider
```

Read back only bounded audit fields:

```bash
npm run analysis:pilot-v2:verify -- --allow-nonproduction-db-read
```

Do not rerun automatically when any job is `leased` with an unexpired lease, when a routing
replay reports a conflict, or when the pilot reaches 5 jobs, 10 runs, 5 escalations, or
500000 micros. `retryable_failed` waits for `available_at`; `terminal_failed` requires
operator diagnosis; `budget_deferred` requires a new explicit budget decision; expired
leases may be reclaimed normally. A succeeded routing replay must not call the provider.

## Rollback and evidence retention

Pilot rows are audit evidence and have no automatic cleanup command. Do not decrement
attempts, reset statuses, delete jobs/runs/results/decisions, or reuse the original
five-case namespace. If migration 008 functions themselves must be removed, use only:

```text
supabase/post-phase-l/908_live_pilot_remediation_function_rollback.sql
```

That bounded rollback preserves every analysis row. Production scheduling, legacy ingest,
semantic approval, canonical approval, projection, and publication are unchanged.
