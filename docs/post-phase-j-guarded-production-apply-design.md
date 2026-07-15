# Post-Phase J Guarded Production Apply Design

This is a future mechanism design, not an executable apply command.

## Required gates

1. Explicit environment allowlist with no production default.
2. Explicit confirmation phrase bound to environment, schema fingerprint, plan ID, and expected operation count.
3. Separate plan and apply modes; plan emits a redacted dry-run artifact.
4. Pre-apply schema fingerprint, migration-history check, expected row/operation counts, backup/export reference, and unique idempotency key.
5. Transaction boundary where supported; otherwise explicit checkpointed batches with a resumable audit record.
6. Automatic stop for unexpected schema, fingerprint mismatch, unresolved source/notice identity, count mismatch, or partial failure.
7. Post-apply graph/legacy/public reconciliation and a rollback reference before success is reported.

The mechanism must reject an unclean working tree, implicit production selection, fuzzy source resolution, automatic production apply, continuation after fingerprint mismatch, and treating a partial apply as success. Every execution creates an audit record containing plan ID, operator identity, environment ID, fingerprint, start/end state, counts, idempotency key, and recovery status. Public exposure/review changes require the separately approved projection workflow; no apply can grant automatic approval or rejection.
