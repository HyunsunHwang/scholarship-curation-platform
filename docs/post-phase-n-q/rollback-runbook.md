# Rollback Runbook

Rollback은 schema, data, application으로 구분한다.

## Schema

새 graph/review object만 제거하며 compatibility baseline과 environment guard를 보존한다. 비운영 schema rehearsal 근거는 Post-Phase L의 `999_post_phase_l_schema_rollback.sql`, `verify_post_phase_l_schema_rollback.sql`, `002_post_phase_l_normalized_graph.sql` 및 관련 report다. Production에서는 fingerprint와 dependency diff 없이 실행하지 않는다.

## Data

Reviewed run과 append-only review event는 기본적으로 물리 삭제하지 않는다. 우선순위:

1. projection hide
2. logical archive
3. run supersession
4. new write stop
5. isolated unreviewed run만 bounded physical rollback

N-Q 실제 비운영 근거는 `reports/post-phase-n-q/integrated-rehearsal.json`이다. 승인 후 거절로 숨기고, reopen/reapprove로 복구한 뒤 replay no-op과 최종 hide를 확인했다.

## Application

`POST_PHASE_O_DB_PUBLIC_READ_MODEL`을 끄고 report-backed honest state로 되돌린다. 동시에 canary scholarship의 `is_verified`와 `list_on_home`을 false로 만든다.

Rollback trigger는 unreviewed public row, rejected leakage, duplicate, source attribution failure, unrelated row change다. 검증은 `scripts/post-phase-q/check-nonproduction-invariants.mjs`와 production용 owner-approved 동등 검증을 사용한다.
