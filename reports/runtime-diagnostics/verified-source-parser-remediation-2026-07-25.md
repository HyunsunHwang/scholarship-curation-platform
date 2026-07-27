# Verified source parser remediation — 2026-07-25

- Base branch: `fix/navigation-contamination-diagnostic` (70771aaeee89f74fb10ee10dff46cb8b3170cd38)
- Branch: `fix/verified-source-parser-remediation-v2` (e9588d75c5fd836b93e1f64ea2a7cc304cc347cf)
- Target sources: 87; classified: 87.
- A/B paired execution: 545 Sources each; no database read/write, production access, or external LLM calls.

## Final-state counts

| State | Count |
| --- | ---: |
| adapter_required | 2 |
| configured_selector_applied | 2 |
| manual_review_required | 80 |
| source_unreachable | 1 |
| verified_heuristic_safe | 2 |

## Paired regression

- B-induced hard failures: 0
- Shared external failures: skku_013 (http_error)
- Partial: control 1, treatment 0
- LIST_SELECTOR_MENU_CONTAMINATION: control 0, treatment 0

## Source inventory

| Source | State | Parser after | Detail identity | Limitation |
| --- | --- | --- | ---: | --- |
| cau_004 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| cau_009 | manual_review_required | heuristic_anchor | 2 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| cau_013 | adapter_required | heuristic_anchor | 2 | — |
| cau_017 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| cau_021 | manual_review_required | heuristic_anchor | 2 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| cau_022 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| cau_023 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| cau_024 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| cau_025 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| cau_026 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| cau_030 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| cau_037 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| cau_038 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| cau_041 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| cau_065 | manual_review_required | heuristic_anchor | 2 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| cau_068 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| cau_070 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| cau_074 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| cau_075 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| cau_078 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| cau_079 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| cau_080 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| ewha_008 | verified_heuristic_safe | heuristic_anchor | 25 | — |
| hanyang_006 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| hanyang_010 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| hanyang_011 | configured_selector_applied | configured_selector | 1 | — |
| hanyang_013 | configured_selector_applied | configured_selector | 0 | — |
| hanyang_017 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| hanyang_018 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| hanyang_019 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| hanyang_022 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| hanyang_025 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| hanyang_033 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| hanyang_034 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| hanyang_035 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| hanyang_036 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| hanyang_038 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| hanyang_039 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| hanyang_040 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| hanyang_061 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| hanyang_062 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| hanyang_063 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| hanyang_064 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| hanyang_065 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| hanyang_066 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| hanyang_068 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| hanyang_070 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| hanyang_071 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| hanyang_072 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| hanyang_074 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| hanyang_075 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| hanyang_076 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| hanyang_077 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| hanyang_079 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| hanyang_080 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| hanyang_081 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| hanyang_082 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| hanyang_083 | manual_review_required | heuristic_anchor | 1 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| hongik_024 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| khu_123 | manual_review_required | heuristic_anchor | 2 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| khu_132 | manual_review_required | heuristic_anchor | 1 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| korea_001 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| korea_031 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| korea_034 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| korea_036 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| korea_037 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| korea_053 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| korea_054 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| korea_055 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| korea_056 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| korea_057 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| korea_058 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| korea_060 | adapter_required | heuristic_anchor | 1 | — |
| korea_062 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| korea_069 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| korea_070 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| korea_076 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| skku_009 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| skku_013 | source_unreachable | n/a | 0 | — |
| skku_042 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| skku_059 | manual_review_required | heuristic_anchor | 1 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| uos_045 | verified_heuristic_safe | heuristic_anchor | 5 | — |
| yonsei_022 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| yonsei_024 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| yonsei_026 | manual_review_required | heuristic_anchor | 1 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| yonsei_036 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |
| yonsei_057 | manual_review_required | heuristic_anchor | 0 | Need authoritative list/detail identity evidence before selector, profile, or URL changes. |

