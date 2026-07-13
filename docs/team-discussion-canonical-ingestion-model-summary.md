# Canonical Ingestion Model Team Discussion Summary

## 지금 결정해야 할 것

장학금 공고 ingestion의 장기 canonical model은 normalized crawler graph로 채택한다.

단, 메인 DB의 source canonical identity는 `notice_sources.source_id`로 둔다. `source_key`는 crawler-facing stable natural key와 idempotency key로 유지한다.

단기 통합은 adapter/read-model first로 진행한다.

## 아직 구현하지 말아야 할 것

- production/main DB migration
- `lib/database.types.ts` broad merge
- `app/admin` UI 전면 교체
- write/apply command 병합
- `crawled_notices` 즉시 제거
- Phase 1~7 personal-dev 결과를 production readiness로 표현
- shallow crawl 결과를 전국 coverage 완성으로 표현

## normalized graph가 장기 방향으로 좋은 이유

normalized crawler graph는 source, notice, occurrence, target, URL alias, asset, keyword match, crawler run, source result, error를 분리해서 추적한다.

이 구조는 duplicate review, no-assets/body-quality policy, source health, rollback scope, batch observability, future LLM-assisted review를 운영하기에 더 적합하다.

`crawled_notices` 단일 staging 중심 모델은 초기 review UI에는 단순하고 빠르지만, 장기 운영 감사와 반복 수집 이력 관리에는 한계가 있다.

## adapter-first가 더 안전한 이유

upstream은 이미 `notice_sources`, `crawled_notices`, admin/review UI, contests schema, product UI를 발전시켰다.

따라서 normalized graph를 바로 UI/DB 위에 덮어씌우면 충돌 비용과 회귀 위험이 크다.

adapter/read-model first 전략은 기존 UI를 유지하면서 graph-backed provenance를 도입하는 전환 경로다. 이는 결정을 미루는 것이 아니라 migration risk를 통제하는 방식이다.

## source_id와 source_key 역할 분리

`notice_sources.source_id`는 DB canonical source identifier다.

`source_key`는 crawler-facing natural key, idempotency key, fixture/run trace key다.

adapter는 `source_key`를 `source_id`로 resolve해야 한다. resolve 실패는 fail closed로 처리하고, silent insert 또는 자동 apply로 이어지면 안 된다.

장기 graph table은 `source_id` FK를 저장해야 하며, `source_key`는 snapshot/alias/evidence로 보존할 수 있다.

## PR 분리 권장

1. Integration Foundation PR: ADR, source identity resolver, local JSON adapter/read-model prototype
2. Ops safety PR: rollback dry-run and aggregate batch observability
3. Review/quality contract PR: review backlog, no_assets/body quality policy, status mapping
4. Adapter-backed admin review MVP PR
5. User-facing scholarship listing/detail/search/filter MVP PR
6. Bounded deeper crawl coverage PR
7. LLM-assisted review prototype PR
8. Schema proposal PR
9. Guarded apply path review PR
10. Production migration PR

## 주요 리스크

- `crawled_notices`와 graph가 독립적으로 발전하면 dual-model divergence가 발생한다.
- source identity mapping이 불완전하면 apply/review 결과가 잘못 연결될 수 있다.
- admin UI를 너무 빨리 merge하면 upstream UI 회귀가 발생할 수 있다.
- schema agreement 없이 `database.types.ts`를 병합하면 type drift가 발생한다.
- personal-dev 검증 결과를 production readiness로 과장하면 운영 판단이 왜곡된다.

## 다음 액션

1. ADR 0001을 팀 review에 올린다.
2. `source_key -> notice_sources.source_id` mapping guarantee를 정의한다.
3. read-only adapter output shape를 확정한다.
4. current admin review UI가 필요한 필드를 목록화한다.
5. local JSON read-model prototype을 만든다.
6. schema migration은 adapter validation 이후 별도 승인으로 진행한다.
