# Post-Phase J Rollback and Recovery Plan

## Principles

The additive graph can be disabled without deleting legacy data. Legacy reads/writes remain available until an explicit cutover. Backfill writes must be scoped by run/audit identifier and remain auditable. Recovery never deletes original crawler evidence, changes public scholarship IDs, or depends on a reverse-destructive migration.

## Recovery scenarios

| Scenario | Detection | Recovery | Evidence retained |
| --- | --- | --- | --- |
| Additive table/index/constraint issue | Migration/rehearsal validation fails | Stop deployment; disable new writer/reader; use approved additive rollback only when safe. | Migration plan, schema fingerprint, failure log. |
| Failed or partial backfill | Count/idempotency/reconciliation mismatch | Stop transaction where possible; mark run failed; isolate scoped rows by audit key; resume only after review. | Dry-run manifest and all raw legacy rows. |
| Compatibility adapter mismatch | Graph and legacy read comparison differs | Disable adapter and keep `crawled_notices` reader. | Comparison report and mismatch samples. |
| Incorrect source mapping | Exact-match contract/evidence fails | Mark mapping unresolved; do not rewrite source identity; rebuild derived projection. | Source-key snapshot and mapping evidence. |
| Duplicate notice identity | Unique conflict or reviewer duplicate decision | Preserve both evidence sets; block effective decision/public projection pending human review. | URL aliases, revisions, events. |
| Public projection mismatch | Existing scholarship mapping/parity mismatch | Stop projection writer; retain existing `scholarships` row and numeric route. | Projection mapping and reconciliation report. |
| Review-decision projection error | Effective event differs from ordered event history | Rebuild projection from immutable events; do not mutate event history. | Event chain and evidence references. |
| Environment schema divergence | J-M0 fingerprint mismatch | Do not apply; update target inventory and re-review SQL. | Sanitized inventory and fingerprints. |

Production recovery requires its own approved runbook, named operators, backup/export evidence, and post-recovery reconciliation. J does not author executable rollback SQL.
