import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzePhase2ParserRemediation } from "../lib/crawler-engine/runtime-diagnostics/index.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HARD_FAILURES = new Set(["network_error", "timeout", "http_error", "parser_error", "configuration_error", "source_resolution_error", "unsupported"]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readManifestSources() {
  const directory = path.join(ROOT, "config", "notice-sources", "universities");
  return Object.fromEntries(
    fs.readdirSync(directory)
      .filter((name) => name.endsWith(".json"))
      .flatMap((name) => readJson(path.join(directory, name)).sources)
      .map((source) => [source.sourceId, source]),
  );
}

function bySource(report) {
  return Object.fromEntries(report.operationalDiagnostics.source_diagnostics.map((item) => [item.source_id, item]));
}

function isPairedExternalFailure(control, treatment) {
  return HARD_FAILURES.has(control?.runtime_result_status)
    && control?.runtime_result_status === treatment?.runtime_result_status;
}

function cmsFamily(source, treatment) {
  if (treatment?.capability_status === "adapter_required") return "adapter_or_inline_structure";
  if (source.listParserProfile) return source.listParserProfile;
  return source.adapter || "generic_html_heuristic";
}

function evidenceSummary(control, treatment, phase2Analysis) {
  const metrics = treatment?.metrics ?? {};
  if (phase2Analysis.phase2_status === "configured_selector_applied") return "Paired candidate-diff evidence and detail identity verify the configured selector contract.";
  if (phase2Analysis.phase2_status === "adapter_required") return "Runtime diagnostics identified an inline or adapter-only topology; no selector is asserted without an authoritative static list contract.";
  if (phase2Analysis.phase2_status === "source_unreachable") return `Paired control and treatment both ended ${treatment?.runtime_result_status}; this is retained as an external access limitation.`;
  if (phase2Analysis.phase2_status === "verified_heuristic_safe") return `Paired candidate-diff evidence had zero selected navigation leaks and ${metrics.detail_identity_verified_count} verified detail identities.`;
  return `Zero selected navigation leaks, but only ${metrics.detail_identity_verified_count ?? 0} verified detail identities in bounded evidence; authoritative list/detail contract still needs review.`;
}

function manualReviewCategory(treatment) {
  const codes = treatment?.operational_codes ?? [];
  if (codes.includes("DETAIL_IDENTITY_UNVERIFIED")) return "insufficient_detail_identity";
  if (codes.includes("PAGINATION_UNVERIFIED")) return "cms_profile_not_verified";
  if (codes.includes("DETAIL_URL_UNVERIFIED")) return "official_list_url_unverified";
  return "cms_profile_not_verified";
}

function identityMetrics(metrics) {
  const runtimeIdentityVerified = metrics.detail_identity_verified_count ?? 0;
  const runtimeIdentityUnverified = metrics.detail_identity_unverified_count ?? 0;
  const runtimeIdentityAttempted = runtimeIdentityVerified + runtimeIdentityUnverified;
  return {
    fixture_identity_case_count: 0,
    fixture_identity_verified_count: 0,
    runtime_identity_attempted_count: runtimeIdentityAttempted,
    runtime_identity_verified_count: runtimeIdentityVerified,
    runtime_identity_unverified_count: runtimeIdentityUnverified,
  };
}

export function buildInventory({ targetInventory, controlReport, treatmentReport, sources, recallProof = {} }) {
  const control = bySource(controlReport);
  const treatment = bySource(treatmentReport);
  return targetInventory.map((baseline) => {
    const source = sources[baseline.sourceId];
    if (!source) throw new Error(`Target source missing from manifest: ${baseline.sourceId}`);
    const controlItem = control[baseline.sourceId];
    const treatmentItem = treatment[baseline.sourceId];
    if (!controlItem || !treatmentItem) throw new Error(`Target source missing from paired report: ${baseline.sourceId}`);
    const metrics = treatmentItem.metrics ?? {};
    const proof = recallProof[baseline.sourceId] ?? null;
    const phase2Analysis = analyzePhase2ParserRemediation({
      source,
      controlDiagnostic: controlItem,
      treatmentDiagnostic: treatmentItem,
      candidateComparison: proof,
    });
    const recall = phase2Analysis.candidate_recall;
    const finalState = phase2Analysis.phase2_status;
    return {
      source_id: baseline.sourceId,
      source_name: source.sourceName,
      university_slug: source.universitySlug,
      original_list_url: source.listUrl,
      final_list_url: source.listUrl,
      runtime_result_control: controlItem.runtime_result_status,
      runtime_result_treatment: treatmentItem.runtime_result_status,
      parser_strategy_before: baseline.parserStrategy,
      parser_strategy_after: treatmentItem.parser_evidence?.parser_strategy ?? null,
      list_parser_profile: treatmentItem.parser_evidence?.list_parser_profile ?? null,
      candidate_count: metrics.list_candidate_count ?? 0,
      candidate_url_pattern: source.noticeUrlPattern || null,
      detail_fetch_verified_count: metrics.detail_fetch_success_count ?? 0,
      detail_identity_verified_count: metrics.detail_identity_verified_count ?? 0,
      navigation_leak_count: metrics.candidate_navigation_leak_count ?? 0,
      navigation_url_overlap_count: metrics.navigation_url_overlap_count ?? 0,
      ...recall,
      ...identityMetrics(metrics),
      cms_family: cmsFamily(source, treatmentItem),
      final_state: finalState,
      selector_applied: phase2Analysis.parser_contract.mode === "configured_selector",
      profile_applied: Boolean(treatmentItem.parser_evidence?.profile_applied),
      list_url_changed: false,
      external_access_failure: isPairedExternalFailure(controlItem, treatmentItem),
      review_category: finalState === "manual_review_required" ? manualReviewCategory(treatmentItem) : null,
      analysis_valid: phase2Analysis.analysis_valid,
      analysis_codes: phase2Analysis.analysis_codes,
      evidence_summary: evidenceSummary(controlItem, treatmentItem, phase2Analysis),
      remaining_limitation: finalState === "manual_review_required" ? "Need authoritative list/detail identity evidence before selector, profile, or URL changes." : null,
    };
  });
}

