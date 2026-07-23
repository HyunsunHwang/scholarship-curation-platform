import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  calculateCpuDelta,
  cumulativeDelta,
  finishCrawlerPerformanceTelemetry,
  isCrawlerPerformanceTelemetryActive,
  kstDateParts,
  percentile,
  sanitizeTelemetryText,
  sanitizeTelemetryUrl,
  startCrawlerPerformanceTelemetry,
  telemetryDetailFinished,
  telemetryDetailStarted,
  telemetryDetailsQueued,
  telemetryHttpFinished,
  telemetryHttpStarted,
  telemetrySourceFinished,
  telemetrySourceStarted,
  telemetrySourcesQueued,
  validateCrawlerPerformanceSummary,
} from "../lib/crawler-engine/crawler-performance-telemetry.mjs";
import { attachCrawlerQualityMetrics } from "./finalize-crawler-performance-telemetry.mjs";
import { buildCombinedCrawlerPerformanceReport, COMBINED_PERFORMANCE_COLUMNS } from "./build-crawler-performance-report.mjs";

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "crawler-telemetry-test-"));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  const disabledDirectory = path.join(temporaryRoot, "disabled");
  assert.equal(startCrawlerPerformanceTelemetry({ enabled: false, outputDirectory: disabledDirectory }), null);
  assert.equal(fs.existsSync(disabledDirectory), false, "disabled telemetry must preserve the old execution path");

  const outputDirectory = path.join(temporaryRoot, "ewha");
  startCrawlerPerformanceTelemetry({ enabled: true, outputDirectory, sampleIntervalMs: 20, universityGroup: "ewha",
    matrixMaxParallel: 5, sourceConcurrency: 2, detailConcurrency: 1, hostConcurrency: 2 });
  telemetrySourcesQueued(1); const source = telemetrySourceStarted();
  telemetryDetailsQueued(1); const detail = telemetryDetailStarted();
  const request = telemetryHttpStarted({ url: "https://user:password@example.com/a?api_key=secret", attempt: 1 });
  await wait(48);
  telemetryHttpFinished(request, { status: 200, bytes: 128 });
  telemetryDetailFinished(detail); telemetrySourceFinished(source);
  const result = await finishCrawlerPerformanceTelemetry({ crawlerResult: { report: { counts: { observed: 2 } } } });
  assert.equal(isCrawlerPerformanceTelemetryActive(), false, "monitor must stop with crawler process");
  assert.ok(result.summary.measurement.sample_count >= 2, "short fixture interval should create multiple samples");
  assert.equal(result.summary.concurrency_summary.active_sources_peak, 1);
  assert.equal(result.summary.concurrency_summary.active_details_peak, 1);
  assert.ok(result.summary.resource_summary.rss_peak_bytes > 0, "RSS peak must be measured");
  assert.equal(result.summary.host_summaries[0].hostname, "example.com");
  assert.equal(result.summary.host_summaries[0].retry_count, 1);
  assert.ok(fs.readFileSync(result.paths.latestCsv, "utf8").split(/\r?\n/).length >= 3);
  assert.equal(validateCrawlerPerformanceSummary(result.summary).valid, true);

  assert.deepEqual(calculateCpuDelta({ user: 0, system: 0 }, { user: 1_000_000, system: 0 }, 1000, 4), {
    cpu_percent_single_core_scale: 100, cpu_percent_machine: 25, cpu_cores_used: 1,
  });
  assert.equal(cumulativeDelta(100, 180), 80);
  assert.equal(cumulativeDelta(180, 100), 0);
  assert.equal(percentile([1, 2, 3, 100], 95), 100);
  assert.equal(sanitizeTelemetryUrl("https://user:pw@example.com/x?token=secret"), "https://example.com/x");
  assert.doesNotMatch(sanitizeTelemetryText("Bearer abc.def.ghi db://u:p@host api_key=secret"), /abc\.def|u:p|secret$/);
  assert.equal(kstDateParts(new Date("2026-07-23T15:30:00Z")).date, "20260724");

  const cleaned = path.join(outputDirectory, "cleaned.csv"); const rejected = path.join(outputDirectory, "rejected.csv");
  fs.writeFileSync(cleaned, "a,b\n1,2\n"); fs.writeFileSync(rejected, "a,b\n3,4\n5,6\n");
  attachCrawlerQualityMetrics(result.summary, {
    totals: { sourceCount: 3, crawledCount: 9, matchedCount: 4, newCount: 2 },
    boundedExecution: { summary: { requested_source_count: 3, successful_source_count: 1, zero_match_source_count: 1,
      partial_source_count: 1, failed_source_count: 1, timeout_source_count: 0, blocked_source_count: 0,
      retried_source_count: 1, recovered_after_retry_count: 1, exhausted_retry_count: 0, total_attempt_count: 4,
      completed_source_count: 3, total_retry_delay_ms: 50 } },
    operationalDiagnostics: { summary: { supported_source_count: 1, manual_review_source_count: 1,
      capability_status_counts: [{ capability_status: "config_or_selector_fix", source_count: 1 }],
      primary_failure_code_counts: [{ failure_code: "DETAIL_FETCH_FAILED", source_count: 1 }] } },
  }, { reportPath: "report.json", cleanedCsvPath: cleaned, rejectedCsvPath: rejected, cleanerDurationMs: 10, universityJobDurationMs: 100 });
  assert.equal(result.summary.quality.runtime_success_count, 1);
  assert.equal(result.summary.quality.cleaner_accepted_count, 1);
  assert.equal(result.summary.quality.cleaner_rejected_count, 2);
  assert.equal(result.summary.quality.detail_fetch_failure_count, 1);

  fs.writeFileSync(path.join(outputDirectory, "crawler-performance-summary-latest.json"), JSON.stringify(result.summary));
  const combined = buildCombinedCrawlerPerformanceReport({ rootDirectory: temporaryRoot, groups: ["ewha", "missing"] });
  assert.equal(combined.combined.university_count, 1);
  assert.equal(combined.combined.complete, false);
  assert.deepEqual(combined.combined.missing_groups, ["missing"]);
  assert.equal(combined.csv.split(/\r?\n/)[0], COMBINED_PERFORMANCE_COLUMNS.join(","));

  const workflow = fs.readFileSync(path.resolve(".github/workflows/crawl-scholarship-notices.yml"), "utf8");
  for (const group of ["ewha", "cau", "korea", "khu", "hanyang", "hongik", "yonsei", "skku", "uos"])
    assert.match(workflow, new RegExp(`group: \\[[^\\]]*${group}`), `matrix must include ${group}`);
  assert.ok(workflow.includes("name: crawl-result-${{ matrix.group }}"));
  assert.ok(workflow.includes(".crawler/${{ matrix.group }}-daily-state.json"));
  assert.ok(workflow.includes("fail-fast: false"));

  const failureDirectory = path.join(temporaryRoot, "failure");
  startCrawlerPerformanceTelemetry({ enabled: true, outputDirectory: failureDirectory, sampleIntervalMs: 20 });
  const failed = await finishCrawlerPerformanceTelemetry({ error: new Error("api_key=do-not-leak") });
  assert.equal(failed.summary.measurement.telemetry_status, "partial");
  assert.doesNotMatch(JSON.stringify(failed.summary), /do-not-leak/);
  assert.ok(failed.summary.measurement.sample_count >= 1, "empty-work runs still retain an initial sample");

  console.log("crawler performance telemetry tests passed");
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
