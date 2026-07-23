import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { monitorEventLoopDelay, PerformanceObserver, performance } from "node:perf_hooks";

export const PERFORMANCE_TELEMETRY_SCHEMA_VERSION = "crawler-performance-telemetry-v1";

export const PERFORMANCE_TIMESERIES_COLUMNS = [
  "timestamp_utc", "timestamp_kst", "elapsed_ms", "sample_interval_ms",
  "cpu_percent_single_core_scale", "cpu_percent_machine", "cpu_cores_used",
  "load_average_1m", "load_average_5m", "load_average_15m",
  "process_rss_bytes", "process_tree_rss_bytes", "process_vms_bytes", "peak_rss_bytes",
  "node_heap_used_bytes", "node_heap_total_bytes", "node_external_bytes", "node_array_buffers_bytes",
  "process_read_bytes", "process_write_bytes", "process_cancelled_write_bytes",
  "runner_network_rx_bytes", "runner_network_tx_bytes", "open_fd_count", "thread_count",
  "disk_available_bytes", "disk_used_percent", "minor_page_faults", "major_page_faults",
  "voluntary_context_switches", "involuntary_context_switches", "event_loop_utilization",
  "event_loop_delay_mean_ms", "event_loop_delay_p50_ms", "event_loop_delay_p95_ms",
  "event_loop_delay_p99_ms", "event_loop_delay_max_ms", "gc_count", "gc_total_duration_ms",
  "gc_max_duration_ms", "gc_duration_p95_ms", "active_source_count", "queued_source_count",
  "active_detail_count", "queued_detail_count", "active_http_request_count", "active_host_count",
  "maximum_requests_for_single_host", "completed_source_count", "completed_detail_count",
  "completed_request_count",
];

const state = {
  session: null,
  activeSources: 0, queuedSources: 0, completedSources: 0,
  activeDetails: 0, queuedDetails: 0, completedDetails: 0,
  activeRequests: 0, completedRequests: 0,
  hosts: new Map(), sourceDurations: [], detailDurations: [], requestDurations: [], responseBytes: [],
  requestSuccess: 0, requestFailure: 0, requestTimeout: 0, http403: 0, http429: 0, http5xx: 0,
  retryAttempts: 0, retryDelayMs: 0,
};

function resetObservationState() {
  Object.assign(state, {
    activeSources: 0, queuedSources: 0, completedSources: 0,
    activeDetails: 0, queuedDetails: 0, completedDetails: 0,
    activeRequests: 0, completedRequests: 0,
    hosts: new Map(), sourceDurations: [], detailDurations: [], requestDurations: [], responseBytes: [],
    requestSuccess: 0, requestFailure: 0, requestTimeout: 0, http403: 0, http429: 0, http5xx: 0,
    retryAttempts: 0, retryDelayMs: 0,
  });
}

const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const integer = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback;
const bool = (value) => value === true || String(value).toLowerCase() === "true";
const round = (value, digits = 3) => Number.isFinite(value) ? Number(value.toFixed(digits)) : null;

export function percentile(values, percentileValue) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const index = Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1);
  return sorted[index];
}

export function calculateCpuDelta(previousUsage, currentUsage, elapsedMs, logicalCpuCount = 1) {
  const cpuMicros = Math.max(0,
    Number(currentUsage?.user ?? 0) + Number(currentUsage?.system ?? 0)
      - Number(previousUsage?.user ?? 0) - Number(previousUsage?.system ?? 0));
  const single = elapsedMs > 0 ? (cpuMicros / (elapsedMs * 1000)) * 100 : 0;
  return {
    cpu_percent_single_core_scale: round(single),
    cpu_percent_machine: round(single / Math.max(1, logicalCpuCount)),
    cpu_cores_used: round(single / 100),
  };
}

export function cumulativeDelta(first, last) {
  if (!Number.isFinite(first) || !Number.isFinite(last)) return null;
  return Math.max(0, last - first);
}

