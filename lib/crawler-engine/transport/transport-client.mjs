import {
  abortableDelay,
  selectRetryDelay,
} from "../execution-policy.mjs";
import {
  telemetryHttpFinished,
  telemetryHttpStarted,
  telemetryRetryDelay,
} from "../crawler-performance-telemetry.mjs";
import { createTransportDispatcherPool } from "./transport-dispatcher-pool.mjs";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const RETRYABLE_NETWORK_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "EAI_AGAIN",
  "ENETUNREACH",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
]);
const NON_RETRYABLE_TLS_CODES = new Set([
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "ERR_SSL_EE_KEY_TOO_SMALL",
]);

function clean(value) {
  return String(value ?? "").trim();
}

function redactSensitiveText(value) {
  return clean(value)
    .replace(
      /([?&][^&=\s]*(?:token|key|secret|password|signature|credential|authorization|auth)[^&=\s]*=)[^&\s]*/gi,
      "$1[REDACTED]",
    )
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]");
}

function sanitizeUrl(value) {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/(token|key|secret|password|signature|credential|authorization|auth)/i.test(key)) {
        url.searchParams.set(key, "[REDACTED]");
      }
    }
    return url.toString();
  } catch {
    return redactSensitiveText(value);
  }
}

function parseRetryAfter(value, nowMs = Date.now()) {
  const text = clean(value);
  if (!text) return null;
  const seconds = Number(text);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - nowMs) : null;
}

function networkCode(error) {
  return clean(error?.code ?? error?.cause?.code ?? error?.cause?.errno).toUpperCase();
}

function isRetryableError(error) {
  if (error?.name === "AbortError" || error?.code === "request_timeout") return true;
  const status = Number(error?.httpStatus);
  if (status) return status === 408 || status === 429 || status >= 500;
  const code = networkCode(error);
  if (NON_RETRYABLE_TLS_CODES.has(code)) return false;
  return RETRYABLE_NETWORK_CODES.has(code)
    || error instanceof TypeError
    || clean(error?.message).toLowerCase().includes("fetch failed");
}

async function readResponseBytesBounded(response, maxBytes) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel();
    const error = new Error("Response content length exceeds the configured byte limit.");
    error.code = "bounded_limit_exceeded";
    throw error;
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        const error = new Error("Response body exceeds the configured byte limit.");
        error.code = "bounded_limit_exceeded";
        throw error;
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

