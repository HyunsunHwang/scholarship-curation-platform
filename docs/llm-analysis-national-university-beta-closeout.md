# LLM 의미 해석 연구 closeout — 전국 대학 본부 장학공지 베타

## 1. Executive decision

**READY TO CLOSE OUT.** 현재 v3.4 계열은 공개 장학금, 관리자 검수 큐, candidate write 경로에 연결되지 않은 fixture/report 전용 연구 경로다. `e30c2d8`의 네 fixture benchmark는 `CONDITIONAL_PASS`이며, 이는 원시 출력의 제품 수준 의미 정확성 보증이 아니라 validation/replay를 거친 실험 상태다. 따라서 v3.4를 새 beta의 선행 구현으로 계속 확장하지 않고 연구 baseline으로 동결해도 현재 서비스에 기능적 영향이 없다.

새 제품 경로는 **전국 대학 본부 장학공지 베타 출시**다. 전국 source registry에 대학 본부 출처를 등록하고, 검증된 출처부터 최근 1개월 backfill 및 이후 신규·수정 공지를 수집한다. 모든 후보는 관리자 검수 후에만 공개한다. Candidate JSON v2 전체 설계, boolean eligibility tree, 자동 적격 판정은 이 beta의 선행조건이 아니다.

## 2. Product direction

beta의 가치는 모든 장학금과 모든 지원 가능 여부를 판정하는 데 있지 않다. 대학 전체 학부생이 확인할 수 있는 공식 본부 공지에서 장학금명, 혜택, 마감, 신청 경로, 원문을 빠르게 제공하는 데 있다.

출처는 다음을 모두 만족해야 한다.

- 국내 4년제 일반대학 또는 교육대학의 공식 도메인이다.
- 대학 본부 또는 중앙 학생지원·장학 조직이 운영한다.
- 대학 전체 학부생을 대상으로 하는 실제 목록형 장학 공지 게시판이며 목록과 상세 원문 URL이 모두 있다.
- 대학원, 단과대, 학과·학부, 사업단·연구소, 외부 재단·지자체·기업·금융기관 출처는 beta에서 제외한다.

`sourceLevel`은 이미 source manifest와 crawler에서 보존·필터할 수 있다. 다만 `university`라고 표시된 출처라도 일반 뉴스센터처럼 장학공지가 분리되지 않은 경우에는 registry 검증에서 제외하거나 명시적으로 장학 공지 범위만 설정해야 한다.

LLM의 역할은 **관리자용 초안**이다. 사용자별 지원 가능 여부, 자동 매칭, 자동 공개를 말하거나 암시하지 않는다. 구조화하지 않은 조건은 `핵심 자격 요약`, `중요 제외·예외`, `기타 중요 안내`, 그리고 원문 snapshot으로 보존한다.

## 3. Current LLM architecture

v3.4의 실제 흐름은 다음과 같다.

```text
notice body segmentation
→ SIMPLE 또는 COMPLEX 복수 pass provider 호출
→ compact claim schema validation
→ claim-level validation / normalization / organization relation gate
→ accepted-pass merge
→ duplicate reconciliation
→ deterministic recovery
→ semantic audit
```

- [`lib/analysis/segment-reference-pipeline-v34.mjs`](../../lib/analysis/segment-reference-pipeline-v34.mjs)는 body 복잡도에 따라 SIMPLE 한 pass 또는 COMPLEX A/B pass를 실행한다. 성공한 pass만 compact 결과에 넣고, claim merge·dedupe·deterministic recovery까지 수행한다.
- [`lib/analysis/segment-reference-schema-v32.mjs`](../../lib/analysis/segment-reference-schema-v32.mjs)와 [`lib/analysis/claim-level-validator-v33.mjs`](../../lib/analysis/claim-level-validator-v33.mjs)는 source ref와 일부 필드의 exact/raw match를 강하게 요구한다.
- [`lib/analysis/provider-output-normalizer-v342.mjs`](../../lib/analysis/provider-output-normalizer-v342.mjs), [`lib/analysis/claim-isolation-validator-v342.mjs`](../../lib/analysis/claim-isolation-validator-v342.mjs), [`lib/analysis/organization-relation-gate-v342.mjs`](../../lib/analysis/organization-relation-gate-v342.mjs)는 validation 실패 claim을 정규화·격리한다.
- [`lib/analysis/generic-claim-reconciler-v34.mjs`](../../lib/analysis/generic-claim-reconciler-v34.mjs)는 중복 claim을 제거하고 단일 후보인 날짜·연락처·혜택을 코드로 복구한다.
- [`scripts/evaluate-segment-reference-generalization-v343.mjs`](../../scripts/evaluate-segment-reference-generalization-v343.mjs)는 provider 허가 환경에서만 실행되며, validation 실패 pass에 대해 offline replay 및 substring 기반 semantic audit을 수행한다.