export function sanitizeTelemetryText(value) {
  return String(value ?? "")
    .replace(/([?&](?:api[_-]?key|token|access[_-]?token|password|secret)=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/\b((?:api[_-]?key|token|access[_-]?token|password|secret)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED_JWT]")
    .replace(/([a-z][a-z0-9+.-]*:\/\/)([^\s/@:]+):([^\s/@]+)@/gi, "$1[REDACTED]:[REDACTED]@");
}

export function sanitizeTelemetryUrl(value) {
  try {
    const url = new URL(String(value));
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return sanitizeTelemetryText(value).split("?")[0];
  }
}

export function kstDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date).reduce((out, part) => ({ ...out, [part.type]: part.value }), {});
  return {
    date: `${parts.year}${parts.month}${parts.day}`,
    timestamp: `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+09:00`,
  };
}

function csvValue(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function parseProcKeyValues(file) {
  try {
    return fs.readFileSync(file, "utf8").split(/\r?\n/).reduce((out, line) => {
      const match = line.match(/^([^:]+):\s*(\d+)/);
      if (match) out[match[1]] = Number(match[2]);
      return out;
    }, {});
  } catch { return {}; }
}

function readProcessTreeMetrics(rootPid) {
  try {
    const processRows = [];
    for (const name of fs.readdirSync("/proc")) {
      if (!/^\d+$/.test(name)) continue;
      try {
        const stat = fs.readFileSync(`/proc/${name}/stat`, "utf8");
        const closing = stat.lastIndexOf(")");
        const fields = stat.slice(closing + 2).split(/\s+/);
        processRows.push({ pid: Number(name), ppid: Number(fields[1]), minor: Number(fields[7]), major: Number(fields[9]) });
      } catch {}
    }
    const included = new Set([Number(rootPid)]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const row of processRows) if (!included.has(row.pid) && included.has(row.ppid)) { included.add(row.pid); changed = true; }
    }
    return processRows.filter((row) => included.has(row.pid)).reduce((out, row) => {
      const status = parseProcKeyValues(`/proc/${row.pid}/status`);
      out.rss += (status.VmRSS ?? 0) * 1024; out.minor += row.minor || 0; out.major += row.major || 0;
      return out;
    }, { rss: 0, minor: 0, major: 0 });
  } catch { return null; }
}

function readProc() {
  const status = parseProcKeyValues(`/proc/${process.pid}/status`);
  const io = parseProcKeyValues(`/proc/${process.pid}/io`);
  const tree = readProcessTreeMetrics(process.pid);
  let openFd = null;
  try { openFd = fs.readdirSync(`/proc/${process.pid}/fd`).length; } catch {}
  return {
    process_vms_bytes: finite(status.VmSize) === null ? null : status.VmSize * 1024,
    process_tree_rss_bytes: tree?.rss || (finite(status.VmRSS) === null ? process.memoryUsage().rss : status.VmRSS * 1024),
    process_read_bytes: finite(io.read_bytes), process_write_bytes: finite(io.write_bytes),
    process_cancelled_write_bytes: finite(io.cancelled_write_bytes), open_fd_count: openFd,
    thread_count: finite(status.Threads), minor_page_faults: tree?.minor ?? null, major_page_faults: tree?.major ?? null,
    voluntary_context_switches: finite(status.voluntary_ctxt_switches),
    involuntary_context_switches: finite(status.nonvoluntary_ctxt_switches),
  };
}

function readNetwork() {
  try {
    const rows = fs.readFileSync("/proc/net/dev", "utf8").split(/\r?\n/).slice(2);
    return rows.reduce((out, row) => {
      const [name, data] = row.trim().split(":");
      if (!data || name === "lo") return out;
      const fields = data.trim().split(/\s+/).map(Number);
      out.rx += fields[0] || 0; out.tx += fields[8] || 0;
      return out;
    }, { rx: 0, tx: 0 });
  } catch { return { rx: null, tx: null }; }
}

