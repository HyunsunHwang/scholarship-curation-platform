import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baseCommit = "8b8cd838b1ab328b9972fd34dcc2e292e0b65b1c";
const artifacts = [
  "docs/post-phase-j-current-schema-inventory.md", "docs/post-phase-j-canonical-schema-proposal.md",
  "docs/post-phase-j-consumer-compatibility-matrix.md", "docs/post-phase-j-additive-migration-sequence.md",
  "docs/post-phase-j-backfill-reconciliation-plan.md", "docs/post-phase-j-rollback-recovery-plan.md",
  "docs/post-phase-j-guarded-production-apply-design.md", "docs/post-phase-j-target-schema-inventory-request.md",
  "docs/post-phase-j-implementation-readiness.md", "docs/post-phase-master-risk-register.md",
  "reports/post-phase-j-canonical-schema-proposal.json", "reports/post-phase-j-schema-production-migration-planning.json",
  "reports/post-phase-master-risk-register.json",
];
const riskFields = ["id", "origin_phase", "status", "evidence", "severity", "deferral_reason", "next_resolution_phase", "next_work_unit", "success_criteria", "owner", "blocking_for_next_phase"];
const read = (file) => readFile(resolve(root, file), "utf8");
const exists = async (file) => { try { await read(file); return true; } catch { return false; } };
const run = (command, args) => new Promise((ok, fail) => execFile(command, args, { cwd: root, windowsHide: true }, (error, stdout, stderr) => error ? fail(new Error(stderr || error.message)) : ok(stdout)));

