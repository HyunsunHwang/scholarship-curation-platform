# 장학금 데이터 파이프라인 및 Engine 기술 설계 검토 보고서

| 항목 | 값 |
|---|---|
| 대상 저장소 | `HyunsunHwang/scholarship-curation-platform` |
| 조사 브랜치 | `docs/engine-technical-design-review` |
| 기준 main SHA | `1f43a4fd2631ce7bce55f58f26bade8ba6ae6e82` |
| Phase 5 참조 | `e4ae7824a7a74c4b422ab0e6dc26055d51072fd2` (`feat/engine-phase-5-limited-semantic-resolution`, main 미병합) |
| 조사일 | 2026-07-20 |
| 문서 유형 | 저장소 근거 기반 기술 설계 검토(문서 전용) |
| Production readiness | **HOLD — 비운영 pre-production platform** |

> 판정 문법: **구현**은 코드 존재, **병합**은 기준 main 포함, **검증**은 명시된 fixture/bounded evidence 통과, **운영 적용**은 production 환경에서 승인된 실행을 뜻한다. 네 상태를 서로 대체해 읽지 않는다. 수치와 판정은 별도 표시가 없으면 기준 main의 추적 파일을 근거로 한다.

## 0. Executive Summary

### 0.1 한 문장 결론

현재 시스템은 장학금 공지를 안전하게 수집하고 근거를 보존해 사람의 검토로 넘기는 **검증된 architecture prototype을 포함한 비운영 pre-production platform**이다. 자동 공개 시스템이나 전국 단위 완성형 데이터 제품은 아니다.

### 0.2 무엇이 실제로 강한가

- 정확한 source identity, 명시적 실패 상태, bounded concurrency/retry/checkpoint/resume가 한 crawler 경로에 결합되어 있다.
- 원문·첨부·parser provenance를 보존하고, 추출값이 evidence span을 벗어나면 거부하는 fail-close 계약이 있다.
- `SourceNotice → SourceDocument → ScholarshipProgram → RecruitmentCycle → OpportunityRevision`의 책임 분리가 설계되어 있다.
- review decision을 append-only event로 남기고 effective state와 public projection을 분리하는 비운영 통합 경로가 있다.
- 공개는 opt-in이며 오류 시 빈 결과를 반환하고, Engine의 `automatic_publish_allowed`는 false로 고정된다.

### 0.3 무엇이 아직 약한가

- Phase 4 대표 24건에서 program/cycle identity usable은 0/24이고, remediated handoff도 clean 0/24이다.
- 공식 P0 재평가에서 216 field slots 중 resolved 14, pending 198, unresolved 4다. 안전성은 높지만 의미 완전성은 낮다.
- attachment 복합 포맷, OCR/HWP 배포, source coverage, relevance precision/recall은 대표성 있는 운영 수준으로 검증되지 않았다.
- committed migration과 runtime/generated type 사이의 production schema parity가 확인되지 않았다.
- 실제 운영 SLO, alerting, 비용, 보존정책, reviewer 처리량과 SLA가 닫히지 않았다.

### 0.4 Phase 5의 정확한 위치

Phase 5는 main이 아니라 별도 브랜치의 제한적 semantic-review prototype이다. 24개 입력 중 12개 target과 1개 negative case를 deterministic replay하여 schema/evidence/validator 경계를 검증했지만 실제 외부 LLM 호출은 0회다. 따라서 prompt의 구조적 유효성은 일부 검증되었으나 모델 품질, JSON transport, latency, cost, outage, drift, prompt injection 내성은 미평가다.

### 0.5 현재 가장 큰 병목

Engine 내부의 가장 큰 병목은 **program/cycle/relation의 의미 해소와 그에 따른 관리자 검토 처리량**이다. 전체 production 전환의 hard gate는 **production schema·RLS·migration·projection parity**다. 수집량을 먼저 늘리면 pending evidence와 검토 부하만 증가할 가능성이 높다.

### 0.6 최종 권고

Phase 5를 곧바로 자동화 엔진으로 확장하지 말고, evidence-bound proposal을 생성하는 sidecar로 유지한다. 먼저 gold corpus의 identity/amount/date adjudication, reviewer throughput 계측, production fingerprint와 migration rehearsal을 완료한 뒤 source cohort를 단계적으로 넓힌다.

## 1. Problem

### 1.1 문제의 본질

장학금 공지는 기관·게시판·첨부 형식이 제각각이고, 하나의 페이지에 여러 프로그램·회차·금액·신청기간이 섞인다. “페이지를 가져왔다”는 사실과 “사용자에게 정확한 기회를 제공할 수 있다”는 사실 사이에 긴 검증 사슬이 필요하다.

### 1.2 수집 문제

목록/상세 구조, pagination, TLS, 인코딩, 동적 렌더링, attachment link가 source마다 다르다. HTTP 200이나 zero match는 성공·부재 증명이 아니며, source-specific adapter가 필요한 예외를 generic parser로 숨기면 오분류가 생긴다.

### 1.3 문서 해석 문제

HTML 본문만으로 충분하지 않은 공지가 많다. PDF embedded text, scanned image OCR, HWP/HWPX와 표 구조를 읽어도 application window, 결과 발표일, 설명회 일시를 구분해야 한다. parser 성공은 semantic correctness를 보장하지 않는다.

### 1.4 identity 문제

