# Post-Phase F-1 Admin Review Integration Runbook

## Local Validation

Run the F-1 builder and validator with Node. The generated view model is committed because the administrator route imports it as a read-only repository artifact.

```powershell
node scripts/build-post-phase-f1-admin-review-diagnostics.mjs
node scripts/validate-post-phase-f1-admin-review-integration.mjs
```

Then run the existing A, F-0, B/C, E, and Integration Foundation validators. Do not run a crawler, connect to Supabase, or add a write/apply action as part of this runbook.

## Review Checklist

1. Confirm the route is under the existing admin guard and is visibly read-only.
2. Confirm every source-resolution failure stays visible and fail-closed.
3. Confirm zero-match is described as an observation rather than absence proof.
4. Confirm A Foundation risk and remediation context remains distinct from A Remediation implementation.
5. Confirm no schema, database-types, workflow, package, detector, parser, or crawler behavior changes are included.
