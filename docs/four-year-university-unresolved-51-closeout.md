# Four-year university unresolved-51 deep remediation closeout

## 1. Clarification (why prior closeout was not this work)

The previously submitted `docs/four-year-university-crawler-remediation-closeout.md` was the **90-error first remediation** closeout (`remediation/four-year-univ-crawler-90`). It still said:

- Purpose: recover 90 error sources
- Recovered with items: 32 / success-zero: 7 / still unresolved: 51
- Exact resume point: continue investigating the remaining 51
- Source-specific adapters: next step

That document was **not** a completed 51-source deep pass. No 51-only baseline freeze, 51 diagnostics, or 51 outcome accounting had been produced.

This document is the **new** unresolved-51 workstream.

## 2. Scope

| Item | Value |
|------|------:|
| Baseline | exactly 51 sources where `final_status != success` after rem-1 |
| Source CSV | `data/notice-sources-four-year-univ.csv` (188 total) |
| Branch | `remediation/unresolved-51-deep-fix` |
| Production DB writes | **none** |

## 3. Baseline freeze

Artifact: `reports/university-beta/unresolved-51-baseline.csv` (+ `.json`)

Checks:

- rows = **51**
- unique `source_id` = **51** (duplicates = 0)
- missing vs original 188 inventory = **0**

Script: `node scripts/freeze-unresolved-51-baseline.mjs`

## 4. Investigation method

1. Deep probe all 51 live URLs → `unresolved-51-diagnostics.json`
2. Diagnose bucket pass → `unresolved-51-diagnose.json/`
3. Classify into evidence-backed clusters (not bare `network_error` / `empty_observed` / `partial`)
4. Apply common pattern/adapter fixes first; source-specific only when needed
5. Re-crawl 51 (plus timeout micro-retry), then full 188 regression crawl

## 5. Root-cause clusters (probe)

See `reports/university-beta/unresolved-51-root-cause-clusters.md`.

Dominant confirmed causes before this fix pass:

| Cluster | Count | Typical evidence |
|---------|------:|------------------|
| selector / URL-pattern gap | 21 | list rows present; detail URLs used `view.do` / `nttSn` / onclick builders excluded by pattern |
| TLS / network / timeout | 13 | fetch failed before HTTP status |
| 403 / login / WAF | 7 | HTTP 403 or login-only boards |
| onclick / POST / event URL | 7 | `goDetail`, `jf_view`, `goView`, `data-id`, `fnView` |
| invalid list URL | 2 | HTTP OK but not a notice list |
| other | 1 | KMOU HTTP 404 |

## 6. Remediation applied

### Common

- Expand detail URL pattern: `view.do`, `nttSn`, `brdIdx`, `DOC_NO`, `BBS_SEQ`, `BoardView.do`, `selectNttInfo.do`, `portalBbs`, `/article/.../detail/`, `boardView.do`, `detailView.do`, `scholarDetail.do`, …
- Files: `lib/crawler-engine/crawler-list-parser.mjs`, `scripts/tune-notice-sources.mjs`, CSV `notice_url_pattern`

### Shared CMS adapters / URL builders (`lib/crawler-adapters/index.mjs`)

- `data-id` / `nttInfoBtn` → `selectNttInfo.do?nttSn=`
- `jf_view(site, fnct, id)` → `/portalBbs/.../view`
- `goView(boardID, boardSeq, …)` → `boardCnts/view.do`
- `goDetail(id)` → `/article/notice/detail/{id}`
- `fn_search_detail(nttId)` → `view.do?nttId=`
- `fnView(date, seq)` (UOS scholarship)
- `goBdView(bdId)` (Nambu)
- `pf_DetailMove(id)` (JBNU)
- `doDetail(id)` (Yongin)
- `fn_View(boardMngNo, boardNo)` (CUP)
- `cau_portal` default config for FR_CON XHR boards (CAU / Konkuk Glocal)
- new list adapter `duksung_bbs_ajax` for Duksung POST JSON list

### CSV selector / adapter updates

Script: `scripts/apply-unresolved-51-csv-fixes.mjs`  
Examples: UOS `li.main_notice_news`, CAU/KKU `adapter=cau_portal`, Duksung `adapter=duksung_bbs_ajax`.