게시물, 문서 revision, 장학 프로그램, 모집 회차, 정정·결과 공지는 동일하지 않다. URL 변경이나 본문 수정 때 무엇을 유지하고 무엇을 새 revision/cycle로 만들지 명시하지 않으면 중복·덮어쓰기·잘못된 관계가 발생한다.

### 1.5 정확성 문제

지원기간과 금액은 사용자 행동을 직접 좌우한다. 근거가 없는 정규화, 복수 금액의 단일값 축약, 신청 URL과 source URL 혼동은 단순 누락보다 위험하다. 정확한 abstention과 review가 필요하다.

### 1.6 운영 문제

재시도·중단·resume·중복 방지, source freshness, parser drift, 검토 backlog, projection rollback과 alerting이 필요하다. 단일 fixture 통과나 bounded live 성공은 장기 운영 신뢰성을 대신하지 못한다.

### 1.7 제품 문제

현재 서비스의 legacy review/public 모델과 새 normalized graph가 공존한다. 새 Engine이 안전해도 production DB, 관리자 권한, 숫자 route, 공개 projection과 호환되지 않으면 제품 전환은 완료되지 않는다.

## 2. Current system design

### 2.1 전체 파이프라인

| 단계 | 입력 | 출력 | 책임 | 실패 상태 | evidence | 현재 구현 수준 | production 적용 여부 |
|---|---|---|---|---|---|---|---|
| Source inventory | source key/config | exact `source_id` | 출처 소유권 | missing/ambiguous/config error | inventory row | main 구현·비운영 검증 | 미적용 |
| Crawl scheduling | source set/run options | run plan | 범위·속도·재개 | cancellation/timeout | run/checkpoint | main 구현·bounded 검증 | 미적용 |
| List/detail fetch | URL | raw response/candidate | 전송·격리 | network/http/parser | status, URL, timestamps | main 구현·bounded live | 기존 crawler와 별도 |
| Document discovery | page/links | assets | 첨부 귀속 | unsupported/oversize/fetch fail | asset metadata | main 구현·부분 검증 | 기본 opt-out |
| Document parsing | bytes | normalized text/pages | 포맷 해석 | tool/timeout/OCR skip | parser/OCR provenance | main 구현·fixture 중심 | 미적용 |
| Normalized graph | crawl result | notice/occurrence/revision | 안정 identity와 관찰 기록 | unresolved source | IDs, hashes | main 구현·non-prod pilot | production 미적용 |
| Deterministic extraction | evidence text | canonical candidate | 안전한 P0 추출 | abstain/review/schema fail | field locators | main 구현·대표 corpus 검증 | 미적용 |
| Semantic proposal | bounded evidence packet | sidecar proposal | 다중 의미·관계 후보 | validator rejection/abstain | evidence refs | branch-only replay | 미병합·미적용 |
| Human review | revision/candidate | append-only decision | 승인·거절 책임 | unresolved/blocked | actor/reason/event | main 비운영 경로 | legacy와 미전환 |
| Effective state | decision events | current decision | event fold | conflict/lifecycle guard | supersession chain | main 비운영 DB 검증 | production 미적용 |
| Public projection | effective approve | public row/visibility | 최소 공개 표면 | fail-closed empty/hide | mapping/reconciliation | main opt-in prototype | production HOLD |
| Notification | publishable change | user delivery | 변화 전달·중복 방지 | 미정의 | 미정의 | 설계 미완료 | 미적용 |

### 2.2 source identity

`notice_sources.source_id`가 DB canonical identity이고 `source_key`는 crawler 입력의 exact-match key다. missing/ambiguous source는 자동 생성·fuzzy match하지 않고 차단한다. 이는 잘못된 기관 귀속보다 처리 중단을 선택한다.

### 2.3 공통 crawler와 adapter seam

권위 entrypoint는 `scripts/crawl-scholarship-notices.mjs`, 공통 실행기는 `lib/crawler-engine/common-runner.mjs`다. generic HTML strategy가 기본이지만 source-specific 예외 adapter를 유지한다. 새 parallel crawler/identity path를 만들지 않는 구조다.

### 2.4 결과 상태 계약

`success`, `empty_observed`, `network_error`, `http_error`, `parser_error`, `configuration_error`, `source_resolution_error`, `unsupported`를 구분한다. 특히 empty와 failure, zero match와 absence를 합치지 않는다.

### 2.5 retry·pacing·concurrency

Phase 2 Gate A는 `Retry-After`, exponential backoff/jitter, abortable delay와 source/host pacing, bounded source/detail/host concurrency를 제공한다. limiter는 process-local이므로 다중 worker 전역 제한은 아직 아니다.

### 2.6 checkpoint·resume

Gate B는 versioned atomic local checkpoint, input fingerprint, completed source skip, signal 기반 graceful shutdown과 settle timeout을 제공한다. 중단 후 resume가 완료 source를 재스케줄하지 않는 fixture와 bounded live evidence가 있다.

### 2.7 문서 discovery와 fetch

Phase 3는 opt-in이며 attachment GET/HEAD, byte limit, 포맷 판별을 수행한다. raw bytes는 영속 graph payload에 넣지 않고 memory에서 parser에 전달한다. 개별 attachment 실패는 전체 notice를 조용히 성공 처리하지 않고 review 신호로 남긴다.

### 2.8 parser와 OCR

HTML, PDF, image, HWPX 경로가 있고 binary HWP는 injected adapter 경계다. PDF는 embedded text 우선, 선택 OCR은 skip/tool/timeout 사유를 기록한다. OCR 좌표가 없는 성공 결과는 Phase 4 evidence locator 요구를 만족하지 못한다.