const safetyFiles = artifacts.filter((file) => file.startsWith("docs/post-phase-j-") || file.startsWith("reports/post-phase-j-")).concat("reports/post-phase-master-risk-register.json");
const patterns = [["api_key", /api[_-]?key/i], ["token", /token/i], ["secret", /secret/i], ["bearer", /bearer/i], ["cookie", /cookie/i], ["session", /session/i]];
const absolutePath = /[A-Z]:\\|\/Users\/|\/home\/|\/workspaces\/|\/mnt\/data\/|Documents[\\/]Codex/i;
const credentialValue = (line) => /\bsk-(?:ant-)?[A-Za-z0-9_-]{16,}\b|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b|\bbearer\s+[A-Za-z0-9._-]{16,}\b|\b(?:api[_-]?key|token|secret|cookie|session)\s*[:=]\s*["']?[A-Za-z0-9._-]{16,}/i.test(line);
async function safetyScan() {
  const matches = []; let pathCount = 0;
  for (const file of safetyFiles) {
    const lines = (await read(file)).split(/\r?\n/);
    lines.forEach((line, index) => {
      pathCount += (line.match(absolutePath) ?? []).length;
      for (const [name, pattern] of patterns) if (pattern.test(line)) matches.push({ file, line: index + 1, matched_pattern: name, classification: credentialValue(line) ? "actual_secret" : "documentation_or_governance_text" });
    });
  }
  const result = { scope: safetyFiles, total_match_count: matches.length, actual_persisted_secret_count: matches.filter((item) => item.classification === "actual_secret").length, unclassified_match_count: matches.filter((item) => !item.classification).length, actual_persisted_absolute_path_count: pathCount, matches };
  await writeFile(resolve(root, "reports/post-phase-j-persisted-artifact-safety-scan.json"), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

const missingArtifacts = (await Promise.all(artifacts.map(async (file) => [file, await exists(file)]))).filter(([, present]) => !present).map(([file]) => file);
const proposal = JSON.parse(await read("reports/post-phase-j-canonical-schema-proposal.json"));
const report = JSON.parse(await read("reports/post-phase-j-schema-production-migration-planning.json"));
const risks = JSON.parse(await read("reports/post-phase-master-risk-register.json"));
const docs = await Promise.all(artifacts.filter((file) => file.endsWith(".md")).map(read));
const trackedChangedFiles = (await run("git", ["-c", "safe.directory=*", "diff", "--name-only", baseCommit])).split(/\r?\n/).filter(Boolean);
const untrackedFiles = (await run("git", ["-c", "safe.directory=*", "ls-files", "--others", "--exclude-standard"])).split(/\r?\n/).filter(Boolean);
const changedFiles = [...new Set([...trackedChangedFiles, ...untrackedFiles])].sort();
const forbiddenChanged = changedFiles.filter((file) => file.startsWith("supabase/migrations/") || file === "lib/database.types.ts" || file === "package.json" || /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(file) || file.startsWith(".github/workflows/") || /^(app|components|lib)\//.test(file));
const unresolved = risks.risks.filter((risk) => risk.status !== "resolved");
const missingRiskGovernance = unresolved.filter((risk) => riskFields.some((field) => risk[field] === undefined || risk[field] === null || risk[field] === ""));
const stalePhaseRisks = unresolved.filter((risk) => risk.next_resolution_phase === "J" || risk.next_resolution_phase === "Post-Phase J");
const safety = await safetyScan();
const docsText = docs.join("\n");
const checks = [
  ["required artifacts", missingArtifacts.length === 0],
  ["source authority", proposal.source_authority?.canonical_internal_source_identifier === "notice_sources.source_id" && proposal.source_authority?.resolution === "exact_only"],
  ["notice identity hierarchy", proposal.notice_identity?.fallback === "source_id + canonical_detail_url_hash" && proposal.notice_identity?.content_hash === "revision_change_detection_only"],
  ["append-only review events", proposal.architecture?.includes("append_only_review_decision_events") && proposal.entities?.some((item) => item.name === "review_decision_events" && item.lifecycle === "append_only")],
  ["public projection compatibility", proposal.compatibility?.scholarships?.includes("unchanged") && proposal.compatibility?.crawled_notices?.includes("physical")],
  ["attachment and LLM boundary", proposal.entities?.some((item) => item.name === "ingestion_notice_assets") && proposal.compatibility?.llm_persistence === false],
  ["raw normalized human public separation", Object.keys(proposal.value_separation ?? {}).length === 6],
  ["compatibility coverage", ["notice_sources", "crawled_notices", "scholarships", "site_settings", "Admin scholarship CRUD", "G report-backed public MVP"].every((term) => docsText.includes(term))],
  ["additive migration sequence", ["J-M0", "J-M1", "J-M2", "J-M3", "J-M4", "J-M5", "J-M6", "J-M7"].every((unit) => docsText.includes(unit))],
  ["first-stage safety", !/DROP TABLE|destructive rename|destructive type conversion|immediate legacy replacement|production dual-write|automatic production apply/i.test(await read("docs/post-phase-j-canonical-schema-proposal.md"))],
  ["implementation readiness", report.post_phase_j_planning_status === "PASS" && report.production_migration_implementation_readiness === "NOT_READY" && report.production_apply_readiness === "NOT_READY"],
  ["prohibited changed paths", forbiddenChanged.length === 0],
  ["risk governance", missingRiskGovernance.length === 0 && stalePhaseRisks.length === 0],
  ["safety counts", Object.values(report.prohibited_action_counts ?? {}).every((value) => value === 0)],
  ["artifact safety", safety.actual_persisted_secret_count === 0 && safety.unclassified_match_count === 0 && safety.actual_persisted_absolute_path_count === 0],
];
const failures = checks.filter(([, pass]) => !pass).map(([name]) => name);
const result = { generated_at: "2026-07-14T00:00:00.000Z", status: failures.length ? "HOLD" : "PASS", post_phase_j_planning_status: report.post_phase_j_planning_status, production_migration_implementation_readiness: report.production_migration_implementation_readiness, production_apply_readiness: report.production_apply_readiness, checks: checks.map(([name, pass]) => ({ name, pass })), failures, changed_files: changedFiles, forbidden_changed_files: forbiddenChanged, unresolved_risk_count: unresolved.length, missing_risk_governance_count: missingRiskGovernance.length, stale_completed_phase_assignment_count: stalePhaseRisks.length, safety };
await writeFile(resolve(root, "reports/post-phase-j-validation-report.json"), `${JSON.stringify(result, null, 2)}\n`);
if (failures.length) throw new Error(`Post-Phase J validation failed: ${failures.join(", ")}`);
console.log("Post-Phase J planning PASS");
console.log("Production migration implementation readiness NOT READY");
console.log("Production apply readiness NOT READY");
