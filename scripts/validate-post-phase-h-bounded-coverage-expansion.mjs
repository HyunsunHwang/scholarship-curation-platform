import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildPostPhaseHBoundedCoverageExpansion } from "./build-post-phase-h-bounded-coverage-expansion.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const first = await buildPostPhaseHBoundedCoverageExpansion();
  const second = await buildPostPhaseHBoundedCoverageExpansion();
  const report = first.report;
  const riskRegister = JSON.parse(await readFile(resolve(repoRoot, "reports/post-phase-master-risk-register.json"), "utf8"));
  const reuseMatrix = await readFile(resolve(repoRoot, "docs/post-phase-h-reuse-matrix.md"), "utf8");
  const activeRisks = riskRegister.risks.filter((risk) => risk.status !== "resolved");
  const checks = [
    ["deterministic output", JSON.stringify(first) === JSON.stringify(second)],
    ["bounded target count", report.metrics.target_source_count >= 4 && report.metrics.target_source_count <= 8],
    ["target budgets", report.target_selection.shared_budget.max_list_pages_per_source <= 3 && report.target_selection.shared_budget.max_detail_checks_per_source <= 5 && report.target_selection.shared_budget.max_attachment_metadata_checks_per_source <= 3 && report.target_selection.shared_budget.max_attachment_download_attempts_per_source === 0],
    ["baseline and after evidence", report.source_comparison.length === report.metrics.target_source_count && report.source_comparison.every((row) => row.baseline && row.after)],
    ["pagination case", report.source_comparison.find((row) => row.source_id === "cau_002")?.deltas.additional_unique_item_count > 0],
    ["detail resolution case", report.source_comparison.find((row) => row.source_id === "cau_003")?.deltas.detail_resolution_improved === true],
    ["attachment metadata case", report.source_comparison.find((row) => row.source_id === "cau_008")?.deltas.attachment_metadata_improved === true],
    ["contextual keyword decision", report.contextual_keyword_decisions.every((decision) => ["high_confidence", "contextual_only", "reject", "insufficient_evidence"].includes(decision.current_decision))],
    ["existing implementation reuse matrix", reuseMatrix.includes("lib/notice-body-extraction.mjs") && reuseMatrix.includes("scripts/crawl-scholarship-notices.mjs") && reuseMatrix.includes("test-only")],
    ["risk ownership", activeRisks.every((risk) => risk.next_resolution_phase && risk.success_criteria)],
    ["deferred risk detail", riskRegister.risks.filter((risk) => risk.status === "deferred").every((risk) => risk.why_not_resolved_now && risk.next_work_unit && risk.owner && typeof risk.blocking_for_next_phase === "boolean")],
    ["no blocking risk", report.risk_summary.blocking_risk_count === 0],
    ["no unassigned risk", report.risk_summary.unassigned_resolution_phase_count === 0],
    ["no public auto expansion", report.metrics.public_exposure_change_count === 0],
    ["no exhaustion claim", report.source_comparison.every((row) => row.after.source_exhaustion_proven === false)],
    ["read-only safety", report.read_only && !report.db_access && !report.db_write && !report.supabase_access && !report.migration && !report.production_apply && !report.crawler_execution && !report.full_crawl],
  ];
  const failures = checks.filter(([, pass]) => !pass).map(([name]) => name);
  invariant(failures.length === 0, `Post-Phase H validation failed: ${failures.join(", ")}`);
  await writeFile(resolve(repoRoot, "reports/post-phase-h-bounded-coverage-expansion.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(resolve(repoRoot, "reports/post-phase-h-source-comparison.json"), `${JSON.stringify({ generated_at: report.generated_at, source_comparison: report.source_comparison, metrics: report.metrics }, null, 2)}\n`, "utf8");
  const validation = {
    generated_at: report.generated_at,
    contract_version: "post-phase-h-bounded-coverage-expansion-validation/v1",
    status: "PASS",
    checks: checks.map(([name]) => name),
    metrics: {
      ...report.metrics,
      carry_forward_risk_count: report.risk_summary.carry_forward_risk_count,
      blocking_risk_count: report.risk_summary.blocking_risk_count,
      unassigned_resolution_phase_count: report.risk_summary.unassigned_resolution_phase_count,
      deterministic_output: true,
    },
    safety: {
      db_access: false,
      db_write: false,
      migration: false,
      production_apply: false,
      crawler_execution: false,
      full_crawl: false,
      public_exposure_auto_expansion: false,
    },
  };
  await writeFile(resolve(repoRoot, "reports/post-phase-h-validation-report.json"), `${JSON.stringify(validation, null, 2)}\n`, "utf8");
  await writeFile(resolve(repoRoot, "reports/post-phase-h-validation-report.md"), `# Post-Phase H Validation Report\n\n- Status: PASS\n- Target sources: ${validation.metrics.target_source_count}\n- Improved sources: ${validation.metrics.improved_source_count}\n- Public exposure change: 0\n- Blocking risks: 0\n- Unassigned resolution phases: 0\n- Evidence: fixture-only, read-only, no crawler execution\n`, "utf8");
  console.log("Post-Phase H validation PASS");
  console.log(JSON.stringify(validation.metrics, null, 2));
}

await main();