### 2.9 parser cache

bytes hash, parser/OCR/options 기반 persistent cache가 있으며 transient failure는 cache하지 않는다. Phase 3 bounded replay에서 3 cache hit, parser invocation 0을 확인했다. crawler resume checkpoint와 parser cache는 별도 책임이다.

### 2.10 normalized ingestion graph

관찰 run/result, source notice, URL alias, occurrence, document/revision/assets를 append-oriented graph로 나눈다. `crawled_notices`는 legacy compatibility이고 normalized graph가 장기 canonical 방향이다.

### 2.11 identity hierarchy

| identity | 의미 | 생성 기준 | revision 조건 | 자동 결정 가능 범위 | 관리자 승인 필요 범위 |
|---|---|---|---|---|---|
| Source | 수집 출처 | inventory exact match | 설정 변경은 identity 변경 아님 | exact key | 신규·중복·ambiguous source |
| SourceNotice | 출처의 게시물 | source+external article ID, 없으면 canonical URL hash | URL alias는 동일 notice 가능 | stable external ID/URL | cross-source 동일성 |
| SourceDocument | 취득한 문서/asset | notice+asset locator/hash | bytes 변경 | byte hash | 의미상 같은 문서 여부 |
| ScholarshipProgram | 지속되는 장학 제도 | provider+program-name evidence | 명칭/주체의 실질 변경 | 강한 단일 근거의 후보 | 조직 역할 중첩·다중 프로그램 |
| RecruitmentCycle | 특정 모집 회차 | program+term/window/round | 새 학기·회차·기간 | 명확한 단일 모집 | 복수 기간·정정 관계 |
| OpportunityRevision | 공개 후보 상태의 revision | cycle+material content | 사용자 영향 필드 변경 | content hash 후보 | materiality 판정 |
| MaterialChangeEvent | 변경 의미 | before/after evidence | 변경 발생마다 | 안전한 diff | 알림·재공개 여부 |

### 2.12 Phase 4 canonical extraction

canonical v1 record는 DB row가 아니라 evidence-bound extraction candidate다. document kind, publishability, lifecycle, organization roles, support type/amount, application window/URL과 review metadata를 다루며 schema와 semantic validator를 모두 통과해야 한다.

### 2.13 P0 deterministic remediation

문서 분류 우선순위, correction relation dependency, application date role, source/application URL route 분리, amount representation gap, Phase 3 status 호환성과 evidence preservation을 강화했다. 자동 공개는 항상 false다.

### 2.14 review contract

값이 없거나 관계가 불명확하면 reason-coded review로 보낸다. recruitment notice의 publishability false도 확인 없이 후보에서 사라지지 않도록 review를 강제한다. review는 오류 은폐가 아니라 명시적 상태다.

### 2.15 append-only decision과 effective state

비운영 Post-Phase L/N-Q 경로는 review event를 immutable append-only로 추가하고 effective decision을 fold한다. 잘못된 approve를 삭제하지 않고 reject/revoke가 supersede한다. idempotency key와 lifecycle guard가 있다.

### 2.16 public projection

effective approve만 create/update/visible로 매핑하고 reject/revoke/expired는 hide한다. DB public read model은 명시적 opt-in이며 query 실패 시 empty로 fail-close한다. fixture/report-backed public prototype과 DB-backed production surface를 구분해야 한다.

### 2.17 단계별 현재 판정

| Phase | 주요 기능 | fixture 검증 | bounded live 검증 | representative 평가 | production 적용 | 정확한 판정 |
|---|---|---|---|---|---|---|
| Phase 1 | 공통 crawler·exact source·상태 | 15/15 | 2 source, 각 1 item | 없음 | 아니오 | 병합·bounded 검증된 crawler foundation |
| Phase 2A | retry/pacing/concurrency | 40/40 | 2 source | 없음 | 아니오 | 단일 process resilience 검증 |
| Phase 2B | checkpoint/resume/shutdown | 15/15 | interrupted/resumed 2 source | 없음 | 아니오 | local recovery 검증 |
| Phase 3 | attachment/parser/cache/OCR 경계 | 86/86 | 2 notices, HTML 2+PDF 1 | 포맷 대표성 부족 | 아니오 | opt-in parser prototype |
| Phase 4 foundation | identity/schema/evidence 계약 | 통과 | 해당 없음 | synthetic 15 | 아니오 | 설계·검증 계약 |
| Phase 4 historical Gate C | deterministic baseline | schema/evidence 24/24 | corpus 기반 | classification 4/24 | 아니오 | 의미 품질 HOLD의 historical baseline |
| Phase 4 P0 remediated | 안전 필드 보완 | mutation/validator 통과 | corpus 재평가 | resolved 14/216 slots | 아니오 | **CONDITIONAL PASS**, 안전성 우선 |
| Phase 4 full handoff | limited candidate 생성 | 통과 | 24-case dry run | output 10, clean 0 | 아니오 | limited Phase 5 entry만 PASS |
| Phase 5 sidecar | semantic proposal/validator | branch replay | 외부 호출 0 | target 12+negative 1 | main 미병합 | replay prototype, live quality 미평가 |
| Post-Phase L/M/N-Q | graph→review→projection | 71/71 등 | non-prod bounded/rehearsal | 3-source pilot | 아니오 | 통합 경로 PASS, production HOLD |

## 3. Why designed so

### 3.1 fail-close 우선

