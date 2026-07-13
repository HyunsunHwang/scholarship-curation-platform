# Post-Phase 기술 로드맵 확정 및 upstream 구현 중복 검증 보고서

작성일: 2026-07-13

## 1. Executive Summary

결론은 명확하다. 장학금 공고 ingestion의 장기 canonical model은 normalized crawler graph로 확정하는 것이 합리적이다. 다만 upstream 메인 레포에는 이미 `notice_sources`, `crawled_notices`, admin/review UI, contests/education/activity 흐름, source inventory, crawler scripts, Supabase migrations가 진행되어 있으므로 broad merge나 UI/DB 전면 교체는 위험하다.

따라서 최종 방향은 `normalized crawler graph canonical + notice_sources.source_id source canonical + source_key crawler natural key + adapter/read-model first`이다. 이는 결정을 미루는 방식이 아니라, canonical 방향을 확정한 상태에서 기존 upstream UI를 보호하며 전환하는 migration strategy다.

MVP 전에는 adapter/read-model, source identity alignment, rollback/batch observability, review backlog, no_assets/body quality policy가 선행되어야 한다. Coverage 개선과 LLM parsing은 중요하지만, bounded 방식과 review assistant 방식으로 늦춰야 한다.

## 2. 현재 방향성 확정

- 장기 canonical ingestion model: normalized crawler graph.
- DB-level source canonical: upstream `notice_sources.source_id`.
- Crawler-facing natural/idempotency key: `source_key`.
- 단기 통합 방식: adapter/read-model first.
- 중기 전환: admin/review UI를 graph 기반으로 점진 이전.
- 장기 상태: `crawled_notices`는 staging/read-model/legacy compatibility layer로 낮춤.

이 방향은 Post-Phase F product/admin integration 전에 반드시 고정되어야 한다. 특히 `source_id`와 `source_key`의 역할을 분리하지 않으면, 이후 review queue, duplicate handling, rollback, batch observability가 모두 흔들린다.

## 3. 비교 범위와 기준 commit

- User repo: `C:\Users\82108\Documents\Codex\2026-06-25\you-are-working-on-the-scholar\work\scholarship-curation-platform`
- User repo commit: `40c5be128176300adf228599127514407b4dadf6` (`40c5be1 docs: add roadmap phase7 gate3 operational readiness`)
- Upstream comparison clone: `C:\Users\82108\Documents\Codex\2026-06-25\you-are-working-on-the-scholar\work\scholarship-curation-platform-upstream-compare`
- Upstream main commit: `8a134533c5334c12a18e43a19bd03accf7189813` (`8a13453 Polish home library and talk modal for desktop and mobile.`)
- Merge base: `9a6cda7f3c9443a16b078d445145254cc417881c`
- 비교 기준: 두 로컬 checkout의 정적 파일, docs, fixtures, scripts, migrations, package scripts, admin/product UI 구조.
- 금지 작업 준수: merge/rebase/cherry-pick/push/DB write/migration 실행 없음.

## 4. upstream 현재 구현 요약

| 영역 | 분류 | 확인 내용 |
| --- | --- | --- |
| notice_sources | Implemented in upstream | Supabase migration `20260709120000_create_notice_sources.sql`; source_id unique key와 RLS 존재. |
| crawled_notices | Implemented in upstream | 기존 scholarship crawl staging/review table. image_urls migration 추가. |
| admin/review UI | Implemented in upstream | `app/admin/review`, `app/admin/crawled-notices`, `app/admin/content` 계열 존재. |
| contests/education/activity | Implemented in upstream | `contests`, `crawled_contests`, content_kind, Linkareer scripts/UI 존재. scholarship graph와 직접 통합 대상은 아님. |
| source inventory | Implemented in upstream | `data/notice-sources.csv`와 대학별 CSV, `export-notice-sources-from-supabase.mjs` 존재. |
| crawler scripts/workflows | Partially implemented | `crawl-scholarship-notices.mjs`, `ingest-notices-to-supabase.mjs`, GitHub Actions 존재. 개인 branch의 guarded graph ingest와 병합 필요. |
| database types | Implemented but conflict-prone | upstream `lib/database.types.ts`는 contests/notice_sources/crawled_notices 기준. broad merge 금지. |

