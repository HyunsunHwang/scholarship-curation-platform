import fs from "node:fs";
import path from "node:path";
import { planCrawlerRollbackScope } from "./plan-crawler-rollback-scope.mjs";

const FIXTURE_DIR = "fixtures/post-phase-d";
const DEFAULT_FIXTURES = [
  "clean-single-run.json",
  "multi-source-batch.json",
  "shared-record-risk.json",
  "orphan-risk.json",
  "partial-write.json",
  "missing-identifier.json",
];
const DEFAULT_JSON_REPORT = "reports/post-phase-d-validation-report.json";
const DEFAULT_MD_REPORT = "reports/post-phase-d-validation-report.md";
const DEFAULT_PLAN_REPORT = "reports/post-phase-d-rollback-scope-plan.json";

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

function stripGeneratedAt(plan) {
  return {
    ...plan,
    generated_at: "<ignored>",
  };
}

function hasBlockedReason(plan, reason) {
  return plan.blocked_reasons.includes(reason);
}

function impactFor(plan, entity) {
  return plan.table_impacts.find((row) => row.entity === entity);
}

function collectTests(plans) {
  const byName = new Map(plans.map((item) => [item.fixture_name, item.plan]));
  const clean = byName.get("clean-single-run");
  const multi = byName.get("multi-source-batch");
  const shared = byName.get("shared-record-risk");
  const orphan = byName.get("orphan-risk");
  const partial = byName.get("partial-write");
  const missing = byName.get("missing-identifier");

  const firstCleanRerun = stripGeneratedAt(clean);
  const secondCleanRerun = stripGeneratedAt(
    planCrawlerRollbackScope(readJson(path.join(FIXTURE_DIR, "clean-single-run.json")), {
      inputPath: path.join(FIXTURE_DIR, "clean-single-run.json"),
      generatedAt: clean.generated_at,
    }),
  );

  return [
    {
      name: "single rehearsal/run scope is identified",
      pass: clean.scope.rehearsal_label === "post-phase-d-clean-single-run" &&
        clean.scope.run_ids.length === 1 &&
        clean.metrics.estimated_affected_row_count > 0,
    },
    {
      name: "multi-source batch scope is aggregated",
      pass: multi.scope.batch_id === "post-phase-d-batch-001" &&
        multi.scope.source_keys.length === 2 &&
        multi.metrics.scoped_source_count >= 2,
    },
    {
      name: "missing rollback identifier is blocked",
      pass: hasBlockedReason(missing, "rollback_identifier_missing") &&
        missing.safe_to_generate_execution_plan === false,
    },
    {
      name: "ambiguous identifier is blocked",
      pass: hasBlockedReason(multi, "ambiguous_identifier_requires_manual_disambiguation") &&
        multi.metrics.ambiguous_identifier_count === 1,
    },
    {
      name: "shared notice/alias/asset relation is not auto-cleanable",
      pass: shared.shared_record_risks.length >= 3 &&
        hasBlockedReason(shared, "shared_reference_exists") &&
        shared.safe_to_generate_execution_plan === false,
    },
    {
      name: "orphan risk is detected",
      pass: orphan.orphan_risks.length >= 1 &&
        hasBlockedReason(orphan, "orphan_risk_exists"),
    },
    {
      name: "partial write pattern is detected",
      pass: partial.partial_write_findings.length >= 1 &&
        hasBlockedReason(partial, "partial_write_state_unclassified_for_execution"),
    },
    {
      name: "pre-existing and newly-created ownership ambiguity is blocked",
      pass: hasBlockedReason(shared, "pre_existing_and_new_ownership_must_be_separated"),
    },
    {
      name: "source row is not a default cleanup target",
      pass: impactFor(clean, "source")?.default_cleanup_target === false,
    },
    {
      name: "zero affected row is no-op/review, not success",
      pass: missing.metrics.estimated_affected_row_count === 0 &&
        hasBlockedReason(missing, "zero_affected_rows_requires_review"),
    },
    {
      name: "same fixture produces deterministic dry-run plan",
      pass: stableStringify(firstCleanRerun) === stableStringify(secondCleanRerun),
    },
    {
      name: "output schema has required dry-run safety fields",
      pass: plans.every(({ plan }) =>
        plan.read_only === true &&
        plan.db_access === false &&
        plan.db_write === false &&
        plan.cleanup_execution === false &&
        plan.sql_generation === false &&
        plan.safe_to_generate_execution_plan === false &&
        Array.isArray(plan.table_impacts) &&
        Array.isArray(plan.blocked_reasons),
      ),
    },
    {
      name: "cleanup SQL or delete/update command is not generated",
      pass: plans.every(({ plan }) => stableStringify(plan).match(/\b(delete|update|drop|truncate)\b/i) == null),
    },
  ];
}