장학금의 잘못된 기간·금액·신청 링크는 사용자 손실로 이어진다. 따라서 낮은 recall을 감수하더라도 unsupported value와 자동 공개를 막는 편이 합리적이다.

### 3.2 evidence first

모든 normalized value에 원문 locator를 연결하면 parser/LLM 교체 후에도 독립 재검증이 가능하다. 이는 모델의 설명이 아니라 원문을 audit authority로 둔다.

### 3.3 deterministic core, semantic sidecar

출처·URL·hash·명확한 날짜와 정책 invariant는 deterministic하게 검사하고, 조직 역할·다중 금액·관계는 제한된 semantic proposal로 분리한다. 비결정성을 core write path에 직접 넣지 않는다.

### 3.4 identity와 content 분리

content hash가 바뀔 때 notice identity까지 바꾸면 history가 단절된다. source notice는 안정적으로 유지하고 document/opportunity revision을 추가해야 변경 추적과 rollback이 가능하다.

### 3.5 관찰과 판단 분리

“가져온 사실”, “추출 후보”, “사람의 결정”, “현재 effective state”, “공개 projection”을 분리하면 실패나 정정이 과거 evidence를 훼손하지 않는다.

### 3.6 append-only review

승인·거절을 mutable column 하나로 덮어쓰면 누가 왜 바꿨는지 잃는다. event와 effective state 분리는 audit, retry idempotency, correction을 지원한다.

### 3.7 exact source resolution

fuzzy match는 편리하지만 잘못된 기관 귀속을 조용히 만든다. source missing을 노출하고 inventory owner가 해결하도록 하는 것이 provenance에 맞다.

### 3.8 bounded validation

공개 사이트에 부담을 주거나 production state를 건드리지 않고 transport와 parser 가정을 점검하기 위해 source/item/page limit을 둔다. 단, bounded evidence를 coverage 증명으로 확대 해석하면 안 된다.

### 3.9 compatibility-first migration

기존 `crawled_notices`, `scholarships`, 숫자 route와 관리자 화면을 즉시 교체하지 않고 compatibility/projection 경계를 둔다. 제품 회귀를 줄이지만 이중 모델의 장기 비용이 생긴다.

### 3.10 사람 승인 유지

현재 대표 corpus에서 identity와 의미 완전성이 낮으므로 review 없는 자동화는 이르다. LLM은 evidence-bound 제안자로 쓰고 최종 공개·관계 확정은 사람이 소유하는 설계가 현재 증거와 일치한다.

## 4. Problems found

### 4.1 representative semantic completeness 부족

historical Gate C는 field presence recall 64/189(0.3386), classification 4/24였다. remediated P0는 안전해졌지만 216 slots 중 resolved가 14뿐이다.

### 4.2 program/cycle identity 미해결

full remediated 평가와 handoff에서 program/cycle usable은 0/24다. stable notice identity와 사용자-facing opportunity identity 사이가 비어 있다.

### 4.3 관리자 검토 부하

handoff 24건 중 review required 24, clean 0, needs-review output 10이다. safe abstention은 옳지만 운영 처리량·SLA·우선순위가 없으면 backlog가 새 병목이 된다.

### 4.4 amount representation gap

복수 benefit, 조건별 금액, tuition+stipend 조합을 canonical v1 단일 필드로 축약할 위험이 있다. remediated shadow에서 representation loss risk 3, canonical conversion gap 4가 남았다.

### 4.5 date role ambiguity

명시적 날짜가 있어도 application window, 변경 마감, 발표, 설명회인지 구분해야 한다. full remediated taxonomy에서 unlabeled date 10건이 영향을 받았다.

### 4.6 document relation ambiguity

correction/result/guidance는 독립 모집이 아닐 수 있다. 대상 notice/cycle이 해소되지 않으면 lifecycle와 publishability를 확정할 수 없다.

### 4.7 organization role overlap

게시기관, 선발기관, 재원 제공자, 운영기관을 한 provider로 합치기 쉽다. provider/program separation이 21개 case에 영향을 주었다.

### 4.8 relevance false positive

tuition 키워드만으로 장학 공지를 판단해 payment-security 공지가 잘못 approve된 비운영 사례가 있었다. append-only reject로 노출은 막았지만 production detector precision/recall은 미평가다.

### 4.9 coverage 대표성 부족

Phase 1–3 bounded live와 Post-Phase L/M의 소수 source pilot은 경로를 검증했을 뿐 전국 장학금 coverage를 증명하지 않는다. risk register도 coverage completeness를 accepted로 유지한다.

### 4.10 source inventory 결손

`cau_012`는 committed inventory에 없어 absence가 아니라 unresolved coverage다. 자동 source 생성 금지는 안전하지만 운영상 inventory stewardship가 필요하다.

### 4.11 attachment 포맷 대표성 부족

Phase 3 bounded live는 HTML/PDF embedded text를 확인했지만 image OCR, binary HWP, HWPX의 실제 source 대표 evidence는 부족하다. parser/tool packaging도 운영 위험이다.

### 4.12 process-local resilience 한계

rate limiter와 local checkpoint는 단일 process에는 적합하지만 distributed worker lease, global host budget, durable queue와 exactly-once 실행을 제공하지 않는다.

### 4.13 production schema parity 미확인

committed migration에는 runtime/generated type이 기대하는 일부 table 생성 이력이 없다. target schema, row counts, RLS, schema cache fingerprint가 없으므로 non-prod PASS를 production에 전이할 수 없다.

