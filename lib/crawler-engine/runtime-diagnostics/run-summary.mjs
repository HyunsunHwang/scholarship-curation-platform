import {
  analyzeRuntimeCrawlFailures,
  isSuccessfulCrawlerResult,
  isZeroMatchCrawlerResult,
} from "./failure-analyzer.mjs";

function clean(value) {
  return String(value ?? "").trim();
}

function sourceSummary(result) {
  return {
    source_key: result.source_key,
    source_id: result.source_id,
    strategy: result.strategy,
    final_status: result.result_status,
    item_count: Number(result.observed_count) || 0,
    attempt_count: Number(result.total_attempt_count) || 0,
    duration_ms: Number(result.duration_ms) || 0,
    reason_code: result.final_reason_code ?? result.error_code ?? result.result_status,
    timeout: result.result_status === "timeout",
    retried: Boolean(result.retried),
    recovered_after_retry: Boolean(result.recovered_after_retry),
    retry_exhausted: Boolean(result.retry_exhausted),
    retry_backoff_ms: Number(result.retry_backoff_ms) || 0,
    maximum_retry_delay_ms: Number(result.maximum_retry_delay_ms) || 0,
    retry_jitter_ratio: Number(result.retry_jitter_ratio) || 0,
    total_retry_delay_ms: Number(result.total_retry_delay_ms) || 0,
    maximum_observed_host_concurrency: Number(result.rate_limit_evidence?.maximum_observed_host_concurrency) || 0,
    rate_limit_wait_ms: (result.rate_limit_evidence?.events ?? []).reduce(
      (sum, event) => sum + (Number(event.wait_duration_ms) || 0),
      0,
    ),
  };
}

export function buildCrawlerRunSummary(sourceResults, run = {}) {
  const results = Array.isArray(sourceResults) ? sourceResults : [];
  const successful = results.filter(isSuccessfulCrawlerResult);
  const zeroMatch = results.filter(isZeroMatchCrawlerResult);
  const failureAnalysis = analyzeRuntimeCrawlFailures(results);
  const startedMs = Number(run.started_ms);
  const finishedMs = Number(run.finished_ms);
  const overallStatus = results.length > 0 && failureAnalysis.failed_source_count === results.length
    ? "failed"
    : failureAnalysis.failed_source_count > 0 || failureAnalysis.partial_source_count > 0
      ? "partial"
      : zeroMatch.length > 0
        ? "completed_with_zero_match"
        : "succeeded";
  return {
    run_id: clean(run.run_id ?? run.idempotency_key) || "crawler-run",
    runner_version: clean(run.runner_version) || "engine-phase-2-common-runner-v1",
    started_at: run.started_at ?? null,
    finished_at: run.finished_at ?? null,
    duration_ms: Number.isFinite(startedMs) && Number.isFinite(finishedMs)
      ? Math.max(0, finishedMs - startedMs)
      : results.reduce((sum, result) => sum + (Number(result.duration_ms) || 0), 0),
    requested_source_count: results.length,
    completed_source_count: results.length,
    successful_source_count: successful.length,
    ...failureAnalysis,
    zero_match_source_count: zeroMatch.length,
    total_attempt_count: results.reduce((sum, result) => sum + (Number(result.total_attempt_count) || 0), 0),
    retried_source_count: results.filter((result) => result.retried).length,
    recovered_after_retry_count: results.filter((result) => result.recovered_after_retry).length,
    exhausted_retry_count: results.filter((result) => result.retry_exhausted).length,
    total_retry_delay_ms: results.reduce((sum, result) => sum + (Number(result.total_retry_delay_ms) || 0), 0),
    total_observed_item_count: results.reduce((sum, result) => sum + (Number(result.observed_count) || 0), 0),
    overall_run_status: overallStatus,
    source_results: results.map(sourceSummary),
  };
}

export function validateCrawlerRunSummary(summary) {
  const errors = [];
  const sources = Array.isArray(summary?.source_results) ? summary.source_results : [];
  const categoryTotal =
    Number(summary?.successful_source_count) +
    Number(summary?.failed_source_count) +
    Number(summary?.zero_match_source_count) +
    Number(summary?.partial_source_count);
  if (Number(summary?.requested_source_count) !== sources.length) errors.push("requested_source_count_mismatch");
  if (Number(summary?.completed_source_count) !== sources.length) errors.push("completed_source_count_mismatch");
  if (categoryTotal !== Number(summary?.completed_source_count)) errors.push("source_status_arithmetic_mismatch");
  if (Number(summary?.retried_source_count) > sources.length) errors.push("retried_source_count_out_of_range");
  if (Number(summary?.recovered_after_retry_count) > Number(summary?.retried_source_count)) errors.push("recovered_count_out_of_range");
  if (Number(summary?.exhausted_retry_count) > Number(summary?.retried_source_count)) errors.push("exhausted_count_out_of_range");
  const attempts = sources.reduce((sum, source) => sum + Number(source.attempt_count || 0), 0);
  if (Number(summary?.total_attempt_count) !== attempts) errors.push("total_attempt_count_mismatch");
  const items = sources.reduce((sum, source) => sum + Number(source.item_count || 0), 0);
  if (Number(summary?.total_observed_item_count) !== items) errors.push("total_observed_item_count_mismatch");
  const retryDelay = sources.reduce((sum, source) => sum + Number(source.total_retry_delay_ms || 0), 0);
  if (Number(summary?.total_retry_delay_ms) !== retryDelay) errors.push("total_retry_delay_ms_mismatch");
  return { valid: errors.length === 0, errors };
}

export function deterministicCrawlerProjection(result) {
  return {
    run: {
      execution_mode: result?.run?.execution_mode,
      runner_version: result?.run?.runner_version,
      status: result?.run?.status,
      metadata: result?.run?.metadata ?? {},
    },
    source_results: (result?.source_results ?? []).map((source) => ({
      ...source,
      duration_ms: undefined,
      started_at: undefined,
      finished_at: undefined,
      rate_limit_evidence: source.rate_limit_evidence
        ? {
            ...source.rate_limit_evidence,
            events: source.rate_limit_evidence.events.map((event) => ({
              ...event,
              granted_at: undefined,
              observed_request_start_ms: undefined,
            })),
          }
        : null,
      attempt_history: (source.attempt_history ?? []).map((attempt) => ({
        ...attempt,
        duration_ms: undefined,
        started_at: undefined,
        finished_at: undefined,
      })),
    })),
    run_summary: {
      ...result?.run_summary,
      run_id: undefined,
      started_at: undefined,
      finished_at: undefined,
      duration_ms: undefined,
      source_results: (result?.run_summary?.source_results ?? []).map((source) => ({
        ...source,
        duration_ms: undefined,
      })),
    },
  };
}