function normalizeCharset(value) {
  const normalized = clean(value).toLowerCase().replace(/^['"]|['"]$/g, "");
  if (normalized === "utf8") return "utf-8";
  if (["cp949", "ms949", "ks_c_5601-1987"].includes(normalized)) return "euc-kr";
  return normalized;
}

function detectCharset(contentType, bytes, fallbackCharset) {
  const header = clean(contentType).match(/charset\s*=\s*([^;]+)/i)?.[1];
  const probe = new TextDecoder("latin1").decode(bytes.subarray(0, 4096));
  const meta = probe.match(/<meta[^>]*charset\s*=\s*["']?\s*([a-zA-Z0-9._-]+)/i)?.[1]
    ?? probe.match(
      /<meta[^>]*content\s*=\s*["'][^"']*charset\s*=\s*([a-zA-Z0-9._-]+)/i,
    )?.[1];
  return [...new Set(
    [header, meta, fallbackCharset, "utf-8", "euc-kr"].map(normalizeCharset).filter(Boolean),
  )];
}

function decodeBytes(bytes, contentType, fallbackCharset) {
  for (const charset of detectCharset(contentType, bytes, fallbackCharset)) {
    try {
      return new TextDecoder(charset, { fatal: true }).decode(bytes);
    } catch {}
  }
  return new TextDecoder("utf-8").decode(bytes);
}

function redirectMethod(status, method) {
  if (status === 303 || ((status === 301 || status === 302) && method === "POST")) {
    return "GET";
  }
  return method;
}

function validateRequestUrl(url, policy, { redirectedFrom = null } = {}) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    const error = new Error(`Invalid transport URL: ${sanitizeUrl(url)}`);
    error.code = "transport_invalid_url";
    throw error;
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    const error = new Error(`Unsupported transport protocol: ${parsed.protocol}`);
    error.code = "transport_unsupported_protocol";
    throw error;
  }
  if (parsed.protocol === "http:" && policy.protocolMode === "strict") {
    const error = new Error(`HTTP is forbidden by strict transport policy: ${parsed.hostname}`);
    error.code = "transport_http_forbidden";
    throw error;
  }
  if (
    parsed.protocol === "http:"
    && !(policy.allowedHttpHosts ?? []).includes(parsed.hostname.toLowerCase())
  ) {
    const error = new Error(`HTTP hostname is not authorized by transport policy: ${parsed.hostname}`);
    error.code = "transport_http_host_forbidden";
    throw error;
  }
  if (redirectedFrom) {
    const previous = new URL(redirectedFrom);
    if (
      previous.hostname !== parsed.hostname
      && policy.redirect.allowCrossHost !== true
    ) {
      const error = new Error("Cross-host redirect is forbidden by transport policy.");
      error.code = "transport_cross_host_redirect_forbidden";
      throw error;
    }
    if (
      previous.protocol === "https:"
      && parsed.protocol === "http:"
      && policy.redirect.allowHttpsToHttpDowngrade !== true
    ) {
      const error = new Error("HTTPS to HTTP redirect downgrade is forbidden.");
      error.code = "transport_https_downgrade_forbidden";
      throw error;
    }
  }
  return parsed;
}

function safeHeaders(input = {}) {
  const headers = new Headers(input);
  return headers;
}

function appendBounded(items, value, maximum = 100) {
  items.push(value);
  while (items.length > maximum) items.shift();
}

function positiveNumber(value, fallback, label) {
  const number = Number(value ?? fallback);
  if (!Number.isFinite(number) || number <= 0) {
    const error = new Error(`${label} must be a positive number`);
    error.code = "transport_invalid_request_option";
    throw error;
  }
  return number;
}

function nonNegativeInteger(value, fallback, label) {
  const number = Number(value ?? fallback);
  if (!Number.isInteger(number) || number < 0) {
    const error = new Error(`${label} must be a non-negative integer`);
    error.code = "transport_invalid_request_option";
    throw error;
  }
  return number;
}

export function buildResolvedTransportPolicyEvidence(policy) {
  return {
    effective_transport_policy_id: policy.policyId,
    transport_policy_binding_id: policy.bindingId,
    transport_policy_fingerprint: policy.policyFingerprint,
    transport_policy_source: policy.policySource,
    dns_family: policy.dnsFamily,
    tls_mode: policy.tlsMode,
    protocol_mode: policy.protocolMode,
    user_agent_profile: policy.userAgentProfile,
    runtime_override_applied: policy.runtimeOverrideApplied,
    allowed_http_hosts: policy.allowedHttpHosts ?? [],
  };
}

export function createTransportClient({
  source,
  policy,
  dispatcherPool = createTransportDispatcherPool(),
  requestLimiter = null,
  fetchImpl = globalThis.fetch,
  fallbackCharset = "utf-8",
  clock = {},
} = {}) {
  if (!source || !policy || typeof fetchImpl !== "function") {
    throw new TypeError("source, policy, and fetchImpl are required");
  }
  const nowMs = clock.nowMs ?? (() => Date.now());
  const random = clock.random ?? (() => Math.random());
  const attempts = [];
  const redirects = [];
  let requestCount = 0;
  let retryAttemptCount = 0;
  let redirectHopCount = 0;
  let insecureTlsApplied = false;
  let systemCaApplied = false;
  let finalUrl = null;

  const performAttempt = async (initialUrl, options, attempt) => {
    let currentUrl = new URL(initialUrl).toString();
    let method = clean(options.method || "GET").toUpperCase();
    let body = options.body;
    const redirectChain = [];
    const headers = safeHeaders({
      "user-agent": policy.userAgent,
      accept: options.accept ?? "*/*",
      "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      ...(options.headers ?? {}),
    });
    for (let hop = 0; hop <= policy.redirect.maximumHops; hop += 1) {
      const parsed = validateRequestUrl(currentUrl, policy, {
        redirectedFrom: redirectChain.at(-1)?.to ?? null,
      });
      finalUrl = parsed.toString();
      const permit = requestLimiter
        ? await requestLimiter.acquire({
            url: parsed.toString(),
            sourceKey: source.sourceKey ?? source.sourceId,
            signal: options.signal,
          })
        : null;
      const controller = new AbortController();
      const timeoutMs = Math.min(
        policy.timeoutMs,
        positiveNumber(options.timeoutMs, policy.timeoutMs, "timeoutMs"),
      );
      const timeout = setTimeout(() => {
        const reason = new Error("Transport request timed out.");
        reason.code = "request_timeout";
        controller.abort(reason);
      }, timeoutMs);
      const signal = options.signal
        ? AbortSignal.any([controller.signal, options.signal])
        : controller.signal;
      let telemetryRequest = null;
      try {
        const {
          dispatcher,
          insecureTlsApplied: applied,
          systemCaApplied: systemCaWasApplied,
        } =
          dispatcherPool.dispatcherFor(parsed, policy);
        insecureTlsApplied ||= applied;
        systemCaApplied ||= systemCaWasApplied;
        telemetryRequest = telemetryHttpStarted({
          url: parsed.toString(),
          attempt,
          kind: options.kind,
        });
        requestCount += 1;
        const response = await fetchImpl(parsed, {
          method,
          body,
          headers: Object.fromEntries(headers.entries()),
          signal,
          dispatcher,
          redirect: "manual",
        });
        if (REDIRECT_STATUSES.has(response.status)) {
          const location = response.headers.get("location");
          await response.body?.cancel();
          if (!location) {
            const error = new Error(`HTTP ${response.status} redirect omitted Location`);
            error.httpStatus = response.status;
            throw error;
          }
          if (hop >= policy.redirect.maximumHops) {
            const error = new Error("Transport redirect hop limit exceeded.");
            error.code = "transport_redirect_limit";
            throw error;
          }
          const nextUrl = new URL(location, parsed).toString();
          validateRequestUrl(nextUrl, policy, { redirectedFrom: parsed.toString() });
          const redirectEvidence = {
            status: response.status,
            from: parsed.toString(),
            to: nextUrl,
          };
          redirectChain.push(redirectEvidence);
          appendBounded(redirects, {
            status: redirectEvidence.status,
            from: sanitizeUrl(redirectEvidence.from),
            to: sanitizeUrl(redirectEvidence.to),
          }, 25);
          redirectHopCount += 1;
          if (new URL(nextUrl).hostname !== parsed.hostname) {
            headers.delete("authorization");
            headers.delete("cookie");
            headers.delete("proxy-authorization");
          }
          method = redirectMethod(response.status, method);
          if (method === "GET") {
            body = undefined;
            headers.delete("content-length");
            headers.delete("content-type");
          }
          telemetryHttpFinished(telemetryRequest, {
            status: response.status,
            bytes: 0,
          });
          currentUrl = nextUrl;
          continue;
        }
        const responseFinalUrl = clean(response.url)
          ? validateRequestUrl(response.url, policy, {
              redirectedFrom: parsed.toString(),
            }).toString()
          : parsed.toString();
        if (response.status === 304) {
          telemetryHttpFinished(telemetryRequest, { status: 304, bytes: 0 });
          finalUrl = responseFinalUrl;
          return {
            bytes: Buffer.alloc(0),
            httpStatus: 304,
            finalUrl,
            contentType: response.headers.get("content-type") ?? "",
            etag: response.headers.get("etag"),
            lastModified: response.headers.get("last-modified"),
            contentLength: 0,
            notModified: true,
            redirectChain: redirectChain.map((entry) => ({
              status: entry.status,
              from: sanitizeUrl(entry.from),
              to: sanitizeUrl(entry.to),
            })),
          };
        }
        if (!response.ok) {
          const error = new Error(`HTTP ${response.status}`);
          error.httpStatus = response.status;
          error.finalUrl = parsed.toString();
          error.retryAfter = response.headers.get("retry-after");
          await response.body?.cancel();
          throw error;
        }
        const maxBytes = Math.min(
          policy.maximumResponseBytes,
          positiveNumber(
            options.maxBytes,
            policy.maximumResponseBytes,
            "maxBytes",
          ),
        );
        const bytes = options.readBody === false
          ? (await response.body?.cancel(), Buffer.alloc(0))
          : await readResponseBytesBounded(response, maxBytes);
        telemetryHttpFinished(telemetryRequest, {
          status: response.status,
          bytes: bytes.length,
        });
        finalUrl = responseFinalUrl;
        return {
          bytes,
          httpStatus: response.status,
          finalUrl,
          contentType: response.headers.get("content-type") ?? "",
          etag: response.headers.get("etag"),
          lastModified: response.headers.get("last-modified"),
          contentLength: Number(response.headers.get("content-length")) || null,
          notModified: false,
          redirectChain: redirectChain.map((entry) => ({
            status: entry.status,
            from: sanitizeUrl(entry.from),
            to: sanitizeUrl(entry.to),
          })),
        };
      } catch (error) {
        if (
          controller.signal.aborted
          && !options.signal?.aborted
          && error?.code !== "request_timeout"
        ) {
          const timeoutError = new Error("Transport request timed out.");
          timeoutError.name = "AbortError";
          timeoutError.code = "request_timeout";
          timeoutError.cause = error;
          if (telemetryRequest) {
            telemetryHttpFinished(telemetryRequest, {
              error: timeoutError,
              timeout: true,
            });
          }
          throw timeoutError;
        }
        if (telemetryRequest) {
          telemetryHttpFinished(telemetryRequest, {
            status: error?.httpStatus,
            error,
            timeout: error?.code === "request_timeout",
          });
        }
        throw error;
      } finally {
        clearTimeout(timeout);
        permit?.release();
      }
    }
    throw new Error("Unreachable redirect state");
  };

  const request = async (url, options = {}) => {
    const requestAttempts = [];
    const retryCount = Math.min(
      policy.retry.count,
      nonNegativeInteger(options.retryCount, policy.retry.count, "retryCount"),
    );
    let lastError = null;
    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      const startedAt = nowMs();
      try {
        const response = await performAttempt(url, options, attempt);
        const attemptEvidence = {
          attempt,
          status: response.httpStatus,
          retryable: false,
          duration_ms: Math.max(0, nowMs() - startedAt),
          retry_delay_ms: 0,
          retry_delay_source: null,
        };
        appendBounded(attempts, attemptEvidence);
        requestAttempts.push(attemptEvidence);
        return {
          ...response,
          requestAttemptCount: attempt + 1,
          requestRetryCount: attempt,
        };
      } catch (error) {
        lastError = error;
        const retryable = isRetryableError(error);
        const hasNext = retryable && attempt < retryCount && !options.signal?.aborted;
        const retryAfterMs = parseRetryAfter(error?.retryAfter, nowMs());
        const delay = hasNext
          ? selectRetryDelay({
              retryAfter: retryAfterMs === null ? null : String(retryAfterMs / 1000),
              nowMs: nowMs(),
              baseDelayMs: policy.retry.baseDelayMs,
              maximumDelayMs: policy.retry.maximumDelayMs,
              retryOrdinal: attempt,
              jitterRatio: policy.retry.jitterRatio,
              random,
            })
          : { retry_delay_ms: 0, retry_delay_source: null };
        const attemptEvidence = {
          attempt,
          status: Number(error?.httpStatus) || null,
          error_code: networkCode(error) || clean(error?.code) || "request_failed",
          retryable,
          duration_ms: Math.max(0, nowMs() - startedAt),
          retry_delay_ms: delay.retry_delay_ms,
          retry_delay_source: delay.retry_delay_source,
        };
        appendBounded(attempts, attemptEvidence);
        requestAttempts.push(attemptEvidence);
        if (!hasNext) break;
        retryAttemptCount += 1;
        telemetryRetryDelay(delay.retry_delay_ms);
        await abortableDelay(delay.retry_delay_ms, { signal: options.signal });
      }
    }
    lastError.requestAttemptHistory = requestAttempts.slice(-25);
    lastError.requestAttemptCount = requestAttempts.length;
    throw lastError;
  };

  return Object.freeze({
    source,
    policy,
    request,
    async fetchHtml(url, options = {}) {
      const response = await request(url, {
        ...options,
        accept: options.accept
          ?? "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      });
      return {
        ...response,
        html: decodeBytes(response.bytes, response.contentType, fallbackCharset),
      };
    },
    async fetchText(url, options = {}) {
      const response = await request(url, options);
      return {
        ...response,
        text: decodeBytes(response.bytes, response.contentType, fallbackCharset),
      };
    },
    async fetchJson(url, options = {}) {
      const response = await request(url, {
        ...options,
        accept: options.accept ?? "application/json",
      });
      return {
        ...response,
        json: JSON.parse(decodeBytes(response.bytes, response.contentType, "utf-8")),
      };
    },
    evidence() {
      return {
        ...buildResolvedTransportPolicyEvidence(policy),
        request_attempt_count: requestCount,
        request_retry_count: retryAttemptCount,
        redirect_hop_count: redirectHopCount,
        redirect_chain: [...redirects],
        final_url: finalUrl ? sanitizeUrl(finalUrl) : null,
        insecure_tls_applied: insecureTlsApplied,
        system_ca_applied: systemCaApplied,
        request_attempt_history: attempts.slice(-25),
      };
    },
  });
}

export { isRetryableError as isRetryableTransportError, sanitizeUrl as sanitizeTransportUrl };
