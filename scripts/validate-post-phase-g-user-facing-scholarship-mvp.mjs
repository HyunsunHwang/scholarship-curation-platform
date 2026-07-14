import { readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildPostPhaseGReport } from "./build-post-phase-g-user-facing-scholarship-mvp.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function repositoryPath(path) {
  return relative(repoRoot, path).replaceAll("\\", "/");
}

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const { report, reportPath } = await buildPostPhaseGReport();
  const secondRun = await buildPostPhaseGReport();
  const riskPath = resolve(repoRoot, "reports/post-phase-master-risk-register.json");
  const riskRegister = JSON.parse(await readFile(riskPath, "utf8"));
  const serialized = JSON.stringify(report);
  const activeRisks = riskRegister.risks.filter((risk) => risk.status !== "resolved");
  const blockingRisks = activeRisks.filter((risk) => risk.blocking_for_next_phase === true);
  const unassignedRisks = activeRisks.filter((risk) => !risk.next_resolution_phase);

  invariant(serialized === JSON.stringify(secondRun.report), "Read-model output must be deterministic.");
  invariant(report.read_only && !report.db_access && !report.db_write && !report.supabase_access, "Report must remain read-only.");
  invariant(report.metrics.input_candidate_count === 13, "Expected 13 F0 candidate rows.");
  invariant(report.metrics.public_item_count === 2, "Expected exactly two reviewed public items.");
  invariant(report.metrics.hidden_item_count === 11, "Expected eleven hidden items.");
  invariant(report.metrics.scenario_fail_count === 0, "All exposure scenarios must pass.");
  invariant(report.build_verification.status === "PASS", "Build verification must pass before G closure.");
  invariant(report.public_items.every((item) => item.id.startsWith("public-")), "Public IDs must stay namespaced.");
  invariant(
    report.exposure_decisions.every((decision) => decision.exposure_status !== "public" || decision.source_resolution_status === "resolved"),
    "Public rows require resolved source identity.",
  );
  invariant(
    activeRisks.every((risk) => risk.next_resolution_phase && risk.success_criteria),
    "Every open or deferred risk needs an owner phase and success criteria.",
  );
  invariant(blockingRisks.length === 0, "No blocking risk may remain for the next phase.");
  invariant(unassignedRisks.length === 0, "No open or deferred risk may lack a resolution phase.");

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const validation = {
    generated_at: "2026-07-14T00:00:00.000Z",
    contract_version: "post-phase-g-user-facing-scholarship-mvp-validation/v1",
    status: "PASS",
    read_only: true,
    db_access: false,
    db_write: false,
    supabase_access: false,
    migration: false,
    crawler_execution: false,
    inputs: {
      post_phase_g_report: repositoryPath(reportPath),
      master_risk_register: repositoryPath(riskPath)
    },
    metrics: {
      input_candidate_count: report.metrics.input_candidate_count,
      public_item_count: report.metrics.public_item_count,
      hidden_item_count: report.metrics.hidden_item_count,
      scenario_pass_count: report.metrics.scenario_pass_count,
      scenario_fail_count: report.metrics.scenario_fail_count,
      deterministic_output: true,
      build_verification_status: report.build_verification.status,
      resolved_risk_count: riskRegister.risks.filter((risk) => risk.status === "resolved").length,
      open_or_deferred_risks_with_owner_and_success_criteria: activeRisks.filter((risk) => risk.next_resolution_phase && risk.success_criteria).length,
      blocking_risk_count: blockingRisks.length,
      unassigned_resolution_phase_count: unassignedRisks.length
    }
  };
  const validationPath = resolve(repoRoot, "reports/post-phase-g-validation-report.json");
  const validationMarkdownPath = resolve(repoRoot, "reports/post-phase-g-validation-report.md");
  await writeFile(validationPath, `${JSON.stringify(validation, null, 2)}\n`, "utf8");
  await writeFile(
    validationMarkdownPath,
    `# Post-Phase G Validation Report\n\n- Status: PASS\n- Build verification: ${validation.metrics.build_verification_status}\n- Public items: ${validation.metrics.public_item_count}\n- Hidden items: ${validation.metrics.hidden_item_count}\n- Deterministic output: true\n- Blocking risks: ${validation.metrics.blocking_risk_count}\n- Unassigned resolution phases: ${validation.metrics.unassigned_resolution_phase_count}\n- DB/Supabase access: false\n- DB write: false\n- Crawler execution: false\n`,
    "utf8",
  );
  console.log("Post-Phase G validation PASS");
  console.log(JSON.stringify(validation.metrics, null, 2));
}

await main();