function aggregateMetrics(plans, tests) {
  const totals = plans.reduce((acc, { plan }) => {
    for (const [key, value] of Object.entries(plan.metrics)) {
      if (typeof value === "number") acc[key] = (acc[key] ?? 0) + value;
    }
    return acc;
  }, {});
  return {
    input_record_count: totals.input_record_count ?? 0,
    scoped_run_count: totals.scoped_run_count ?? 0,
    scoped_source_count: totals.scoped_source_count ?? 0,
    scoped_canonical_key_count: totals.scoped_canonical_key_count ?? 0,
    table_entity_count: plans[0]?.plan.metrics.table_entity_count ?? 0,
    estimated_affected_row_count: totals.estimated_affected_row_count ?? 0,
    shared_record_risk_count: totals.shared_record_risk_count ?? 0,
    orphan_risk_count: totals.orphan_risk_count ?? 0,
    partial_write_finding_count: totals.partial_write_finding_count ?? 0,
    blocked_reason_count: totals.blocked_reason_count ?? 0,
    manual_review_required_count: totals.manual_review_required_count ?? 0,
    missing_identifier_count: totals.missing_identifier_count ?? 0,
    ambiguous_identifier_count: totals.ambiguous_identifier_count ?? 0,
    deterministic_rerun_match: tests.find((test) =>
      test.name.includes("deterministic dry-run plan"),
    )?.pass ?? false,
    output_schema_valid: tests.find((test) =>
      test.name.includes("required dry-run safety fields"),
    )?.pass ?? false,
    db_access: false,
    db_write: false,
    cleanup_execution: false,
  };
}

function buildMarkdownReport(report) {
  const lines = [];
  lines.push("# Post-Phase D Rollback Cleanup Dry-run Validation Report");
  lines.push("");
  lines.push(`Generated at: ${report.generated_at}`);
  lines.push("");
  lines.push("## Status");
  lines.push("");
  lines.push(report.status);
  lines.push("");
  lines.push("## Scope");
  lines.push("");
  lines.push("- Read-only rollback scope and cleanup dry-run planner.");
  lines.push("- Fixture/evidence-based estimated counts only.");
  lines.push("- No DB access, DB write, cleanup execution, or SQL generation.");
  lines.push("");
  lines.push("## Metrics");
  lines.push("");
  for (const [key, value] of Object.entries(report.metrics)) {
    lines.push(`- ${key}: ${value}`);
  }
  lines.push("");
  lines.push("## Tests");
  lines.push("");
  for (const test of report.tests) {
    lines.push(`- ${test.pass ? "PASS" : "FAIL"}: ${test.name}`);
  }
  lines.push("");
  lines.push("## Fixture Results");
  lines.push("");
  for (const result of report.fixture_results) {
    lines.push(`- ${result.fixture}: estimated=${result.estimated_affected_row_count}, blocked=${result.blocked_reason_count}, manual_review=${result.manual_review_required_count}`);
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
  const plans = fixturePaths.map((fixturePath) => {
    const input = readJson(fixturePath);
    const plan = planCrawlerRollbackScope(input, {
      inputPath: fixturePath,
      generatedAt,
    });
    return {
      fixture_name: path.basename(fixturePath, ".json"),
      fixture_path: repoRelativePath(fixturePath),
      plan,
    };
  });
  const tests = collectTests(plans);
  const pass = tests.every((test) => test.pass);
  return {
    generated_at: generatedAt,
    status: pass ? "PASS" : "HOLD",
    read_only: true,
    db_access: false,
    db_write: false,
    cleanup_execution: false,
    sql_generation: false,
    inputs: {
      fixtures: fixturePaths.map(repoRelativePath),
    },
    metrics: aggregateMetrics(plans, tests),
    tests,
    fixture_results: plans.map(({ fixture_name: fixture, fixture_path, plan }) => ({
      fixture,
      fixture_path,
      estimated_affected_row_count: plan.metrics.estimated_affected_row_count,
      blocked_reason_count: plan.metrics.blocked_reason_count,
      manual_review_required_count: plan.metrics.manual_review_required_count,
      shared_record_risk_count: plan.metrics.shared_record_risk_count,
      orphan_risk_count: plan.metrics.orphan_risk_count,
      partial_write_finding_count: plan.metrics.partial_write_finding_count,
    })),
    plans: plans.map(({ plan }) => plan),
    safety: {
      production_main_access: false,
      personal_dev_supabase_access: false,
      db_access: false,
      db_write: false,
      cleanup_execution: false,
      sql_generation: false,
      migration: false,
      generated_database_types_changed: false,
      admin_ui_changed: false,
      product_ui_changed: false,
    },
    evidence_and_limitations: {
      personal_dev_evidence_used: false,
      synthetic_fixture_only: true,
      live_db_state_verified: false,
      production_cleanup_readiness_proven: false,
      team_agreement_required_before_destructive_cleanup: true,
    },
    limitations: [
      "This phase proves read-only scope classification against local fixtures, not production cleanup readiness.",
      "All affected row counts are estimated from fixture evidence and are not live DB row counts.",
      "No personal-dev or production/main Supabase access was used.",
      "No destructive SQL, migration, guarded apply, admin UI, or product UI integration is included.",
      "Future destructive cleanup requires separate team approval, DB-backed evidence, and execution-specific safeguards.",
    ],
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fixturePaths = DEFAULT_FIXTURES.map((name) => path.join(FIXTURE_DIR, name));
  const generatedAt = args["generated-at"] ?? "2026-07-13T00:00:00.000Z";
  const report = buildReport({ fixturePaths, generatedAt });
  writeJson(args.output ?? DEFAULT_JSON_REPORT, report);
  fs.writeFileSync(
    path.resolve(args.markdown ?? DEFAULT_MD_REPORT),
    buildMarkdownReport(report),
    "utf8",
  );
  writeJson(args.plan ?? DEFAULT_PLAN_REPORT, report.plans[0]);

  console.log(`status=${report.status}`);
  console.log(`json_report=${path.resolve(args.output ?? DEFAULT_JSON_REPORT)}`);
  console.log(`markdown_report=${path.resolve(args.markdown ?? DEFAULT_MD_REPORT)}`);
  console.log(`scope_plan=${path.resolve(args.plan ?? DEFAULT_PLAN_REPORT)}`);
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
