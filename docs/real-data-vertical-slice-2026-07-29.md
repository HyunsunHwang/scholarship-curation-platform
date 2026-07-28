# Real-Data Vertical Slice — 2026-07-29

## Result: HOLD

This bounded attempt did not reach a data-bearing ingest. No sandbox apply, review action,
or public-exposure action was performed.

## Selected source and bounds

- Source: `cau_001` — 중앙대 경영학부
- Selection basis: existing Git manifest entry, generic HTML adapter, public list/detail
  URLs, and prior bounded-run evidence of detail and attachment metadata collection.
- Input: `manifest:cau` with the exact `CRAWL_SOURCE_ID_ALLOWLIST=cau_001` allowlist.
- Bounds: one source, one list page, five list observations maximum, source concurrency one.
- Data access: public university site only; no Supabase source lookup was used.

The initial CSV-input attempt was stopped before any source request because the CSV-wide
transport-registry validation rejected unrelated `cau_072`. The manifest input was used for
the bounded attempt because it validated the checked-in source registry and still selected
only `cau_001`.

## Collection outcome

The bounded crawler reached the list page and observed exactly five current list items. All
five were preliminary `not_candidate` results with
`scholarship_keyword_not_found`; no item was eligible for detail fetch or downstream ingest.
The list titles, dates, and actual detail URLs were:

| Title | List date | Detail URL | Candidate result |
| --- | --- | --- | --- |
| 2026학년도 2학기 휴,복학 신청 안내 | 2026.07.22 | `bbsIdx=7435` | `not_candidate` |
| 2026학년도 2학기 수강신청(학부) 일정 안내 | 2026.07.20 | `bbsIdx=7432` | `not_candidate` |
| 2026년 8월 졸업대상자 졸업사정 및 학사학위취득 유예 신청 안내 | 2026.06.29 | `bbsIdx=7425` | `not_candidate` |
| 2026학년도 2학기 경영학부 재입학 신청 안내 | 2026.06.15 | `bbsIdx=7417` | `not_candidate` |
| 경영학부 수업 삼수강 신청 안내 | 2026.04.13 | `bbsIdx=7377` | `not_candidate` |

The full URLs are retained only in the local bounded-run artifact under `/private/tmp`; this
document deliberately does not copy bodies or attachment content. The crawler made one
diagnostic detail probe successfully, but that probe is not a scholarship candidate and
does not turn any of the five list items into ingestion input.

## Ground-truth and review status

No candidate reached detail fetch, so title/URL/source-identity ground-truth comparison for
a data-bearing record, body/attachment comparison, and review-safety preview are all
**NOT AVAILABLE**. There is no basis to infer a mismatch, a quality state, or a duplicate
from non-candidate items. `no_assets` was not treated as a rejection criterion.

## Dry-run

`scripts/ingest-post-phase-l.mjs` was run without `--apply` against the bounded local
crawler artifact. It used the exact approved sandbox target ref
`hrayfvdggbhfmmzfblly`; the target guard matched and production detection was false.

| Planned table | Rows |
| --- | ---: |
| `ingestion_crawl_runs` | 1 |
| `ingestion_source_run_results` | 1 |
| `ingestion_notices` | 0 |
| `ingestion_notice_occurrences` | 0 |
| `ingestion_notice_revisions` | 0 |
| `ingestion_notice_assets` | 0 |
| `review_items` | 0 |
| `crawled_notices` compatibility rows | 0 |

The dry-run made no remote read or write. It confirms that applying this input would only
record a zero-candidate source result, not the requested five real notice records.

## Decision and next condition

The five-record vertical slice is not proven. A sandbox write would not satisfy its stated
purpose, so it is prohibited for this attempt. No second write or idempotency replay was
performed.

A future attempt needs one separately selected, existing supported source whose first
bounded five observations contain eligible scholarship candidates. Before any apply it must
repeat the five-record ground-truth comparison and satisfy the apply gate; it must not alter
candidate policy solely to force these five non-scholarship notices through the pipeline.
