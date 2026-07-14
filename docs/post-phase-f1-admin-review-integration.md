# Post-Phase F-1: Adapter-backed Admin Review Integration

## Purpose

F-1 exposes the existing F-0, B/C, E, and Post-Phase A read-model, observability, and quality-policy evidence in an isolated administrator diagnostics route: `/admin/crawler-review`. It is not a replacement for the existing DB-backed review queue.

## Data Sources

The route imports the generated `reports/post-phase-f1-admin-review-integration.json` view model. Its builder assembles only repository reports: F-0 adapter foundation, B/C review quality foundation, E batch observability, and A reliability, closure, spot-check, and remediation reports. The page makes no direct Supabase query and adds no write path.

## States Shown

The route exposes source identity resolution, review and quality state, zero-match observation, parser/readability reason codes, P0/P1 remediation context, next action, batch status, warning count, and rollback-scope availability. The policy panel covers `no_assets`, image-only, attachment-only, short-body, second-pass, encoding, detail-body, and list-only states.

## Read-only Policy

- The route does not create, update, apply, approve, or reject candidates.
- Zero-match is an observation, not proof of scholarship absence or source exhaustion.
- Post-Phase A Foundation documents evidence and priorities; it does not mean source/parser remediation or full coverage is complete.
- Production detector, parser, and crawler behavior are unchanged.

## Non-goals and Next Steps

F-1 does not modify the schema, `lib/database.types.ts`, production source adapters, detector terms, or crawler workflows. Next work remains Post-Phase A Remediation - Source & Parser Fixes, Post-Phase A Remediation - Detector & Deeper Crawl Evaluation, and a separately approved Review Decision Lifecycle.