function readDisk(directory) {
  try {
    const stats = fs.statfsSync(directory);
    const total = Number(stats.blocks) * Number(stats.bsize);
    const available = Number(stats.bavail) * Number(stats.bsize);
    return { disk_available_bytes: available, disk_used_percent: total > 0 ? round((1 - available / total) * 100) : null };
  } catch { return { disk_available_bytes: null, disk_used_percent: null }; }
}

function hostConcurrency() {
  const active = [...state.hosts.values()].map((host) => host.active);
  return { active: active.filter((value) => value > 0).length, maximum: active.length ? Math.max(...active) : 0 };
}

function hostRecord(hostname) {
  if (!state.hosts.has(hostname)) state.hosts.set(hostname, {
    hostname, active: 0, request_count: 0, success_count: 0, failure_count: 0,
    timeout_count: 0, http_403_count: 0, http_429_count: 0, http_5xx_count: 0,
    retry_count: 0, latencies: [],
  });
  return state.hosts.get(hostname);
}

export function telemetrySourcesQueued(count) { if (state.session) state.queuedSources += Math.max(0, integer(count)); }
export function telemetrySourceStarted() {
  if (!state.session) return null;
  state.queuedSources = Math.max(0, state.queuedSources - 1); state.activeSources += 1;
  return performance.now();
}
export function telemetrySourceFinished(token) {
  if (!state.session) return;
  state.activeSources = Math.max(0, state.activeSources - 1); state.completedSources += 1;
  if (Number.isFinite(token)) state.sourceDurations.push(performance.now() - token);
}
export function telemetryDetailsQueued(count) { if (state.session) state.queuedDetails += Math.max(0, integer(count)); }
export function telemetryDetailStarted() {
  if (!state.session) return null;
  state.queuedDetails = Math.max(0, state.queuedDetails - 1); state.activeDetails += 1;
  return performance.now();
}
export function telemetryDetailFinished(token) {
  if (!state.session) return;
  state.activeDetails = Math.max(0, state.activeDetails - 1); state.completedDetails += 1;
  if (Number.isFinite(token)) state.detailDurations.push(performance.now() - token);
}
export function telemetryHttpStarted({ url, attempt = 0 } = {}) {
  if (!state.session) return null;
  let hostname = "invalid-host";
  try { hostname = new URL(String(url)).hostname.toLowerCase(); } catch {}
  const host = hostRecord(hostname);
  host.active += 1; state.activeRequests += 1;
  if (attempt > 0) { state.retryAttempts += 1; host.retry_count += 1; }
  return { started: performance.now(), hostname, url: sanitizeTelemetryUrl(url), attempt };
}
export function telemetryHttpFinished(token, { status, bytes = 0, error, timeout = false } = {}) {
  if (!state.session || !token) return;
  const duration = performance.now() - token.started;
  const host = hostRecord(token.hostname);
  host.active = Math.max(0, host.active - 1); host.request_count += 1; host.latencies.push(duration);
  state.activeRequests = Math.max(0, state.activeRequests - 1); state.completedRequests += 1;
  state.requestDurations.push(duration); state.responseBytes.push(Math.max(0, Number(bytes) || 0));
  if (error) { state.requestFailure += 1; host.failure_count += 1; } else { state.requestSuccess += 1; host.success_count += 1; }
  if (timeout) { state.requestTimeout += 1; host.timeout_count += 1; }
  if (status === 403) { state.http403 += 1; host.http_403_count += 1; }
  if (status === 429) { state.http429 += 1; host.http_429_count += 1; }
  if (status >= 500 && status <= 599) { state.http5xx += 1; host.http_5xx_count += 1; }
}
export function telemetryRetryDelay(delayMs) { if (state.session) state.retryDelayMs += Math.max(0, Number(delayMs) || 0); }

function distribution(prefix, values) {
  return {
    [`${prefix}_p50_ms`]: round(percentile(values, 50)), [`${prefix}_p95_ms`]: round(percentile(values, 95)),
    [`${prefix}_p99_ms`]: round(percentile(values, 99)), [`${prefix}_max_ms`]: values.length ? round(Math.max(...values)) : null,
  };
}