### 4.14 legacy/canonical 이중 모델

legacy mutable `crawled_notices`, current `scholarships`, normalized graph, projection이 공존한다. authority와 cutover 조건이 운영 수준으로 완료되지 않으면 divergence가 발생한다.

### 4.15 RLS와 관리자 경로 미검증

비운영 SQL은 immutable event와 권한 경계를 갖지만 실제 production admin/public access와의 호환성이 검증되지 않았다. credentialless browser evidence도 제한적이다.

### 4.16 observability와 alerting 미완료

보고서 기반 batch observability는 있으나 DB-level batch API/UI, external alert service, cleanup execution, SLO가 production-ready하게 연결되지 않았다.

### 4.17 notification 계약 부재

Engine은 notification을 false로 막지만 material-change ownership, recipient preference, deduplication ledger, correction/revoke 처리와 delivery audit은 구현되지 않았다.

### 4.18 법적·보안·보존 운영정책 부족

일부 crawler 문서에 robots/약관 확인 안내는 있으나 source별 허용 근거, 개인정보 redaction, 원문/첨부 retention, LLM 전송 정책, 삭제 요청과 incident runbook이 통합 계약으로 닫히지 않았다.

## 5. Exact interpretation

### 5.1 “PASS”의 범위

각 PASS는 해당 report의 입력과 invariant에만 적용된다. Phase 3 fixture PASS는 모든 HWP를 읽는다는 뜻이 아니며, Post-Phase L non-prod PASS는 production migration PASS가 아니다.

### 5.2 main과 Phase 5 branch

기준 main에는 Phase 4 closeout까지 병합되어 있다. Phase 5 SHA는 별도 branch 참조이며 본 문서는 비교 분석만 한다. Phase 5 기능을 현재 main capability로 집계하지 않는다.

### 5.3 replay와 live LLM

Phase 5 report의 replay output은 저장된 deterministic response를 schema/validator에 통과시킨 것이다. `live_call_count=0`, provider/model null이므로 실제 외부 모델 성공률이 아니다.

### 5.4 code existence와 production

runner, provider client, migration SQL이 존재해도 실행 승인·환경 parity·monitoring·rollback 증거가 없으면 production 적용이 아니다.

### 5.5 bounded live의 의미

공개 HTTP bounded run은 transport와 제한된 sample의 parser 동작을 확인한다. source 전체, 장기 drift, completeness, production scheduler를 검증하지 않는다.

### 5.6 zero match의 의미

zero match는 해당 bounded 조건에서 candidate를 찾지 못했다는 관찰이다. 장학 공지가 없다는 evidence가 아니다.

### 5.7 parser success의 의미

텍스트 추출 성공은 field 의미나 date role이 맞다는 뜻이 아니다. provenance가 충분해야 다음 semantic 단계가 시작될 뿐이다.

### 5.8 review required의 의미

review required는 품질 실패만이 아니라 의도적 안전 상태다. 다만 비율이 100%이면 자동화 효율 목표는 달성하지 못한 것이다.

### 5.9 precision과 recall의 해석

P0 resolved subset precision 1.0은 전체 field 정확도 1.0이 아니다. denominator가 6개인 precision과 14개 gold 중 6개 recall을 함께 봐야 한다.

### 5.10 schema valid의 의미

schema-valid JSON은 의미가 맞다는 뜻이 아니다. evidence coverage, relation/identity validator, gold comparison과 human adjudication이 별도로 필요하다.

### 5.11 non-production integration PASS

graph→event→effective→projection의 transaction과 rollback 경로가 제한된 환경에서 동작했다는 뜻이다. production data shape와 RLS가 같다는 보장은 없다.

### 5.12 public surface 구분

report-backed prototype, legacy DB read, opt-in canonical projection은 서로 다른 데이터 권위다. UI가 렌더된 사실만으로 canonical production path가 활성화되었다고 판단하지 않는다.

### 5.13 최종 상태 표현

현재 상태는 “production-ready AI scholarship engine”이 아니라 “안전 계약과 제한적 통합이 검증된 pre-production platform”이다. Full-schema Gate C와 production rollout은 HOLD다.

### 현재 가능한 것과 가능하지 않은 것

| 기능 | 현재 가능 | 부분 가능 | 불가능·미검증 | 근거 |
|---|---|---|---|---|
| source exact resolution | main에서 가능 | inventory가 있는 source만 | 신규/fuzzy 자동 귀속 | Phase 1 baseline, canonical schema proposal |
| bounded crawl | main에서 가능 | 소수 source/sample | 전국 coverage·장기 scheduler | Phase 1–2 reports |
| retry/checkpoint/resume | 단일 process 가능 | local file state | distributed exactly-once | Gate A/B evidence |
| HTML/PDF text parsing | 제한 환경 가능 | opt-in·bounded | 모든 실문서 포맷 | Phase 3 baseline |
| OCR/HWP/HWPX | fixture 경로 존재 | tool/adapter 조건부 | 대표 live 품질 | Phase 3 parsing report |
| evidence-bound P0 extraction | 가능 | resolved subset 중심 | 높은 semantic recall | P0 remediated report |
| program/cycle 확정 | 후보 계약 존재 | branch sidecar proposal | 자동 canonical 확정 | full Gate C, Phase 5 replay |
| append-only review | non-prod 가능 | 별도 integration path | production admin 전환 | Post-Phase L/N-Q evidence |
| public projection | non-prod preview 가능 | opt-in/fail-close | production canonical exposure | N-Q contract/readiness decision |
| 외부 LLM semantic review | client code가 branch에 존재 | replay validation | 실제 품질·비용·안정성 | Phase 5 branch report, live call 0 |
| notification | 자동 차단 가능 | material-change 설계 일부 | delivery/dedupe/revoke | Phase 4 review contract |
| production rollout | 아니오 | owner-gated 준비 문서 | schema/RLS parity와 canary | production readiness decision |