## 5. 개인 브랜치 Roadmap Phase 1~7 이후 잔여 과제 요약

Roadmap Phase 1~7은 personal-dev 기준 DB/ingest mechanics와 운영 안전성의 일부를 구조적으로 검증했다. Phase 7 최종 결과는 CONDITIONAL PASS이며, MVP/beta 즉시 런칭 가능 상태가 아니다.

주요 잔여 과제는 다음이다.

- Review backlog: Phase 5/6에서 clean 후보가 아닌 duplicate/review, quality-review 항목을 admin queue로 분리해야 한다.
- no_assets/body quality: no_assets는 correctness blocker가 아니지만 quality badge와 review trigger로 노출해야 한다.
- Rollback/cleanup: cleanup scope 식별은 가능하지만 실제 cleanup execution은 별도 승인과 dry-run이 필요하다.
- Aggregate observability: source-scoped run을 batch 단위로 이해할 수 있는 report/read-model이 필요하다.
- Coverage: Phase 4의 shallow observation risk를 bounded deeper crawl로 줄여야 한다.
- Product/admin integration: upstream UI를 재사용하되 graph adapter/read-model을 붙여야 한다.
- LLM parsing: 자동 확정값이 아니라 review assistant로 시작해야 한다.

## 6. Post-Phase 과제별 구현 상태 분류표

| 단계 | 과제 | 현재 분류 | MVP 필수 여부 | 판단 | 추천 PR |
| --- | --- | --- | --- | --- | --- |
| Integration 0 | Canonical contract / ADR | Design decision required before implementation | MVP prerequisite | 이미 ADR/adapter contract 초안 존재. 팀 review 후 schema/UI 작업의 선행 gate로 사용. | PR 1: ADR/evidence |
| Integration 1 | source_id/source_key alignment | Design decision required before implementation | MVP prerequisite | `notice_sources.source_id`를 DB canonical로 채택하고 `source_key`를 crawler natural/idempotency key로 유지. read-only mapping 검증 필요. | PR 2: source identity mapping |
| Integration 2 | adapter/read-model migration | New implementation required | MVP prerequisite before UI integration | normalized graph output을 upstream admin/review shape로 변환. 첫 구현은 local JSON/read-only. | PR 3: read-only adapter prototype |
| Post-Phase D | rollback / cleanup tooling | New implementation required | MVP essential minimum | Phase 6 scope 식별 근거는 있으나 cleanup execution은 미검증. count-only/dry-run runbook부터 필요. | PR 4: ops safety |
| Post-Phase E | aggregate run observability | New implementation required | MVP essential minimum | Phase 6은 84 source-scoped run이므로 batch summary/read-model이 필요. 초기에는 report-layer로 충분. | PR 4: ops safety |
| Post-Phase B | review backlog pipeline | Partially implemented / develop existing upstream feature | MVP essential | upstream admin review UI가 있으나 Phase 5/6 duplicate-review/quality-review backlog와 graph evidence 연결 필요. | PR 5: review/quality contract |
| Post-Phase C | no_assets / body quality policy | New implementation required | MVP essential | Phase 7 policy는 정리됐지만 upstream UI badge/filter/status 구현은 없음. no_assets는 blocker가 아니라 quality signal. | PR 5: review/quality contract |
| Post-Phase F | product/admin integration | Partially implemented / develop existing upstream feature | MVP essential after adapter | upstream UI는 재사용. graph-native 재작성보다 adapter/read-model로 목록, 상세, review queue를 연결. | PR 6: adapter-backed MVP UI |
| Post-Phase A | deeper crawl & coverage improvement | New implementation required | Beta recommended; bounded MVP support | max_items=3/5 bounded dry-run과 source-health queue. UI/ops를 깨지 않는 범위에서 진행. | PR 7: bounded coverage |
| Post-Phase G | LLM-assisted parsing evaluation | Defer | Post-MVP recommended | 자동 확정값이 아니라 review assistant로 시작. evidence span/confidence/admin approval 필수. | PR 8+: LLM review assistant |

