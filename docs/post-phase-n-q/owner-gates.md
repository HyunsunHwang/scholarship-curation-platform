# Owner Gates

The authoritative gate packet is `reports/post-phase-n-q/owner-gates.json`.

## Reconciled status

- `OWNER_GATE_N_PRODUCTION_READ_ONLY_FINGERPRINT`: `PASS_OWNER_READ_ONLY`.
  The repository accepted owner-supplied read-only evidence through the
  sanitised acceptance summary. Raw evidence and receipts remain outside Git.
- `migration_readiness`: `HOLD`; therefore production migration remains
  `NOT_AUTHORIZED`.
- Canary write authorization is `NOT_AUTHORIZED`. This is distinct from the
  canary rollout/release status, which remains `HOLD`.
- Public beta release remains `HOLD`; it is not an implicit authorization.

The N-Q validator rejects a mismatch between accepted owner evidence and a
pending fingerprint gate, between migration readiness `HOLD` and a migration
authorization, between an unauthorized canary write and rollout `GO`, and
between unmet public-beta prerequisites and release `GO`.

## Evidence handling

Only the sanitised acceptance summary is tracked. Credentials, production URLs
and refs, raw fingerprints, receipts, archives, and full owner diffs must not
be printed, committed, or used as focused-test cleanup targets.
