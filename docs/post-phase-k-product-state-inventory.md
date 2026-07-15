# Post-Phase K Current Product State Inventory

The structured inventory is `reports/post-phase-k-product-state-inventory.json`.

## Public Product

- `/scholarships` and `/scholarships/public-[canonical-key]` are **report-backed** G MVP routes. They are now explicitly marked as a reviewed report snapshot, not live crawl output or a DB-backed public projection.
- The report model applies a fail-closed exposure policy. Hidden, unresolved, duplicate-risk, blocked, and insufficient-evidence candidates are not public evidence of absence or deletion.
- Numeric `/scholarships/[id]` remains protected DB-backed product behavior. K preserves it and does not claim that it is the G report projection.

## Admin Product

- `/admin/review` and `/admin/review/scholarships/[id]` are **DB-backed** `crawled_notices` compatibility flows. K exposes source ID, body/attachment availability, observation information, and the legacy row-mutation boundary.
- A non-`new` crawled notice now renders a closed review state instead of another promotion form. Rejected items may be restored; promoted items cannot be restored or re-promoted and must be managed through their linked public record.
- The local K browser environment had no authorized Supabase configuration, so DB-backed admin routes are recorded as environment-blocked rather than visually verified live state.
- `/admin/content?kind=scholarship` remains DB-backed direct CRUD with existing numeric identifiers. It is not reclassified as crawler projection.
- `/admin/crawler-review` is **report-backed**, read-only diagnostics. K explicitly labels it as a snapshot rather than live monitoring.

## Prototype Disposition

K replaces misleading presentation on the selected service path with visible backing/state boundaries. It does not invent live data, expose blocked candidates, replace the current review lifecycle, or create a parallel UI.
