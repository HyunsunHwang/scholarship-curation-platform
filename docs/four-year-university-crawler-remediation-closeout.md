# Four-year university crawler remediation closeout

## 1. Purpose and scope

Recover as many as possible of the **90 error sources** from the nationwide 4-year university HQ scholarship-notice crawl (`data/notice-sources-four-year-univ.csv`), classify every failure with evidence, and leave a clear path to `crawled_notices` → admin review → scholarships.

Repository: `HyunsunHwang/scholarship-curation-platform`  
Branch: `remediation/four-year-univ-crawler-90`  
DB writes: **not performed** (ingest dry-run only).

## 2. Starting state (2026-07-30 initial crawl)

| Metric | Value |
|--------|------:|
| Sources | 188 |
| Success | 98 |
| Success with list items | 78 |
| Success but 0 items | 20 |
| Errors | 90 |
| Observed | 702 |
| Keyword matched | 293 |
| New notices | 283 |

Error buckets: `empty_observed` 65, `network_error` 11, `attempt_timeout` 6, `partial` 4, `http_error` 2, `transport_http_forbidden` 1, `transport_redirect_limit` 1.

## 3. Investigation method

1. Extract error-90 + success-zero-20 inventory.
2. Run `diagnose-notice-sources.mjs` on those 110 sources.
3. Cross with `crawler-operational-diagnostics` (`primary_failure_code`, access profiles).
4. Spot-fetch live HTML (e.g. Konkuk `artclList.do`) to confirm onclick/`artclView.do` patterns.
5. Apply common config/code fixes; retry the 110 sources; merge results for all 188.

Diagnose buckets on the 110: `ok` 39, `fallback_scan` 26, `link_extract_fail` 18, `fetch_error` 16, `selector_miss` 11.

## 4. Failure cause distribution (initial error 90)

| root_cause_category | count |
|---------------------|------:|
| onclick_event_url_required | 44 |
| list_selector_mismatch | 13 |
| network_dns_or_tls_failure | 11 |
| detail_url_resolution_failed | 7 |
| timeout | 6 |
| http_forbidden | 3 |
| valid_zero_recent_posts | 3 |
| unknown_requires_manual_review | 2 |
| redirect_loop | 1 |

**Dominant confirmed root cause:** `tune-notice-sources.mjs` wrote a narrow `notice_url_pattern` that **excluded** `artclView.do`. The default parser pattern already included `artclView.do`, so tuned `.do` boards matched list rows then dropped every detail URL → `empty_observed` / `URL_RESOLUTION_FAILED`.

## 5. Common fixes applied

| Change | File(s) |
|--------|---------|
| Prefer explicit `university_slug` over `source_id` first segment | `lib/notice-sources-loader.mjs`, sync/merge scripts |
| Expand `DO_DETAIL_URL_PATTERN` to include `artclView.do`, `nttId`, `artclNo` | `scripts/tune-notice-sources.mjs` |
| Expand `DEFAULT_NOTICE_URL_PATTERN` similarly | `lib/crawler-engine/crawler-list-parser.mjs` |
| Generic `jf_viewArtcl(site, board, id)` URL builder | `lib/crawler-adapters/index.mjs` |
| Rewrite CSV patterns (105 rows); clear 11 `selector_miss` list selectors | `data/notice-sources-four-year-univ.csv` |
| HTTP preserve-http bindings for 8 legacy HTTP list URLs | `config/crawler-transport/transport-policies.json` |

## 6. New parser profiles / adapters

No new named adapter. Shared generic improvements only (`jf_viewArtcl` + URL patterns). Source-specific adapters remain the next step for unresolved CMS outliers.

## 7. Error-90 outcomes

| Outcome | Count |
|---------|------:|
| Recovered with list items | 32 |
| Moved to success but 0 items | 7 |
| Still unresolved | 51 |
| **Total** | **90** |

Examples recovered: 가천대, 가톨릭관동대, 건국대, 경남대, 고려대(세종), 국립목포대, 국립한국교통대, 나사렛대, 한국외대, …

