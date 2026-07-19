# Engine Phase 2 Completion — Gate B

## 목적

Gate B는 기존 common crawler에 로컬 단일 프로세스용 progress checkpoint, explicit resume, graceful cancellation, interrupted-run recovery를 추가한다. Gate A의 retry, pacing, shared host limiter, bounded source/detail concurrency, `AbortSignal`을 그대로 사용한다.

새 runner, scheduler, queue, worker, DB-backed state machine은 추가하지 않는다.

## Checkpoint 계약

checkpoint schema version은 `1`, runner contract는 `engine-phase-2-gate-b-v1`이다. checkpoint에는 다음 실행 진행 정보만 저장한다.

- run identity
- configuration/source-set fingerprint
- exact `source_key` 집합
- completed source와 completed work-item identity
- failed/cancelled evidence와 summary
- `running`, `cancelled`, `completed` 상태
- 생성/갱신 시각

work-item key는 별도 identity를 만들지 않는다. 기존 normalized graph가 사용하는 canonical URL/external article ID와 `ingestion_notices` stable UUID 규칙을 재사용한다.

raw HTML, PDF/HWP/HWPX/image bytes, OCR/document full text, normalized graph payload, credential, cookie, authorization header는 저장하지 않는다.

## Atomic write

최종 checkpoint를 직접 truncate하지 않는다. 같은 디렉터리에 exclusive temp file을 만들고 내용을 쓴 뒤 flush/close하고 최종 경로로 rename한다.

```text
checkpoint.json.tmp-<pid>-<nonce>
→ checkpoint.json
```

write/rename 이전 실패는 명시적인 `checkpoint_atomic_write_failed`이며 기존 checkpoint를 보존하고 temp file을 정리한다.

## Explicit resume

CLI 옵션은 positional input/output/state 인자 뒤 또는 사이에 둘 수 있다.

```powershell
npm run crawl:notices -- data/notice-sources.csv exports/notices .crawler/state.json `
  --checkpoint-path .crawler/engine-phase-2-progress.json `
  --run-identity nightly-local-2026-07-17
```

중단된 실행은 같은 source/config/run identity로 명시적으로 resume한다.

```powershell
npm run crawl:notices -- data/notice-sources.csv exports/notices .crawler/state.json `
  --checkpoint-path .crawler/engine-phase-2-progress.json `
  --run-identity nightly-local-2026-07-17 `
  --resume
```

`--resume` 없이 기존 checkpoint 경로를 사용하면 `checkpoint_exists_resume_required`로 fail-closed한다. `--resume`에는 `--checkpoint-path`가 필수다. 다음 불일치도 scheduling 이전에 실패한다.

- corrupt JSON 또는 필수 schema 누락
- schema/runner version 불일치
- configuration fingerprint 불일치
- source-set/source keys 불일치
- malformed 또는 duplicate completed identity
- summary와 identity counter 모순

완료 source는 source scheduling 전에 제외한다. 완료 work item은 detail/document parser scheduling 전에 제외한다. 이미 완료된 작업을 실행한 뒤 결과만 버리는 후처리 skip은 사용하지 않는다.

## Cancellation lifecycle

CLI는 하나의 `AbortController`에 `SIGINT`와 `SIGTERM`을 연결한다.

1. 첫 signal에서 abort reason을 기록한다.
2. Gate A bounded scheduling이 새 source/detail/retry/rate-limit wait를 시작하지 않는다.
3. 이미 실행 중인 작업은 `--settle-timeout-ms` 안에서 settle한다. 기본값은 5초다.
4. grace timeout 후 남은 작업은 completed로 기록하지 않고 abandoned/cancelled evidence로 남긴다.
5. 마지막 일관된 progress를 atomic cancellation checkpoint로 저장한다.
6. runner/CLI 결과에 `cancelled`, reason, checkpoint save 성공/실패를 명시한다.
7. SIGINT/SIGTERM 및 AbortSignal/timer listener를 정리한다.

두 번째 signal은 force-exit 요청을 로그로 명시하지만 첫 cancellation checkpoint를 손상시키는 별도 process state machine을 만들지 않는다.

## Phase 3 parser cache와의 분리

Gate B checkpoint는 run progress와 completion identity만 담당한다. Phase 3 persistent cache는 document parse 결과 재사용만 담당한다.

- completed item은 parser 호출 자체를 skip한다.
- incomplete item을 resume하면 기존 Phase 3 cache hit를 사용할 수 있다.
- Gate B는 Phase 3 cache key, parser version, byte/text fingerprint를 변경하지 않는다.
- checkpoint에 parser cache payload를 복제하지 않는다.

## Idempotency

fixture는 uninterrupted 실행과 deterministic cancellation 후 resumed 실행을 비교한다. normalized notice identity set, source status 구조, completed source/work-item 집합이 같아야 한다.

필수 불변식은 다음과 같다.

```text
resume_reexecuted_completed_source_count=0
resume_reexecuted_completed_work_item_count=0
resume_duplicate_identity_count=0
resume_second_execution_new_result_count=0
uninterrupted_vs_resumed_identity_match=true
uninterrupted_vs_resumed_core_structure_match=true
```

## 검증

```powershell
npm run test:engine-phase-2-gate-b -- --json=.tmp/engine-phase-2-gate-b/fixture-results.json
npm run live:engine-phase-2-gate-b
npm run evidence:engine-phase-2-gate-b
npm run validate:engine-phase-2-gate-b
```

live dry-run은 공개 source 2개, source당 공지 최대 1건, DB/production credential 없는 HTTP read-only 범위다. 외부 `AbortController`로 deterministic cancellation한 뒤 같은 local checkpoint에 explicit resume한다. SIGINT/SIGTERM은 process를 종료시키지 않는 deterministic integration fixture로 검증한다.

## 제한과 안전

- local single-process checkpoint만 지원한다.
- 여러 process가 같은 checkpoint를 동시에 공유하는 사용법은 지원하지 않는다.
- distributed coordination과 DB-backed durability는 없다.
- checkpoint migration framework는 없다.
- production DB/Supabase read/write, migration, canary, scheduler, queue, worker, external LLM을 사용하지 않는다.
- production migration과 canary/public beta 상태는 기존 HOLD/NOT_AUTHORIZED를 유지한다.
