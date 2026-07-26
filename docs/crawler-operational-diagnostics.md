# Crawler operational diagnostics metric semantics

`operational-crawl-diagnostics-v2` preserves its CSV column order for
compatibility. Its navigation-contamination metrics changed meaning on
2026-07-26, so reports produced before and after that change must not compare
`contaminated_candidate_leak_count` as though it represented the same fact.

| Metric | Current meaning |
| --- | --- |
| `contaminated_candidate_leak_count` | Compatibility alias for `candidate_navigation_leak_count`: the number of final candidates whose selected node came from a navigation or pagination container. |
| `candidate_navigation_leak_count` | The selected-candidate navigation/pagination leak count used to emit `LIST_SELECTOR_MENU_CONTAMINATION`. |
| `navigation_url_overlap_count` | The number of otherwise valid candidate URLs also observed in navigation, sidebar, recent-post, or menu markup. It is evidence only and does not emit `LIST_SELECTOR_MENU_CONTAMINATION`. |
| `filtered_navigation_anchor_count` | Navigation-container anchors excluded before candidate creation by the generic parser. |
| `filtered_pagination_anchor_count` | Pagination-container anchors excluded before candidate creation by the generic parser. |

The generic parser treats structural container membership as the only
high-confidence reason to pre-filter a link. A `page=` query parameter alone is
not pagination proof: valid detail URLs can use the same parameter. Candidate
provenance remains internal and is not added to the public notice payload.

Consumers of pre-2026-07-26 reports should treat the old
`contaminated_candidate_leak_count` as historical URL-overlap evidence. For new
reports, use `navigation_url_overlap_count` for that purpose.
