# Engine Phase 2 Completion — Gate A

## 범위

Gate A는 기존 Engine Phase 1/2 common runner를 확장해 반복 수집의 요청 안정성을 보완한다. 구현 범위는 Retry-After, bounded exponential backoff, deterministic jitter, 취소 가능한 delay, process-local source/host rate limiting, bounded source/detail concurrency다.

새 runner나 scheduler framework를 만들지 않는다. 기존 흐름은 그대로 유지된다.

```text
source config
→ source resolver
→ common runner
→ bounded list/detail transport
→ optional Phase 3 document processor
→ common output
```

## Retry 정책

재시도 대상은 network/transport error, timeout, HTTP 408, HTTP 429, HTTP 5xx다. configuration/source-resolution/unsupported/parser invariant와 HTTP 401·403 및 다른 명백한 4xx는 기본적으로 재시도하지 않는다. 취소도 재시도 대상이 아니다.

429 응답의 `Retry-After`는 delta-seconds와 HTTP-date를 지원한다. 음수, NaN, malformed 값은 무시하며 과거 HTTP-date는 0으로 정규화한다. 최종 delay는 다음 식을 사용한다.

```text
retry_delay_ms = min(
  maximum_retry_delay_ms,
  max(retry_after_ms, exponential_backoff_with_jitter_ms)
)
```

지수 backoff의 retry ordinal은 0부터 시작한다.

```text
base_delay_ms * 2^retry_ordinal
```

jitter는 `exponential * (1 + symmetric_random * jitter_ratio)` 방식이며 maximum delay로 제한한다. runner는 `nowMs()/nowIso()`, `sleep(ms, signal)`, `random()`을 주입할 수 있어 fixture가 실제 시간 대기 없이 동일한 delay sequence를 재현한다.

attempt history에는 기존 필드와 함께 다음 증거가 추가된다.

- `retry_delay_ms`
- `retry_delay_source`
- `retry_after_ms`
- `exponential_backoff_ms`
- `retryable`
- `reason_code`

## AbortSignal-aware delay

retry backoff와 rate-limit pacing은 공통 `abortableDelay()`를 사용한다. signal이 abort되면 timer와 listener를 정리하고 즉시 종료하며 추가 attempt를 만들지 않는다.

Gate A는 delay와 scheduling을 취소할 수 있는 seam만 제공한다. CLI의 SIGINT/SIGTERM 전체 lifecycle, in-flight settle 정책, 취소 checkpoint는 Gate B 범위다.

## Source/host rate limiting

rate limiter는 한 Node.js process 안에서 동작한다. URL에서 host key를 추출하지 못하면 `invalid-host` fallback을 사용한다.

지원 설정:

- source별 최소 request interval
- host별 최소 request interval
- host별 최대 동시 request 수

list/detail fetch와 Phase 3 attachment HEAD/GET transport가 같은 limiter seam을 사용한다. permit은 transport가 성공하거나 실패해도 `finally`에서 반환된다. evidence에는 source key, host key, wait duration, logical request start, cancelled wait, observed host concurrency를 기록한다.

이는 distributed rate limiter가 아니다. Redis, DB lock, queue, cron, worker는 추가하지 않는다.

## Bounded concurrency

common runner는 다음 두 cap을 지원한다.

- `sourceConcurrency`: 동시에 실행하는 source 수
- `detailConcurrency`: 한 source 안에서 동시에 처리하는 notice detail 수

host concurrency cap은 전체 detail cap보다 우선한다. 결과 배열은 입력 순서를 유지한다. 한 source의 실패는 다른 source를 중단하지 않으며, 한 detail 또는 Phase 3 document hook의 실패는 해당 notice를 partial evidence로 남기고 sibling notice 처리를 계속한다. signal abort 후에는 새 작업을 scheduling하지 않는다.

## CLI 환경변수

`crawl:notices`는 다음 환경변수를 읽는다.

```text
CRAWL_SOURCE_CONCURRENCY
CRAWL_DETAIL_CONCURRENCY
CRAWL_HOST_CONCURRENCY
CRAWL_SOURCE_MIN_INTERVAL_MS
CRAWL_HOST_MIN_INTERVAL_MS
CRAWL_RETRY_BACKOFF_MS
CRAWL_RETRY_MAX_DELAY_MS
CRAWL_RETRY_JITTER_RATIO
```

기본값은 source concurrency 1, detail concurrency 2, host concurrency 2, source/host interval 250ms, retry base 1초, retry maximum 30초, jitter ratio 0.1이다. 기존 Phase 3 opt-in `CRAWL_DOCUMENT_PARSING_ENABLED` 동작은 유지한다.

checkpoint/resume/recovery 환경변수는 Gate A에서 추가하지 않는다.

## 검증

```text
npm run test:engine-phase-2-gate-a
npm run live:engine-phase-2-gate-a
npm run evidence:engine-phase-2-gate-a
npm run validate:engine-phase-2-gate-a
```

focused fixture는 fake transport, fake clock, injected sleep/random으로 Retry-After 두 형식, `[100, 200, 400]` exponential sequence, deterministic jitter, abort timer cleanup, source/host interval, host/source/detail cap, fault isolation, Phase 3 on/off 호환성을 검증한다.

bounded live run은 `korea_002`, `yonsei_001` 공개 source에서 source당 공지 1건만 읽는다. source/detail concurrency 2, host concurrency 1, source interval 150ms, host interval 200ms, retry 최대 1회다. DB/production/LLM을 사용하지 않으며 checkpoint를 만들지 않는다.

## Gate B로 이관된 범위

다음은 이 branch에서 구현하지 않는다.

- 최소 versioned checkpoint와 atomic write
- completed source/work key와 resume skip
- corrupt/incompatible checkpoint fail-closed
- SIGINT/SIGTERM graceful cancellation lifecycle
- cancellation checkpoint
- interrupted run recovery와 resume idempotency
- uninterrupted/resumed 구조 동등성

Gate B는 Gate A가 PR로 검증·병합된 뒤 별도 작업으로 진행한다.

## 제한과 비목표

- limiter는 단일 process 범위이며 distributed replica 간 요청을 조정하지 않는다.
- bounded live 표본은 전국 source coverage 증거가 아니다.
- Phase 3 PDF/HWP/OCR parser를 다시 구현하지 않는다.
- duplicate/same-program/changed-content/moved-URL 판정을 추가하지 않는다.
- DB ingest, migration, production access, UI, API, cron, queue, worker, 외부 LLM을 추가하지 않는다.