## 6. Missed possibilities

### 6.1 source contract registry — 부분 구현

exact source inventory는 있으나 owner, robots/terms decision, expected cadence, parser version, freshness SLO를 한 registry로 묶지 않았다.

### 6.2 source change detection — 미구현

DOM signature와 selector health trend로 parser drift를 조기 감지하는 contract test/alert가 필요하다.

### 6.3 distributed host budget — 미구현

process-local limiter를 durable lease/token bucket으로 확장하면 여러 worker가 동일 host를 과도 호출하는 것을 막을 수 있다.

### 6.4 durable workflow queue — 설계 전용

checkpoint는 local file이다. production에서는 run/source/detail/document 단위 durable state machine과 retry budget이 필요하다.

### 6.5 raw evidence object storage — 부분 구현

hash와 metadata는 있으나 원문/첨부의 승인된 object storage, encryption, retention, legal deletion 계약이 완성되지 않았다.

### 6.6 format sandboxing — 미구현

PDF/HWP/OCR 도구를 resource-limited sandbox에서 실행하고 decompression bomb·malformed file을 격리할 필요가 있다.

### 6.7 parser canary corpus — 부분 구현

fixture는 강하지만 실제 source별 golden document와 parser version regression matrix가 충분하지 않다.

### 6.8 relevance classifier evaluation — 미평가

scholarship relevance의 labeled precision/recall과 false-negative audit이 없다. keyword gate만으로 cohort를 확대하면 안 된다.

### 6.9 structured amount algebra — 설계 전용

정액, 범위, tuition percentage, per-period, multi-component, conditional benefit을 lossless component list로 표현할 필요가 있다.

### 6.10 temporal semantics engine — 부분 구현

application window parsing은 있으나 timezone, inclusive/exclusive boundary, rolling deadline, business-day rule, correction precedence를 통합하지 않았다.

### 6.11 program/cycle resolver — 부분 구현

Phase 5 sidecar가 후보를 내지만 main 병합, live quality, merge policy, canonical identity write는 없다.

### 6.12 relation graph UI — 미구현

관리자가 correction/result/guidance를 기존 cycle에 연결하고 before/after evidence를 비교하는 전용 UX가 필요하다.

### 6.13 active learning loop — 설계 전용

review reasons와 corrected proposals를 versioned gold corpus로 되돌려 prompt/rule/model별 개선을 측정하는 폐루프가 없다.

### 6.14 reviewer throughput analytics — 미평가

case당 시간, 수정 필드, abstention utility, agreement, backlog age를 계측하지 않아 LLM의 실제 운영 가치가 불명확하다.

### 6.15 model governance — 미구현

model/prompt version registry, eval gate, rollback, cost ceiling, data residency, redaction, outage fallback이 필요하다.

### 6.16 projection reconciliation — 부분 구현

비운영 preview와 rollback은 있으나 legacy `scholarships`와 canonical projection 간 production duplicate/route reconciliation은 미완료다.

### 6.17 notification ledger — 미구현

material change별 recipient·channel·dedupe key·delivery state·revoke 보상 event를 append-only로 관리해야 한다.

### 6.18 product feedback quality loop — 미구현

사용자의 만료·금액 오류 신고를 source revision/evidence/review item으로 되돌리는 provenance 경로가 없다.

### 6.19 post-operation drift program — 운영 후 과제

source freshness, parser drift, semantic distribution, reviewer disagreement, model cost/latency, public correction rate를 주기적으로 재평가해야 한다.

## 7. Roadmap

### 7.1 즉시: evidence와 판정 denominator 닫기

1. 24-case gold corpus에서 program/cycle/relation, application date role, amount components를 독립 adjudication한다.
2. canonical v2에 lossless `benefit_components`와 typed temporal interval을 설계하고 v1 conversion loss를 fixture로 고정한다.
3. Phase 5 live runner의 transport/parse/validator/abstain/fallback 상태를 top-level PASS와 분리한다.
4. external call 없이 replay mutation tests를 늘리고 prompt injection, dangling evidence, unsupported amount/date를 반드시 reject한다.
5. review packet에 deterministic result, proposal delta, evidence, reason, 선택지를 함께 제공하고 case당 처리 시간을 계측한다.
6. source inventory에 owner, cadence, legal check, expected parser와 freshness threshold를 추가하는 별도 승인을 준비한다.

즉시 완료 조건은 identity usable과 date/amount exactness가 사전 정의된 gold denominator에서 보고되고, clean/abstain/reject의 의미가 report에서 분리되는 것이다.

### 7.2 production 전: 통합·운영 hard gate

