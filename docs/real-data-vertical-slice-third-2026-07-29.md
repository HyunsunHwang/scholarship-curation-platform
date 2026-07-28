# Real-Data Vertical Slice — third attempt (2026-07-29)

## 1. Scope

This attempt changed only source selection order: public official boards were
inspected before selecting an existing source. It does not retry `cau_001` or
`yonsei_060`, add an adapter, relax the candidate policy, access production, or
call an LLM/provider. Collection uses one source, at most three list pages,
30 observations, five detail-bearing candidates, and source concurrency one.

## 2. Five curated official boards

The table distinguishes a public-page observation from repository evidence.
Only a board with a visible, repeatable official list was eligible for selection.

| University | Official board | Public-page result | Latest observed scholarship titles | Strict result |
| --- | --- | --- | --- | --- |
| 고려대 | 경영대학 학부 장학 검색 공지 | Official `korea.ac.kr` detail pages expose title, date, body, and attachments; the filtered board is repeatable | `2026학년도 2학기 Dream Scholarship 1차 신청 안내`, `2026년도 1학기 골드만삭스 미래의동반자재단 장학생 선발 안내` | Eligible, not selected |
| 서울대 | Scholarship information page | Official page found, but it was an information page rather than a verified public repeating notice list in this pass | — | Excluded |
| 연세대 | 학생지원팀 장학 공지 | Official `yonsei.ac.kr` detail page exposes author, date, body, and attachment; current five-item list was not independently re-established | `2026학년도 현송교육문화재단 장학생 선발 안내`, `2026년 상반기 서울인재대학장학금 선발 안내` | Not selected |
| 이화여대 | 학생처 장학복지팀 장학공지 | Public list exposes more than five current scholarship notices, dates, detail URLs, and attachment markers without login | `2026-2학기 양영재단 장학생 선발 안내`, `2026-2027 슬로바키아 정부초청 장학생 선발 안내` | **Selected** |
| 한양대 | 학생지원팀 서울 장학공지 | Official list reports 82 items and shows scholarship titles with dates; browser text rendering did not expose distinct detail targets | `2026-2학기 학부생 교내 가계곤란장학 신청`, `2026-1학기 국가장학금(2차) 신청 안내` | Excluded: detail target not verified |

The public evidence is limited to the listed official pages. Search-result text
was not used as the sole basis for the selected source.

## 3. Source inventory mapping

| Official board | Existing source | Mapping | Parser/adapter evidence |
| --- | --- | --- | --- |
| 고려대 경영대학 | `korea_001` | EXACT_MATCH | enabled `generic_html` |
| 연세대 학생지원팀 | `yonsei_069` | EXACT_MATCH | enabled `generic_html`; historic checked-in handoff evidence exists |
| 이화 학생처 장학공지 | `ewha_068` | EXACT_MATCH | enabled `generic_html`, `tbody tr` / date selectors |
| 한양 학생지원팀 | `hanyang_068` | EXACT_MATCH | enabled `generic_html` |
| 서울대 scholarship information page | none | NOT_REGISTERED | not a verified repeating public notice board |

The checked-in manifest, university CSV, source snapshot, and transport registry
all contain `ewha_068`. No duplicate source ID was found for its normalized list
URL. This is manifest evidence only; it does not prove the sandbox
`notice_sources` table has the same row.

## 4. Selected source and rationale

`ewha_068` — 이화여대 학생처 장학복지팀 통합 장학공지

- Official public list, current titles/dates/detail links, and attachment markers
  were visible without login.
- Exact enabled manifest entry and existing generic table-parser support exist.
- No source-specific adapter, session, POST flow, or anti-bot workaround was needed.

## 5. Collection result

Local artifact: `/private/tmp/real-data-vertical-slice-third/crawler/scholarship-notices-20260729.json`

| Bound/result | Value |
| --- | --- |
| Source / pages / observations | `ewha_068` / 1 / 5 |
| Candidate cap / final candidates | 5 / 4 |
| Source concurrency | 1 |
| DB / production / provider access during collection | 0 / 0 / 0 |

The four candidates were article numbers `365411`, `365405`, `365300`, and
`365911`, all from source identity `ewha_068`.

## 6. Ground-truth comparison

The crawler fetched each official detail page; title, date, original URL,
source identity, and non-empty body were compared to the public page evidence.

| Article | Title/date/URL/source | Body | Attachments | Classification |
| --- | --- | --- | --- | --- |
| 365411 | MATCH / 2026-07-01 | MATCH (8,699 chars) | MATCH (2) | candidate |
| 365405 | MATCH / 2026-07-01 | MATCH (8,229 chars) | MATCH (3) | candidate |
| 365300 | MATCH / 2026-07-01 | MATCH (902 chars) | MATCH (0) | candidate |
| 365911 | MATCH / 2026-07-28 | MATCH (1,564 chars) | MATCH (2) | candidate |

No title, URL, or source-identity mismatch was observed.

## 7. Review-safety preview

The existing review policy treats `imageUrls` (not document attachments) as its
asset input. All four records have sufficient text but no image URLs. Because no
duplicate query was performed for the preview, `duplicateEvidenceUnavailable`
was set and every record is conservatively review-required:

- `reasons`: `missing_assets`, `evidence_incomplete`
- `bodyQuality`: `text_sufficient_no_assets`
- `assetCount`: 0; `evidenceIncomplete`: true
- `requiresAdminReview`: true; `publicPublicationAllowed`: false

## 8. Dry-run

`scripts/ingest-post-phase-l.mjs` dry-run used the local artifact and produced:

- target ref `hrayfvdggbhfmmzfblly`; production detection `false`
- exact manifest source resolution for `ewha_068`; fuzzy/create counts 0
- remote reads/writes: 0 / 0
- plan: 4 notices, 4 occurrences, 4 revisions, 7 assets, 4 review items, and
  4 compatibility rows (plus one crawl run and one source result)

## 9. Sandbox apply and verification

The pre-apply environment guard passed: sandbox ref matched, production was
false, service credential presence was confirmed without printing it, and live
provider permission was false.

One apply was attempted and failed at `ingestion_source_run_results` because the
sandbox `notice_sources` table has no `ewha_068` row. The FK prevented every
source-result, notice, occurrence, revision, asset, review item, and compatibility
write. Read-only verification found only the preceding `ingestion_crawl_runs` row
was inserted (count 1); all of those dependent tables have count 0.

No second actual apply was performed.

## 10. Admin/public verification

No review items or compatibility rows exist after the failed apply, so no admin
queue or public-route record is available to inspect. The review preview would
have required admin review and disallowed public publication; no public approval
or publication occurred.

## 11. Idempotency

A second dry-run on the identical artifact produced identical graph counts and
a matching deterministic plan hash. Both dry-runs made zero remote mutations.
This does not authorize replaying the failed apply.

## 12. PASS / CONDITIONAL PASS / HOLD

**HOLD.** The source-selection, bounded collection, ground-truth comparison,
review preview, and dry-run passed, but the sandbox source inventory is not
aligned with the checked-in manifest. The first apply also left a lone crawl-run
row, so recovery requires an explicitly approved, bounded remediation plan:
register/verify `ewha_068` in the sandbox source registry and reconcile the
orphan crawl-run before a new, separately authorized vertical slice. Do not
replay this artifact or run a second apply.

## 13. Git result

This report records the evidence and no source/adapter/LLM/pilot code change.
