# Post-Phase N-Q Final Merge Readiness

`final-merge-readiness.json` is a snapshot of live Git commands, not an input
that can make the validator pass. The report generator fetches `origin` and
records the fetched main SHA, evaluated HEAD SHA, merge base, ancestor result,
ahead/behind values, unresolved-conflict count, and clean-worktree result.

The validator independently performs the same live calculation and rejects a
report whose Git snapshot or PR/synchronization classifications disagree. A
failed fetch is recorded as `REMOTE_FETCH_FAILED` and holds PR creation
readiness; stale remote-tracking data is not accepted.

## Independent decisions

- `pr_creation_readiness` is `PASS` only with a successful fetch, no unresolved
  conflict, matching live snapshot, passing required engineering checks, and
  preserved production safety.
- `branch_up_to_date_with_main` is `PASS` when `behind_by=0`, otherwise
  `OUTDATED`. It does not by itself block PR creation.
- `direct_fast_forward_merge_readiness` is `PASS` only when `origin/main` is an
  ancestor and `behind_by=0`; otherwise it is `NOT_APPLICABLE`.

The report records the HEAD evaluated immediately before it is written. Its
containing commit and final pushed SHA are intentionally reported separately to
avoid self-referential report-only commits.

Production release gates remain independent: fingerprint
`PASS_OWNER_READ_ONLY`, migration `HOLD`, production migration and canary write
`NOT_AUTHORIZED`, and canary rollout/public beta `HOLD`.