1. owner-authorized production read-only fingerprint로 schema, migration history, row count, RLS, schema cache를 확인한다.
2. sanitized schema diff와 non-prod clone에서 migration/backfill/reconciliation/rollback을 재연한다.
3. canonical projection과 legacy numeric route의 duplicate, visibility, bookmark/reference 호환성을 검증한다.
4. representative source cohort를 포맷·기관·언어·동적성 기준으로 층화하고 relevance/parser/identity metrics를 측정한다.
5. durable run state, distributed rate limit, alerting, dashboard, runbook, backup/export와 retention을 구현·검증한다.
6. 관리자 인증 browser에서 queue/detail/approve/reject/recovery와 audit event를 end-to-end 검증한다.
7. LLM 사용 시 승인된 provider, redaction, data retention, prompt/model pinning, timeout/cost ceiling, deterministic fallback을 적용한다.
8. canary는 자동 공개 없이 시작하고 owner gate 후 제한 projection, 즉시 hide/rollback을 증명한다.

Production 진입 조건은 schema parity PASS, critical risk 0, 공개 reconciliation 0 discrepancy, rollback drill PASS, alert ownership과 review SLA가 모두 증거로 남는 것이다.

### 7.3 운영 후: 품질·비용 최적화

1. source freshness와 parser drift SLO를 운영하고 breach를 자동 격리한다.
2. review correction을 gold corpus에 append하고 규칙/모델 버전별 offline eval을 지속한다.
3. high-confidence·low-risk 필드만 단계적으로 auto-accept하되 amount/date/URL과 relation은 더 높은 threshold를 유지한다.
4. 사용자 오류 신고와 correction rate를 material-change evidence로 연결한다.
5. model call rate, latency, cost, abstention utility와 reviewer time saved를 함께 최적화한다.
6. notification은 별도 ledger와 canary로 도입하고 correction/revoke 보상 흐름을 검증한다.

### 위험 기반 실행표

| 위험 | 영향 | 현재 완화 | 남은 문제 | 해결 시점 | 완료 기준 |
|---|---|---|---|---|---|
| semantic incompleteness | 사용자 필드 누락·과도한 review | fail-close, gold corpus | identity/date/amount recall | 즉시 | field별 threshold와 adjudication agreement |
| amount/date 오정규화 | 직접적인 사용자 손실 | evidence locator, abstain | 복합 benefit·date role | 즉시 | lossless schema와 exactness PASS |
| LLM overclaim | 잘못된 자동 결정 | sidecar, validator, auto false | live 품질·drift 미평가 | 즉시~production 전 | live 상태 분리와 human baseline 우위 |
| source/parser drift | 조용한 누락·오분류 | explicit status, fixtures | freshness SLO·alert 없음 | production 전 | canary corpus와 alert drill PASS |
| distributed duplicate/load | 중복 처리·대상 사이트 부담 | local idempotency/pacing | global lease/rate budget | production 전 | multi-worker fault test PASS |
| schema/RLS divergence | migration 실패·노출 회귀 | non-prod rehearsal, opt-in | production fingerprint 부재 | production 전 | sanitized parity와 rollback PASS |
| legacy/canonical divergence | 중복·route/bookmark 회귀 | compatibility/projection | cutover authority 미정 | production 전 | reconciliation discrepancy 0 |
| review backlog | freshness 저하 | reason-coded queue | SLA·throughput 미계측 | 즉시~production 전 | backlog age와 처리량 SLO 충족 |
| document security/legal | 악성 파일·약관·보존 위험 | byte bound, 수동 안내 | sandbox/retention/승인 기록 | production 전 | security/legal sign-off와 drill |
| notification duplication | 중복·오정보 발송 | 전체 비활성 | ledger/보상 event 없음 | 운영 후 별도 canary | dedupe·revoke E2E PASS |

## 8. Final evaluation

### 8.1 Architecture coherence

- **평가:** PASS
- **근거:** 관찰·추출·판단·effective state·projection의 층이 분리되고 identity 책임도 명시적이다.
- **현재 한계:** legacy/canonical 이중 모델의 종료 시점이 없다.
- **다음 판정 조건:** authority/cutover/rollback owner가 승인된 migration plan으로 고정될 것.

### 8.2 Source provenance

- **평가:** CONDITIONAL PASS
- **근거:** exact source resolution, URL alias, run/result/revision evidence가 있다.
- **현재 한계:** inventory 결손과 source별 ownership/legal/freshness metadata가 부족하다.
- **다음 판정 조건:** pilot cohort 전 source에 owner·cadence·허용 근거·freshness SLO가 있을 것.

### 8.3 Crawl resilience

- **평가:** CONDITIONAL PASS
- **근거:** retry, pacing, concurrency, checkpoint, resume와 bounded live evidence가 있다.
- **현재 한계:** process-local이고 distributed coordination·durable scheduler가 없다.
- **다음 판정 조건:** multi-worker host budget, durable lease, fault injection과 recovery drill PASS.

### 8.4 Document parsing

- **평가:** CONDITIONAL PASS
- **근거:** 86/86 fixture와 HTML/PDF bounded replay cache evidence가 있다.
- **현재 한계:** OCR/HWP/HWPX 실제 대표 corpus와 sandbox/tool deployment가 부족하다.
- **다음 판정 조건:** 포맷별 real-world gold corpus exactness와 resource/failure envelope 통과.

### 8.5 Evidence integrity

- **평가:** PASS
- **근거:** field locator, reference validation, unsupported-value rejection과 append-only provenance가 강제된다.
- **현재 한계:** OCR bbox와 raw evidence retention 정책이 완전하지 않다.
- **다음 판정 조건:** 모든 enabled parser가 재현 가능한 locator와 retention policy를 제공할 것.

### 8.6 Deterministic extraction safety