export function validateCrawlerPerformanceSummary(summary) {
  const errors = [];
  if (summary?.schema_version !== PERFORMANCE_TELEMETRY_SCHEMA_VERSION) errors.push("invalid schema_version");
  for (const key of ["configuration", "runner", "measurement", "resource_summary", "event_loop_summary", "gc_summary", "concurrency_summary", "performance", "reliability", "quality"])
    if (!summary?.[key] || typeof summary[key] !== "object" || Array.isArray(summary[key])) errors.push(`missing object: ${key}`);
  if (!Array.isArray(summary?.host_summaries)) errors.push("host_summaries must be an array");
  if (!Array.isArray(summary?.warnings)) errors.push("warnings must be an array");
  return { valid: errors.length === 0, errors };
}

export function startCrawlerPerformanceTelemetry(options = {}) {
  if (!bool(options.enabled ?? process.env.CRAWLER_TELEMETRY_ENABLED)) return null;
  if (state.session) throw new Error("crawler performance telemetry already started");
  resetObservationState();
  const outputDirectory = path.resolve(options.outputDirectory ?? process.env.CRAWLER_TELEMETRY_OUTPUT_DIR ?? "exports/notices");
  fs.mkdirSync(outputDirectory, { recursive: true });
  const startedAt = new Date();
  const date = kstDateParts(startedAt).date;
  const sampleIntervalMs = Math.max(10, integer(options.sampleIntervalMs ?? process.env.TELEMETRY_SAMPLE_INTERVAL_MS, 2000));
  const datedCsv = path.join(outputDirectory, `crawler-performance-timeseries-${date}.csv`);
  const latestCsv = path.join(outputDirectory, "crawler-performance-timeseries-latest.csv");
  const stream = fs.createWriteStream(datedCsv, { encoding: "utf8" });
  stream.on("error", (error) => {
    if (state.session?.stream === stream) state.session.telemetryError = sanitizeTelemetryText(error?.message ?? error);
  });
  stream.write(`${PERFORMANCE_TIMESERIES_COLUMNS.join(",")}\n`);
  const delay = monitorEventLoopDelay({ resolution: 20 }); delay.enable();
  const gcDurations = [];
  const gcObserver = new PerformanceObserver((list) => { for (const entry of list.getEntries()) gcDurations.push(entry.duration); });
  try { gcObserver.observe({ entryTypes: ["gc"] }); } catch {}
  const logicalCpuCount = Math.max(1, os.cpus().length);
  const startedMonotonic = performance.now();
  let previousMonotonic = startedMonotonic;
  let previousCpu = process.cpuUsage();
  let previousElu = performance.eventLoopUtilization();
  const networkStart = readNetwork();
  const samples = [];
  let telemetryError = null;

  const sample = () => {
    try {
      const now = new Date(); const monotonic = performance.now(); const memory = process.memoryUsage();
      const proc = readProc(); const network = readNetwork(); const disk = readDisk(outputDirectory);
      const actualSampleIntervalMs = monotonic - previousMonotonic;
      const currentCpu = process.cpuUsage();
      const cpu = calculateCpuDelta(previousCpu, currentCpu, actualSampleIntervalMs, logicalCpuCount);
      previousCpu = currentCpu; previousMonotonic = monotonic;
      const elu = performance.eventLoopUtilization(previousElu); previousElu = performance.eventLoopUtilization();
      const load = os.loadavg(); const concurrency = hostConcurrency(); const kst = kstDateParts(now);
      const row = {
        timestamp_utc: now.toISOString(), timestamp_kst: kst.timestamp, elapsed_ms: round(monotonic - startedMonotonic), sample_interval_ms: round(actualSampleIntervalMs),
        ...cpu, load_average_1m: load[0], load_average_5m: load[1], load_average_15m: load[2],
        process_rss_bytes: memory.rss, process_tree_rss_bytes: proc.process_tree_rss_bytes, process_vms_bytes: proc.process_vms_bytes,
        peak_rss_bytes: Math.round(process.resourceUsage().maxRSS * 1024), node_heap_used_bytes: memory.heapUsed,
        node_heap_total_bytes: memory.heapTotal, node_external_bytes: memory.external, node_array_buffers_bytes: memory.arrayBuffers,
        ...proc, runner_network_rx_bytes: network.rx, runner_network_tx_bytes: network.tx, ...disk,
        event_loop_utilization: round(elu.utilization, 6), event_loop_delay_mean_ms: round(delay.mean / 1e6),
        event_loop_delay_p50_ms: round(delay.percentile(50) / 1e6), event_loop_delay_p95_ms: round(delay.percentile(95) / 1e6),
        event_loop_delay_p99_ms: round(delay.percentile(99) / 1e6), event_loop_delay_max_ms: round(delay.max / 1e6),
        gc_count: gcDurations.length, gc_total_duration_ms: round(gcDurations.reduce((a, b) => a + b, 0)),
        gc_max_duration_ms: gcDurations.length ? round(Math.max(...gcDurations)) : 0, gc_duration_p95_ms: round(percentile(gcDurations, 95)),
        active_source_count: state.activeSources, queued_source_count: state.queuedSources,
        active_detail_count: state.activeDetails, queued_detail_count: state.queuedDetails,
        active_http_request_count: state.activeRequests, active_host_count: concurrency.active,
        maximum_requests_for_single_host: concurrency.maximum, completed_source_count: state.completedSources,
        completed_detail_count: state.completedDetails, completed_request_count: state.completedRequests,
      };
      samples.push(row);
      stream.write(`${PERFORMANCE_TIMESERIES_COLUMNS.map((key) => csvValue(row[key])).join(",")}\n`);
    } catch (error) {
      telemetryError = sanitizeTelemetryText(error?.message ?? error);
      if (state.session) state.session.telemetryError = telemetryError;
    }
  };
  sample();
  const timer = setInterval(sample, sampleIntervalMs); timer.unref();
  state.session = { outputDirectory, date, datedCsv, latestCsv, stream, delay, gcObserver, gcDurations, samples,
    sampleIntervalMs, startedAt, startedMonotonic, timer, logicalCpuCount, networkStart, telemetryError,
    options };
  return state.session;
}