이 경로는 `crawled_notices`, `scholarships`, 관리자 action을 import하거나 write하지 않는다. repository 검색상 runtime 사용처는 v3.4 evaluator/replay/test뿐이다. 즉 test·report 전용 연구 경로다.

## 4. Production-path assessment

현재 관리자 draft 경로는 v3.4와 별개다.

```text
crawled_notices(title, source_name, body, notice_url)
→ generateNoticeDraft
→ extractScholarshipDraft
→ crawled_notices.extracted_draft
→ administrator form review
→ promoteNotice
→ scholarships + scholarship_selection_stages
→ verified public detail/card
```

- [`app/admin/crawled-notices/actions.ts`](../../app/admin/crawled-notices/actions.ts)의 `generateNoticeDraft`는 관리자 권한에서 기존 notice의 제목·기관·본문·URL을 읽고 `extractScholarshipDraft` 결과를 `extracted_draft`로 저장한다. Post-Phase L 환경에서는 provider 호출을 막는다.
- [`lib/notice-extraction.ts`](../../lib/notice-extraction.ts)의 `NoticeDraft`는 금액, 기간, 지원 방법, 서류, 연락처, 선발 절차와 다수의 legacy 자격 필드를 만든다. JSON parse 실패 시 provider 재호출을 한 번 시도하며, 일부 자격 값을 표준화·환산한다.
- [`app/admin/review/scholarships/[id]/page.tsx`](../../app/admin/review/scholarships/[id]/page.tsx)는 `extracted_draft`로 검수 form 기본값을 채운다. 원문 URL·본문·source ID·중복 위험도 함께 보여 준다.
- `promoteNotice`는 검수 form을 [`lib/scholarship-payload.ts`](../../lib/scholarship-payload.ts)로 변환해 `scholarships`에 넣고, review 상태를 갱신한다. 해당 action에는 실제 DB write가 있으나 이번 closeout에서는 실행하지 않았다.
- 공개 상세는 [`app/scholarships/[id]/page.tsx`](../../app/scholarships/[id]/page.tsx)에서 `is_verified=true`인 scholarship을 읽으며, 일정·지원 방법·자격·원문·원문 URL을 표시한다. [`lib/scholarships/public-scholarship-service.ts`](../../lib/scholarships/public-scholarship-service.ts)는 controlled beta DB projection도 제공한다.

따라서 beta에는 **관리자 검수→승격→공개라는 경계는 재사용**할 수 있다. 그러나 현 `NoticeDraft`를 beta contract로 그대로 채택해서는 안 된다. legacy 자격 배열·점수 환산·세부 프로필 필드는 beta 필수값보다 넓고, parse 재시도 및 본문 보강 호출 정책도 새 contract에서 명시적으로 결정해야 한다.

## 5. Findings from CAU and Dream

동결 baseline은 다음 실제 fixture와 report로 구성된다.

- [`fixtures/llm-analysis/unseen-generalization-v343.json`](../../fixtures/llm-analysis/unseen-generalization-v343.json): CAU 예술대 성적우수장학생(`cau_041/1030`)과 고려대 경영대 Dream Scholarship(`korea_001/7264`)의 원문, URL, 게시일, SHA-256.
- [`reports/llm-analysis/segment-reference-generalization-v343.json`](../../reports/llm-analysis/segment-reference-generalization-v343.json): 네 fixture, provider call 3회, benchmark `CONDITIONAL_PASS`.
- [`reports/llm-analysis/segment-reference-generalization-audit-v343.json`](../../reports/llm-analysis/segment-reference-generalization-audit-v343.json) 및 [`reports/llm-analysis/segment-reference-generalization-consolidated-v343.json`](../../reports/llm-analysis/segment-reference-generalization-consolidated-v343.json): 수동 감사·통합 기준선.

