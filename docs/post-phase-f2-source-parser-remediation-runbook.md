# Post-Phase F-2 Runbook

## Generate and Validate

Run with a normal Node.js runtime:

```powershell
node scripts/build-post-phase-f2-source-parser-remediation.mjs
node scripts/validate-post-phase-f2-source-parser-remediation.mjs
node scripts/build-post-phase-f1-admin-review-diagnostics.mjs
node scripts/validate-post-phase-f1-admin-review-integration.mjs
```

The builder reads Post-Phase A P0 priority decisions and committed F-2 fixtures. It writes repository-relative, deterministic JSON reports. It does not connect to a database or execute a crawler.

## Reviewer Checks

1. Confirm every P0 decision is `resolved` or `deferred`.
2. Confirm every deferred source has an explicit next action.
3. Confirm before/after body and URL fixtures pass.
4. Confirm all P0-improved source observations remain `needs_review`, not `clean`.
5. Confirm `source_exhaustion_proven` is false and zero-match is not treated as absence proof.
6. Confirm F-1 shows the F-2 fields and read-only scope notices.

## Scope Boundaries

No DB or Supabase read/write is part of this runbook. No migration, destructive SQL, production apply path, detector-keyword change, full crawl, or source-wide coverage claim is allowed. Do not turn deferred sources into automatic fallback parsing without a reviewed fixture and explicit source-specific evidence.

## Deferred Follow-Up

- `cau_003`: establish a trustworthy list-to-detail fixture before changing parser logic.
- `cau_012`: establish explicit inventory and source identity evidence before adapter work.
- F-3: P1 encoding normalization and attachment parsing, each with bounded fixtures and fail-closed review behavior.
