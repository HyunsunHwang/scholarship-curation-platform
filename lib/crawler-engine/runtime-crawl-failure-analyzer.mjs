export const CRAWLER_RESULT_STATUSES = Object.freeze([
  "success",
  "empty_observed",
  "partial",
  "timeout",
  "network_error",
  "http_error",
  "parser_error",
  "configuration_error",
  "source_resolution_error",
  "unsupported",
]);

const SUCCESS_STATUSES = new Set(["success"]);
const ZERO_MATCH_STATUSES = new Set(["empty_observed"]);
const PARTIAL_STATUSES = new Set(["partial"]);
const BLOCKED_STATUSES = new Set([
  "configuration_error",
  "source_resolution_error",
  "unsupported",
]);

function clean(value) {
  return String(value ?? "").trim();
}

export function sanitizeCrawlerError(value) {
  let message = clean(value?.message ?? value);
  message = message
    .replace(/(authorization|cookie)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/(password|passwd|secret|token|api[_-]?key|anon[_-]?key|service[_-]?role[_-]?key)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/bearer\s+[A-Za-z0-9._~+/-]+/gi, "Bearer [REDACTED]")
    .replace(/(postgres(?:ql)?:\/\/)[^\s/@]+(?::[^\s/@]*)?@/gi, "$1[REDACTED]@")
    .replace(/eyJ[A-Za-z0-9_-]{20,}(?:\.[A-Za-z0-9_-]+){0,2}/g, "[REDACTED_JWT]");
  return message.slice(0, 300);
}

export function classifyCrawlerFailure(error, fallback = "network_error", { isCancellation } = {}) {
  if (error?.crawlerStatus && CRAWLER_RESULT_STATUSES.includes(error.crawlerStatus)) {
    return error.crawlerStatus;
  }
  if (isCancellation?.(error)) return "partial";
  if (error?.name === "AbortError" || error?.code === "attempt_timeout") return "timeout";
  if (Number.isFinite(Number(error?.httpStatus))) return "http_error";
  return fallback;
}

export function isSuccessfulCrawlerResult(result) {
  return SUCCESS_STATUSES.has(result?.result_status);
}

export function isZeroMatchCrawlerResult(result) {
  return ZERO_MATCH_STATUSES.has(result?.result_status);
}

export function isPartialCrawlerResult(result) {
  return PARTIAL_STATUSES.has(result?.result_status);
}

function reasonCode(result) {
  return clean(result?.final_reason_code ?? result?.error_code ?? result?.result_status) || "unknown_runtime_failure";
}

export function analyzeRuntimeCrawlFailures(sourceResults) {
  const results = Array.isArray(sourceResults) ? sourceResults : [];
  const partial = results.filter(isPartialCrawlerResult);
  const failed = results.filter((result) =>
    !isSuccessfulCrawlerResult(result) &&
    !isZeroMatchCrawlerResult(result) &&
    !isPartialCrawlerResult(result));
  const failureReasonCounts = new Map();

  for (const result of [...partial, ...failed]) {
    const code = reasonCode(result);
    failureReasonCounts.set(code, (failureReasonCounts.get(code) ?? 0) + 1);
  }

  const blocked = failed.filter((result) => BLOCKED_STATUSES.has(result?.result_status));
  return {
    failed_source_count: failed.length,
    timeout_source_count: results.filter((result) => result?.result_status === "timeout").length,
    partial_source_count: partial.length,
    blocked_source_count: blocked.length,
    partial_or_blocked_source_count: partial.length + blocked.length,
    runtime_failure_reason_counts: [...failureReasonCounts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([reason_code, source_count]) => ({ reason_code, source_count })),
  };
}
