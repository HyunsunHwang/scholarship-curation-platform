# Unresolved-51 verification fix (pre-main)

Generated: 2026-07-30

This supersedes the earlier “No regression” claim in the first unresolved-51 closeout.

## 1. Source-level regression vs rem-1

Artifacts:

- `reports/university-beta/regression-rem1-vs-full188-initial.json` (raw full-188 before retries)
- `reports/university-beta/regression-rem1-vs-coherent.json` (after best-of retries)

### Initial full-188 (before regression retries)

| Group | Count |
|-------|------:|
| success → non-success | 7 |
| with-items → zero/non-success | 16 |
| recovered_with_items → full non-success | 1 |

Dominant cause: `attempt_timeout` on rem-1 success boards during the concurrent full crawl.

### After targeted retries + coherent best-of

| Group | Count |
|-------|------:|
| success → non-success | **1** (`ou_1878_univ_001` 경성대, HTTP 429 / unavailable) |
| with-items → zero/non-success | **10** (1 hard fail above + 9 `success` with 0 items in 120–365d lookback) |
| recovered_with_items → coherent non-success | **0** (disabled duplicate excluded) |

### Coherent active floors

| Metric | Rem-1 | Coherent active (187) |
|--------|------:|----------------------:|
| Success | 137 | **158** |
| With items | 110 | **123** |

Arithmetic check:

- Unique 51 recoveries after dropping GNTECH duplicate: **22**
- Rem-1 success retained after retries: **136** (137 − 1 remaining)
- Expected success ≈ 136 + 22 = **158** ✓

## 2. Duplicate source resolution

| Source | Action |
|--------|--------|
| `ou_1821_univ_001` 경남과학기술대학교 | `enabled=false` (2021 GNU 통합; identical list_url) |
| `ou_1864_univ_001` 경상국립대학교 | canonical active board |

Outcome for `ou_1821`: `replacement_source_found` → canonical `ou_1864`.

## 3. Outcome taxonomy fix

`verified_no_central_board` is **no longer** assigned from HTTP 404 / homepage redirect alone.

| Outcome | Count |
|---------|------:|
| recovered_with_items | 22 |
| recovered_valid_zero | 0 |
| replacement_source_found | 1 |
| replacement_source_not_found | 2 |
| invalid_list_url | 0 |
| verified_external_block | 6 |
| verified_no_central_board | **0** |
| temporarily_unavailable | 16 |
| still_unresolved | 4 |
| **Sum** | **51** |

`replacement_source_not_found` covers KMOU 404 + Luther invalid English URL after replacement search without a verified board (not “verified absence”).

## 4. Coherent final-188

- `reports/university-beta/four-year-university-final.csv`
- `reports/university-beta/four-year-university-final.json`
- `exports/notices-four-year-univ-coherent/scholarship-notices-coherent.json`

Each `source_id` appears once. Disabled sources are marked `final_status=disabled` and excluded from active Success/with-items floors.

## 5. Remaining residual risk

- `ou_1878` 경성대: rem-1 success board still blocked (429) after retries → counts as the sole success→non regression.
- 9 rem-1 with-items boards currently return success/0 under extended lookback → tracked in regression CSV; not flipped to error status.
