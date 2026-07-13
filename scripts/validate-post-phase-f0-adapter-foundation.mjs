import fs from "node:fs";
import path from "node:path";
import { buildAdapterBackedReviewReadModel } from "./build-adapter-backed-review-read-model.mjs";

const FIXTURE_DIRECTORY = "fixtures/post-phase-f0";
const FIXTURE_NAMES = [
  "resolved-clean-candidate.json",
  "resolved-no-assets-text-sufficient.json",
  "resolved-duplicate-review.json",
  "resolved-quality-review.json",
  "unresolved-source-candidate.json",
  "ambiguous-source-candidate.json",
  "missing-source-key-candidate.json",
  "image-only-suspected-candidate.json",
  "zero-match-observed-source.json",
  "batch-incomplete-warning.json",
  "mixed-adapter-batch.json",
];
const GENERATED_AT = "2026-07-13T00:00:00.000Z";
const FOUNDATION_REPORT = "reports/post-phase-f0-adapter-foundation.json";
const VALIDATION_JSON = "reports/post-phase-f0-validation-report.json";
const VALIDATION_MARKDOWN = "reports/post-phase-f0-validation-report.md";

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

function expectedCountsMatch(input, report) {
  return Object.entries(input.expected_counts ?? {}).every(([key, value]) => report.counts[key] === value);
}

function schemaValid(report) {
  return report.review_read_model.every((row) =>
    report.required_output_fields.every((field) => Object.hasOwn(row, field)),
  );
}

function arithmeticValid(report) {
  const rows = report.review_read_model;
  return report.counts.candidate_count === rows.length &&
    report.counts.resolved_source_count === rows.filter((row) => row.source_resolution_status === "resolved").length &&
    report.counts.unresolved_source_count === rows.filter((row) => row.source_resolution_status === "unresolved").length &&
    report.counts.ambiguous_source_count === rows.filter((row) => row.source_resolution_status === "ambiguous").length &&
    report.counts.missing_source_key_count === rows.filter((row) => row.source_resolution_status === "missing_source_key").length &&
    report.counts.inactive_source_count === rows.filter((row) => row.source_resolution_status === "inactive_source").length &&
    report.counts.source_key_alias_required_count === rows.filter((row) => row.source_resolution_status === "source_key_alias_required").length &&
    report.counts.blocked_count === rows.filter((row) => row.review_status === "blocked").length &&
    report.counts.auto_apply_allowed_count === rows.filter((row) => row.auto_apply_allowed).length;
}

function aggregateReports(fixtureReports) {
  const counts = fixtureReports.reduce((total, item) => {
    for (const [key, value] of Object.entries(item.report.counts)) {
      total[key] = (total[key] ?? 0) + value;
    }
    return total;
  }, {});
  return {
    generated_at: GENERATED_AT,
    contract_version: "post-phase-f0-adapter-foundation/v1",
    read_only: true,
    db_access: false,
    db_write: false,
    migration: false,
    crawler_execution: false,
    destructive_action: false,
    fixture_name: "post-phase-f0-fixture-aggregate",
    source_identity_policy: fixtureReports[0].report.source_identity_policy,
    counts,
    review_read_model: fixtureReports.flatMap((item) => item.report.review_read_model),
    required_output_fields: fixtureReports[0].report.required_output_fields,
  };
}

function policyTests(rows) {
  const nonResolved = rows.filter((row) => row.source_resolution_status !== "resolved");
  return [
    {
      name: "unresolved, ambiguous, missing, inactive, and alias-required source rows fail closed",
      pass: nonResolved.length > 0 && nonResolved.every((row) => row.auto_apply_allowed === false && row.review_status === "blocked"),
    },
    {
      name: "duplicate review rows never auto apply",
      pass: rows.filter((row) => row.duplicate_status !== "unique").every((row) => row.auto_apply_allowed === false),
    },
    {
      name: "quality review rows never auto apply",
      pass: rows.filter((row) => ["short_body_needs_review", "empty_or_missing_body", "attachment_required_unknown"].includes(row.body_quality))
        .every((row) => row.auto_apply_allowed === false),
    },
    {
      name: "blocked rows never auto apply",
      pass: rows.filter((row) => row.review_status === "blocked").every((row) => row.auto_apply_allowed === false),
    },
    {
      name: "no-assets text-sufficient rows are not blockers",
      pass: rows.filter((row) => row.body_quality === "text_sufficient_no_assets")
        .every((row) => row.review_status !== "blocked"),
    },
    {
      name: "image-only suspected rows require admin review",
      pass: rows.filter((row) => row.image_only_suspected).every((row) => row.admin_review_required === true),
    },
    {
      name: "zero-match remains observed evidence rather than absence proof",
      pass: rows.filter((row) => row.zero_match_observed).every((row) =>
        /not a source-exhaustion or scholarship-absence proof/i.test(String(row.evidence_json.observability.zero_match_interpretation)),
      ),
    },
    {
      name: "incomplete and blocked batches surface a warning or blocker",
      pass: rows.filter((row) => ["incomplete", "degraded", "blocked"].includes(row.batch_observability_status))
        .every((row) => row.admin_review_required || row.review_status === "blocked"),
    },
  ];
}

