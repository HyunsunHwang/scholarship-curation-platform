# Post-Phase M Operator Runbook

## Safety boundary

Operate only against the authorized non-production target after the hardened L environment guard passes. Never disable certificate verification, infer absence from zero matches, create ambiguous sources, or publish preview rows.

## Operating cycle

1. Run the cohort seed in plan mode and review exact source metadata.
2. Apply only with the approved L confirmation contract.
3. Run `run-post-phase-m-controlled-pilot.mjs` with an explicit cycle number.
4. Verify every source has one result and inspect blocked, zero-match, retry, body, and asset evidence.
5. Run the L runtime verifier with the six-source allowlist and preserve the cycle directory.
6. Exercise review events only through the append-only RPC; preview rows must remain unverified and absent from home.

## Incident response

- Transport blocked: preserve the error code and bounded retry count. Do not create a notice.
- Zero match: preserve observed count and explicit classification. Do not delete prior state or infer absence.
- Replay: reuse the deterministic idempotency key and require duplicate counts of zero.
- Rollback: select only an M-owned run that has no immutable review dependency. Verify unrelated runs, compatibility rows, and review events before and after.
- Reviewed-run rollback: use logical supersession or an approved archival design. The generic deletion path is intentionally blocked by the review revision foreign key.
- Preview leakage: stop immediately if any hidden row appears on the public list or numeric detail route.

Recovery evidence is recorded in `reports/post-phase-m-incident-recovery.json`. Production execution requires a separate authorization and is not part of this runbook.