## 7. Post-Phase A: Deeper Crawl & Coverage

목적은 shallow crawl로 남은 false-negative risk를 줄이는 것이다. 기존 보고서 기준 `CRAWL_MAX_ITEMS_PER_SOURCE=1`, zero-match source 다수, high-priority source inspection queue가 남아 있다.

upstream에는 crawler scripts와 source inventory가 있으므로 완전히 새로 만들 필요는 없다. 그러나 bounded max_items=3/5 dry-run, match-lift comparison, timeout/failure rate, source-health queue는 새로 정리해야 한다.

추천 분류: New implementation required, 단 existing upstream crawler/source inventory를 활용.

MVP 전 필수 수준은 전체 coverage 완성이 아니라 source-health risk를 사용자/관리자가 오판하지 않게 하는 최소 report다. 본격 coverage 개선은 beta 전 또는 MVP 이후 반복 과제로 두는 것이 안전하다.

## 8. Post-Phase B: Review Backlog Pipeline

목적은 Phase 5/6에서 clean 후보가 아닌 95개 review/excluded 항목을 안전하게 관리하는 것이다.

upstream에는 admin review UI와 `crawled_notices` 기반 scholarship review 흐름이 이미 있다. 따라서 새 UI를 통째로 만드는 것보다, normalized graph evidence와 Phase 5/6 classification을 upstream review flow에 연결하는 것이 맞다.

추천 분류: Partially implemented / develop existing upstream feature.

필요 작업은 review reason 표준화, duplicate/review status, quality-review status, approve/reject/merge 정책, graph evidence preservation, adapter output shape 확정이다.

## 9. Post-Phase C: no_assets / Body Quality Policy

목적은 첨부가 없는 공지와 본문 품질이 애매한 공지를 correctness failure가 아니라 quality/review signal로 다루는 것이다.

개인 브랜치 Phase 7 문서에는 no_assets가 자동 blocker가 아니라는 정책이 이미 정리되어 있다. 하지만 upstream UI에는 no_assets/body_quality badge, filter, review trigger가 아직 graph 계약 기준으로 붙어 있지 않다.

추천 분류: New implementation required, 단 policy는 기존 Roadmap Phase 7 결과를 활용.

MVP 전 필수다. 사용자가 보는 장학금 상세/목록에서 품질 상태와 원문 링크가 분리되어야 하고, admin은 no_assets + short_body 같은 위험 조합을 review할 수 있어야 한다.

## 10. Post-Phase D: Rollback / Cleanup Tooling

목적은 잘못 적재된 데이터를 식별하고 필요 시 안전하게 되돌릴 수 있는 절차를 만드는 것이다.

Phase 6 evidence는 rehearsal_label, run_ids, canonical_key/source_key 기반 scope 식별 가능성을 보여준다. 하지만 cleanup SQL 생성/실행은 검증되지 않았다.

추천 분류: New implementation required.

MVP 전 최소 필수는 destructive cleanup이 아니라 count-only cleanup scope dry-run, table별 affected row count, shared notice/alias 삭제 위험 분석, partial write recovery guide다. 실제 cleanup execution은 별도 승인 없이는 금지해야 한다.

## 11. Post-Phase E: Aggregate Run Observability

목적은 source-scoped run 결과를 운영자가 batch 단위로 이해하게 만드는 것이다.

Phase 6은 84개 source-scoped run과 1개 rehearsal_label을 남겼다. report-layer aggregation은 가능하지만 DB-level aggregate batch table은 없다.

