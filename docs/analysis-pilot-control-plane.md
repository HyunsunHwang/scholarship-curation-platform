# Analysis pilot control-plane contract

The durable analysis engine is shared; queue selection is not.

Global workers use `claim_notice_analysis_jobs`. Pilot workers require a durable
`notice_analysis_pilot_runs` row and immutable `notice_analysis_pilot_run_jobs` membership,
then use only `claim_notice_analysis_pilot_job`. The database joins the exact member to its
expected revision and input fingerprint and increments one attempt in the same transaction.
Before mutation, the worker and claim RPC independently recalculate the complete
five-member manifest fingerprint.

One member is `smoke`; four are `expansion`. Expansion is locked until the smoke job has a
durable success, validated result, evidence, routing decision, recorded provider usage,
reconciled cost, and remaining budget.

Provider usage is an independent receipt keyed by `(job_id, attempt_number, run_role)`.
Receipt conflicts are rejected. Missing usage is unknown, never zero. Receipt persistence
happens after the provider response and before semantic validation. If receipt persistence
fails, `provider_usage_persistence_failed` is a non-escalatable reconciliation stop:
additional provider calls, routing, and finalization are forbidden. The cost reservation is
not automatically released. Missing usage uses the same conservative stop policy.

Live provider execution is double-gated by `--allow-live-provider` and
`POST_PHASE_L_ALLOW_LIVE_PROVIDER=true`. Fixture/replay execution does not require the live
environment permission.

## Canonical manifest

Members are sorted by `execution_order`. After `pilot-manifest-v1`, the UTF-8 byte length
and value of `execution_order`, `stage`, `job_id`, `expected_revision_id`, and
`expected_input_fingerprint` are concatenated for each member. SHA-256 of that string is
calculated by `lib/analysis/analysis-pilot-manifest.mjs` and migration 009.

Registration rejects a supplied mismatch, verifies stored rows after insertion, and
distinguishes an identical idempotent replay from a conflicting replay. Worker preflight
and the DB claim boundary reject drift before claim, lease, attempt, reservation, or
provider activity.

The control plane stores only bounded diagnostics. Raw provider responses, complete prompts,
notice bodies, attachment bodies, credentials, and connection strings are prohibited.

Migration 009 has not been applied by Codex. The SQL golden vector, concurrency behavior,
RLS, and privileges must be verified in the sandbox before registration.

The approved sandbox prerequisite is `pgcrypto` in the `extensions` schema. Migration 009
calls `extensions.digest(text,text)` and `pg_catalog.encode(bytea,text)` explicitly and
fails fast if the extension schema or digest overload is absent.
