import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET_REPORT = path.join(ROOT, "reports", "runtime-diagnostics", "verified-source-parser-remediation-2026-07-25.json");
const OUTPUT_DIRECTORY = path.join(ROOT, "reports", "runtime-diagnostics", "phase2-parser-remediation");
const DEFAULT_RUNTIME_SNAPSHOT = path.join(OUTPUT_DIRECTORY, "runtime-input-snapshot.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function counts(items, key) {
  return Object.fromEntries(items.reduce((map, item) => map.set(item[key] ?? "null", (map.get(item[key] ?? "null") ?? 0) + 1), new Map()));
}

export function buildPhase2Baseline({ historicalReport, runtimeReport }) {
  const targetSources = historicalReport.inventory.map((item) => ({
    source_id: item.source_id,
    university_slug: item.university_slug,
    source_name: item.source_name,
    historical_selection: {
      primary_failure_code: "LIST_SELECTOR_MENU_CONTAMINATION",
      parser_strategy: item.parser_strategy_before,
      meaning: "Historical target: prior diagnostics conflated selected-node navigation leakage with navigation URL overlap.",
    },
  })).sort((left, right) => left.source_id.localeCompare(right.source_id));
  if (targetSources.length !== 87 || new Set(targetSources.map((item) => item.source_id)).size !== 87) {
    throw new Error("Phase 2 historical target set must contain exactly 87 unique Sources");
  }

  const runtimeInput = runtimeReport.operationalDiagnostics
    ? {
      sourceRegistry: runtimeReport.sourceRegistry,
      runAt: runtimeReport.runAt,
      sourceDiagnostics: runtimeReport.operationalDiagnostics.source_diagnostics,
      provenance: null,
    }
    : {
      sourceRegistry: runtimeReport.source_registry,
      runAt: runtimeReport.run_at ?? runtimeReport.provenance?.run_at,
      sourceDiagnostics: runtimeReport.source_diagnostics,
      provenance: runtimeReport.provenance,
    };
  const diagnostics = runtimeInput.sourceDiagnostics;
  const diagnosticById = new Map(diagnostics.map((item) => [item.source_id, item]));
  const current = targetSources.map((target) => {
    const diagnostic = diagnosticById.get(target.source_id);
    if (!diagnostic) throw new Error(`Current runtime report omitted target ${target.source_id}`);
    return {
      ...target,
      runtime_result_status: diagnostic.runtime_result_status,
      capability_status: diagnostic.capability_status,
      primary_failure_code: diagnostic.primary_failure_code,
      operational_codes: diagnostic.operational_codes,
      parser_strategy: diagnostic.parser_evidence?.parser_strategy ?? null,
      candidate_navigation_leak_count: diagnostic.metrics?.candidate_navigation_leak_count ?? null,
      navigation_url_overlap_count: diagnostic.metrics?.navigation_url_overlap_count ?? null,
      detail_identity_verified_count: diagnostic.metrics?.detail_identity_verified_count ?? null,
    };
  });

  return {
    schema_version: "phase2-parser-remediation-baseline-v1",
    generated_at: runtimeInput.runAt,
    source_registry: runtimeInput.sourceRegistry,
    runtime_input_provenance: runtimeInput.provenance,
    historical_target_definition: historicalReport.target_definition,
    target_count: targetSources.length,
    targets: current,
    current_summary: {
      runtime_result_status_counts: counts(current, "runtime_result_status"),
      capability_status_counts: counts(current, "capability_status"),
      primary_failure_code_counts: counts(current, "primary_failure_code"),
      selected_navigation_leak_source_count: current.filter((item) => Number(item.candidate_navigation_leak_count) > 0).length,
      navigation_url_overlap_source_count: current.filter((item) => Number(item.navigation_url_overlap_count) > 0).length,
    },
    audit_findings: [
      "The crawler evidence distinguishes candidate_navigation_leak_count from navigation_url_overlap_count.",
      "The remediation report generator currently derives final_state outside the operational analyzer, so phase 1 must move final phase2 interpretation into analyzer output.",
      "The remediation report generator defaults candidate_recall_verified for non-configured sources without candidate-diff evidence; phase 1 must remove that optimistic default.",
      "Current operational capability_status still permits manual_review_required; phase 1 must introduce the phase2 terminal status model without changing crawler observation semantics.",
    ],
  };
}

export function renderPhase2BaselineMarkdown(baseline) {
  return `# Phase 2 parser remediation baseline\n\n- Historical targets: ${baseline.target_count}\n- Current selected navigation leaks: ${baseline.current_summary.selected_navigation_leak_source_count}\n- Current navigation URL overlap Sources: ${baseline.current_summary.navigation_url_overlap_source_count}\n\n## Contract audit\n\n${baseline.audit_findings.map((finding) => `- ${finding}`).join("\n")}\n\n## Current capability status\n\n${Object.entries(baseline.current_summary.capability_status_counts).map(([status, count]) => `- ${status}: ${count}`).join("\n")}\n`;
}

export function buildPhase2BaselineArtifacts({ historicalReport, runtimeReport }) {
  const baseline = buildPhase2Baseline({ historicalReport, runtimeReport });
  const targetSources = {
    schema_version: "phase2-target-sources-v1",
    target_count: baseline.target_count,
    targets: baseline.targets.map(({ runtime_result_status, capability_status, primary_failure_code, operational_codes, parser_strategy, candidate_navigation_leak_count, navigation_url_overlap_count, detail_identity_verified_count, ...target }) => target),
  };
  return { baseline, targetSources, markdown: renderPhase2BaselineMarkdown(baseline) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const runtimePath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_RUNTIME_SNAPSHOT;
  const artifacts = buildPhase2BaselineArtifacts({ historicalReport: readJson(TARGET_REPORT), runtimeReport: readJson(runtimePath) });
  writeJson(path.join(OUTPUT_DIRECTORY, "target-sources.json"), artifacts.targetSources);
  writeJson(path.join(OUTPUT_DIRECTORY, "baseline.json"), artifacts.baseline);
  fs.writeFileSync(path.join(OUTPUT_DIRECTORY, "baseline.md"), artifacts.markdown, "utf8");
  console.log(`target_sources=${artifacts.baseline.target_count}`);
}
