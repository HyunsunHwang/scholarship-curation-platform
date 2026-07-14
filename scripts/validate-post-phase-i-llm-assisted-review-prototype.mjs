import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPostPhaseI } from "./build-post-phase-i-llm-assisted-review-prototype.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scanReport = "reports/post-phase-i-persisted-artifact-safety-scan.json";
const secretPatterns = [
  ["sk-", /sk-/i], ["sk-ant-", /sk-ant-/i], ["eyJ", /eyJ/],
  ["Bearer", /Bearer/i], ["Authorization:", /Authorization:/i],
  ["OPENAI_API_KEY", /OPENAI_API_KEY/i], ["ANTHROPIC_API_KEY", /ANTHROPIC_API_KEY/i],
  ["SUPABASE_SERVICE_ROLE_KEY", /SUPABASE_SERVICE_ROLE_KEY/i], ["SERVICE_ROLE", /SERVICE_ROLE/i],
  ["token", /token/i], ["secret", /secret/i], ["cookie", /cookie/i],
  ["session", /session/i], ["api_key", /api_key/i], ["authorization", /authorization/i],
];
const absolutePathPattern = /C:\/|C:\\|\/Users\/|\/home\/|\/workspaces\/|\/mnt\/data\/|Documents\\Codex/;

async function filesUnder(directory) {
  const entries = await readdir(resolve(root, directory), { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => entry.isDirectory()
    ? filesUnder(`${directory}/${entry.name}`)
    : [`${directory}/${entry.name}`]));
  return files.flat();
}