| 관찰 | 실제 결과 | beta에 주는 결론 |
|---|---|---|
| 개별 정보 추출 | 제목, 혜택, 기간, 자격 단서는 대체로 발견됐다. | 핵심 필드 초안은 유효한 보조 수단이다. |
| 출력 계약 | CAU SIMPLE은 organization role/source ref shape 오류로 raw validation 실패했다. Dream A도 raw substring·role 오류가 났다. | 모델의 schema 준수만으로 공개 판단을 하면 안 된다. |
| 관계 오류 | Dream의 개별 자격은 찾았지만 AND/OR 적용 범위를 잘못 조립했다. | 자연어 요약과 원문 검수로 시작하고 boolean tree를 미룬다. |
| merge/replay | evaluator는 completed pass만 merge하고, `final_claims`가 비어 있을 때만 replay 결과를 채택한다. Dream은 B pass가 남아 A replay의 핵심 필드가 최종값에서 사라질 수 있다. | 여러 pass 결과를 코드가 의미적으로 조립하는 경로를 beta에서 쓰지 않는다. |
| evaluator | 새 audit은 cited segment에 `semantic_value`가 있으면 `CORRECT`, 아니면 `PARTIAL`로 둔다. 관계·범위 오류를 충분히 판정하지 못한다. | `CONDITIONAL_PASS`, `HALLUCINATED 0`을 beta 제품 품질 증거로 사용하지 않는다. |

CAU와 Dream은 beta contract의 **회귀 표본**으로만 재사용한다. 향후 구현은 provider output, 관리자 수정 결과, 원문 snapshot을 함께 저장하고, fixture의 수동 판정은 변경 이력 있는 별도 정답으로 보존한다. 기존 report의 claim count와 substring audit 등급은 배포 승인 근거가 아니다.

## 6. Asset disposition

| 자산·모듈 | 실제 역할 | 분류 | 베타 처리 | 장기 처리 | 이유 |
|---|---|---|---|---|---|
| `segment-reference-pipeline-v34.mjs` | 복수 pass claim 추출·merge·recovery | Obsolete path | 공개 경로에서 제외, 동결 | 연구 비교용 보존 | beta가 필요로 하지 않는 의미적 조립을 수행한다. |
| v3.2/v3.3 claim schema·validator | strict raw/source-ref claim 계약 | Obsolete path | 사용하지 않음 | 연구 참조 | raw match가 제품 의미 정확성을 보장하지 않는다. |
| v342 normalizer/isolation gate | 실패 claim 정규화·격리 | Obsolete path | replay에 사용하지 않음 | 실패 분석 참고 | beta는 실패를 `extraction_failed` 또는 검수 보류로 보낸다. |
| organization relation gate | 프로그램과 무관한 기관 언급 격리 | Reusable core | 좁은 안전 규칙으로만 참고 | 재설계 후 재사용 | 국가장학금 등 관련 언급 오인을 막는 문제 자체는 남는다. |
| generic claim reconciler/recovery | dedupe와 deterministic value 복구 | Obsolete path | 사용하지 않음 | 연구 보존 | claim 선택·복구가 사실을 소실하거나 바꿀 수 있다. |
| notice segmentation | 연속 원문 구간과 offset 검증 | Reusable core | 필요할 때 evidence locator로 사용 | 유지 | 원문 fidelity와 관리자 탐색에 유용하다. |
| source refs/provenance | claim과 원문 연결 | Reusable core | 핵심 필드 excerpt에 축소 적용 | 유지 | 검수 속도와 감사 가능성을 높인다. |
| provider raw output | 모델 응답 재현 근거 | Reusable core | 안전하게 저장 | 모델 평가에 유지 | 관리자 수정과 비교 가능한 원자료다. |
| v3.4 fixture/report/test | 실제 공지 benchmark | Advanced R&D | 수정 없이 동결 | 새 contract 회귀 corpus | 제품 배포 판정이 아닌 연구 기준선이다. |
| `scholarship-analysis-v1`/program-cycle domain | 승인된 semantic output에서 program/cycle proposal 생성 | Advanced R&D | beta 선행조건에서 제외 | 중복 통합 필요 시 재개 | `eligibility_conditions` 등 정교한 canonical output을 전제한다. |
| candidate handoff gate | clean/needs review/blocked 공개 경계 | Reusable core | status·audit trail 개념 재사용 | 유지 | 자동 공개를 막는 경계는 beta에도 필요하다. |
| `extractScholarshipDraft`/`NoticeDraft` | 관리자 form용 legacy LLM draft | Release blocker | 작은 contract로 축소·대체 설계 | legacy mapping은 유지 | 기존 관리자 경로에 실제 연결되어 있다. |
| review form/`promoteNotice` | 관리자 검수 뒤 공개 scholarship 승격 | Release blocker | 재사용, 필드 매핑 검증 | 개선 | beta의 human-in-the-loop 경계다. |
| public scholarship/detail model | 검수된 행의 카드·상세 노출 | Release blocker | 기존 필수 표시값 보존 | 유지 | 최종 사용자 노출 경로다. |
| source snapshot/hash, source ID, revision 진단 | 수집 원문·수정 추적 | Reusable core | registry 운영에 포함 | 유지 | 수정 공지 재검수에 필요하다. |

