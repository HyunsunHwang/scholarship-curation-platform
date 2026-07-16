# Post-Phase L Browser Walkthrough

## Preconditions

The three apply SQL files must be applied to the dedicated L project, the pilot data run must be persisted, and a test admin must exist. Test credentials remain local environment values and are never committed or printed. The bootstrap command is guarded and apply-only.

No browser step may click AI draft or AI formatting controls. Those actions are disabled in the L environment at both UI and server boundaries.

## Routes and evidence

1. `/admin/review`
   - Authenticated admin layout renders.
   - The pilot compatibility row appears without changing non-L review behavior.
2. `/admin/review/scholarships/[pilot-id]`
   - Canonical source ID, source-key snapshot, run/source result, body quality, assets, URLs, last observed time, effective decision, event history, legacy comparison, and blocked reason are visible.
   - Before approval the projection preview is hidden.
   - Approve/reject/reopen creates an event and does not mutate prior event rows.
3. `/admin/crawler-review`
   - The existing report snapshot remains labelled report-backed.
   - The L section is labelled DB-backed only after a successful graph query.
   - Run ID, mode, source count, per-source result, matched count, retry evidence, and status are visible.
4. Controlled projection preview
   - An approved clean `cau_001` item displays a hidden scholarship-compatible payload.
   - `is_verified=false`, `list_on_home=false`, and `publicExposureEnabled=false` remain visible in evidence.
   - Blocked or unresolved sources never produce a payload.
5. `/scholarships`
   - Existing honest report-backed prototype state remains unchanged.
   - No L pilot row leaks into the public list.
6. `/scholarships/[numeric-id or compatible test route]`
   - Numeric route parsing and existing DB-backed behavior remain intact.
   - The controlled preview does not allocate or replace a numeric public route.

## Viewports and runtime checks

- desktop: 1440 x 1000
- mobile: 390 x 844
- no horizontal overflow at 390 px
- no incoherent overlap in evidence, history, comparison, or preview sections
- no browser console error attributable to L
- no external LLM request
- no public pilot leakage

Structured results and screenshots are written under `reports/post-phase-l-browser/` only after the owner gate. The pre-apply readiness artifact deliberately records the walkthrough as incomplete.