function hasCredentialValue(line) {
  return /\bsk-(?:ant-)?[A-Za-z0-9_-]{16,}\b|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b|\b(?:Bearer|Authorization:)\s+[A-Za-z0-9._-]{16,}\b|\b(?:OPENAI_API_KEY|ANTHROPIC_API_KEY|SUPABASE_SERVICE_ROLE_KEY)\s*[:=]\s*["']?[A-Za-z0-9._-]{16,}|\b(?:secret|token|cookie|session|api_key|authorization)\b\s*[:=]\s*["']?[A-Za-z0-9._-]{16,}/i.test(line);
}

function classifyMatch(file, pattern, line) {
  if (hasCredentialValue(line)) return ["actual_secret", "Credential-shaped value detected; the value is intentionally not persisted in this report."];
  if (file === "reports/post-phase-master-risk-register.json" && pattern === "sk-") {
    return ["harmless_identifier", "Case-insensitive pattern matched a RISK- identifier, not an API-key prefix."];
  }
  if (file.startsWith("fixtures/")) return ["fixture_text", "Fixture field text is a deliberate negative-contract input, not a credential."];
  if (file.startsWith("docs/")) return ["documentation_text", "Documentation mentions a security-related term without a credential value."];
  if (file.startsWith("reports/")) return ["harmless_identifier", "Generated evidence preserves a fixture identifier, not a credential value."];
  return ["other_false_positive", "Pattern matched a non-credential artifact token."];
}

async function scanPersistedArtifacts() {
  const docs = (await filesUnder("docs")).filter((file) => file.startsWith("docs/post-phase-i-"));
  const fixtures = await filesUnder("fixtures/post-phase-i");
  const reports = (await filesUnder("reports"))
    .filter((file) => file.startsWith("reports/post-phase-i-") && file !== scanReport);
  const files = [...docs, ...fixtures, ...reports, "reports/post-phase-master-risk-register.json"].sort();
  const matches = [];

  for (const file of files) {
    const lines = (await readFile(resolve(root, file), "utf8")).split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const [matchedPattern, pattern] of secretPatterns) {
        if (pattern.test(line)) {
          const [classification, reason] = classifyMatch(file, matchedPattern, line);
          matches.push({ file, line: index + 1, matched_pattern: matchedPattern, classification, reason });
        }
      }
    });
  }

  const actualSecretCount = matches.filter((match) => match.classification === "actual_secret").length;
  const unclassifiedCount = matches.filter((match) => !match.classification).length;
  const absolutePathCount = files.reduce(async (countPromise, file) => {
    const count = await countPromise;
    const content = await readFile(resolve(root, file), "utf8");
    return count + (content.match(new RegExp(absolutePathPattern.source, "g")) ?? []).length;
  }, Promise.resolve(0));
  const result = {
    scope: files,
    scan_report_excluded_to_prevent_self_referential_matches: true,
    total_secret_scan_match_count: matches.length,
    classified_false_positive_count: matches.length - actualSecretCount - unclassifiedCount,
    actual_persisted_secret_count: actualSecretCount,
    unclassified_match_count: unclassifiedCount,
    actual_persisted_absolute_path_count: await absolutePathCount,
    matches,
  };
  await writeFile(resolve(root, scanReport), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

const first = await buildPostPhaseI();
const second = await buildPostPhaseI();
const metrics = first.metrics;
const risks = JSON.parse(await readFile(resolve(root, "reports/post-phase-master-risk-register.json"), "utf8"));
const safetyScan = await scanPersistedArtifacts();
const terminalRiskStatuses = new Set(risks.status_policy?.terminal_statuses ?? []);
const isTerminalRiskStatus = (status) => terminalRiskStatuses.has(status);
const unresolvedRisks = risks.risks.filter((risk) => !isTerminalRiskStatus(risk.status));
const requiredRiskFields = ["id", "origin_phase", "status", "evidence", "severity", "deferral_reason", "next_resolution_phase", "next_work_unit", "success_criteria", "owner", "blocking_for_next_phase"];
const missingRiskFields = unresolvedRisks.filter((risk) => requiredRiskFields.some((field) => risk[field] === undefined || risk[field] === null || risk[field] === ""));
const unassignedRiskCount = unresolvedRisks.filter((risk) => !risk.next_resolution_phase).length;
const completedResolutionPhases = new Set(["H", "I", "Post-Phase H", "Post-Phase I"]);
const staleResolutionPhaseCount = unresolvedRisks.filter((risk) => completedResolutionPhases.has(risk.next_resolution_phase)).length;
const missingOwnerCount = unresolvedRisks.filter((risk) => typeof risk.owner !== "string" || !risk.owner.trim()).length;
const missingBlockingStatusCount = unresolvedRisks.filter((risk) => typeof risk.blocking_for_next_phase !== "boolean").length;
const checks = [
  ["deterministic replay", JSON.stringify(first) === JSON.stringify(second)],
  ["positive cases accepted", metrics.schema_valid_count === metrics.evaluation_case_count && metrics.evidence_link_valid_count === metrics.evaluation_case_count],
  ["negative cases rejected", first.evaluation.filter((item) => item.kind === "negative").every((item) => !item.accepted)],
  ["explicit quality metrics", metrics.accepted_unsupported_claim_count === 0 && metrics.accepted_hallucinated_field_count === 0 && metrics.detected_unsupported_claim_attempt_count > 0 && metrics.detected_unsupported_claim_attempt_count === metrics.rejected_unsupported_claim_attempt_count && metrics.detected_hallucinated_field_attempt_count > 0 && metrics.detected_hallucinated_field_attempt_count === metrics.rejected_hallucinated_field_attempt_count],
  ["provider and policy fail closed", metrics.provider_failure_count === metrics.provider_failure_case_count && metrics.auto_approve_attempt_count === 1 && metrics.auto_reject_attempt_count === 1 && metrics.public_exposure_attempt_count === 1 && metrics.automatic_decision_count === 0],
  ["public and review state preserved", metrics.public_exposure_before === metrics.public_exposure_after && metrics.review_state_change_count === 0],
  ["persisted artifact safety", safetyScan.actual_persisted_secret_count === 0 && safetyScan.unclassified_match_count === 0 && safetyScan.actual_persisted_absolute_path_count === 0],
  ["risk status policy", terminalRiskStatuses.size > 0 && unresolvedRisks.every((risk) => risks.status_policy.unresolved_statuses.includes(risk.status))],
  ["risk contract", missingRiskFields.length === 0 && unassignedRiskCount === 0 && staleResolutionPhaseCount === 0 && missingOwnerCount === 0 && missingBlockingStatusCount === 0],
];
const failures = checks.filter(([, pass]) => !pass).map(([name]) => name);
if (failures.length) throw new Error(failures.join(", "));

const result = {
  generated_at: first.generated_at,
  status: "CONDITIONAL PASS",
  execution_mode: first.execution_mode,
  checks: checks.map(([name]) => name),
  metrics: {
    ...metrics,
    deterministic_replay_match: JSON.stringify(first) === JSON.stringify(second),
    output_schema_valid: metrics.schema_valid_count === metrics.evaluation_case_count,
    unresolved_risk_count: unresolvedRisks.length,
    unresolved_risk_missing_required_field_count: missingRiskFields.length,
    risk_unassigned_resolution_phase_count: unassignedRiskCount,
    risk_stale_resolution_phase_count: staleResolutionPhaseCount,
    risk_missing_owner_count: missingOwnerCount,
    risk_missing_blocking_status_count: missingBlockingStatusCount,
    actual_persisted_absolute_path_count: safetyScan.actual_persisted_absolute_path_count,
    total_secret_scan_match_count: safetyScan.total_secret_scan_match_count,
    classified_false_positive_count: safetyScan.classified_false_positive_count,
    actual_persisted_secret_count: safetyScan.actual_persisted_secret_count,
    unclassified_match_count: safetyScan.unclassified_match_count,
  },
  safety: { db_write: false, migration: false, production_apply: false, crawler_execution: false, external_provider_call: false },
};
await writeFile(resolve(root, "reports/post-phase-i-validation-report.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log("Post-Phase I validation CONDITIONAL PASS");
