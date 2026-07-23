export const DEFAULT_SOURCE_CONCURRENCY = 1;
export const DEFAULT_DETAIL_CONCURRENCY = 1;
export const DEFAULT_HOST_CONCURRENCY = 2;
export const MAX_LOCAL_CONCURRENCY = 16;

function finiteInteger(value, fallback, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isFinite(Number(value))) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(Number(value))));
}

export function normalizeConcurrency(value, fallback = 1) {
  return finiteInteger(value, fallback, 1, MAX_LOCAL_CONCURRENCY);
}

export function crawlerCancellationError(reason = "crawler_cancelled") {
  const error = new Error("Crawler execution was cancelled.");
  error.name = "AbortError";
  error.code = String(reason || "crawler_cancelled");
  error.crawlerStatus = "cancelled";
  return error;
}

export function isCrawlerCancellation(value) {
  return value?.crawlerStatus === "cancelled" ||
    value?.code === "crawler_cancelled" ||
    (value?.name === "AbortError" && value?.code !== "attempt_timeout");
}

export async function abortableDelay(delayMs, { signal, clock = {} } = {}) {
  const boundedDelay = Math.max(0, Number(delayMs) || 0);
  if (signal?.aborted) throw crawlerCancellationError();
  if (boundedDelay === 0) return;
  if (typeof clock.sleep === "function") {
    await clock.sleep(boundedDelay, signal);
    if (signal?.aborted) throw crawlerCancellationError();
    return;
  }
  const schedule = clock.setTimeout ?? setTimeout;
  const cancel = clock.clearTimeout ?? clearTimeout;
  await new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;
    let onAbort = () => {};
    const finish = (operation) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onAbort);
      operation();
    };
    onAbort = () => {
      cancel(timer);
      finish(() => reject(crawlerCancellationError()));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    timer = schedule(() => finish(resolve), boundedDelay);
  });
}

export function parseRetryAfter(value, nowMs = Date.now()) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (/^[+-]/.test(raw)) return null;
  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const seconds = Number(raw);
    return Number.isFinite(seconds) && seconds >= 0 ? Math.floor(seconds * 1_000) : null;
  }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor(parsed - Number(nowMs || 0)));
}

export function computeExponentialBackoff({
  baseDelayMs,
  maximumDelayMs,
  retryOrdinal,
  jitterRatio = 0,
  random = Math.random,
}) {
  const base = Math.max(0, Number(baseDelayMs) || 0);
  const maximum = Math.max(0, Number(maximumDelayMs) || 0);
  const ordinal = Math.max(0, Math.floor(Number(retryOrdinal) || 0));
  const ratio = Math.min(1, Math.max(0, Number(jitterRatio) || 0));
  const randomValue = Math.min(1, Math.max(0, Number(random()) || 0));
  const exponential = Math.min(maximum, base * (2 ** ordinal));
  const jittered = exponential * (1 + ((randomValue * 2) - 1) * ratio);
  return Math.min(maximum, Math.max(0, Math.round(jittered)));
}

export function selectRetryDelay({
  retryAfter,
  nowMs,
  baseDelayMs,
  maximumDelayMs,
  retryOrdinal,
  jitterRatio,
  random,
}) {
  const retryAfterMs = parseRetryAfter(retryAfter, nowMs);
  const backoffMs = computeExponentialBackoff({
    baseDelayMs,
    maximumDelayMs,
    retryOrdinal,
    jitterRatio,
    random,
  });
  const selected = Math.min(
    Math.max(0, Number(maximumDelayMs) || 0),
    Math.max(retryAfterMs ?? 0, backoffMs),
  );
  return {
    retry_delay_ms: selected,
    retry_delay_source: retryAfterMs !== null && retryAfterMs >= backoffMs
      ? "retry_after"
      : "exponential_backoff",
    retry_after_ms: retryAfterMs,
    exponential_backoff_ms: backoffMs,
  };
}

export async function boundedMap(values, concurrency, worker, {
  signal,
  settleTimeoutMs = null,
  clock = {},
} = {}) {
  const items = Array.from(values ?? []);
  const limit = normalizeConcurrency(concurrency);
  const results = new Array(items.length);
  let nextIndex = 0;
  let active = 0;
  const activeIndexes = new Set();
  return new Promise((resolve) => {
    let settled = false;
    let settleTimer = null;
    const schedule = clock.setTimeout ?? setTimeout;
    const cancel = clock.clearTimeout ?? clearTimeout;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (settleTimer !== null) cancel(settleTimer);
      signal?.removeEventListener("abort", onAbort);
      resolve(results.filter((value) => value !== undefined));
    };
    const onAbort = () => {
      if (active === 0) {
        finish();
        return;
      }
      if (Number.isFinite(Number(settleTimeoutMs))) {
        settleTimer = schedule(() => {
          for (const index of activeIndexes) {
            results[index] ??= { __bounded_map_abandoned: true, index };
          }
          finish();
        }, Math.max(0, Number(settleTimeoutMs)));
      }
    };
    const launch = () => {
      if (settled) return;
      if ((signal?.aborted || nextIndex >= items.length) && active === 0) {
        finish();
        return;
      }
      while (!signal?.aborted && active < limit && nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        active += 1;
        activeIndexes.add(index);
        Promise.resolve(worker(items[index], index, signal))
          .then((value) => { results[index] = value; })
          .catch((error) => { results[index] = { __bounded_map_error: error, index }; })
          .finally(() => {
            active -= 1;
            activeIndexes.delete(index);
            launch();
          });
      }
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
    launch();
  });
}

