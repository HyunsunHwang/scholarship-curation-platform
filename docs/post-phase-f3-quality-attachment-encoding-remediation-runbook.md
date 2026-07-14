# Post-Phase F-3 Runbook

## Generate and Validate

```powershell
node scripts/build-post-phase-f3-quality-attachment-encoding-remediation.mjs
node scripts/validate-post-phase-f3-quality-attachment-encoding-remediation.mjs
node scripts/build-post-phase-f1-admin-review-diagnostics.mjs
node scripts/validate-post-phase-f1-admin-review-integration.mjs
```

The builder reads committed A/F-2 reports and F-3 fixtures only. It creates deterministic, repository-relative reports. It does not contact a database, download an attachment, or execute a crawler.

## Review Checks

1. Every P1 decision is `resolved` or `deferred`, and every deferred source has a next action.
2. Metadata-present and metadata-missing attachment fixtures both pass.
3. Replacement-character and normalization fixtures both pass.
4. `no_assets` remains distinct from attachment-only evidence.
5. Attachment-only, image-only, short-body, and encoding-risk fixtures are not clean.
6. A clean normalization candidate has sufficient text and no remaining risk.
7. F-1 reads F-3 status without introducing an approve, apply, or write control.

## Boundaries

Do not treat metadata-level evidence as attachment content. Do not repair source text that contains replacement characters. Do not use these bounded fixtures to claim broad source coverage, source exhaustion, scholarship absence, or production readiness.
