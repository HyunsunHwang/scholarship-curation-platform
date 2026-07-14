# Post-Phase F-2 Bounded Source Spot-Check Results

These checks are public, bounded observations. Each source used one list page and at most one representative detail page. They are not a crawler run, source inventory proof, pagination audit, attachment-completeness audit, or scholarship-absence conclusion.

| Source | List/detail | Body evidence | URL result | Attachment observation | Before to after | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| `cau_003` | List 200; no safe detail URL found | Not verified | Not verified | Not checked | blocked to blocked | Deferred; add list/detail fixture first. |
| `cau_010` | List 200; representative detail 200 | Insufficient body evidence | Canonical KBoard document URL | KBoard attachment metadata observed | blocked to needs_review | Adapter evidence is bounded; defer body/attachment interpretation. |
| `cau_011` | List 200; representative detail 200 | `#bo_v_con`, normalized length 720 | Canonical numeric `wr_id` URL | Not observed on representative page | blocked to needs_review | P0 selector and URL evidence retained for review. |
| `cau_013` | List 200; representative detail 200 | `.entry-content`, normalized length 321 | Stable permalink observed | Not observed on representative page | blocked to needs_review | P0 selector evidence retained for review. |

The machine-readable counterpart is `reports/post-phase-f2-source-spot-check-results.json`. Future source-key/source-id differences need an explicit mapping source. Fuzzy matching and automatic source creation remain prohibited.