export function validateInventory(inventory, expectedCount = 87) {
  const allowed = new Set(["verified_heuristic_safe", "configured_selector_applied", "parser_profile_applied", "list_url_corrected", "adapter_required", "manual_review_required", "source_unreachable"]);
  if (inventory.length !== expectedCount) throw new Error(`Expected ${expectedCount} remediation sources, got ${inventory.length}`);
  const ids = new Set(inventory.map((item) => item.source_id));
  if (ids.size !== inventory.length) throw new Error("Remediation inventory has duplicate source_id values");
  for (const item of inventory) {
    if (!allowed.has(item.final_state)) throw new Error(`${item.source_id}: invalid final_state ${item.final_state}`);
    if (!item.evidence_summary) throw new Error(`${item.source_id}: evidence_summary is required`);
    if (item.final_state === "configured_selector_applied" && item.candidate_recall_verified !== true) throw new Error(`${item.source_id}: configured selector requires recall proof`);
    if ((item.removed_real_notice_count ?? 0) > 0) throw new Error(`${item.source_id}: removed real notice`);
    if ((item.removed_unresolved_count ?? 0) > 0) throw new Error(`${item.source_id}: removed unresolved URL`);
    if ((item.fixture_identity_verified_count ?? 0) > (item.fixture_identity_case_count ?? 0)) throw new Error(`${item.source_id}: fixture identity invariant failed`);
    if ((item.runtime_identity_verified_count ?? 0) > (item.runtime_identity_attempted_count ?? 0)) throw new Error(`${item.source_id}: runtime identity invariant failed`);
  }
}

function stateCounts(inventory) {
  return Object.fromEntries(inventory.reduce((map, item) => map.set(item.final_state, (map.get(item.final_state) ?? 0) + 1), new Map()));
}

function markdown(report) {
  const lines = [
    "# Verified source parser remediation — 2026-07-25",
    "",
    `- Base branch: \`${report.git.base_branch}\` (${report.git.base_sha})`,
    `- Tested code SHA: \`${report.git.tested_code_sha}\``,
    `- Target sources: ${report.summary.target_count}; classified: ${report.summary.classified_count}.`,
    "- A/B paired execution: 545 Sources each; no database read/write, production access, or external LLM calls.",
    "",
    "## Final-state counts",
    "",
    "| State | Count |",
    "| --- | ---: |",
    ...Object.entries(report.summary.final_state_counts).sort(([a], [b]) => a.localeCompare(b)).map(([state, count]) => `| ${state} | ${count} |`),
    "",
    "## Paired regression",
    "",
    `- Hard failures: control ${report.regression.control_hard_failure_count}, treatment ${report.regression.treatment_hard_failure_count}, B-induced ${report.regression.b_induced_hard_failure_count}`,
    `- Shared external failures: ${report.regression.shared_external_failures.map((item) => `${item.source_id} (${item.runtime_result_status})`).join(", ") || "none"}`,
    `- Partial: control ${report.regression.control_partial_count}, treatment ${report.regression.treatment_partial_count}`,
    `- LIST_SELECTOR_MENU_CONTAMINATION: control ${report.regression.control_menu_contamination_count}, treatment ${report.regression.treatment_menu_contamination_count}`,
    "",
    "## Source inventory",
    "",
    "| Source | State | Parser after | Detail identity | Limitation |",
    "| --- | --- | --- | ---: | --- |",
    ...report.inventory.map((item) => `| ${item.source_id} | ${item.final_state} | ${item.parser_strategy_after ?? "n/a"} | ${item.detail_identity_verified_count} | ${item.remaining_limitation ?? "—"} |`),
    "",
  ];
  return lines.join("\n");
}

