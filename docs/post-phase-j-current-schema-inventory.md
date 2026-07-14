# Post-Phase J Current Schema Inventory

## Evidence classification

Repository evidence is incomplete for the deployed schema. Committed migrations prove only `notice_sources` and recent contest changes. `lib/database.types.ts` proves generated client expectations, not complete migration history. Runtime consumers prove required table/field behavior, not target-environment presence.

| Entity | Evidence and schema shape | Readers and writers | Exposure/lifecycle | Confidence |
| --- | --- | --- | --- | --- |
| `notice_sources` | Migration `20260709120000`: identity PK `id`, unique `source_id`, FK `org_unit_id`, indexes on university, org-unit, enabled+slug, RLS public select and admin CUD. | Source loader, resolver, source scripts; no generated type entry found. | Source registry; `source_id` is canonical. | Committed migration-backed; target state unknown. |
| `crawled_notices` | Generated type: numeric `id`, source fields, URL/body/image fields, `new/promoted/rejected`, `scholarship_id`, reviewer metadata, seen/run timestamps. Image column has a committed additive migration. No committed create migration is present. | Admin review page and crawled-notice actions read/write it; ingestion scripts name it. | Existing DB-backed review lifecycle. Promotion creates `scholarships`, then mutates this row. | Generated-type and runtime-backed; create/constraints/RLS unknown. |
| `scholarships` | Generated type: numeric `id`, public product attributes, qualification fields, source/original notice fields, timestamps. No committed create migration is present. | Admin CRUD actions, public pages, matching/bookmark/analytics consumers, review promotion. | Current public product domain and `/scholarships/[id]` identity. | Generated-type and runtime-backed; target constraints/RLS unknown. |
| `scholarship_target_units` | Generated type and admin CRUD delete/insert synchronization. | Scholarship admin action writer; matching/runtime reader. | Dependent mutable product data. | Generated-type/runtime-backed; migration evidence absent. |
| `scholarship_selection_stages` | Generated type and admin CRUD delete/insert synchronization. | Scholarship admin action writer; admin/public detail readers. | Dependent mutable product data. | Generated-type/runtime-backed; migration evidence absent. |
| `site_settings` | Generated type has single-row `id`, `header_logo_url`, `updated_at`; legacy page redirects to settings. SQL utility exists outside committed migration history. | Settings/admin and public layout consumers. | Configuration, not ingestion. A build report recorded schema-cache absence warning. | Generated-type/runtime-backed; target presence unknown. |
| `crawler_source_targets` | Mentioned in source-planning context but not found in committed migration or generated types in this checkout. | Source registry planning scripts only, if present in another environment. | Potential operational target config. | Inferred/unknown. |
| `org_units`, aliases, profiles, bookmarks, analytics | Generated types and runtime consumers; `notice_sources.org_unit_id` references `org_units`. | Product/admin/runtime-specific. | Outside first graph migration except FK compatibility. | Generated-type/runtime-backed. |
| `contests`, `crawled_contests`, contest stages | Recent committed migrations and generated types. | Shared review UI uses distinct contest flow. | Out of J scholarship graph scope. | Mixed committed/generated. |

## Consumer map

| Consumer | Current source | DB/report-backed | J compatibility requirement |
| --- | --- | --- | --- |
| Admin scholarship CRUD | `scholarships`, target-unit and selection-stage tables | DB-backed server actions | Remain unchanged in first additive stage. |
| Admin scholarship review queue | `crawled_notices` | DB-backed page/actions | Preserve physical table and current lifecycle. |
| Promotion/rejection/restore | `crawled_notices` and `scholarships` | DB-backed server actions | No behavior or write change in J. |
| Public scholarship product route | `scholarships` and associated data | DB-backed product runtime | Preserve numeric IDs and `/scholarships/[id]`. |
| G public MVP list/detail | F-0/F-1 JSON reports through public read model | Report-backed prototype | Classify as prototype evidence, not persisted projection. |
| Normalized graph adapter | fixtures and local reports | Report-backed/read-only | Remains comparison-only until a later gate. |
| Source registry scripts | CSV snapshots and `notice_sources` design | File-backed plus planned DB use | Exact `source_key -> source_id` resolution only. |
| Site settings | `site_settings` | DB-backed runtime expectation | Inventory target presence/cache before implementation. |

## Migration completeness and non-break contracts

Committed migration history does not reproduce all tables visible in generated types or runtime code. The repository also contains historical SQL utilities outside `supabase/migrations`; these are not evidence of applied migration history. A sanitized target-environment inventory is therefore mandatory before implementation.

The following cannot break: existing scholarship numeric IDs, `/scholarships/[id]`, admin scholarship CRUD, current crawled-notice review/promotion/rejection flow, exact source resolution, and fail-closed public exposure. Zero match and crawler disappearance do not prove deletion or absence.