function markdown(report) {
  const lines = [
    "# Post-Phase F-0 Adapter Foundation Validation",
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
    "- Fixture-backed read-only adapter evidence only; no live DB, crawler, or admin UI integration is exercised.",
    "- An alias mapping source must be explicitly designed before source_key/source_id divergence can proceed.",
    "- Zero-match is an observed source result, not a source-exhaustion or scholarship-absence proof.",
  ];
  return `${lines.join("\n")}\n`;
}

function main() {
  const fixtureReports = FIXTURE_NAMES.map((name) => {
    const fixturePath = path.join(FIXTURE_DIRECTORY, name);
    const input = readJson(fixturePath);
    const first = buildAdapterBackedReviewReadModel(input, { generatedAt: input.generated_at ?? GENERATED_AT });
    const second = buildAdapterBackedReviewReadModel(input, { generatedAt: input.generated_at ?? GENERATED_AT });
    return {
      fixture: repoRelative(fixturePath),
      report: first,
      expected_counts_match: expectedCountsMatch(input, first),
      deterministic: stableStringify(first) === stableStringify(second),
      schema_valid: schemaValid(first),
      arithmetic_valid: arithmeticValid(first),
    };
  });
  const aggregate = aggregateReports(fixtureReports);
  const rows = aggregate.review_read_model;
  const tests = [
    ...fixtureReports.map((item) => ({ name: `${item.fixture} expected counts`, pass: item.expected_counts_match })),
    { name: "adapter output schema is valid", pass: fixtureReports.every((item) => item.schema_valid) },
    { name: "adapter arithmetic is consistent", pass: fixtureReports.every((item) => item.arithmetic_valid) },
    { name: "adapter semantic output is deterministic", pass: fixtureReports.every((item) => item.deterministic) },
    ...policyTests(rows),
    {
      name: "adapter runtime performs no DB access, write, migration, crawler execution, or destructive action",
      pass: fixtureReports.every((item) => item.report.db_access === false && item.report.db_write === false &&
        item.report.migration === false && item.report.crawler_execution === false && item.report.destructive_action === false),
    },
  ];
  const metrics = {
    fixture_count: FIXTURE_NAMES.length,
    resolved_source_count: aggregate.counts.resolved_source_count,
    unresolved_source_count: aggregate.counts.unresolved_source_count,
    ambiguous_source_count: aggregate.counts.ambiguous_source_count,
    missing_source_key_count: aggregate.counts.missing_source_key_count,
    clean_count: aggregate.counts.clean_count,
    duplicate_review_count: aggregate.counts.duplicate_review_count,
    quality_review_count: aggregate.counts.quality_review_count,
    blocked_count: aggregate.counts.blocked_count,
    no_assets_count: aggregate.counts.no_assets_count,
    image_only_suspected_count: aggregate.counts.image_only_suspected_count,
    zero_match_observed_count: aggregate.counts.zero_match_observed_count,
    admin_review_required_count: aggregate.counts.admin_review_required_count,
    auto_apply_allowed_count: aggregate.counts.auto_apply_allowed_count,
    batch_warning_count: aggregate.counts.batch_warning_count,
    rollback_scope_available_count: aggregate.counts.rollback_scope_available_count,
    deterministic_rerun_match: fixtureReports.every((item) => item.deterministic),
    output_schema_valid: fixtureReports.every((item) => item.schema_valid),
    arithmetic_consistency_valid: fixtureReports.every((item) => item.arithmetic_valid),
    source_resolution_policy_valid: policyTests(rows)[0].pass,
  };
  const pass = tests.every((test) => test.pass);
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
  writeJson(FOUNDATION_REPORT, aggregate);
  writeJson(VALIDATION_JSON, validation);
  writeText(VALIDATION_MARKDOWN, markdown(validation));
  console.log(`status=${validation.status}`);
  console.log(`json_report=${repoRelative(VALIDATION_JSON)}`);
  console.log(`markdown_report=${repoRelative(VALIDATION_MARKDOWN)}`);
  for (const [key, value] of Object.entries(metrics)) console.log(`${key}=${value}`);
  if (!pass) process.exitCode = 1;
}

main();