Unresolved clusters: remaining event-URL boards, network/TLS/timeout, selector miss, WAF/403.

## 8. Success-98 minimum validation

- Top producers (동서대, 전주대, 연세대 미래, 경성대, …) kept `LIST_DETAIL_PAGES` topology in operational diagnostics; keyword matching applied after list observation.
- Smoke re-crawl of previously failing HQ boards (건국/가천/관동) returned scholarship-titled `artclView.do` URLs — pattern fix does not appear to invent menu noise for that CMS family.
- Original success-zero 20 rechecked in retry cohort; several remain zero (date filter / undated) and are tagged `valid_zero_recent_posts` or empty-board confirmation needed — **not** silently treated as healthy coverage.
- Full per-row title↔detail identity verification for all 98 was **not** completed; residual risk recorded as release blocker.

## 9. Final collectable sources

| Metric | Final (merged) |
|--------|---------------:|
| Success | 137 |
| Success with list items | 110 |
| Errors | 51 |
| Observed items | 1012 |
| Keyword matched | 563 |
| Recent/new notices | 553 |
| Launch eligible | 60 |
| Candidate handoff ready | 60 |

## 10. Recent 1-month / lookback candidates

Crawl used `CRAWL_LOOKBACK_DAYS=90` for remediation recall. Product backfill window in the brief is **2026-06-30+**; date states for undated posts remain `date_not_stated` / filtered when `allowUndated=false`. Do not treat pin posts as recent solely due to sort order.

## 11. DB / admin handoff

- Crawl CSV lacks `source_group`; prepared `exports/notices-four-year-univ/scholarship-notices-merged-for-ingest.csv`.
- `INGEST_DRY_RUN=true` attempted against that file (see remediation JSON for result).
- **No production `crawled_notices` write** in this pass.
- Admin review / scholarship promotion not started.

## 12. Release blockers

1. 51 unresolved HQ sources (network, selector, remaining event URLs).
2. Detail identity verification uneven (`DETAIL_IDENTITY_UNVERIFIED` common even on successes).
3. Ingest path needs `source_group` (and confirmed non-prod vs prod target) before apply.
4. `launch_eligible` currently requires matched>0; many boards with undated-only posts need explicit undated policy.
5. False-success audit of all 98 not exhaustive.

## 13. Reusable core

- Expanded notice URL patterns for Korean `.do` / `artclView` CMS.
- `jf_viewArtcl` generic script URL resolution.
- `deriveUniversitySlug` prefers CSV slug (`ou_{id}` no longer collapses to `ou`).
- Inventory + remediation report scripts under `scripts/build-four-year-*.ts|mjs`.

## 14. Advanced R&D (deferred)

Playwright/XHR capture, per-CMS adapters, advanced dedupe engine, Beta Extraction Contract field expansions.

## 15. Obsolete path

Narrow tune pattern `(mode=view|articleNo=|boardNo=|nttNo=|idx=|no=\d+)` without `artclView.do` — superseded.

## 16. Unresolved sources — next actions

See `reports/university-beta/four-year-university-source-remediation.csv` columns `remaining_blocker` and `exact_next_action` for all 188 rows (filter `initial_status != success` and `recovered=false`).

Priority B examples still open: 고려대(서울) network, 강원대 403, several TLS/`fetch failed` hosts.

## 17. Exact resume point

1. Continue Priority-B unresolved sources with live HTML capture for remaining `onclick_event_url_required` / `list_selector_mismatch`.
2. Confirm ingest target env; run `INGEST_DRY_RUN` then `--apply` only on approved env.
3. Tighten detail-identity checks for launch-eligible cohort before admin queue flood.
4. Optionally re-crawl full 188 with fixed CSV for a single coherent latest report (current “final” merges initial success-78 with retry-110).

## Verdict

**CONDITIONAL PASS** — 32 of 90 errors recovered with items; 60 sources launch-eligible for candidate handoff dry-run; 51 unresolved with classified next actions; no production DB write.
