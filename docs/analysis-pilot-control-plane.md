# Analysis pilot control-plane contract

The durable analysis engine is shared; queue selection is not.

Global workers use `claim_notice_analysis_jobs`. Pilot workers require a durable
`notice_analysis_pilot_runs` row and immutable `notice_analysis_pilot_run_jobs` membership,
then use only `claim_notice_analysis_pilot_job`. The database joins the exact member to its
expected revision and input fingerprint and increments one attempt in the same transaction.

One member is `smoke`; four are `expansion`. Expansion is locked until the smoke job has a
durable success, validated result, evidence, routing decision, recorded provider usage,
reconciled cost, and remaining budget.

Provider usage is an independent receipt keyed by `(job_id, attempt_number, run_role)`.
Receipt conflicts are rejected. Missing usage is unknown, never zero. Receipt persistence
happens after the provider response and before semantic validation. If receipt persistence
fails, validation may be diagnosed locally but finalization is forbidden.

The control plane stores only bounded diagnostics. Raw provider responses, complete prompts,
notice bodies, attachment bodies, credentials, and connection strings are prohibited.