## 7. Minimal extraction contract proposal

이 절은 구현 명세가 아니라 beta 재개 시 확정할 최소 계약이다. legacy DB 필드가 존재하더라도 아래 필드 밖의 프로필 구조화를 초안 생성의 성공 조건으로 삼지 않는다.

### 공개 카드

| 필드 | 상태/표현 |
|---|---|
| 장학금명 | `known`이어야 한다. |
| 대학 또는 운영기관 | `known`이어야 하며 source metadata와 구분한다. |
| 금액·혜택 요약 | `known` 또는 `not_stated`; 원문 표현을 우선한다. |
| 신청 마감일 | `known`, `not_stated`, `not_applicable`, `ambiguous` 중 하나를 표시한다. |
| 공지 유형 | 아래 opportunity mode enum. |

### 상세 페이지

- 신청 시작일과 마감일, 각 값 상태
- 금액 또는 혜택 요약
- 핵심 지원·선발 자격의 자연어 요약
- 중요한 제외·예외 조건
- 신청 방법과 원문 URL
- 기타 중요 안내, 원문 snapshot, attachment reference가 있으면 그 링크

### 관리자 검수

- draft 값과 값 상태
- source ID, 게시글 식별자, canonical URL, 게시일, content hash
- 각 핵심 필드의 짧은 원문 evidence excerpt와 locator. segment ID는 구현 선택 사항이며 character span은 beta에서 불필요하다.
- 원문 전체 snapshot과 attachment reference
- 검수 상태, 관리자 수정값·사유·시각·담당자, extraction failure 이유

### 내부 provenance

- prompt version, model, schema version, provider raw output, extraction timestamp
- 최초/최종 관측 시각과 revision/hash
- source registry version

### 상태 표현과 opportunity mode

값 상태는 `known`, `not_stated`, `not_applicable`, `ambiguous`를 사용한다. provider/parse/network 등 기술 실패는 값 상태로 위장하지 않고 `extraction_failed`로 분리한다.

`application_required`, `automatic_selection`, `nomination_required`, `information_only`, `unknown`은 beta에 필요한 작은 enum이다. 이는 CTA·일정 표시와 사용자 오해를 제어하는 분류일 뿐 eligibility logic이 아니다. 원문상 유형이 불명확하면 `unknown`으로 검수에 보낸다.

필드별 character span, 모든 문장의 claim, boolean condition tree, match-safe projection은 beta 이후 항목이다. 반대로 원문 URL·전체 snapshot·핵심 필드 excerpt는 관리자 검수 속도와 잘못된 날짜·금액 방지에 필요하므로 생략하지 않는다.

## 8. Review and publication boundary

```text
수집된 원문 및 provenance
→ LLM draft (또는 extraction_failed)
→ 관리자 검수·수정·승인/거절
→ 검수 승인된 scholarship public projection
```

- LLM draft는 공개 권한을 갖지 않는다.
- `ambiguous`, `not_stated`, `extraction_failed`는 자동 추론·replay로 채우지 않는다. 필요한 경우 관리자가 원문을 확인하거나 보류·거절한다.
- 수정 공지는 URL 동일 여부와 content hash/revision을 기준으로 새 검수 대상으로 만들며, 기존 공개값을 자동 변경하거나 자동 공개하지 않는다.
- 공개 전에는 원문 URL, 본문 또는 snapshot, 장학금명, 기관, 마감 상태, opportunity mode, 검수 이력이 존재해야 한다.

이 경계는 현재 `generateNoticeDraft` → review form → `promoteNotice`의 구조를 활용할 수 있다. 구현 재개 시에는 작은 contract를 legacy form과 public model에 매핑하되, 기존의 세부 자격 필드를 모두 생성하도록 요구하지 않는다.

## 9. Frozen research baseline

다음은 삭제·이동·재생성하지 않고 baseline으로 동결한다.

