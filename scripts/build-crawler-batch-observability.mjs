import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSourceIdentityIndex,
  resolveSourceKey,
} from "./resolve-crawler-source-identities.mjs";

const __filename = fileURLToPath(import.meta.url);

const DEFAULT_INPUT = "fixtures/post-phase-e/healthy-batch.json";
const DEFAULT_OUTPUT = "reports/post-phase-e-batch-observability.json";
const DEFAULT_SOURCES = "data/notice-sources.csv";
const DEFAULT_MAPPING_SNAPSHOT =
  "fixtures/integration-foundation/source-identity-mapping-snapshot.json";

const ALLOWED_STATUSES = new Set([
  "success",
  "zero_match_observed",
  "failed",
  "timeout",
  "partial",
  "blocked",
]);

const STATUS_PRECEDENCE = {
  blocked: 4,
  incomplete: 3,
  degraded: 2,
  healthy: 1,
};

const REQUIRED_TOP_LEVEL_FIELDS = [
  "schema_version",
  "generated_at",
  "read_only",
  "db_access",
  "db_write",
  "crawler_execution",
  "batch_identity",
  "batch_status",
  "completion",
  "metrics",
  "source_summaries",
  "issues",
  "rollback_scope_evidence",
];

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(values.map(cleanText).filter(Boolean))].sort();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function writeJson(filePath, value) {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function repoRelativePath(filePath) {
  return path.relative(process.cwd(), path.resolve(filePath)).split(path.sep).join("/");
}

function numberOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeCounts(value) {
  const counts = value && typeof value === "object" ? value : {};
  return {
    clean: Number(counts.clean ?? 0),
    needs_review: Number(counts.needs_review ?? 0),
    blocked: Number(counts.blocked ?? 0),
  };
}

function candidateTotal(counts) {
  return counts.clean + counts.needs_review + counts.blocked;
}

function normalizeResult(raw, index) {
  const sourceKey = cleanText(raw.source_key);
  const resolution = resolveSourceKey(sourceKey, index);
  const counts = normalizeCounts(raw.candidate_counts);
  return {
    run_id: cleanText(raw.run_id),
    rehearsal_label: cleanText(raw.rehearsal_label),
    batch_id: cleanText(raw.batch_id),
    source_key: sourceKey,
    source_id: cleanText(raw.source_id) || resolution.source_id,
    source_resolution_status: resolution.resolution_status,
    source_resolution: resolution,
    status: cleanText(raw.status),
    crawled_item_count: numberOrNull(raw.crawled_item_count),
    matched_item_count: numberOrNull(raw.matched_item_count),
    candidate_counts: counts,
    candidate_count: candidateTotal(counts),
    canonical_keys: unique(toArray(raw.canonical_keys)),
    started_at: cleanText(raw.started_at) || null,
    finished_at: cleanText(raw.finished_at) || null,
    error_code: raw.error_code == null ? null : cleanText(raw.error_code),
    warnings: toArray(raw.warnings).map(cleanText).filter(Boolean).sort(),
  };
}

function issue({ code, severity, sourceKey = null, runId = null, message, blocksCompletion }) {
  return {
    code,
    severity,
    source_key: sourceKey,
    run_id: runId,
    message,
    blocks_completion: blocksCompletion,
  };
}

function sortIssues(issues) {
  return issues.sort((a, b) =>
    String(a.code).localeCompare(String(b.code)) ||
    String(a.source_key ?? "").localeCompare(String(b.source_key ?? "")) ||
    String(a.run_id ?? "").localeCompare(String(b.run_id ?? "")) ||
    String(a.message).localeCompare(String(b.message)),
  );
}

function sourceKeyOf(result) {
  return result.source_key || "<missing-source-key>";
}

function groupBySource(results) {
  const map = new Map();
  for (const result of results) {
    const key = sourceKeyOf(result);
    const bucket = map.get(key) ?? [];
    bucket.push(result);
    map.set(key, bucket);
  }
  return new Map([...map.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function sameOperationalResult(a, b) {
  return JSON.stringify({
    source_id: a.source_id,
    status: a.status,
    crawled_item_count: a.crawled_item_count,
    matched_item_count: a.matched_item_count,
    candidate_counts: a.candidate_counts,
    error_code: a.error_code,
  }) === JSON.stringify({
    source_id: b.source_id,
    status: b.status,
    crawled_item_count: b.crawled_item_count,
    matched_item_count: b.matched_item_count,
    candidate_counts: b.candidate_counts,
    error_code: b.error_code,
  });
}

function maxStatus(current, candidate) {
  return STATUS_PRECEDENCE[candidate] > STATUS_PRECEDENCE[current] ? candidate : current;
}

function validateResult(result, input, expectedKeys, issues) {
  if (!ALLOWED_STATUSES.has(result.status)) {
    issues.push(issue({
      code: "unknown_status",
      severity: "blocking",
      sourceKey: result.source_key || null,
      runId: result.run_id || null,
      message: `unknown source result status: ${result.status || "<empty>"}`,
      blocksCompletion: true,
    }));
  }

  for (const [field, value] of [
    ["crawled_item_count", result.crawled_item_count],
    ["matched_item_count", result.matched_item_count],
    ["candidate_count", result.candidate_count],
    ["clean_candidate_count", result.candidate_counts.clean],
    ["needs_review_candidate_count", result.candidate_counts.needs_review],
    ["blocked_candidate_count", result.candidate_counts.blocked],
  ]) {
    if (!Number.isInteger(value) || value < 0) {
      issues.push(issue({
        code: "invalid_count",
        severity: "blocking",
        sourceKey: result.source_key || null,
        runId: result.run_id || null,
        message: `${field} must be a non-negative integer`,
        blocksCompletion: true,
      }));
    }
  }

  if (result.source_resolution_status === "missing" || result.source_resolution_status === "invalid") {
    issues.push(issue({
      code: "unresolved_source_identity",
      severity: "blocking",
      sourceKey: result.source_key || null,
      runId: result.run_id || null,
      message: "source_key did not resolve by exact notice_sources.source_id identity",
      blocksCompletion: true,
    }));
  }

  if (result.source_resolution_status === "ambiguous") {
    issues.push(issue({
      code: "ambiguous_source_identity",
      severity: "blocking",
      sourceKey: result.source_key || null,
      runId: result.run_id || null,
      message: "source_key resolved to multiple source_id candidates",
      blocksCompletion: true,
    }));
  }

  if (result.rehearsal_label && input.rehearsal_label && result.rehearsal_label !== input.rehearsal_label) {
    issues.push(issue({
      code: "cross_batch_record",
      severity: "blocking",
      sourceKey: result.source_key || null,
      runId: result.run_id || null,
      message: "source result has a different rehearsal_label than the batch",
      blocksCompletion: true,
    }));
  }

  if (result.batch_id && input.batch_id && result.batch_id !== input.batch_id) {
    issues.push(issue({
      code: "cross_batch_record",
      severity: "blocking",
      sourceKey: result.source_key || null,
      runId: result.run_id || null,
      message: "source result has a different batch_id than the batch",
      blocksCompletion: true,
    }));
  }

  if (result.status === "failed") {
    issues.push(issue({
      code: "source_failed",
      severity: "warning",
      sourceKey: result.source_key,
      runId: result.run_id,
      message: "source result failed",
      blocksCompletion: false,
    }));
  }

  if (result.status === "timeout") {
    issues.push(issue({
      code: "source_timeout",
      severity: "warning",
      sourceKey: result.source_key,
      runId: result.run_id,
      message: "source result timed out",
      blocksCompletion: false,
    }));
  }

  if (result.status === "partial") {
    issues.push(issue({
      code: "source_partial",
      severity: "blocking",
      sourceKey: result.source_key,
      runId: result.run_id,
      message: "source result is partial",
      blocksCompletion: true,
    }));
  }

  if (result.status === "blocked") {
    issues.push(issue({
      code: "source_blocked",
      severity: "warning",
      sourceKey: result.source_key,
      runId: result.run_id,
      message: "source result is blocked",
      blocksCompletion: false,
    }));
  }

  if (result.status === "zero_match_observed") {
    issues.push(issue({
      code: "zero_match_observed",
      severity: "info",
      sourceKey: result.source_key,
      runId: result.run_id,
      message: "zero-match is an observation for this run, not proof that no scholarship notice exists",
      blocksCompletion: false,
    }));
  }

  if (result.candidate_counts.needs_review > 0) {
    issues.push(issue({
      code: "candidate_review_backlog",
      severity: "warning",
      sourceKey: result.source_key,
      runId: result.run_id,
      message: "source result contains candidates requiring review",
      blocksCompletion: false,
    }));
  }

  if (result.candidate_counts.blocked > 0) {
    issues.push(issue({
      code: "candidate_blocked",
      severity: "warning",
      sourceKey: result.source_key,
      runId: result.run_id,
      message: "source result contains blocked candidates",
      blocksCompletion: false,
    }));
  }

  if (result.matched_item_count != null && result.candidate_count > result.matched_item_count) {
    issues.push(issue({
      code: "count_mismatch",
      severity: "blocking",
      sourceKey: result.source_key,
      runId: result.run_id,
      message: "candidate count exceeds matched item count",
      blocksCompletion: true,
    }));
  }

  if (result.source_key && !expectedKeys.has(result.source_key)) {
    issues.push(issue({
      code: "cross_batch_record",
      severity: "blocking",
      sourceKey: result.source_key,
      runId: result.run_id,
      message: "source result is not in expected_source_keys",
      blocksCompletion: true,
    }));
  }
}

function buildIssues(input, results, expectedSourceKeys) {
  const issues = [];
  const expectedKeys = new Set(expectedSourceKeys);
  if (!input.rehearsal_label && !input.batch_id) {
    issues.push(issue({
      code: "invalid_batch_identity",
      severity: "blocking",
      message: "batch requires rehearsal_label or batch_id",
      blocksCompletion: true,
    }));
  }

  if (expectedSourceKeys.length === 0 && results.length === 0) {
    issues.push(issue({
      code: "empty_batch",
      severity: "blocking",
      message: "batch has no expected sources and no observed source results",
      blocksCompletion: true,
    }));
  }

  const observedKeys = unique(results.map((row) => row.source_key));
  const observedSet = new Set(observedKeys);
  for (const key of expectedSourceKeys) {
    if (!observedSet.has(key)) {
      issues.push(issue({
        code: "missing_expected_source_result",
        severity: "blocking",
        sourceKey: key,
        message: "expected source has no observed source result",
        blocksCompletion: true,
      }));
    }
  }

  const bySource = groupBySource(results);
  for (const [sourceKey, bucket] of bySource.entries()) {
    if (bucket.length > 1) {
      const allSame = bucket.every((row) => sameOperationalResult(row, bucket[0]));
      issues.push(issue({
        code: allSame ? "duplicate_source_result" : "conflicting_source_result",
        severity: allSame ? "warning" : "blocking",
        sourceKey,
        runId: unique(bucket.map((row) => row.run_id)).join(","),
        message: allSame
          ? "duplicate source result has equivalent operational content"
          : "duplicate source result has conflicting operational content",
        blocksCompletion: !allSame,
      }));
    }
  }

  for (const result of results) {
    validateResult(result, input, expectedKeys, issues);
  }

  return sortIssues(issues);
}

function summarizeSource(sourceKey, rows, issuesForSource) {
  const sortedRows = rows.sort((a, b) => a.run_id.localeCompare(b.run_id));
  const counts = sortedRows.reduce((acc, row) => {
    acc.crawled_item_count += Math.max(0, row.crawled_item_count ?? 0);
    acc.matched_item_count += Math.max(0, row.matched_item_count ?? 0);
    acc.candidate_counts.clean += Math.max(0, row.candidate_counts.clean);
    acc.candidate_counts.needs_review += Math.max(0, row.candidate_counts.needs_review);
    acc.candidate_counts.blocked += Math.max(0, row.candidate_counts.blocked);
    return acc;
  }, {
    crawled_item_count: 0,
    matched_item_count: 0,
    candidate_counts: { clean: 0, needs_review: 0, blocked: 0 },
  });
  const statuses = unique(sortedRows.map((row) => row.status));
  const blocking = issuesForSource.some((item) => item.blocks_completion);
  const manualReview = issuesForSource.some((item) =>
    item.code === "candidate_review_backlog" ||
    item.code === "candidate_blocked" ||
    item.severity === "blocking",
  );
  const resolved = sortedRows.find((row) => row.source_resolution_status === "resolved");
  return {
    source_key: sourceKey,
    source_id: resolved?.source_id ?? sortedRows[0]?.source_id ?? null,
    source_resolution_status: sortedRows[0]?.source_resolution_status ?? "missing",
    run_ids: unique(sortedRows.map((row) => row.run_id)),
    source_result_status: statuses.length === 1 ? statuses[0] : "conflicting",
    operational_status: blocking ? "blocked" :
      statuses.some((status) => ["failed", "timeout", "blocked"].includes(status)) ? "degraded" :
        statuses.includes("partial") ? "incomplete" : "complete",
    crawled_item_count: counts.crawled_item_count,
    matched_item_count: counts.matched_item_count,
    candidate_counts: counts.candidate_counts,
    issue_codes: unique(issuesForSource.map((item) => item.code)),
    complete: !blocking && !statuses.includes("partial"),
    manual_review_required: manualReview,
  };
}

function buildSourceSummaries(expectedSourceKeys, results, issues) {
  const bySource = groupBySource(results);
  for (const sourceKey of expectedSourceKeys) {
    if (!bySource.has(sourceKey)) bySource.set(sourceKey, []);
  }
  return [...bySource.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sourceKey, rows]) => summarizeSource(
      sourceKey,
      rows,
      issues.filter((item) => item.source_key === sourceKey),
    ));
}

function buildMetrics(expectedSourceKeys, results, sourceSummaries, issues) {
  const statusSourceCounts = {
    success_source_count: 0,
    zero_match_observed_source_count: 0,
    failed_source_count: 0,
    timeout_source_count: 0,
    partial_source_count: 0,
    blocked_source_count: 0,
  };
  for (const summary of sourceSummaries) {
    if (summary.source_result_status === "success") statusSourceCounts.success_source_count += 1;
    if (summary.source_result_status === "zero_match_observed") {
      statusSourceCounts.zero_match_observed_source_count += 1;
    }
    if (summary.source_result_status === "failed") statusSourceCounts.failed_source_count += 1;
    if (summary.source_result_status === "timeout") statusSourceCounts.timeout_source_count += 1;
    if (summary.source_result_status === "partial") statusSourceCounts.partial_source_count += 1;
    if (summary.source_result_status === "blocked") statusSourceCounts.blocked_source_count += 1;
  }

  const candidateCounts = results.reduce((acc, row) => {
    acc.clean_candidate_count += Math.max(0, row.candidate_counts.clean);
    acc.needs_review_candidate_count += Math.max(0, row.candidate_counts.needs_review);
    acc.blocked_candidate_count += Math.max(0, row.candidate_counts.blocked);
    acc.crawled_item_count += Math.max(0, row.crawled_item_count ?? 0);
    acc.matched_item_count += Math.max(0, row.matched_item_count ?? 0);
    return acc;
  }, {
    crawled_item_count: 0,
    matched_item_count: 0,
    clean_candidate_count: 0,
    needs_review_candidate_count: 0,
    blocked_candidate_count: 0,
  });

  const missingExpected = issues.filter((item) => item.code === "missing_expected_source_result").length;
  return {
    expected_source_count: expectedSourceKeys.length,
    observed_unique_source_count: unique(results.map((row) => row.source_key)).length,
    run_count: unique(results.map((row) => row.run_id)).length,
    source_result_count: results.length,
    ...statusSourceCounts,
    crawled_item_count: candidateCounts.crawled_item_count,
    matched_item_count: candidateCounts.matched_item_count,
    candidate_count:
      candidateCounts.clean_candidate_count +
      candidateCounts.needs_review_candidate_count +
      candidateCounts.blocked_candidate_count,
    clean_candidate_count: candidateCounts.clean_candidate_count,
    needs_review_candidate_count: candidateCounts.needs_review_candidate_count,
    blocked_candidate_count: candidateCounts.blocked_candidate_count,
    missing_expected_source_count: missingExpected,
    duplicate_source_result_count: issues.filter((item) => item.code === "duplicate_source_result").length,
    conflicting_source_result_count: issues.filter((item) => item.code === "conflicting_source_result").length,
    unresolved_source_count: issues.filter((item) => item.code === "unresolved_source_identity").length,
    ambiguous_source_count: issues.filter((item) => item.code === "ambiguous_source_identity").length,
    cross_batch_record_count: issues.filter((item) => item.code === "cross_batch_record").length,
    issue_count: issues.length,
  };
}

function arithmeticConsistent(metrics, sourceSummaries) {
  const candidateOk =
    metrics.clean_candidate_count +
    metrics.needs_review_candidate_count +
    metrics.blocked_candidate_count === metrics.candidate_count;
  const statusOk =
    metrics.success_source_count +
    metrics.zero_match_observed_source_count +
    metrics.failed_source_count +
    metrics.timeout_source_count +
    metrics.partial_source_count +
    metrics.blocked_source_count <= metrics.observed_unique_source_count;
  const missingOk = metrics.missing_expected_source_count === sourceSummaries.filter((row) =>
    row.run_ids.length === 0,
  ).length;
  const nonNegative = Object.values(metrics).every((value) =>
    typeof value !== "number" || (Number.isInteger(value) && value >= 0),
  );
  return candidateOk && statusOk && missingOk && nonNegative;
}

function batchStatusFrom({ issues, metrics }) {
  let status = "healthy";
  if (issues.some((item) => item.severity === "blocking" && [
    "invalid_batch_identity",
    "unresolved_source_identity",
    "ambiguous_source_identity",
    "conflicting_source_result",
    "cross_batch_record",
    "unknown_status",
    "invalid_count",
  ].includes(item.code))) {
    status = maxStatus(status, "blocked");
  }
  if (issues.some((item) => item.code === "empty_batch")) status = maxStatus(status, "incomplete");
  if (issues.some((item) => [
    "missing_expected_source_result",
    "source_partial",
    "count_mismatch",
  ].includes(item.code))) {
    status = maxStatus(status, "incomplete");
  }
  if (metrics.failed_source_count || metrics.timeout_source_count || metrics.blocked_source_count ||
      metrics.needs_review_candidate_count || metrics.blocked_candidate_count) {
    status = maxStatus(status, "degraded");
  }
  return status;
}

function buildCompletion({ batchStatus, metrics, issues }) {
  const expectedSourcesComplete = metrics.missing_expected_source_count === 0;
  const sourceResultsComplete = expectedSourcesComplete &&
    !issues.some((item) => ["source_partial", "count_mismatch", "empty_batch"].includes(item.code));
  const countsConsistent = metrics.arithmetic_consistency_valid;
  const sourceIdentityComplete = metrics.unresolved_source_count === 0 && metrics.ambiguous_source_count === 0;
  return {
    expected_sources_complete: expectedSourcesComplete,
    source_results_complete: sourceResultsComplete,
    counts_consistent: countsConsistent,
    source_identity_complete: sourceIdentityComplete,
    safe_to_mark_batch_complete:
      ["healthy", "degraded"].includes(batchStatus) &&
      sourceResultsComplete &&
      countsConsistent &&
      sourceIdentityComplete &&
      !issues.some((item) => item.blocks_completion),
    safe_to_claim_source_exhaustion: false,
  };
}

export function buildCrawlerBatchObservability(input, options = {}) {
  const sourceIndex = buildSourceIdentityIndex({
    sourceCsvPath: options.sourceCsvPath ?? DEFAULT_SOURCES,
    mappingSnapshotPath: options.mappingSnapshotPath ?? DEFAULT_MAPPING_SNAPSHOT,
  });
  const expectedSourceKeys = unique(toArray(input.expected_source_keys));
  const results = toArray(input.source_results).map((row) => normalizeResult(row, sourceIndex));
  const issues = buildIssues(input, results, expectedSourceKeys);
  const sourceSummaries = buildSourceSummaries(expectedSourceKeys, results, issues);
  const metricsBase = buildMetrics(expectedSourceKeys, results, sourceSummaries, issues);
  const arithmeticValid = arithmeticConsistent(metricsBase, sourceSummaries);
  const metrics = {
    ...metricsBase,
    arithmetic_consistency_valid: arithmeticValid,
  };
  const batchStatus = batchStatusFrom({ issues, metrics });
  const completion = buildCompletion({ batchStatus, metrics, issues });
  const runIds = unique(results.map((row) => row.run_id));
  const sourceIds = unique(sourceSummaries.map((row) => row.source_id));
  const canonicalKeys = unique(results.flatMap((row) => row.canonical_keys));

  return {
    schema_version: "post-phase-e/v1",
    generated_at: options.generatedAt ?? input.generated_at ?? new Date().toISOString(),
    input: {
      fixture_name: cleanText(input.fixture_name) || null,
      input_path: options.inputPath ? repoRelativePath(options.inputPath) : null,
    },
    read_only: true,
    db_access: false,
    db_write: false,
    crawler_execution: false,
    destructive_action: false,
    sql_generation: false,
    batch_identity: {
      rehearsal_label: cleanText(input.rehearsal_label) || null,
      batch_id: cleanText(input.batch_id) || null,
      run_ids: runIds,
      expected_source_keys: expectedSourceKeys,
      observed_source_keys: unique(results.map((row) => row.source_key)),
      resolved_source_ids: sourceIds,
    },
    batch_status: batchStatus,
    completion,
    metrics,
    source_summaries: sourceSummaries,
    issues,
    rollback_scope_evidence: {
      rehearsal_label: cleanText(input.rehearsal_label) || null,
      batch_id: cleanText(input.batch_id) || null,
      run_ids: runIds,
      source_keys: unique([...expectedSourceKeys, ...results.map((row) => row.source_key)]),
      source_ids: sourceIds,
      canonical_keys: canonicalKeys,
      evidence_complete: completion.source_results_complete && completion.source_identity_complete,
      destructive_action_authorized: false,
    },
    zero_match_policy: {
      observation_only: true,
      absence_proof: false,
      safe_to_claim_source_exhaustion: false,
    },
    required_output_fields_present: REQUIRED_TOP_LEVEL_FIELDS.every((field) =>
      Object.prototype.hasOwnProperty.call({
        schema_version: true,
        generated_at: true,
        read_only: true,
        db_access: true,
        db_write: true,
        crawler_execution: true,
        batch_identity: true,
        batch_status: true,
        completion: true,
        metrics: true,
        source_summaries: true,
        issues: true,
        rollback_scope_evidence: true,
      }, field),
    ),
    limitations: [
      "synthetic local fixture evidence only",
      "not a live crawler run aggregate",
      "no live DB state or production observability readiness is proven",
      "zero-match is not absence proof",
      "no DB-level batch table, API route, UI, alerting, or cleanup execution is implemented",
    ],
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = args.input ?? DEFAULT_INPUT;
  const outputPath = args.output ?? DEFAULT_OUTPUT;
  const input = readJson(inputPath);
  const report = buildCrawlerBatchObservability(input, {
    inputPath,
    generatedAt: args["generated-at"],
    sourceCsvPath: args.sources ?? DEFAULT_SOURCES,
    mappingSnapshotPath: args["mapping-snapshot"] ?? DEFAULT_MAPPING_SNAPSHOT,
  });
  writeJson(outputPath, report);
  console.log(`batch_observability_report=${path.resolve(outputPath)}`);
  console.log(`batch_status=${report.batch_status}`);
  console.log(`expected_source_count=${report.metrics.expected_source_count}`);
  console.log(`observed_unique_source_count=${report.metrics.observed_unique_source_count}`);
  console.log(`issue_count=${report.metrics.issue_count}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
