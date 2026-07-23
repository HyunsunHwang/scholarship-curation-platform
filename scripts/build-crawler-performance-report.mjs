import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { kstDateParts, validateCrawlerPerformanceSummary } from "../lib/crawler-engine/crawler-performance-telemetry.mjs";

export const COMBINED_PERFORMANCE_COLUMNS = [
  "date", "university_group", "source_count", "matrix_max_parallel", "source_concurrency", "detail_concurrency", "host_concurrency",
  "duration_ms", "sources_per_minute", "requests_per_minute", "cpu_average_percent_machine", "cpu_p95_percent_machine",
  "cpu_peak_percent_machine", "cpu_peak_cores_used", "rss_average_bytes", "rss_p95_bytes", "rss_peak_bytes", "heap_used_peak_bytes",
  "event_loop_utilization_average", "event_loop_delay_p95_ms", "event_loop_delay_p99_ms", "disk_read_bytes", "disk_write_bytes",
  "network_rx_bytes", "network_tx_bytes", "runtime_success_count", "runtime_partial_count", "runtime_failure_count", "timeout_count",
  "http_403_count", "http_429_count", "http_5xx_count", "retry_attempt_count", "retry_exhausted_count", "observed_count",
  "matched_count", "new_notice_count", "detail_fetch_failure_count", "cleaner_accepted_count", "cleaner_rejected_count",
  "telemetry_status", "warning_count",
];

const csv = (value) => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export function combinedPerformanceRow(summary, date) {
  const c = summary.configuration; const r = summary.resource_summary; const e = summary.event_loop_summary;
  const p = summary.performance; const reliability = summary.reliability; const q = summary.quality;
  return {
    date, university_group: c.university_group, source_count: c.source_count, matrix_max_parallel: c.matrix_max_parallel,
    source_concurrency: c.source_concurrency, detail_concurrency: c.detail_concurrency, host_concurrency: c.host_concurrency,
    duration_ms: summary.durations?.crawler_duration_ms ?? c.duration_ms, sources_per_minute: p.sources_per_minute,
    requests_per_minute: p.requests_per_minute, cpu_average_percent_machine: r.cpu_average_percent_machine,
    cpu_p95_percent_machine: r.cpu_p95_percent_machine, cpu_peak_percent_machine: r.cpu_peak_percent_machine,
    cpu_peak_cores_used: r.cpu_peak_cores_used, rss_average_bytes: r.rss_average_bytes, rss_p95_bytes: r.rss_p95_bytes,
    rss_peak_bytes: r.rss_peak_bytes, heap_used_peak_bytes: r.heap_used_peak_bytes,
    event_loop_utilization_average: e.event_loop_utilization_average, event_loop_delay_p95_ms: e.event_loop_delay_p95_ms,
    event_loop_delay_p99_ms: e.event_loop_delay_p99_ms, disk_read_bytes: r.disk_read_bytes, disk_write_bytes: r.disk_write_bytes,
    network_rx_bytes: r.network_rx_bytes, network_tx_bytes: r.network_tx_bytes, runtime_success_count: q.runtime_success_count,
    runtime_partial_count: q.runtime_partial_count, runtime_failure_count: q.runtime_failed_count, timeout_count: q.runtime_timeout_count,
    http_403_count: reliability.http_403_count, http_429_count: reliability.http_429_count, http_5xx_count: reliability.http_5xx_count,
    retry_attempt_count: reliability.retry_attempt_count, retry_exhausted_count: reliability.retry_exhausted_count,
    observed_count: q.observed_count, matched_count: q.keyword_matched_count, new_notice_count: q.new_notice_count,
    detail_fetch_failure_count: q.detail_fetch_failure_count, cleaner_accepted_count: q.cleaner_accepted_count,
    cleaner_rejected_count: q.cleaner_rejected_count, telemetry_status: summary.measurement.telemetry_status,
    warning_count: summary.warnings.length,
  };
}

export function buildCombinedCrawlerPerformanceReport({ rootDirectory = "exports/notices", groups = [] } = {}) {
  const date = kstDateParts().date; const summaries = []; const missing_groups = []; const invalid_groups = [];
  for (const group of groups) {
    const file = path.join(rootDirectory, group, "crawler-performance-summary-latest.json");
    if (!fs.existsSync(file)) { missing_groups.push(group); continue; }
    const summary = JSON.parse(fs.readFileSync(file, "utf8")); const validation = validateCrawlerPerformanceSummary(summary);
    if (!validation.valid) { invalid_groups.push({ group, errors: validation.errors }); continue; }
    summaries.push(summary);
  }
  const rows = summaries.map((summary) => combinedPerformanceRow(summary, date));
  const combined = { schema_version: "crawler-performance-combined-v1", generated_at: new Date().toISOString(), date,
    university_count: summaries.length, requested_university_count: groups.length, complete: summaries.length === groups.length,
    missing_groups, invalid_groups, university_summaries: summaries };
  return { combined, csv: `${COMBINED_PERFORMANCE_COLUMNS.join(",")}\n${rows.map((row) => COMBINED_PERFORMANCE_COLUMNS.map((key) => csv(row[key])).join(",")).join("\n")}${rows.length ? "\n" : ""}` };
}

export function writeCombinedCrawlerPerformanceReport(options = {}) {
  const root = path.resolve(options.rootDirectory ?? "exports/notices"); const result = buildCombinedCrawlerPerformanceReport({ ...options, rootDirectory: root });
  const directory = path.join(root, "performance"); fs.mkdirSync(directory, { recursive: true }); const date = result.combined.date;
  const json = `${JSON.stringify(result.combined, null, 2)}\n`;
  for (const file of [`crawler-performance-combined-${date}.json`, "crawler-performance-combined-latest.json"]) fs.writeFileSync(path.join(directory, file), json);
  for (const file of [`crawler-performance-combined-${date}.csv`, "crawler-performance-combined-latest.csv"]) fs.writeFileSync(path.join(directory, file), result.csv);
  return result;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const groups = (process.env.CRAWLER_UNIVERSITY_GROUPS ?? "ewha,cau,korea,khu,hanyang,hongik,yonsei,skku,uos").split(",").filter(Boolean);
  const result = writeCombinedCrawlerPerformanceReport({ rootDirectory: process.argv[2] ?? "exports/notices", groups });
  console.log(`telemetry_university_count=${result.combined.university_count}`);
  if (!result.combined.complete) console.log(`telemetry_missing_groups=${result.combined.missing_groups.join(",")}`);
}
