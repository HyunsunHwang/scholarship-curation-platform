# Unresolved-51 root cause clusters

Generated: 2026-07-30T12:35:57.501Z

## Probe clusters (pre-fix evidence)

| Cluster | Count | Source IDs |
|---------|------:|------------|
| selector_mismatch | 21 | ou_1732_univ_001, ou_1786_univ_001, ou_1821_univ_001, ou_1864_univ_001, ou_1986_univ_001, ou_2074_univ_001, ou_2081_univ_001, ou_2106_univ_001, ou_2112_univ_001, ou_2163_univ_001, ou_2246_univ_001, ou_2468_univ_001, ou_2515_univ_001, ou_10_univ_001, ou_2909_univ_001, ou_3064_univ_001, ou_8_univ_001, ou_3209_univ_001, ou_3436_univ_001, ou_3437_univ_001, ou_3518_univ_001 |
| http_403_waf | 7 | ou_1737_univ_001, ou_1751_univ_001, ou_2015_univ_001, ou_2173_univ_001, ou_2700_univ_001, ou_3198_univ_001, ou_3229_univ_001 |
| onclick_post_event_url | 7 | ou_1745_univ_001, ou_1779_univ_001, ou_2266_univ_001, ou_12_univ_001, ou_2292_univ_001, ou_2791_univ_001, ou_3509_univ_001 |
| tls_network_timeout | 13 | ou_1888_univ_001, ou_1923_univ_001, ou_1_univ_001, ou_2062_univ_001, ou_2149_univ_001, ou_2238_univ_001, ou_2257_univ_001, ou_2579_univ_001, ou_2981_univ_001, ou_3003_univ_001, ou_3187_univ_001, ou_3342_univ_001, ou_1618_univ_001 |
| other | 1 | ou_2097_univ_001 |
| invalid_list_url | 2 | ou_2355_univ_001, ou_2401_univ_001 |

## Probe root_cause_category counts

| Category | Count |
|----------|------:|
| list_selector_mismatch | 21 |
| network_dns_or_tls_failure | 13 |
| login_required | 6 |
| detail_url_resolution_failed | 6 |
| not_a_notice_list | 2 |
| http_403 | 1 |
| unknown_requires_manual_review | 1 |
| onclick_javascript | 1 |

## Notes

- Probe intentionally avoided treating bare `network_error` / `empty_observed` / `partial` as final root causes.
- Common remediations applied: expanded detail URL pattern (`view.do`, `nttSn`, `brdIdx`, `DOC_NO`, `BoardView`, `portalBbs`, …), `data-id`→`selectNttInfo`, `jf_view`, `goView` (boardCnts), `goDetail`, `fn_search_detail`, `fnView` (UOS), `goBdView`, `pf_DetailMove`, `doDetail`, `fn_View` (CUP), `cau_portal` defaults, `duksung_bbs_ajax` adapter.