추천 분류: New implementation required.

MVP 전에는 DB table보다 report/read-model aggregation으로 충분하다. 정식 운영 전 `crawler_batch_runs` 같은 DB-level aggregate table을 검토하면 된다.

## 12. Post-Phase F: Product/Admin Integration

목적은 데이터 파이프라인을 실제 관리자/사용자 화면에 연결하는 것이다.

upstream은 이미 admin content/review UI, scholarship edit/detail, contests/education/activity UI를 상당 부분 구현했다. 따라서 개인 브랜치의 graph를 UI 위에 바로 덮어씌우면 회귀 위험이 크다.

추천 분류: Partially implemented / develop existing upstream feature.

전략은 adapter-backed MVP다. 기존 UI는 유지하고, normalized graph output을 `crawled_notices` compatible view 또는 admin review read-model로 공급한다. graph-native UI 전환은 이후 selected features부터 점진 진행한다.

## 13. Post-Phase G: LLM-assisted Parsing

목적은 원문 공지를 신청 대상, 기간, 금액, 제출 서류 등 구조화된 장학금 정보로 바꾸는 것을 보조하는 것이다.

추천 분류: Defer.

처음부터 자동 확정값으로 쓰면 위험하다. MVP 이후 review assistant로 시작하고, confidence score, evidence span, admin approval을 필수로 둬야 한다.

## 14. Adapter-first Migration 과제

adapter-first는 임시 회피책이 아니다. canonical direction을 normalized graph로 확정한 상태에서 upstream UI를 보호하는 전환 전략이다.

필수 과제:

- normalized graph output schema 정리.
- `source_key -> notice_sources.source_id` resolver.
- unresolved source fail-closed policy.
- graph to admin review read-model mapping.
- local JSON output prototype.
- validation report: source resolution, review status, duplicate status, body quality, no_assets, zero-match source counts.
- DB write 없는 read-only comparison.

## 15. Source Identity Alignment 과제

핵심 원칙은 다음이다.

- `notice_sources.source_id`는 DB canonical source identifier다.
- `source_key`는 crawler-facing natural key와 idempotency key다.
- graph tables는 장기적으로 `source_id` FK를 저장해야 한다.
- `source_key`는 snapshot/alias/evidence로 보존할 수 있다.
- upstream 통합 시 `source_key`를 DB-wide canonical ID로 취급하면 안 된다.

이 과제는 schema migration보다 먼저 끝나야 한다.

## 16. 새로 구현할 과제 vs 기존 기능을 refine할 과제

| 분류 | 영역 | 권고 |
| --- | --- | --- |
| 재사용/확장 | upstream admin/review UI | adapter/read-model을 통해 유지. 즉시 graph-native 전면 재작성 금지. |
| 재사용/확장 | upstream notice_sources | `source_id`를 DB canonical로 채택. |
| 재사용/확장 | crawled_notices | 단기 staging/read-model/legacy compatibility layer로 유지. |
| 새 구현 | source resolver | `source_key -> notice_sources.source_id` read-only mapping 검증. |
| 새 구현 | graph adapter/read-model | normalized graph output을 admin review compatible shape로 변환. |
| 새 구현 | rollback/batch observability | Phase 6 run/rehearsal scope 기반 count-only/dry-run과 batch summary. |
| 합의 선행 | schema proposal/migration | source identity, read-model, review 상태 계약 합의 후 진행. |
| 합의 선행 | admin graph-native migration | adapter-backed MVP 이후 단계적 전환. |

## 17. MVP 전 필수 과제

MVP 전 필수 과제는 다음 순서로 본다.

1. Source identity mapping: `source_key -> source_id` read-only 검증.
2. Adapter/read-model local JSON prototype.
3. Rollback scope dry-run과 batch summary.
4. Review backlog queue contract.
5. no_assets/body_quality badge/status policy.
6. Existing admin review UI에 adapter output 연결.
7. User-facing listing/detail/search/filter 최소 연결.

