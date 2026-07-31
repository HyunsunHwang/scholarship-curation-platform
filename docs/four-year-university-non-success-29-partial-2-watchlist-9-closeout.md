# 전국 대학 본부 장학공지 29 + 2 + 9 집중 관측 closeout

기준 commit: `73c486c` (`remediation/unresolved-51-deep-fix`). 이 closeout은 production DB write, main merge, 187개 전체 재크롤을 수행하지 않았다.

## Cohort 정의와 검증

`four-year-university-final.json`을 생성한 coherent-final의 운영 판정을 그대로 사용했다. 즉 `success`와 `partial`은 운영상 success로 취급하고, active source 중 그 밖의 상태만 hard non-success로 계산했다.

| Cohort | 의미 | Rows |
|---|---|---:|
| Hard non-success | 현재 수집 실패 | 29 |
| Partial/degraded | 일부 수집 성공, 완전성 미달 | 2 |
| Coverage watchlist | 실행 성공, 기존보다 관측량 감소 | 9 |

검증 결과는 hard=29, partial=2, watchlist=9, cohort 간 `source_id` overlap=0, unique=40, disabled=0이다. 기준 fixture의 disabled GNU duplicate (`ou_1821_univ_001`)는 포함하지 않았다.

## 관측 방법과 증거

각 source의 configured official URL에 대해 15초 timeout, 최대 8 redirect, 비인증 read-only GET을 2회(transport error/timeout/429는 3회) 수행했다. HTTP status, redirect chain, content type/charset/size, list/detail 후보, selector 결과와 재시도 결과는 source별 `response-summary.json`에 남겼다. DB, crawler write, 로그인, CAPTCHA/WAF 우회는 하지 않았다.

실제 브라우저도 partial 2개를 교차 확인했다. 두 사이트 모두 공개 목록 자체와 로그인 링크가 함께 보였으며, 로그인 링크의 존재만으로 목록 인증 요구라고 판정하지 않았다.

## Hard non-success: 현재 수집 실패

29개는 하나의 실패군으로 제품 화면에 합산하지 않는다. 관측 원인 분포는 public-list login/auth gate 12, DNS/TLS/connection failure 11, 공개 XHR/POST adapter 필요 2, HTTP 403 1, stale URL 1, 수동 브라우저 확인 2다.

- P1: 강서대학교(`ou_1745_univ_001`), 대구한의대학교(`ou_2112_univ_001`) — 공개 XHR/POST list adapter를 제한적으로 구현하고 제목→상세 일치로 회귀 검증한다.
- P2: stale URL 1개는 공식 중앙 장학 게시판의 replacement URL 확인 후 registry만 교체한다. JavaScript event를 확정하지 못한 2개는 사람이 공식 목록/상세 클릭을 확인한 뒤 source adapter 여부를 정한다.
- P3: 로그인/403/transport 장애는 우회하지 않는다. 공개 대체 게시판이 확인되기 전까지 beta에서 제외하고 source별 저빈도 재시도 큐로 유지한다.

개별 원인, 실패 stage, raw evidence, 정확한 action은 diagnostics와 solution strategy CSV/JSON에 있다.

## Partial/degraded: 일부 수집 성공, 완전성 미달

| Source | 기존 observed | 어디까지 성공했나 | 원인 | 완전 성공 조치 | 운영 사용 |
|---|---:|---|---|---|---|
| 동국대학교(WISE) `ou_2285_univ_001` | 5 | 공개 장학/봉사 목록 및 상세 접근 | 빈 list selector가 학사일정 링크까지 섞는 config/scope mismatch | P0: notice table과 장학/봉사 detail link 범위를 source config로 고정 | 수정·source 회귀 검증 전에는 사용 금지 |
| 협성대학교 `ou_3518_univ_001` | 2 | 공개 협성소식 목록 | `jf_view` onclick의 상세 URL 복원이 불완전한 parser/adapter gap | P1: onclick payload→detail URL 공용 builder 보완 | 수정·title/detail 일치 검증 전에는 사용 금지 |

두 경우 모두 공개 목록이 살아 있으므로 재시도만으로 완전 성공이 보장되지는 않는다. 정확한 config/adapter 수정 뒤 source 단위 crawl과 최신 제목·상세 URL 일치 검증을 해야 한다.

## Coverage watchlist: 실행 성공, 기존보다 관측량 감소

9개는 실행 자체는 success지만 이전 with-items에서 0으로 감소했다. 7개는 목록에 최근 항목 신호가 있어 `current_false_zero`, 2개(광주대, 대전신학대)는 undated posts가 날짜 필터에서 탈락한 `undated_posts_filtered`다. 모두 P0 source-level selector/date/undated handling 검증 대상이며, 이 결과를 정상 zero로 승격하지 않는다.

## 제품 판단 및 재개 지점

이번 closeout의 결과는 **CONDITIONAL PASS**다. 40개 집중 관측과 사람 검토 패키지는 완성됐지만, beta 활성화는 29 hard non-success를 제외하고 partial 2개 및 zero-watchlist 9개의 source-level regression을 먼저 고친 후에만 진행한다. 다음 구현 단위는 (1) watchlist P0 date/undated/selector regression, (2) Dongguk WISE config scope, (3) Hyupsung `jf_view` builder, (4) 두 public XHR/POST adapter 순서다.

사람 검토는 `non-success-29-partial-2-watchlist-9-human-review.html`에서 cohort별 filter와 source별 checklist로 수행한다. 체크 상태는 localStorage에만 저장되며 외부로 전송되지 않는다.