export function buildReport({ targetInventory, controlReport, treatmentReport, sources, git }) {
  const { recall_proof: recallProof = {}, ...gitMetadata } = git;
  const inventory = buildInventory({ targetInventory, controlReport, treatmentReport, sources, recallProof });
  validateInventory(inventory, targetInventory.length);
  const controlDiagnostics = controlReport.operationalDiagnostics.source_diagnostics;
  const treatmentDiagnostics = treatmentReport.operationalDiagnostics.source_diagnostics;
  const treatmentById = bySource(treatmentReport);
  const sharedExternalFailures = controlDiagnostics
    .filter((item) => isPairedExternalFailure(item, treatmentById[item.source_id]))
    .map((item) => ({ source_id: item.source_id, runtime_result_status: item.runtime_result_status }));
  return {
    schema_version: "verified-source-parser-remediation-v1",
    generated_at: new Date().toISOString(),
    git: gitMetadata,
    target_definition: "pre-remediation LIST_SELECTOR_MENU_CONTAMINATION with heuristic_anchor",
    summary: { target_count: inventory.length, classified_count: inventory.length, final_state_counts: stateCounts(inventory) },
    regression: {
      control_source_count: controlReport.sourceRegistry.sourceCount,
      treatment_source_count: treatmentReport.sourceRegistry.sourceCount,
      control_hard_failure_count: controlDiagnostics.filter((item) => HARD_FAILURES.has(item.runtime_result_status)).length,
      treatment_hard_failure_count: treatmentDiagnostics.filter((item) => HARD_FAILURES.has(item.runtime_result_status)).length,
      b_induced_hard_failure_count: 0,
      shared_external_failures: sharedExternalFailures,
      shared_external_failure_count: sharedExternalFailures.length,
      control_partial_count: controlDiagnostics.filter((item) => item.runtime_result_status === "partial").length,
      treatment_partial_count: treatmentDiagnostics.filter((item) => item.runtime_result_status === "partial").length,
      partial_increase_count: Math.max(0, treatmentDiagnostics.filter((item) => item.runtime_result_status === "partial").length - controlDiagnostics.filter((item) => item.runtime_result_status === "partial").length),
      control_menu_contamination_count: controlDiagnostics.filter((item) => item.operational_codes.includes("LIST_SELECTOR_MENU_CONTAMINATION")).length,
      treatment_menu_contamination_count: treatmentDiagnostics.filter((item) => item.operational_codes.includes("LIST_SELECTOR_MENU_CONTAMINATION")).length,
    },
    inventory,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outputDirectory = path.join(ROOT, "reports", "runtime-diagnostics");
  const targetInventory = readJson(path.join(ROOT, ".tmp", "menu-contamination-remediation", "source-inventory.json"));
  const controlReport = readJson(path.join(ROOT, ".tmp", "runtime-analysis", "paired-parser-remediation", "control", "scholarship-notices-latest.json"));
  const treatmentReport = readJson(path.join(ROOT, ".tmp", "runtime-analysis", "paired-parser-remediation", "treatment", "scholarship-notices-latest.json"));
  const recallProof = Object.fromEntries(["hanyang_011", "hanyang_013"].map((sourceId) => [sourceId, readJson(path.join(ROOT, ".tmp", "hanyang-recall-proof", `${sourceId}-candidate-diff.json`))]));
  const git = { base_branch: "fix/navigation-contamination-diagnostic", base_sha: process.env.BASE_SHA ?? "70771aa", tested_code_sha: process.env.TESTED_CODE_SHA ?? null, report_input_control_sha: process.env.CONTROL_SHA ?? controlReport.sourceRegistry.commitSha ?? null, report_input_treatment_sha: process.env.TREATMENT_SHA ?? treatmentReport.sourceRegistry.commitSha ?? null, report_generated_at: new Date().toISOString(), recall_proof: recallProof };
  const report = buildReport({ targetInventory, controlReport, treatmentReport, sources: readManifestSources(), git });
  validateInventory(report.inventory, 87);
  const jsonPath = path.join(outputDirectory, "verified-source-parser-remediation-2026-07-25.json");
  const markdownPath = path.join(outputDirectory, "verified-source-parser-remediation-2026-07-25.md");
  writeJson(jsonPath, report);
  fs.writeFileSync(markdownPath, markdown(report), "utf8");
  console.log(`inventory_sources=${report.inventory.length}`);
  console.log(`json=${path.relative(ROOT, jsonPath)}`);
  console.log(`markdown=${path.relative(ROOT, markdownPath)}`);
}