- `lib/analysis/segment-reference-pipeline-v34.mjs`
- `lib/analysis/segment-reference-schema-v32.mjs`
- `lib/analysis/claim-level-validator-v33.mjs`
- `lib/analysis/provider-output-normalizer-v342.mjs`
- `lib/analysis/claim-isolation-validator-v342.mjs`
- `lib/analysis/organization-relation-gate-v342.mjs`
- `lib/analysis/generic-claim-reconciler-v34.mjs`
- `scripts/evaluate-segment-reference-generalization-v341.mjs`
- `scripts/evaluate-segment-reference-generalization-v343.mjs`
- `scripts/replay-segment-reference-generalization-v342.mjs`
- `scripts/test-segment-reference-pipeline-v34.mjs`
- `scripts/test-segment-reference-replay-v342.mjs`
- `scripts/test-segment-reference-generalization-v343.mjs`
- `fixtures/llm-analysis/unseen-generalization-v343.json` 및 기존 v341 fixture
- `reports/llm-analysis/segment-reference-generalization-*.json`
- `docs/llm-analysis-segment-reference-generalization-v343.md`

동결은 제거가 아니다. 다음은 새 beta 경로에서 금지한다: v3.4 provider 재평가를 release gate로 사용, validation 실패 claim의 의미적 replay, pass 간 claim 재조립, substring audit을 semantic correctness 증명으로 사용, role/category 예외 누적.

## 10. Known limitations

- 현재 `NoticeDraft`는 beta보다 넓은 legacy qualification schema와 일부 값 환산을 포함한다. 이는 빠른 검수를 위해서는 과도하고, 잘못된 자동 구조화 위험이 있다.
- 기존 draft 함수는 본문이 짧으면 URL detail fetch를 하고, JSON parse 실패에는 provider 재시도를 한다. beta의 provider 횟수·본문 보강·실패 보존 정책은 새 contract에서 별도로 확정해야 한다.
- 공개 detail은 legacy 필드와 자동 qualification match UI를 지원한다. beta에서 이를 사용자 적격 판정으로 노출하지 않도록 mapping과 copy를 점검해야 한다.
- `scholarships` payload는 `apply_start_date`, `apply_end_date`, `apply_url` 등을 string으로 요구한다. 최소 contract의 상태값을 legacy 공개 모델로 옮기는 방식을 구현 전에 설계해야 한다.
- repository 코드만으로 운영 DB의 실제 source completeness, crawler 성공률, 검수 적체량, production environment flag 상태는 판단하지 않았다.

## 11. Resume gates

| 고급 작업 | 재개 gate |
|---|---|
| boolean eligibility tree | 관리자 수정·자격 불일치 피드백이 반복되는 조건 관계 유형을 충분히 보여 주고, 자연어 요약으로 검수할 수 없는 사례가 누적됐을 때 |
| match projection | 승인된 조건 구조와 신뢰 가능한 사용자 프로필이 함께 있고, false-positive 비용을 측정할 수 있을 때 |
| verifier LLM | 핵심 필드의 관리자 수정 이력으로 versioned 평가 표본을 만들고, verifier가 사람 검수 시간을 줄인다는 holdout 증거가 있을 때 |
| automatic approval | 출처별 추출 실패·수정·중복·수정공지 비율이 안정적이며 critical field error를 사전에 막는 규칙과 rollback 경로가 검증됐을 때 |
| fine-tuning | 사용 권한이 명확한 대규모 수정·승인 corpus, 고정 schema, baseline 대비 측정 가능한 비용·정확도 가설이 있을 때 |
| relation-aware semantic evaluator | 수동 판정이 AND/OR·예외·적용 범위 오류를 명시적으로 태깅한 평가 corpus가 있을 때 |

재개 판단은 provider 출력량이나 `CONDITIONAL_PASS` 개수만으로 하지 않는다. source별 관리자 수정률, 추출 실패 분포, 수정 공지 비율, 원문 클릭·지원 클릭·저장·자격 불일치 피드백을 함께 본다.

## 12. Exact next task

**전국 대학 본부 장학공지 beta의 MVP extraction contract 결정 문서를 작성하고 승인한다.** 이 한 작업은 source registry 입력 요건, 본 문서의 카드·상세·검수·provenance 필드, 상태 enum, 검수 후 공개 gate를 확정하는 일이며, provider 호출·Candidate JSON v2·새 validator·새 pipeline 구현은 포함하지 않는다.
