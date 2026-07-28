# Real-Data Vertical Slice retry — 2026-07-29

## Source selection (evidence-first)

This retry selects one source before any live request. The comparison is limited to
the checked-in crawler evidence below; it does not probe candidate sources.

| Source | Existing evidence | Detail/data quality | Decision |
| --- | --- | --- | --- |
| `yonsei_060` — 연세대 언더우드국제대학 | `reports/post-phase-n-q/live-yonsei-060-remediation/scholarship-notices-20260716.json` recorded 30 observations and 2 new matched candidates | Both candidates had an original detail URL, parsed date, body (`5398` and `215` characters), and attachment/image metadata | **Selected** |
| `cau_001` — 중앙대 장학 | The 2026-07-29 bounded attempt observed five recent list items and found zero candidates | No data-bearing candidate was available for the next gate | Not selected |
| `cau_003` — 중앙대 IADPR | Existing phase-N evidence contains one candidate only | One historic body (`657` characters), no asset evidence | Not selected: cannot meet the at-least-two gate |

`yonsei_060` is the only compared source with two existing data-bearing candidate
records. Its historic matches occurred at list positions 4 and 29, so this retry
uses the explicitly permitted 30-observation bound rather than a five-observation
probe.

## Collection contract

- Source: `yonsei_060` only, via `manifest:yonsei`
- Maximum list pages: 3; maximum observations: 30
- Maximum detail-bearing candidates: 5; source concurrency: 1
- Candidate keyword policy and adapters remain unchanged.
- The result is HOLD before any database write unless the live run yields 2–5
  candidates with valid original detail evidence.

The candidate cap is enforced in the detail-fetch planner. Entries beyond the cap
are recorded with `candidate_limit_reached` and never enter final candidate output.

## Live collection result — HOLD

The selected source was collected once at `2026-07-28T17:26:03.471Z` (UTC) using
the contract above. The local artifact is intentionally outside the repository at
`/private/tmp/real-data-vertical-slice-retry/crawler/scholarship-notices-20260729.json`.

| Gate evidence | Result |
| --- | --- |
| Requested/processed source count | 1 / 1 (`yonsei_060`) |
| List pages / observations | 1 / 30 (within the 3 / 30 bounds) |
| Detail-bearing candidate cap | 5 configured; 0 planned |
| Preliminary classifications | 0 candidate, 29 not-candidate, 1 out-of-range |
| Final data-bearing candidates | 0 |
| Runtime | list and one diagnostic detail probe succeeded; no provider or database access |

The current page exposed no parsed list dates (`date_extract_count=0`) and the
generic parser reported `INLINE_NOTICE_STRUCTURE_DETECTED` / `ADAPTER_REQUIRED`.
The historic detail URLs are therefore not enough to claim current candidate
ground truth. The retry does **not** relax keywords or add an adapter: that would
expand this vertical-slice scope.

Because the candidate-count gate requires 2–5 current candidates, this attempt
stops before ground-truth comparison, review-safety preview, ingest dry-run,
sandbox apply, read verification, UI confirmation, public-read verification, or
idempotency dry-run. No database write, production access, public publication,
LLM/provider call, pilot modification, or source retry occurred.
