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
const TRANSPORT_CODE_MAX_LENGTH = 80;
const TLS_CERTIFICATE_CODES = new Set([
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "CERT_UNTRUSTED",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "ERR_SSL_EE_KEY_TOO_SMALL",
  "ERR_SSL_CA_MD_TOO_WEAK",
]);
const DNS_CODES = new Set(["ENOTFOUND", "EAI_AGAIN", "EAI_FAIL"]);
const CONNECTION_TIMEOUT_CODES = new Set([
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);
const CONNECTION_RESET_CODES = new Set(["ECONNRESET"]);
const SOCKET_CODES = new Set(["UND_ERR_SOCKET"]);
const CONNECTION_REFUSED_CODES = new Set(["ECONNREFUSED"]);
const NETWORK_UNREACHABLE_CODES = new Set(["ENETUNREACH", "EHOSTUNREACH"]);
const NON_RETRYABLE_TRANSPORT_CODES = new Set([...TLS_CERTIFICATE_CODES, "ENOTFOUND"]);
const RETRYABLE_TRANSPORT_CODES = new Set([
  ...CONNECTION_TIMEOUT_CODES,
  ...CONNECTION_RESET_CODES,
  ...SOCKET_CODES,
  ...CONNECTION_REFUSED_CODES,
  ...NETWORK_UNREACHABLE_CODES,
  "EAI_AGAIN",
]);

function clean(value) {
  return String(value ?? "").trim();
}

export function normalizeTransportErrorCode(value) {
  const code = clean(value).toUpperCase();
  if (!code || code.length > TRANSPORT_CODE_MAX_LENGTH) return null;
  return /^[A-Z0-9_-]+$/.test(code) ? code : null;
}

export function classifyTransportErrorCode(value) {
  const code = normalizeTransportErrorCode(value);
  if (!code) return "unknown";
  if (TLS_CERTIFICATE_CODES.has(code)) return "tls_certificate";
  if (DNS_CODES.has(code)) return "dns";
  if (CONNECTION_TIMEOUT_CODES.has(code)) return "connection_timeout";
  if (CONNECTION_RESET_CODES.has(code)) return "connection_reset";
  if (SOCKET_CODES.has(code)) return "socket";
  if (CONNECTION_REFUSED_CODES.has(code)) return "connection_refused";
  if (NETWORK_UNREACHABLE_CODES.has(code)) return "network_unreachable";
  return "unknown";
}

export function isRetryableTransportErrorCode(value) {
  const code = normalizeTransportErrorCode(value);
  if (!code) return null;
  if (NON_RETRYABLE_TRANSPORT_CODES.has(code)) return false;
  if (RETRYABLE_TRANSPORT_CODES.has(code)) return true;
  return null;
}

export function extractSafeCrawlerErrorEvidence(error) {
  let current = error;
  for (let depth = 0; current && depth < 4; depth += 1) {
    const code = normalizeTransportErrorCode(
      current.code ?? current.cause?.code ?? current.cause?.errno,
    );
    if (code) {
      return {
        transport_error_code: code,
        transport_error_category: classifyTransportErrorCode(code),
        transport_error_retryable: isRetryableTransportErrorCode(code),
      };
    }
    current = current.cause;
  }
  return {
    transport_error_code: null,
    transport_error_category: "unknown",
    transport_error_retryable: null,
  };
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
  const transportCodeCounts = new Map();
  const transportCategoryCounts = new Map();

  for (const result of [...partial, ...failed]) {
    const code = reasonCode(result);
    failureReasonCounts.set(code, (failureReasonCounts.get(code) ?? 0) + 1);
    const transportCode = normalizeTransportErrorCode(result?.transport_error_code);
    if (!transportCode) continue;
    const category = clean(result?.transport_error_category) || "unknown";
    const countKey = `${category}\u0000${transportCode}`;
    transportCategoryCounts.set(category, (transportCategoryCounts.get(category) ?? 0) + 1);
    transportCodeCounts.set(countKey, (transportCodeCounts.get(countKey) ?? 0) + 1);
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
    runtime_transport_error_category_counts: [...transportCategoryCounts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([category, source_count]) => ({ category, source_count })),
    runtime_transport_error_counts: [...transportCodeCounts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, source_count]) => {
        const [category, code] = key.split("\u0000");
        return { category, code, source_count };
      }),
  };
}
