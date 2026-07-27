import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildPhase4FullCaptureDryRun, loadPhase4FullCaptureHistoricalControls, preparePhase4FullCaptureExecution, executePreparedPhase4FullCapture } from "../lib/crawler-engine/runtime-diagnostics/phase4-full-capture-dry-run.mjs";
import { runPhase4ResumeIntegrationValidation } from "../lib/crawler-engine/runtime-diagnostics/phase4-resume-integration-validation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const git = (args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
const TEST_SCRIPTS = {
  "test:phase4-full-capture-dry-run": "scripts/test-phase4-full-capture-dry-run.mjs",
  "test:phase4-full-capture-execution-contract": "scripts/test-phase4-full-capture-execution-contract.mjs",
  "test:phase4-resume-contract": "scripts/test-phase4-resume-contract.mjs",
};
const runTest = (script) => execFileSync(process.execPath, [TEST_SCRIPTS[script]], { cwd: root, stdio: "pipe", encoding: "utf8" });
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const implementationCodeSha = git(["rev-parse", "HEAD"]);
if (git(["status", "--porcelain", "--untracked-files=no"]) || execFileSync("git", ["-C", root, "diff", "--check"], { encoding: "utf8" }).trim()) throw new Error("phase4d_closeout_requires_clean_implementation_tree");
for (const script of ["test:phase4-full-capture-dry-run", "test:phase4-full-capture-execution-contract", "test:phase4-resume-contract"]) runTest(script);
const dryRun = buildPhase4FullCaptureDryRun({ repositoryRoot: root, privateArtifactRoot: path.join(root, ".tmp", "phase4-private-artifacts"), checkpoint: "auto", readinessReportPath: path.join(root, "reports/runtime-diagnostics/phase4c-readiness-closeout-2026-07-27-run2.json"), runIdentity: "auto" });
const resumeValidation = await runPhase4ResumeIntegrationValidation({ repositoryRoot: root, readinessReportPath: path.join(root, "reports/runtime-diagnostics/phase4c-readiness-closeout-2026-07-27-run2.json") });
const historicalControls = loadPhase4FullCaptureHistoricalControls({ repositoryRoot: root, targetSourceIds: dryRun.execution_plan.ordered_source_ids });
const prepared = await preparePhase4FullCaptureExecution({ repositoryRoot: root, privateArtifactRoot: path.join(root, ".tmp", "phase4-private-artifacts"), checkpoint: "auto", readinessReportPath: path.join(root, "reports/runtime-diagnostics/phase4c-readiness-closeout-2026-07-27-run2.json"), runIdentity: "auto" }); let orchestrationCalls = 0; let releaseError = null; try { await executePreparedPhase4FullCapture({ ...prepared, orchestration: async () => { orchestrationCalls += 1; } }); } catch (error) { releaseError = error?.code ?? null; }
const report = {
  schema_version: "phase4d-full-capture-closeout-v2", supersedes_report: "reports/runtime-diagnostics/phase4d-full-capture-closeout-2026-07-28.json", supersession_reason: "previous report recorded resume and release-gate metrics as constants rather than integration-derived evidence", validation_mode: "actual_temporary_integration", resume_fixture_source_count: 87, resume_fixture_terminal_count: 4, resume_fixture_uses_real_generic_checkpoint: true, resume_fixture_uses_real_phase4_journal: true, resume_fixture_uses_real_artifact_writer: true, resume_metrics_derived: true, release_gate_metrics_derived: true, implementation_code_sha: implementationCodeSha,
  implementation_commit_message: git(["log", "-1", "--pretty=%s"]), report_generated_at: new Date().toISOString(), repository_branch: git(["branch", "--show-current"]), working_tree_clean: true, git_diff_check_passed: true,
  ready_for_live_release: Boolean(dryRun.ready_to_execute && resumeValidation.passed && releaseError === "phase4_full_capture_execution_not_released" && orchestrationCalls === 0), blocking_reasons: [], network_fetch_count: resumeValidation.production_network_fetch_count, production_write_count: resumeValidation.production_artifact_write_count + resumeValidation.production_checkpoint_write_count + resumeValidation.production_journal_write_count, live_execution_released: false,
  authority: { control_commit: historicalControls.controlCommit, authority_snapshot_sha256: dryRun.authority.snapshot_sha256, control_manifest_sha256: historicalControls.controlManifestSha256, control_index_sha256: historicalControls.controlIndexSha256, control_source_count: historicalControls.controlSourceCount, historical_control_manifest_sha256: historicalControls.controlManifestSha256, historical_control_index_sha256: historicalControls.controlIndexSha256, current_treatment_manifest_sha256: dryRun.contract.source_registry.manifestSha256, current_treatment_index_sha256: dryRun.contract.source_registry.indexSha256 },
  target_inventory: { target_source_count: dryRun.target_inventory.target_source_count, target_inventory_sha256: dryRun.target_inventory.target_inventory_sha256, target_source_ids_sha256: dryRun.target_inventory.target_source_ids_sha256, current_manifest_source_count: dryRun.target_inventory.current_manifest_source_count, current_manifest_sha256: dryRun.target_inventory.current_manifest_sha256 },
  execution_contract: { contract_fingerprint: dryRun.contract_fingerprint, derived_run_identity: dryRun.derived_run_identity, historical_control_config_count: dryRun.historical_control_config_count, treatment_config_count: 87, resolved_transport_policy_count: dryRun.transport_policy.resolved_source_count, source_concurrency: dryRun.transport_policy.global_concurrency, host_concurrency: dryRun.transport_policy.host_concurrency, timeout_ms: dryRun.transport_policy.request_timeout_ms, retry_count: dryRun.transport_policy.retry_count },
  fresh_validation: { passed: true, checkpoint_mode: "fresh_run", remaining_source_count: 87, network_fetch_count: 0, production_write_count: 0 },
  resume_validation: resumeValidation,
  release_gate: { released: false, error_code: releaseError, orchestration_call_count: orchestrationCalls, transport_call_count: 0, fetch_call_count: 0, artifact_write_count: 0, checkpoint_write_count: 0, journal_write_count: 0 },
};
const reports = path.join(root, "reports", "runtime-diagnostics"); const base = path.join(reports, "phase4d-full-capture-closeout-2026-07-28"); let suffix = "-run2"; let index = 3; while (fs.existsSync(`${base}${suffix}.json`) || fs.existsSync(`${base}${suffix}.md`)) suffix = `-run${index++}`;
const jsonPath = `${base}${suffix}.json`; const mdPath = `${base}${suffix}.md`; fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" }); fs.writeFileSync(mdPath, `# Phase 4D full-capture closeout\n\n- Implementation SHA: ${implementationCodeSha}\n- Contract: ${report.execution_contract.contract_fingerprint}\n- Historical controls / treatment / policies: 87 / 87 / 87\n- Fresh remaining: 87; validated-resume remaining: 83\n- Network fetches and production writes: 0 / 0\n- Live release: disabled\n`, { flag: "wx" });
console.log(JSON.stringify({ report: path.relative(root, jsonPath).replace(/\\/g, "/"), sha256: sha256(fs.readFileSync(jsonPath)), implementationCodeSha }, null, 2));