Coverage 전체 완성과 LLM 구조화 자동화는 MVP 필수로 보지 않는다.

## 18. MVP 이후로 미룰 과제

- max_items=5 이상 broader coverage sweep.
- DB-level aggregate batch table.
- graph-native admin UI 전면 전환.
- `crawled_notices` 제거 또는 완전 downgrade migration.
- LLM structured extraction 자동 확정.
- production/main DB migration.
- cleanup execution automation.

## 19. 추천 PR 분리 전략

| PR | 범위 | 포함 | 제외 |
| --- | --- | --- | --- |
| PR 1 | ADR/evidence docs | ADR 0001, adapter contract, compatibility report, Phase 7 summary | DB/schema/UI 변경 제외 |
| PR 2 | source identity mapping | `source_key -> source_id` read-only resolver/report | write/apply 제외 |
| PR 3 | read-only adapter prototype | local JSON read-model, validation report | DB write 제외 |
| PR 4 | ops safety | rollback dry-run, batch summary/report-layer observability | cleanup execution 제외 |
| PR 5 | review/quality contract | review backlog, no_assets/body_quality policy, status mapping | UI 전면 재작성 제외 |
| PR 6 | adapter-backed MVP UI | 기존 admin/review UI에 read-model 연결 | graph-native rewrite 제외 |
| PR 7 | bounded coverage | max_items=3/5 dry-run, source-health queue | 무제한 crawl 제외 |
| PR 8+ | LLM review assistant | summary/extraction draft with evidence/confidence | 자동 확정값 제외 |

## 20. 최종 추천 로드맵

최종 추천 순서는 다음이다.

1. ADR/team agreement 최종 review.
2. Source identity alignment read-only report.
3. Adapter/read-model local JSON prototype.
4. Rollback dry-run + aggregate batch observability.
5. Review backlog + no_assets/body quality policy.
6. Adapter-backed admin review MVP.
7. User-facing scholarship listing/detail/search/filter MVP.
8. Bounded deeper crawl coverage improvement.
9. LLM-assisted review prototype.
10. Schema proposal and production migration planning.

이 순서는 기존 Post-Phase D/E -> B/C -> F -> A -> G 흐름을 유지하되, 그 앞에 source identity와 adapter migration gate를 추가한 것이다.

## 21. 팀과 합의해야 할 질문

- `source_key -> source_id` mapping의 최소 보장 수준은 무엇인가?
- `admin_review_notice_view`는 DB view, materialized view, API route, local generated JSON 중 무엇으로 시작할 것인가?
- 현재 admin review UI가 요구하는 필드 중 graph에서 바로 derivable하지 않은 필드는 무엇인가?
- `crawled_notices`에 계속 write할 것인가, 아니면 graph에서 생성되는 read-model로 낮출 것인가?
- no_assets/body_quality status는 DB field, read-model field, UI-only derived field 중 어디에 둘 것인가?
- duplicate/review와 quality-review backlog는 어떤 status enum으로 표현할 것인가?
- production apply 전 rollback/cleanup tooling의 최소 승인 기준은 무엇인가?
- LLM output은 어떤 evidence/confidence 기준을 만족해야 admin review에 노출할 것인가?

## 결론

normalized crawler graph를 장기 canonical ingestion model로 채택하는 것은 합리적이다. 그러나 upstream admin/review/UI를 즉시 전면 재작성하지 않는 것도 동시에 합리적이다.

지금 필요한 것은 broad merge가 아니라 기능 단위 PR이다. 특히 source identity alignment와 adapter/read-model prototype을 Post-Phase의 첫 gate로 추가해야 한다. 이 gate를 통과하면 공존은 기술부채가 아니라 통제된 migration path가 된다. 반대로 이 gate 없이 `crawled_notices`와 graph가 각각 발전하면 장기 리스크가 커진다.