## 7. Verification

### Unresolved-51 re-crawl

```
CRAWL_SOURCE_ID_ALLOWLIST=<51 ids>
CRAWL_MAX_PAGES_PER_SOURCE=2
CRAWL_MAX_ITEMS_PER_SOURCE=15
CRAWL_LOOKBACK_DAYS=120
node scripts/crawl-scholarship-notices.mjs data/notice-sources-four-year-univ.csv exports/notices-unresolved-51-retry2 ...
```

Timeout micro-retry (6 sources, max items 5) merged into best-of result.

Recovered sources were checked for **list title + detail URL identity** (not list count alone). Examples:

- 동국대 `.../article/notice/detail/213247`
- 창원대 `.../selectNttInfo.do?...&nttSn=...`
- 중앙대 `BoardView.do?...&BBS_SEQ=...` via `cau_portal`
- 덕성여대 `boardView.do?bsIdx=36&bIdx=...` via `duksung_bbs_ajax`

### Full 188 regression crawl

```
node scripts/crawl-scholarship-notices.mjs data/notice-sources-four-year-univ.csv exports/notices-four-year-univ-final ...
```

| Metric | Rem-1 baseline | After unresolved-51 |
|--------|---------------:|--------------------:|
| Success | 137 | **150** |
| Success with list items | 110 | **115** |
| Errors / non-success | 51 | **38** (incl. partial) |
| Observed / matched | — | 1001 / 713 |

No regression on rem-1 success floor (137 → 150, with-items 110 → 115).

## 8. Outcome accounting (must sum to 51)

| Outcome | Count |
|---------|------:|
| recovered with items | **23** |
| recovered valid zero | **0** |
| replacement source found | **0** |
| verified external block | **6** |
| verified no central board | **2** |
| temporarily unavailable | **16** |
| still unresolved | **4** |
| **Sum** | **51** |

Artifacts:

- `reports/university-beta/unresolved-51-remediation.csv`
- `reports/university-beta/four-year-university-final.csv`
- `reports/university-beta/four-year-university-final.json`

## 9. Still open / next actions

- Temporarily unavailable: DNS/TLS/timeout hosts (경운, 계명, 고려대 scholarship host, 목포해양, 한밭 detail timeout, …) — re-probe later; no aggressive WAF bypass.
- Verified external block: 강원대 403, login-gated boards (강남/광주여대/남서울/세한/청주교대 등).
- Still unresolved: boards needing further CMS discovery (국민대 archive-like page, 동덕, 광신 login rows, etc.).
- URL replacements for KMOU 404 / Luther English notice not confirmed as official central scholarship boards.

## 10. Git

- Branch: `remediation/unresolved-51-deep-fix`
- Start commit: `d4864f3` — Freeze unresolved-51 baseline and live diagnostics
- Final commit: (this closeout commit)
- Remote push: pending at closeout authoring time
- Production ingest: not run

### Changed files (this workstream)

- `lib/crawler-adapters/index.mjs`
- `lib/crawler-engine/crawler-list-parser.mjs`
- `scripts/tune-notice-sources.mjs`
- `scripts/apply-unresolved-51-csv-fixes.mjs`
- `scripts/build-unresolved-51-deliverables.mjs`
- `scripts/freeze-unresolved-51-baseline.mjs`
- `scripts/probe-unresolved-51-diagnostics.mjs`
- `data/notice-sources-four-year-univ.csv`
- `reports/university-beta/unresolved-51-*`
- `reports/university-beta/four-year-university-final.csv|json`
- `docs/four-year-university-unresolved-51-closeout.md`

### Commands

```
node scripts/freeze-unresolved-51-baseline.mjs
node scripts/probe-unresolved-51-diagnostics.mjs
node scripts/apply-unresolved-51-csv-fixes.mjs
# 51 retry + timeout micro-retry + full 188
node scripts/crawl-scholarship-notices.mjs data/notice-sources-four-year-univ.csv <out> <state>
node scripts/build-unresolved-51-deliverables.mjs <51-best.json> <full-188.json>
```