export async function finishCrawlerPerformanceTelemetry({ crawlerResult = null, error = null } = {}) {
  const session = state.session;
  if (!session) return null;
  clearInterval(session.timer);
  if (session.samples.length === 0) session.telemetryError = session.telemetryError ?? "no telemetry samples collected";
  session.delay.disable(); session.gcObserver.disconnect();
  await new Promise((resolve) => session.stream.end(resolve));
  fs.copyFileSync(session.datedCsv, session.latestCsv);
  const finishedAt = new Date(); const durationMs = performance.now() - session.startedMonotonic;
  const samples = session.samples; const cpu = samples.map((item) => item.cpu_percent_machine);
  const rss = samples.map((item) => item.process_tree_rss_bytes); const networkEnd = readNetwork();
  const values = (key) => samples.map((item) => item[key]).filter(Number.isFinite);
  const perMinute = (count) => durationMs > 0 ? round((count * 60_000) / durationMs) : 0;
  const options = session.options;
  const summary = {
    schema_version: PERFORMANCE_TELEMETRY_SCHEMA_VERSION,
    configuration: {
      commit_sha: options.commitSha ?? process.env.GITHUB_SHA ?? null,
      workflow_run_id: options.workflowRunId ?? process.env.GITHUB_RUN_ID ?? null,
      workflow_run_attempt: options.workflowRunAttempt ?? process.env.GITHUB_RUN_ATTEMPT ?? null,
      job_name: options.jobName ?? process.env.GITHUB_JOB ?? null,
      university_group: options.universityGroup ?? process.env.CRAWLER_UNIVERSITY_GROUP ?? null,
      matrix_max_parallel: integer(options.matrixMaxParallel ?? process.env.CRAWL_MATRIX_MAX_PARALLEL, 5),
      source_concurrency: integer(options.sourceConcurrency ?? process.env.CRAWL_SOURCE_CONCURRENCY, 1),
      detail_concurrency: integer(options.detailConcurrency ?? process.env.CRAWL_DETAIL_CONCURRENCY, 2),
      host_concurrency: integer(options.hostConcurrency ?? process.env.CRAWL_HOST_CONCURRENCY, 2),
      timeout_ms: integer(options.timeoutMs ?? process.env.CRAWL_TIMEOUT_MS, 25000),
      retry_count: integer(options.retryCount ?? process.env.CRAWL_RETRY_COUNT, 1),
      retry_backoff_ms: integer(options.retryBackoffMs ?? process.env.CRAWL_RETRY_BACKOFF_MS, 1000),
      retry_maximum_delay_ms: integer(options.retryMaximumDelayMs ?? process.env.CRAWL_RETRY_MAX_DELAY_MS, 30000),
      retry_jitter_ratio: finite(options.retryJitterRatio ?? process.env.CRAWL_RETRY_JITTER_RATIO) ?? 0.1,
      lookback_days: integer(options.lookbackDays ?? process.env.CRAWL_LOOKBACK_DAYS, 31),
      allow_undated: bool(options.allowUndated ?? process.env.CRAWL_ALLOW_UNDATED),
      ignore_seen: bool(options.ignoreSeen ?? process.env.CRAWL_IGNORE_SEEN),
      fresh_start: bool(options.freshStart ?? process.env.CRAWL_FRESH_START),
      document_parsing_enabled: bool(options.documentParsingEnabled ?? process.env.CRAWL_DOCUMENT_PARSING_ENABLED),
      source_count: state.completedSources, started_at: session.startedAt.toISOString(), finished_at: finishedAt.toISOString(), duration_ms: round(durationMs),
    },
    runner: { runner_os: process.env.RUNNER_OS ?? os.platform(), runner_arch: process.env.RUNNER_ARCH ?? os.arch(),
      runner_image: process.env.ImageOS ?? null, runner_logical_cpu_count: session.logicalCpuCount,
      network_measurement_scope: "runner", cpu_formula: "single_core=(process_cpu_us/elapsed_us)*100; machine=single_core/logical_cpu_count" },
    measurement: { sample_interval_ms: session.sampleIntervalMs, sample_count: samples.length,
      telemetry_status: session.telemetryError ? "partial" : error ? "partial" : "success",
      telemetry_error: sanitizeTelemetryText(session.telemetryError ?? error?.message ?? "") || null },
    resource_summary: {
      cpu_average_percent_machine: cpu.length ? round(cpu.reduce((a, b) => a + b, 0) / cpu.length) : null,
      cpu_p95_percent_machine: round(percentile(cpu, 95)), cpu_peak_percent_machine: cpu.length ? round(Math.max(...cpu)) : null,
      cpu_peak_cores_used: values("cpu_cores_used").length ? round(Math.max(...values("cpu_cores_used"))) : null,
      rss_average_bytes: rss.length ? Math.round(rss.reduce((a, b) => a + b, 0) / rss.length) : null,
      rss_p95_bytes: percentile(rss, 95), rss_peak_bytes: rss.length ? Math.max(...rss) : null,
      heap_used_peak_bytes: values("node_heap_used_bytes").length ? Math.max(...values("node_heap_used_bytes")) : null,
      disk_read_bytes: cumulativeDelta(samples[0]?.process_read_bytes, samples.at(-1)?.process_read_bytes),
      disk_write_bytes: cumulativeDelta(samples[0]?.process_write_bytes, samples.at(-1)?.process_write_bytes),
      network_rx_bytes: cumulativeDelta(session.networkStart.rx, networkEnd.rx), network_tx_bytes: cumulativeDelta(session.networkStart.tx, networkEnd.tx),
    },
    event_loop_summary: { event_loop_utilization_average: values("event_loop_utilization").length ? round(values("event_loop_utilization").reduce((a,b)=>a+b,0)/values("event_loop_utilization").length, 6) : null,
      event_loop_delay_p95_ms: round(percentile(values("event_loop_delay_p95_ms"), 95)), event_loop_delay_p99_ms: round(percentile(values("event_loop_delay_p99_ms"), 99)) },
    gc_summary: { gc_count: session.gcDurations.length, gc_total_duration_ms: round(session.gcDurations.reduce((a,b)=>a+b,0)),
      gc_max_duration_ms: session.gcDurations.length ? round(Math.max(...session.gcDurations)) : 0, gc_duration_p95_ms: round(percentile(session.gcDurations,95)) },
    concurrency_summary: { active_sources_peak: Math.max(0, ...values("active_source_count")), active_details_peak: Math.max(0, ...values("active_detail_count")),
      active_http_requests_peak: Math.max(0, ...values("active_http_request_count")), source_queue_peak: Math.max(0, ...values("queued_source_count")), detail_queue_peak: Math.max(0, ...values("queued_detail_count")) },
    performance: { sources_per_minute: perMinute(state.completedSources), details_per_minute: perMinute(state.completedDetails), requests_per_minute: perMinute(state.completedRequests),
      observed_notices_per_minute: perMinute(crawlerResult?.report?.counts?.observed ?? 0), ...distribution("source_duration", state.sourceDurations), ...distribution("detail_duration", state.detailDurations),
      request_latency_p50_ms: round(percentile(state.requestDurations,50)), request_latency_p90_ms: round(percentile(state.requestDurations,90)), request_latency_p95_ms: round(percentile(state.requestDurations,95)), request_latency_p99_ms: round(percentile(state.requestDurations,99)), request_latency_max_ms: state.requestDurations.length ? round(Math.max(...state.requestDurations)) : null },
    reliability: { request_count: state.completedRequests, request_success_count: state.requestSuccess, request_failure_count: state.requestFailure,
      request_timeout_count: state.requestTimeout, http_403_count: state.http403, http_429_count: state.http429, http_5xx_count: state.http5xx,
      response_bytes_total: state.responseBytes.reduce((a,b)=>a+b,0), response_bytes_p50: percentile(state.responseBytes,50), response_bytes_p95: percentile(state.responseBytes,95), response_bytes_max: state.responseBytes.length ? Math.max(...state.responseBytes) : null,
      retry_attempt_count: state.retryAttempts, retry_delay_total_ms: state.retryDelayMs, retried_source_count: null, recovered_after_retry_count: null, retry_exhausted_count: null,
      dns_timing_supported: false, tcp_timing_supported: false, tls_timing_supported: false, ttfb_supported: false },
    quality: {},
    host_summaries: [...state.hosts.values()].map(({ active, latencies, ...host }) => ({ ...host,
      latency_p50_ms: round(percentile(latencies,50)), latency_p95_ms: round(percentile(latencies,95)), latency_p99_ms: round(percentile(latencies,99)) })),
    durations: { crawler_duration_ms: round(durationMs), cleaner_duration_ms: null, university_job_duration_ms: null },
    quality_metrics_source: {}, warnings: session.telemetryError ? [session.telemetryError] : [],
  };
  const validation = validateCrawlerPerformanceSummary(summary);
  if (!validation.valid) throw new Error(`invalid telemetry summary: ${validation.errors.join(", ")}`);
  const datedJson = path.join(session.outputDirectory, `crawler-performance-summary-${session.date}.json`);
  const latestJson = path.join(session.outputDirectory, "crawler-performance-summary-latest.json");
  const json = `${JSON.stringify(summary, null, 2)}\n`;
  fs.writeFileSync(datedJson, json); fs.writeFileSync(latestJson, json);
  state.session = null;
  return { summary, paths: { datedCsv: session.datedCsv, latestCsv: session.latestCsv, datedJson, latestJson } };
}

export function isCrawlerPerformanceTelemetryActive() { return Boolean(state.session); }