- **평가:** CONDITIONAL PASS
- **근거:** P0 safety mutation과 remediated representative reevaluation에서 unsupported/automatic publish가 0이다.
- **현재 한계:** resolved denominator와 recall이 작고 clean candidate가 없다.
- **다음 판정 조건:** 확대 gold corpus에서 field별 precision/recall/abstention threshold 충족.

### 8.7 Semantic completeness

- **평가:** HOLD
- **근거:** program/cycle usable 0/24, pending 198/216, non-P0 semantic 영향 22건이다.
- **현재 한계:** 조직 역할, 다중 benefit, date role, correction relation이 미해결이다.
- **다음 판정 조건:** identity/date/amount gold agreement와 lossless canonical representation PASS.

### 8.8 LLM-assisted review

- **평가:** UNEVALUATED FOR LIVE USE
- **근거:** branch replay에서 schema/evidence/negative validator는 통과했다.
- **현재 한계:** 외부 call 0이며 품질·비용·latency·drift·outage가 미평가다.
- **다음 판정 조건:** 승인된 bounded live set에서 transport와 semantic metrics를 분리 보고하고 human baseline 대비 이득을 증명할 것.

### 8.9 Human review governance

- **평가:** CONDITIONAL PASS
- **근거:** reason-coded review, append-only event, supersession과 자동 공개 차단이 있다.
- **현재 한계:** reviewer SLA, agreement, backlog, UX end-to-end evidence가 없다.
- **다음 판정 조건:** 인증 환경 workflow와 throughput/error audit PASS.

### 8.10 Data model and identity

- **평가:** CONDITIONAL PASS
- **근거:** 안정 notice/revision identity와 program/cycle 설계가 명확하다.
- **현재 한계:** program/cycle resolver와 production migration authority가 없다.
- **다음 판정 조건:** representative identity precision/recall 및 production reconciliation PASS.

### 8.11 Public projection safety

- **평가:** CONDITIONAL PASS
- **근거:** explicit opt-in, approve-only projection, reject/revoke hide, error fail-close와 rollback rehearsal이 있다.
- **현재 한계:** production route/RLS/duplicate parity가 확인되지 않았다.
- **다음 판정 조건:** owner-gated production fingerprint와 canary reconciliation 0 discrepancy.

### 8.12 Operations, security, and compliance

- **평가:** HOLD
- **근거:** 일부 reason-coded observability와 비운영 guard는 있다.
- **현재 한계:** SLO/alerts, secrets/provider policy, document sandbox, retention/legal runbook과 production access evidence가 없다.
- **다음 판정 조건:** 운영 owner, alert escalation, security/legal review, backup/restore drill 완료.

### 8.13 Product readiness

- **평가:** HOLD
- **근거:** 안전한 prototype과 non-prod vertical slice는 있으나 production migration과 의미 완전성이 닫히지 않았다.
- **현재 한계:** coverage, review throughput, identity, schema parity가 동시에 미완료다.
- **다음 판정 조건:** 7.2 hard gate 전부 충족 후 제한 canary에서 사용자-facing date/amount correctness를 검증할 것.

**최종 분류:** **검증된 architecture prototype을 포함한 비운영 pre-production platform**. 단순 proof of concept보다는 강하지만, production-ready platform 또는 production system으로 분류할 근거는 없다.

## 근거 인덱스

- Phase 1: [공통 crawler 설계](../engine/engine-phase-1-common-crawler.md), [baseline](../../reports/engine-phase-1-baseline.json)
- Phase 2: [Gate A](../engine/engine-phase-2-gate-a.md), [Gate B](../engine/engine-phase-2-gate-b.md)
- Phase 3: [문서 parsing](../engine-phase-3-document-parsing.md), [baseline](../../reports/engine-phase-3-baseline.json)
- Phase 4: [identity/schema/evidence ADR](../engine/adr/phase-4-identity-schema-evidence-evaluation.md), [evaluation contract](../engine/engine-phase-4-evaluation-contract.md), [P0 remediation](../engine/engine-phase-4-p0-extractor-remediation.md)
- Phase 4 대표 평가: [historical Gate C](../../reports/engine-phase-4-gate-c-representative-evaluation.json), [P0 remediated](../../reports/engine-phase-4-gate-c-p0-remediated.json), [full remediated](../../reports/engine-phase-4-gate-c-remediated.json), [candidate handoff](../../reports/engine-phase-4-candidate-handoff-dry-run.json)
- Canonical integration: [schema proposal](../post-phase-j-canonical-schema-proposal.md), [fixed scope](../post-phase-l-fixed-integration-scope.md), [review-to-public contract](../post-phase-n-q/review-to-public-contract.md)
- Non-production evidence: [Post-Phase L validation](../../reports/post-phase-l-validation-report.json), [Post-Phase M verification](../../reports/post-phase-m-runtime-verification.json), [integrated rehearsal](../../reports/post-phase-n-q/integrated-rehearsal.json)
- Production constraints: [current schema inventory](../post-phase-j-current-schema-inventory.md), [production readiness decision](../post-phase-m-production-readiness-decision.md), [master risk register](../../reports/post-phase-master-risk-register.json)

Phase 5의 branch-only 파일은 기준 main에 존재하지 않으므로 깨지는 상대 링크를 만들지 않았다. 참조 SHA의 replay report와 sidecar schema/provider/validator 구현을 `git show e4ae7824...:<path>`로 조사했으며, 그 결과는 “branch-only, external live call 0”으로만 본문에 반영했다.