function hostKeyFromUrl(value) {
  try { return new URL(String(value)).host.toLowerCase() || "invalid-host"; } catch { return "invalid-host"; }
}

export function createCrawlerRateLimiter({
  minimumSourceIntervalMs = 0,
  minimumHostIntervalMs = 0,
  maximumHostConcurrency = DEFAULT_HOST_CONCURRENCY,
  clock = {},
} = {}) {
  const sourceInterval = finiteInteger(minimumSourceIntervalMs, 0);
  const hostInterval = finiteInteger(minimumHostIntervalMs, 0);
  const hostLimit = normalizeConcurrency(maximumHostConcurrency, DEFAULT_HOST_CONCURRENCY);
  const nowMs = clock.nowMs ?? (() => Date.now());
  const sources = new Map();
  const hosts = new Map();
  const events = [];
  let maximumObservedHostConcurrency = 0;

  const sourceState = (key) => {
    if (!sources.has(key)) sources.set(key, { next_start_ms: 0 });
    return sources.get(key);
  };
  const hostState = (key) => {
    if (!hosts.has(key)) hosts.set(key, { next_start_ms: 0, reserved: 0, running: 0, queue: [] });
    return hosts.get(key);
  };

  const pump = (hostKey) => {
    const host = hostState(hostKey);
    while (host.reserved < hostLimit && host.queue.length > 0) {
      const entry = host.queue.shift();
      if (entry.signal?.aborted) {
        entry.cleanup();
        entry.reject(crawlerCancellationError());
        continue;
      }
      host.reserved += 1;
      const source = sourceState(entry.sourceKey);
      const queuedAt = nowMs();
      const grantedAt = Math.max(queuedAt, source.next_start_ms, host.next_start_ms);
      source.next_start_ms = grantedAt + sourceInterval;
      host.next_start_ms = grantedAt + hostInterval;
      const event = {
        source_key: entry.sourceKey,
        host_key: hostKey,
        queued_count: host.queue.length,
        wait_duration_ms: Math.max(0, grantedAt - queuedAt),
        granted_at: null,
        observed_request_start_ms: null,
        cancelled: false,
      };
      events.push(event);
      Promise.resolve(abortableDelay(event.wait_duration_ms, { signal: entry.signal, clock }))
        .then(() => {
          entry.cleanup();
          if (entry.signal?.aborted) throw crawlerCancellationError();
          host.running += 1;
          maximumObservedHostConcurrency = Math.max(maximumObservedHostConcurrency, host.running);
          event.granted_at = typeof clock.nowIso === "function"
            ? clock.nowIso()
            : new Date(grantedAt).toISOString();
          event.observed_request_start_ms = grantedAt;
          let released = false;
          entry.resolve({
            source_key: entry.sourceKey,
            host_key: hostKey,
            wait_duration_ms: event.wait_duration_ms,
            release() {
              if (released) return;
              released = true;
              host.running -= 1;
              host.reserved -= 1;
              pump(hostKey);
            },
          });
        })
        .catch((error) => {
          entry.cleanup();
          event.cancelled = true;
          host.reserved -= 1;
          entry.reject(error);
          pump(hostKey);
        });
    }
  };

  return {
    async acquire({ url, sourceKey = "unknown-source", signal } = {}) {
      const normalizedSourceKey = String(sourceKey || "unknown-source");
      const hostKey = hostKeyFromUrl(url);
      const host = hostState(hostKey);
      return new Promise((resolve, reject) => {
        const entry = { sourceKey: normalizedSourceKey, signal, resolve, reject, cleanup: () => {} };
        const onAbort = () => {
          const index = host.queue.indexOf(entry);
          if (index < 0) return;
          host.queue.splice(index, 1);
          entry.cleanup();
          events.push({
            source_key: normalizedSourceKey,
            host_key: hostKey,
            queued_count: host.queue.length,
            wait_duration_ms: 0,
            granted_at: null,
            observed_request_start_ms: null,
            cancelled: true,
          });
          reject(crawlerCancellationError());
        };
        entry.cleanup = () => signal?.removeEventListener("abort", onAbort);
        signal?.addEventListener("abort", onAbort, { once: true });
        host.queue.push(entry);
        pump(hostKey);
      });
    },
    snapshot({ sourceKey } = {}) {
      const selected = sourceKey
        ? events.filter((event) => event.source_key === sourceKey)
        : events;
      return {
        minimum_source_interval_ms: sourceInterval,
        minimum_host_interval_ms: hostInterval,
        maximum_host_concurrency: hostLimit,
        maximum_observed_host_concurrency: maximumObservedHostConcurrency,
        request_count: selected.filter((event) => event.granted_at !== null).length,
        cancelled_wait_count: selected.filter((event) => event.cancelled).length,
        events: selected.map((event) => ({ ...event })),
      };
    },
  };
}
