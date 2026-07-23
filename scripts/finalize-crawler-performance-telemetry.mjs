import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { kstDateParts, validateCrawlerPerformanceSummary } from "../lib/crawler-engine/crawler-performance-telemetry.mjs";

function countCsvDataRows(file) {
  if (!file || !fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, "utf8").trim();
  if (!text) return 0;
  let rows = 0; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '"') quoted = text[index + 1] === '"' ? quoted : !quoted;
    if (text[index] === "\n" && !quoted) rows += 1;
  }
  return Math.max(0, rows);
}

function capabilityCount(summary, status) {
  return summary?.capability_status_counts?.find((item) => item.capability_status === status)?.source_count ?? 0;
}

function optionalNumber(value) {
  return value !== null && value !== undefined && String(value).trim() !== "" && Number.isFinite(Number(value))
    ? Number(value)
    : null;
}

export function attachCrawlerQualityMetrics(summary, report, {
  reportPath = "scholarship-notices-latest.json", cleanedCsvPath, rejectedCsvPath,
  cleanerDurationMs = null, universityJobDurationMs = null,
} = {}) {
  const runtime = report?.boundedExecution?.summary ?? {};
  const operational = report?.operationalDiagnostics?.summary ?? {};
  const totals = report?.totals ?? {};
  const primaryFailures = operational.primary_failure_code_counts ?? [];
  const failureCount = (code) => primaryFailures.find((item) => item.failure_code === code)?.source_count ?? 0;
  const filterMetricTotal = (key) => (report?.perSource ?? []).reduce((total, source) => total + Number(source?.filterMetrics?.[key] ?? 0), 0);
  summary.configuration.source_count = runtime.requested_source_count ?? totals.sourceCount ?? summary.configuration.source_count;
  summary.reliability = {
    ...summary.reliability,
    runtime_success_count: runtime.successful_source_count ?? null,
    runtime_zero_match_count: runtime.zero_match_source_count ?? null,
    runtime_partial_count: runtime.partial_source_count ?? null,
    runtime_failed_count: runtime.failed_source_count ?? null,
    runtime_timeout_count: runtime.timeout_source_count ?? null,
    runtime_blocked_count: runtime.blocked_source_count ?? null,
    retried_source_count: runtime.retried_source_count ?? null,
    recovered_after_retry_count: runtime.recovered_after_retry_count ?? null,
    retry_exhausted_count: runtime.exhausted_retry_count ?? null,
    retry_attempt_count: Math.max(summary.reliability.retry_attempt_count ?? 0,
      Math.max(0, (runtime.total_attempt_count ?? 0) - (runtime.completed_source_count ?? 0))),
    retry_delay_total_ms: runtime.total_retry_delay_ms ?? summary.reliability.retry_delay_total_ms,
  };
  summary.quality = {
    runtime_success_count: runtime.successful_source_count ?? null,
    runtime_zero_match_count: runtime.zero_match_source_count ?? null,
    runtime_partial_count: runtime.partial_source_count ?? null,
    runtime_failed_count: runtime.failed_source_count ?? null,
    runtime_timeout_count: runtime.timeout_source_count ?? null,
    runtime_blocked_count: runtime.blocked_source_count ?? null,
    operational_supported_count: operational.supported_source_count ?? capabilityCount(operational, "supported"),
    operational_manual_review_count: operational.manual_review_source_count ?? capabilityCount(operational, "manual_review_required"),
    operational_config_fix_count: capabilityCount(operational, "config_or_selector_fix"),
    operational_detail_failed_count: capabilityCount(operational, "list_supported_detail_failed"),
    observed_count: totals.crawledCount ?? runtime.total_observed_item_count ?? null,
    keyword_matched_count: filterMetricTotal("keyword_match_count"),
    date_matched_count: filterMetricTotal("date_match_count"),
    new_notice_count: totals.newCount ?? report?.newNotices?.length ?? null,
    detail_fetch_failure_count: failureCount("DETAIL_FETCH_FAILED"),
    cleaner_accepted_count: countCsvDataRows(cleanedCsvPath),
    cleaner_rejected_count: countCsvDataRows(rejectedCsvPath),
  };
  summary.performance.observed_notices_per_minute = summary.durations?.crawler_duration_ms > 0
    ? Number(((summary.quality.observed_count ?? 0) * 60_000 / summary.durations.crawler_duration_ms).toFixed(3))
    : 0;
  summary.durations.cleaner_duration_ms = optionalNumber(cleanerDurationMs);
  summary.durations.university_job_duration_ms = optionalNumber(universityJobDurationMs);
  summary.quality_metrics_source = {
    runtime: `${path.basename(reportPath)}#boundedExecution`,
    operational: `${path.basename(reportPath)}#operationalDiagnostics`,
    cleaner: cleanedCsvPath ? path.basename(cleanedCsvPath) : null,
  };
  return summary;
}

export function finalizeCrawlerPerformanceTelemetry({ outputDirectory, cleanerDurationMs, universityJobDurationMs } = {}) {
  const directory = path.resolve(outputDirectory);
  const summaryPath = path.join(directory, "crawler-performance-summary-latest.json");
  const reportPath = path.join(directory, "scholarship-notices-latest.json");
  if (!fs.existsSync(summaryPath)) throw new Error(`telemetry summary not found: ${summaryPath}`);
  if (!fs.existsSync(reportPath)) throw new Error(`crawler report not found: ${reportPath}`);
  const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  attachCrawlerQualityMetrics(summary, report, {
    reportPath,
    cleanedCsvPath: path.join(directory, "scholarship-notices-latest.cleaned.csv"),
    rejectedCsvPath: path.join(directory, "scholarship-notices-latest.rejected.csv"),
    cleanerDurationMs,
    universityJobDurationMs,
  });
  const validation = validateCrawlerPerformanceSummary(summary);
  if (!validation.valid) throw new Error(`invalid telemetry summary: ${validation.errors.join(", ")}`);
  const datedPath = path.join(directory, `crawler-performance-summary-${kstDateParts(new Date(summary.configuration.started_at)).date}.json`);
  const json = `${JSON.stringify(summary, null, 2)}\n`;
  fs.writeFileSync(summaryPath, json); fs.writeFileSync(datedPath, json);
  return summary;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const outputDirectory = process.argv[2];
    if (!outputDirectory) throw new Error("usage: node scripts/finalize-crawler-performance-telemetry.mjs <output-directory> [cleaner-duration-ms] [job-duration-ms]");
    finalizeCrawlerPerformanceTelemetry({ outputDirectory, cleanerDurationMs: process.argv[3], universityJobDurationMs: process.argv[4] });
    console.log(`telemetry_finalized=${path.resolve(outputDirectory)}`);
  } catch (error) {
    console.error(error?.message ?? error); process.exitCode = 1;
  }
}
