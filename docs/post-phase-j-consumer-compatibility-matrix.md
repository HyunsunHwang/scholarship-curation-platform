# Post-Phase J Consumer Compatibility Matrix

| Consumer | Current data source | Future source | Requirement | Adapter/projection | Read/write change | Cutover prerequisite and rollback | J action / future unit |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `notice_sources` registry | Existing source registry | Same registry | Preserve `source_id`; exact mapping only. | Graph FK and source-key snapshot. | None in J. | Target FK/RLS inventory; rollback is no graph activation. | Documented / J-M1. |
| Source registry scripts | CSV and existing source policy | Same plus graph source reference | No fuzzy match or automatic creation. | Read-only resolver/comparison. | None in J. | Mapping exception review; retain current scripts. | Designed / J-M2. |
| Admin review queue | `crawled_notices` | Same until approved graph adapter | Keep physical table while writers remain. | Future graph-to-compatibility read adapter. | No read or write change in J. | Parity evidence and separate approval; revert reader to table. | Designed / J-M4. |
| Crawled notice promotion/rejection | `crawled_notices` then `scholarships` | Same current behavior | Preserve lifecycle and linked scholarship ID. | Future append-only event projection, not active. | No change in J; no dual-write. | Event/projection parity and replay; retain current actions. | Designed / J-M5. |
| Admin scholarship CRUD | `scholarships` plus dependent tables | Same | Numeric IDs and CRUD remain authoritative first stage. | Later mapping by `scholarship_projection_mappings`. | None in J. | Public and admin regression suite; retain direct CRUD. | No change / J-M5. |
| Public scholarship list/detail | `scholarships` routes plus current product data | Same initially | Preserve IDs and `/scholarships/[id]`. | Later approved-review to scholarship projection. | None in J. | Reconciliation and route parity; legacy table remains. | No change / J-M5. |
| G report-backed public MVP | F-0/F-1 JSON | Same report fixtures | Treat as prototype evidence, not product persistence. | No DB projection activated. | None. | Existing report validation; no rollback needed. | Explicitly classified / later retirement decision. |
| Normalized graph adapter | Fixtures/local JSON | Graph tables only after J-M1 | Fail closed for unresolved source and non-clean review. | Read-only comparison adapter. | No legacy write. | Deterministic comparison and counts; disable adapter. | Designed / J-M2. |
| `site_settings` consumers | Runtime `site_settings` expectation | Same | Do not couple to graph migration. | None. | None. | Target inventory/cache check; unchanged runtime. | Documented / J-M0. |

First-stage decisions are fixed: `scholarships` is unchanged, `crawled_notices` remains a physical table, production dual-write is not approved, and compatibility projection is designed but inactive.
