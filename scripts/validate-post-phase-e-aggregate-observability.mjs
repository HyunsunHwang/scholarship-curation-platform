import fs from "node:fs";
import path from "node:path";
import { buildCrawlerBatchObservability } from "./build-crawler-batch-observability.mjs";

const FIXTURE_DIR = "fixtures/post-phase-e";
const DEFAULT_FIXTURES = [
  "healthy-batch.json",
  "mixed-outcome-batch.json",
  "partial-batch.json",
  "conflicting-duplicate-result.json",
  "unresolved-source-batch.json",
  "cross-batch-contamination.json",
  "empty-batch.json",
];
const DEFAULT_JSON_REPORT = "reports/post-phase-e-validation-report.json";
const DEFAULT_MD_REPORT = "reports/post-phase-e-validation-report.md";
const DEFAULT_SAMPLE_REPORT = "reports/post-phase-e-batch-observability.json";
const GENERATED_AT = "2026-07-13T00:00:00.000Z";

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

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableStringify(value[key])}`,
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function withoutGeneratedAt(report) {
  return {
    ...report,
    generated_at: "<ignored>",
  };
}

function issuesInclude(report, code) {
  return report.issues.some((issue) => issue.code === code);
}

function hasRequiredOutputSchema(report) {
  return [
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
  ].every((field) => Object.prototype.hasOwnProperty.call(report, field));
}

function arraysStable(report) {
  const sourceKeys = report.source_summaries.map((row) => row.source_key);
  const issueKeys = report.issues.map((row) =>
    `${row.code}|${row.source_key ?? ""}|${row.run_id ?? ""}|${row.message}`,
  );
  return stableStringify(sourceKeys) === stableStringify([...sourceKeys].sort()) &&
    stableStringify(issueKeys) === stableStringify([...issueKeys].sort());
}

function buildSynthetic(base, mutate) {
  return mutate(JSON.parse(JSON.stringify(base)));
}

function collectTests({ plansByName, synthetic }) {
  const healthy = plansByName.get("healthy-batch");
  const mixed = plansByName.get("mixed-outcome-batch");
  const partial = plansByName.get("partial-batch");
  const conflict = plansByName.get("conflicting-duplicate-result");
  const unresolved = plansByName.get("unresolved-source-batch");
  const cross = plansByName.get("cross-batch-contamination");
  const empty = plansByName.get("empty-batch");

  return [
    {
      name: "healthy batch is classified as healthy",
      pass: healthy.batch_status === "healthy",
    },
    {
      name: "complete healthy batch can be marked complete",
      pass: healthy.completion.safe_to_mark_batch_complete === true,
    },
    {
      name: "zero-match is an observation, not absence proof",
      pass: issuesInclude(mixed, "zero_match_observed") &&
        mixed.zero_match_policy.absence_proof === false &&
        mixed.completion.safe_to_claim_source_exhaustion === false,
    },
    {
      name: "mixed complete outcomes are degraded, not healthy",
      pass: mixed.batch_status === "degraded" &&
        mixed.completion.source_results_complete === true,
    },
    {
      name: "missing expected source result makes batch incomplete",
      pass: partial.batch_status === "incomplete" &&
        issuesInclude(partial, "missing_expected_source_result"),
    },
    {
      name: "partial result makes batch incomplete",
      pass: partial.batch_status === "incomplete" &&
        issuesInclude(partial, "source_partial"),
    },
    {
      name: "conflicting duplicate makes batch blocked",
      pass: conflict.batch_status === "blocked" &&
        issuesInclude(conflict, "conflicting_source_result"),
    },
    {
      name: "unresolved source identity makes batch blocked",
      pass: unresolved.batch_status === "blocked" &&
        issuesInclude(unresolved, "unresolved_source_identity"),
    },
    {
      name: "ambiguous source identity makes batch blocked",
      pass: unresolved.batch_status === "blocked" &&
        issuesInclude(unresolved, "ambiguous_source_identity"),
    },
    {
      name: "cross-batch record makes batch blocked",
      pass: cross.batch_status === "blocked" &&
        issuesInclude(cross, "cross_batch_record"),
    },
    {
      name: "empty batch is no-op/review, not healthy",
      pass: empty.batch_status === "incomplete" &&
        issuesInclude(empty, "empty_batch") &&
        empty.completion.safe_to_mark_batch_complete === false,
    },
    {
      name: "source result counts reconcile with unique source counts",
      pass: [...plansByName.values()].every((report) =>
        report.metrics.source_result_count >= report.metrics.observed_unique_source_count,
      ),
    },
    {
      name: "candidate sub-counts reconcile with candidate total",
      pass: [...plansByName.values()].every((report) =>
        report.metrics.clean_candidate_count +
          report.metrics.needs_review_candidate_count +
          report.metrics.blocked_candidate_count === report.metrics.candidate_count,
      ),
    },
    {
      name: "negative counts are rejected or blocked",
      pass: synthetic.negative.batch_status === "blocked" &&
        issuesInclude(synthetic.negative, "invalid_count"),
    },
    {
      name: "unknown statuses fail closed",
      pass: synthetic.unknown.batch_status === "blocked" &&
        issuesInclude(synthetic.unknown, "unknown_status"),
    },
    {
      name: "source rows are not modified or created",
      pass: [...plansByName.values()].every((report) =>
        report.db_write === false &&
        report.rollback_scope_evidence.destructive_action_authorized === false,
      ),
    },
    {
      name: "output schema contains required fields",
      pass: [...plansByName.values()].every(hasRequiredOutputSchema),
    },
    {
      name: "same fixture produces deterministic semantic output",
      pass: stableStringify(withoutGeneratedAt(healthy)) === stableStringify(withoutGeneratedAt(
        buildCrawlerBatchObservability(readJson(path.join(FIXTURE_DIR, "healthy-batch.json")), {
          inputPath: path.join(FIXTURE_DIR, "healthy-batch.json"),
          generatedAt: GENERATED_AT,
        }),
      )),
    },
    {
      name: "output arrays have stable ordering",
      pass: [...plansByName.values()].every(arraysStable),
    },
    {
      name: "no DB access or write occurs",
      pass: [...plansByName.values()].every((report) =>
        report.db_access === false && report.db_write === false,
      ),
    },
    {
      name: "no crawler execution occurs",
      pass: [...plansByName.values()].every((report) => report.crawler_execution === false),
    },
    {
      name: "no destructive SQL or cleanup command is generated",
      pass: [...plansByName.values()].every((report) =>
        report.destructive_action === false &&
        report.sql_generation === false &&
        stableStringify(report).match(/\b(DELETE FROM|UPDATE |DROP TABLE|TRUNCATE TABLE)\b/i) == null,
      ),
    },
    {
      name: "rollback scope evidence remains read-only",
      pass: [...plansByName.values()].every((report) =>
        report.rollback_scope_evidence.destructive_action_authorized === false,
      ),
    },
    {
      name: "safe_to_claim_source_exhaustion is always false",
      pass: [...plansByName.values()].every((report) =>
        report.completion.safe_to_claim_source_exhaustion === false,
      ),
    },
  ];
}

function aggregateMetrics(plans, tests) {
  const totals = [...plans.values()].reduce((acc, report) => {
    for (const [key, value] of Object.entries(report.metrics)) {
      if (typeof value === "number") acc[key] = (acc[key] ?? 0) + value;
    }
    acc[`${report.batch_status}_batch_count`] =
      (acc[`${report.batch_status}_batch_count`] ?? 0) + 1;
    return acc;
  }, {
    healthy_batch_count: 0,
    degraded_batch_count: 0,
    incomplete_batch_count: 0,
    blocked_batch_count: 0,
  });

  return {
    fixture_count: plans.size,
    healthy_batch_count: totals.healthy_batch_count,
    degraded_batch_count: totals.degraded_batch_count,
    incomplete_batch_count: totals.incomplete_batch_count,
    blocked_batch_count: totals.blocked_batch_count,
    expected_source_count: totals.expected_source_count ?? 0,
    observed_unique_source_count: totals.observed_unique_source_count ?? 0,
    run_count: totals.run_count ?? 0,
    source_result_count: totals.source_result_count ?? 0,
    success_source_count: totals.success_source_count ?? 0,
    zero_match_observed_source_count: totals.zero_match_observed_source_count ?? 0,
    failed_source_count: totals.failed_source_count ?? 0,
    timeout_source_count: totals.timeout_source_count ?? 0,
    partial_source_count: totals.partial_source_count ?? 0,
    blocked_source_count: totals.blocked_source_count ?? 0,
    crawled_item_count: totals.crawled_item_count ?? 0,
    matched_item_count: totals.matched_item_count ?? 0,
    candidate_count: totals.candidate_count ?? 0,
    clean_candidate_count: totals.clean_candidate_count ?? 0,
    needs_review_candidate_count: totals.needs_review_candidate_count ?? 0,
    blocked_candidate_count: totals.blocked_candidate_count ?? 0,
    missing_expected_source_count: totals.missing_expected_source_count ?? 0,
    duplicate_source_result_count: totals.duplicate_source_result_count ?? 0,
    conflicting_source_result_count: totals.conflicting_source_result_count ?? 0,
    unresolved_source_count: totals.unresolved_source_count ?? 0,
    ambiguous_source_count: totals.ambiguous_source_count ?? 0,
    cross_batch_record_count: totals.cross_batch_record_count ?? 0,
    issue_count: totals.issue_count ?? 0,
    deterministic_rerun_match: tests.find((test) =>
      test.name.includes("deterministic semantic output"),
    )?.pass ?? false,
    output_schema_valid: tests.find((test) =>
      test.name.includes("required fields"),
    )?.pass ?? false,
    arithmetic_consistency_valid: [...plans.values()].every((report) =>
      report.metrics.arithmetic_consistency_valid === true,
    ),
    db_access: false,
    db_write: false,
    crawler_execution: false,
    destructive_action: false,
  };
}

function buildMarkdownReport(report) {
  const lines = [];
  lines.push("# Post-Phase E Aggregate Observability Validation Report");
  lines.push("");
  lines.push(`Generated at: ${report.generated_at}`);
  lines.push("");
  lines.push("## Status");
  lines.push("");
  lines.push(report.status);
  lines.push("");
  lines.push("## Metrics");
  lines.push("");
  for (const [key, value] of Object.entries(report.metrics)) {
    lines.push(`- ${key}: ${value}`);
  }
  lines.push("");
  lines.push("## Fixture Results");
  lines.push("");
  for (const result of report.fixture_results) {
    lines.push(`- ${result.fixture}: expected=${result.expected_batch_status}, actual=${result.actual_batch_status}, expected_sources=${result.expected_source_count}, observed_sources=${result.observed_unique_source_count}, issues=${result.issue_count}, complete=${result.safe_to_mark_batch_complete}, ${result.pass ? "PASS" : "FAIL"}`);
  }
  lines.push("");
  lines.push("## Tests");
  lines.push("");
  for (const test of report.tests) {
    lines.push(`- ${test.pass ? "PASS" : "FAIL"}: ${test.name}`);
  }
  lines.push("");
  lines.push("## Limitations");
  lines.push("");
  for (const limitation of report.limitations) {
    lines.push(`- ${limitation}`);
  }
  return `${lines.join("\n")}\n`;
}

function buildReport({ fixturePaths, generatedAt }) {
  const plans = new Map();
  for (const fixturePath of fixturePaths) {
    const input = readJson(fixturePath);
    plans.set(path.basename(fixturePath, ".json"), buildCrawlerBatchObservability(input, {
      inputPath: fixturePath,
      generatedAt,
    }));
  }

  const healthyInput = readJson(path.join(FIXTURE_DIR, "healthy-batch.json"));
  const synthetic = {
    negative: buildCrawlerBatchObservability(buildSynthetic(healthyInput, (input) => {
      input.fixture_name = "synthetic-negative-count";
      input.source_results[0].crawled_item_count = -1;
      return input;
    }), { generatedAt }),
    unknown: buildCrawlerBatchObservability(buildSynthetic(healthyInput, (input) => {
      input.fixture_name = "synthetic-unknown-status";
      input.source_results[0].status = "mystery";
      return input;
    }), { generatedAt }),
  };

  const tests = collectTests({ plansByName: plans, synthetic });
  const fixtureResults = [...plans.entries()].map(([fixture, report]) => {
    const input = readJson(path.join(FIXTURE_DIR, `${fixture}.json`));
    return {
      fixture,
      expected_batch_status: input.expected_batch_status,
      actual_batch_status: report.batch_status,
      expected_source_count: report.metrics.expected_source_count,
      observed_unique_source_count: report.metrics.observed_unique_source_count,
      issue_count: report.metrics.issue_count,
      safe_to_mark_batch_complete: report.completion.safe_to_mark_batch_complete,
      pass: input.expected_batch_status === report.batch_status,
    };
  });
  const pass = tests.every((test) => test.pass) && fixtureResults.every((result) => result.pass);

  return {
    generated_at: generatedAt,
    status: pass ? "PASS" : "HOLD",
    read_only: true,
    db_access: false,
    db_write: false,
    crawler_execution: false,
    destructive_action: false,
    inputs: {
      fixtures: fixturePaths.map(repoRelativePath),
    },
    metrics: aggregateMetrics(plans, tests),
    fixture_results: fixtureResults,
    tests,
    sample_summary_report: plans.get("mixed-outcome-batch"),
    plans: [...plans.values()],
    limitations: [
      "synthetic local fixture based validation only",
      "not a live crawler run aggregate",
      "live DB state and live row counts are not verified",
      "production observability readiness is not proven",
      "zero-match is an observation, not absence proof",
      "no DB-level batch table, API route, UI, alerting, or cleanup execution is implemented",
      "Post-Phase D destructive execution remains unauthorized",
    ],
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fixturePaths = DEFAULT_FIXTURES.map((name) => path.join(FIXTURE_DIR, name));
  const generatedAt = args["generated-at"] ?? GENERATED_AT;
  const report = buildReport({ fixturePaths, generatedAt });

  writeJson(args.output ?? DEFAULT_JSON_REPORT, report);
  fs.writeFileSync(
    path.resolve(args.markdown ?? DEFAULT_MD_REPORT),
    buildMarkdownReport(report),
    "utf8",
  );
  writeJson(args.sample ?? DEFAULT_SAMPLE_REPORT, report.sample_summary_report);

  console.log(`status=${report.status}`);
  console.log(`json_report=${path.resolve(args.output ?? DEFAULT_JSON_REPORT)}`);
  console.log(`markdown_report=${path.resolve(args.markdown ?? DEFAULT_MD_REPORT)}`);
  console.log(`sample_report=${path.resolve(args.sample ?? DEFAULT_SAMPLE_REPORT)}`);
  for (const [key, value] of Object.entries(report.metrics)) {
    console.log(`${key}=${value}`);
  }
  if (report.status !== "PASS") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
