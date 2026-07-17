# Engine Phase 2 — Crawler resilience and run observability

## Outcome

Engine Phase 2 extends the Phase 1 common runner. It does not introduce another crawler, identity model, ingest path, API, scheduler, worker, or user interface.

The existing `crawl:notices` generic HTML path now executes each source as a bounded logical attempt. A source failure is returned as evidence rather than thrown across the multi-source run, so later sources continue sequentially. Source-specific adapters remain available through their existing exceptional path.

## Timeout and retry policy

- Default source-attempt timeout: 25,000 ms.
- Default retry count: 1, giving at most two logical attempts.
- Default retry backoff: 1,000 ms, bounded to at most 30,000 ms.
- Configurable retry count is capped at 3 to prevent unbounded execution.
- Retryable attempts wait linearly (`base x 1`, `base x 2`, `base x 3`) only when another attempt remains. The final or any non-retryable attempt does not wait.
- The common runner sets the transport retry count to zero for each logical attempt. This prevents hidden nested retries and keeps `attempt_history` equal to the actual source attempts.
- Each attempt owns an `AbortController` and timer. The timer is cleared in `finally`, and real HTTP requests receive the abort signal.
- `CRAWL_TIMEOUT_MS`, `CRAWL_RETRY_COUNT`, and `CRAWL_RETRY_BACKOFF_MS` configure the authoritative CLI path. The CLI retains its 200 ms minimum and the common runner enforces the 30-second maximum.

Retryable outcomes are timeout, network failure, HTTP 429, and HTTP 5xx. Configuration, source resolution, unsupported strategy, parser/normalization failure, HTTP 4xx other than 429, empty observation, and detail-level partial outcomes are not retried.

## Source result evidence

Each bounded source result records:

- exact `source_key` and resolved `source_id`;
- strategy and final status;
- configured timeout/retry values;
- total attempts, total duration, item count, and final reason;
- `retried`, `recovered_after_retry`, and `retry_exhausted` flags;
- per-attempt sequence, status, retryability, duration, reason code, timeout flag, item count, and bounded error summary.
- configured `retry_backoff_ms`, per-attempt `retry_delay_ms`, and accumulated `total_retry_delay_ms`.

Error summaries redact authorization, cookies, passwords, tokens, API keys, database URL credentials, bearer values, and JWT-like values, and are capped at 300 characters. Stack traces, response HTML, headers, and cookies are not stored in attempt evidence.

An observed list with a failed detail request is `partial`, not clean success. `empty_observed` remains a zero-match observation and is not proof that a site has no scholarship notices.

## Run summary

`runCommonCrawler` executes sources sequentially and produces `run_summary`. The existing CLI embeds the same aggregate under `boundedExecution.summary` in its local JSON report.

The aggregate includes requested/completed/success/failed/timeout/zero-match/partial/blocked counts; total attempts, items, and retry delay; retry/recovery/exhaustion counts; per-source final status; and `overall_run_status`.

Overall statuses are:

- `succeeded`: every source succeeded;
- `completed_with_zero_match`: no failures/partials, with at least one empty observation;
- `partial`: success/zero/partial mixed with failures, or any detail-level partial result;
- `failed`: every requested source failed.

`validateCrawlerRunSummary` checks source count, mutually exclusive status arithmetic, attempt totals, item totals, retry-delay totals, and retry count bounds.

## Deterministic fixture validation

The Phase 2 suite compares a normalized structural projection. It removes timestamps, duration, and run ID while retaining statuses, reasons, attempt order, retry flags, items, and aggregate counts. Production code continues to use real clocks and durations.

The committed tests cover healthy execution, transient recovery, timeout recovery and exhaustion, HTTP 429/5xx/network/timeout backoff, linear delay, maximum clamping, final-attempt no-delay, non-retryable no-delay, deterministic delay evidence, multi-source isolation, secret redaction, normalized graph compatibility, timer/request cleanup, retry aggregates, and run-summary arithmetic.

## Bounded live observation

The live dry-run used `ewha_010` and `ewha_015`, sequential execution, one list page, at most three observed items per source, 25-second timeout, one retry, and one-second retry backoff. A first-attempt success legitimately records no applied backoff; fixture tests provide the backoff behavior evidence.

The first bounded items produced zero scholarship keyword matches. This is only a point-in-time match observation; it is not absence or full-coverage evidence. Raw local JSON/CSV/state artifacts remain in `.tmp` during evidence generation and are not committed.

## Safety and deferred work

The run used CSV source configuration and public HTTP only. Database read/write, Production access, migration, LLM calls, admin UI, API routes, cron, queue, deployment, canary, ingest/apply, and public publishing were not performed.

Exceptional source-specific adapters retain their pre-existing transport behavior. Moving each exceptional adapter behind this generic bounded strategy contract is future, evidence-driven work rather than a Phase 2 expansion.

The evidence builder inspects the committed diff from the injected `--base-sha` (defaulting to the Phase 2 base) in addition to the working tree. This prevents a clean post-commit tree from hiding scoped admin UI, migration, API/cron/queue/worker, sensitive-path, or tracked raw-live changes.
