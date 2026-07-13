import fs from "node:fs";
import path from "node:path";
import { buildReviewBacklogQualityFoundation } from "./build-review-backlog-quality-foundation.mjs";

const FIXTURE_DIRECTORY = "fixtures/post-phase-bc";
const FIXTURE_NAMES = [
  "clean-candidate.json",
  "duplicate-review-candidate.json",
  "quality-review-short-body.json",
  "no-assets-text-sufficient.json",
  "image-only-suspected.json",
  "blocked-missing-source.json",
  "blocked-invalid-date.json",
  "zero-match-observed-source.json",
  "mixed-review-batch.json",
];
const JSON_REPORT = "reports/post-phase-bc-review-quality-foundation.json";
const VALIDATION_JSON = "reports/post-phase-bc-validation-report.json";
const VALIDATION_MARKDOWN = "reports/post-phase-bc-validation-report.md";
const GENERATED_AT = "2026-07-13T00:00:00.000Z";

const REQUIRED_FIELDS = [
  "source_id", "source_key_snapshot", "canonical_key", "title", "original_url",
  "normalized_url", "published_at", "body_text", "body_text_length", "has_assets",
  "asset_count", "no_assets", "body_quality", "image_only_suspected",
  "attachment_required_unknown", "quality_reason_codes", "quality_review_required",
  "duplicate_status", "classification_status", "review_status", "blocker_status",
  "quality_status", "status", "reason_code", "severity", "is_auto_apply_allowed",
  "requires_admin_review", "is_blocking", "recommended_action", "target_summary",
  "keyword_summary", "evidence_json", "latest_run_id", "latest_batch_label",
  "created_at", "updated_at",
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function writeJson(filePath, value) {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(filePath, value) {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, value, "utf8");
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function repoRelative(filePath) {
  return path.relative(process.cwd(), path.resolve(filePath)).split(path.sep).join("/");
}

function rowsHaveSchema(rows) {
  return rows.every((row) => REQUIRED_FIELDS.every((field) => Object.hasOwn(row, field)));
}

function expectedCountsMatch(input, report) {
  return Object.entries(input.expected_counts ?? {}).every(([key, value]) => report.counts[key] === value);
}

function collectSafetyTests(rows) {
  return [
    {
      name: "blocked rows never allow auto apply",
      pass: rows.filter((row) => row.is_blocking).every((row) => row.is_auto_apply_allowed === false),
    },
    {
      name: "duplicate and quality review rows never allow auto apply",
      pass: rows.filter((row) => ["duplicate_review", "quality_review"].includes(row.classification_status))
        .every((row) => row.is_auto_apply_allowed === false),
    },
    {
      name: "no-assets text-sufficient rows are not blockers",
      pass: rows.filter((row) => row.classification_status === "no_assets_text_sufficient")
        .every((row) => row.is_blocking === false),
    },
    {
      name: "image-only suspected rows require review",
      pass: rows.filter((row) => row.classification_status === "image_only_suspected")
        .every((row) => row.requires_admin_review === true),
    },
    {
      name: "zero-match is not expressed as source exhaustion proof",
      pass: rows.filter((row) => row.classification_status === "zero_match_observed")
        .every((row) => /not a source-exhaustion|not a source-exhaustion or scholarship-absence proof/i
          .test(String(row.evidence_json.policy_note))),
    },
  ];
}

function arithmeticConsistent(report) {
  const rows = report.review_backlog;
  return report.counts.candidate_count === rows.length &&
    report.counts.blocked_count === rows.filter((row) => row.is_blocking).length &&
    report.counts.admin_review_required_count === rows.filter((row) => row.requires_admin_review).length &&
    report.counts.auto_apply_allowed_count === rows.filter((row) => row.is_auto_apply_allowed).length &&
    report.counts.no_assets_count === rows.filter((row) => row.no_assets).length;
}

function aggregateFixtureReports(fixtureReports) {
  const reviewBacklog = fixtureReports.flatMap((item) => item.report.review_backlog);
  const counts = fixtureReports.reduce((total, item) => {
    for (const [key, value] of Object.entries(item.report.counts)) {
      total[key] = (total[key] ?? 0) + value;
    }
    return total;
  }, {});
  return {
    generated_at: GENERATED_AT,
    contract_version: "post-phase-bc-review-quality-foundation/v1",
    read_only: true,
    db_access: false,
    db_write: false,
    migration: false,
    crawler_execution: false,
    destructive_action: false,
    fixture_name: "post-phase-bc-fixture-aggregate",
    counts,
    review_backlog: reviewBacklog,
  };
}

function markdown(report) {
  const lines = [
    "# Post-Phase B/C Review Quality Foundation Validation",
    "",
    `Generated at: ${report.generated_at}`,
    "",
    "## Status",
    "",
    report.status,
    "",
    "## Metrics",
    "",
    ...Object.entries(report.metrics).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## Tests",
    "",
    ...report.tests.map((test) => `- ${test.pass ? "PASS" : "FAIL"}: ${test.name}`),
    "",
    "## Safety",
    "",
    ...Object.entries(report.safety).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## Limitations",
    "",
    "- This is a fixture-backed, read-only policy foundation; it does not read or write the DB.",
    "- `zero_match_observed` records a source-run observation only; it does not establish source exhaustion or scholarship absence.",
    "- An explicit source-key mapping remains necessary if crawler `source_key` and canonical `notice_sources.source_id` diverge.",
  ];
  return `${lines.join("\n")}\n`;
}

function main() {
  const fixtureReports = FIXTURE_NAMES.map((name) => {
    const fixturePath = path.join(FIXTURE_DIRECTORY, name);
    const input = readJson(fixturePath);
    const first = buildReviewBacklogQualityFoundation(input, { generatedAt: input.generated_at ?? GENERATED_AT });
    const second = buildReviewBacklogQualityFoundation(input, { generatedAt: input.generated_at ?? GENERATED_AT });
    return {
      fixture: repoRelative(fixturePath),
      report: first,
      deterministic: stableStringify(first) === stableStringify(second),
      expected_counts_match: expectedCountsMatch(input, first),
      output_schema_valid: rowsHaveSchema(first.review_backlog),
      arithmetic_consistency_valid: arithmeticConsistent(first),
    };
  });

  const aggregate = aggregateFixtureReports(fixtureReports);
  const aggregateRows = aggregate.review_backlog;

  const tests = [
    ...fixtureReports.map((item) => ({
      name: `${item.fixture} expected classification counts`,
      pass: item.expected_counts_match,
    })),
    { name: "all fixture outputs satisfy review read-model schema", pass: fixtureReports.every((item) => item.output_schema_valid) },
    { name: "all fixture outputs satisfy arithmetic consistency", pass: fixtureReports.every((item) => item.arithmetic_consistency_valid) },
    { name: "review read-model semantic output is deterministic for every fixture", pass: fixtureReports.every((item) => item.deterministic) },
    ...collectSafetyTests(aggregateRows),
    {
      name: "foundation runtime performs no DB access, write, migration, crawler execution, or destructive action",
      pass: fixtureReports.every((item) => item.report.db_access === false && item.report.db_write === false &&
        item.report.migration === false && item.report.crawler_execution === false && item.report.destructive_action === false),
    },
  ];
  const pass = tests.every((test) => test.pass);
  const metrics = {
    fixture_count: FIXTURE_NAMES.length,
    clean_count: aggregate.counts.clean_count,
    duplicate_review_count: aggregate.counts.duplicate_review_count,
    quality_review_count: aggregate.counts.quality_review_count,
    blocked_count: aggregate.counts.blocked_count,
    no_assets_count: aggregate.counts.no_assets_count,
    image_only_suspected_count: aggregate.counts.image_only_suspected_count,
    zero_match_observed_count: aggregate.counts.zero_match_observed_count,
    admin_review_required_count: aggregate.counts.admin_review_required_count,
    auto_apply_allowed_count: aggregate.counts.auto_apply_allowed_count,
    read_model_deterministic_rerun_match: fixtureReports.every((item) => item.deterministic),
    output_schema_valid: fixtureReports.every((item) => item.output_schema_valid),
    arithmetic_consistency_valid: fixtureReports.every((item) => item.arithmetic_consistency_valid),
  };
  const validation = {
    generated_at: GENERATED_AT,
    status: pass ? "PASS" : "HOLD",
    inputs: FIXTURE_NAMES.map((name) => `${FIXTURE_DIRECTORY}/${name}`),
    metrics,
    tests,
    safety: {
      db_access: false,
      db_write: false,
      supabase_access: false,
      migration: false,
      crawler_execution: false,
      destructive_action: false,
      admin_ui_modified: false,
      workflow_or_package_modified: false,
    },
  };

  writeJson(JSON_REPORT, aggregate);
  writeJson(VALIDATION_JSON, validation);
  writeText(VALIDATION_MARKDOWN, markdown(validation));
  console.log(`status=${validation.status}`);
  console.log(`json_report=${repoRelative(VALIDATION_JSON)}`);
  console.log(`markdown_report=${repoRelative(VALIDATION_MARKDOWN)}`);
  for (const [key, value] of Object.entries(metrics)) console.log(`${key}=${value}`);
  if (!pass) process.exitCode = 1;
}

main();
