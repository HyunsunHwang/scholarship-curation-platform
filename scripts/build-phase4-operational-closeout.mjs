import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { injectPhase4ActionEvidence, loadPhase4ActionEvidence } from "../lib/crawler-engine/runtime-diagnostics/phase4-action-evidence-loader.mjs";
import crypto from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimePath = path.join(root, ".tmp/runtime-analysis/phase4-authoritative-closeout/scholarship-notices-20260728.json");
const evidencePath = path.join(root, "reports/runtime-diagnostics/phase4-parser-evidence-gate-2026-07-28-run6.json");
const targetPath = path.join(root, "reports/runtime-diagnostics/phase2-parser-remediation/target-sources.json");
const output = path.join(root, "reports/runtime-diagnostics/phase4-operational-closeout-2026-07-28-run2.json");
const rawInputs = await Promise.all([runtimePath, evidencePath, targetPath].map(async (file) => fs.readFile(file)));
const [runtime, evidence, targets] = rawInputs.map((bytes) => JSON.parse(bytes.toString("utf8")));
if (runtime?.totals?.sourceCount !== 545 || runtime?.operationalDiagnostics?.source_diagnostics?.length !== 545) throw new Error("phase4_closeout_545_accounting_failed");
const targetIds = targets.targets.map((target) => target.source_id);
const manifestIndex = JSON.parse(await fs.readFile(path.join(root, "config/notice-sources/manifest-index.json"), "utf8"));
const manifestSources = [];
for (const group of manifestIndex.groups) {
  const manifest = JSON.parse(await fs.readFile(path.join(root, "config/notice-sources", group.path), "utf8"));
  manifestSources.push(...manifest.sources.map((source) => source.sourceId));
}
const runtimeSourceIds = runtime.operationalDiagnostics.source_diagnostics.map((row) => row.source_id);
const unique = (values) => new Set(values);
const missing = [...unique(manifestSources)].filter((id) => !unique(runtimeSourceIds).has(id));
const unexpected = [...unique(runtimeSourceIds)].filter((id) => !unique(manifestSources).has(id));
if (unique(manifestSources).size !== 545 || unique(runtimeSourceIds).size !== 545 || missing.length || unexpected.length) throw new Error("phase4_closeout_source_set_failed");
const loaded = loadPhase4ActionEvidence(evidence, { expectedSourceIds: targetIds, expectedRunIdentity: evidence.run_identity, expectedContractFingerprint: evidence.contract_fingerprint, expectedInputFileSha256: evidence.input_file_sha256, expectedAccounting: { expected_source_count: 87, index_source_count: 87, journal_source_count: 87, terminal_artifact_count: 87, incomplete_attempt_count: 0, artifact_file_count: 87, capture_success_count: 77, transport_lane_count: 10, verified_equivalent_count: 77, parser_regression_count: 0 } });
const diagnostics = injectPhase4ActionEvidence(runtime.operationalDiagnostics, loaded);
const diagnosticsValidation = (await import("../lib/crawler-engine/runtime-diagnostics/operational-crawl-failure-analyzer.mjs")).validateOperationalCrawlDiagnostics(diagnostics);
if (!diagnosticsValidation.valid) throw new Error(`phase4_closeout_operational_diagnostics_invalid:${diagnosticsValidation.errors.join(",")}`);
const targetRows = diagnostics.source_diagnostics.filter((row) => loaded.has(row.source_id));
if (targetRows.length !== 87 || new Set(targetRows.map((row) => row.source_id)).size !== 87) throw new Error("phase4_closeout_target_accounting_failed");
const count = (rows, field) => Object.entries(rows.reduce((result, row) => { const value = row[field] ?? "unknown"; result[value] = (result[value] ?? 0) + 1; return result; }, {})).sort(([a], [b]) => a.localeCompare(b)).map(([key, source_count]) => ({ [field]: key, source_count }));
const closeout = {
  schema_version: "phase4-operational-closeout-v2",
  generated_at: new Date().toISOString(),
  generator_code_sha: crypto.createHash("sha256").update(await fs.readFile(fileURLToPath(import.meta.url))).digest("hex"),
  runtime_report: path.basename(runtimePath),
  runtime_report_sha256: crypto.createHash("sha256").update(rawInputs[0]).digest("hex"),
  reconciliation_report: path.basename(evidencePath),
  reconciliation_report_sha256: crypto.createHash("sha256").update(rawInputs[1]).digest("hex"),
  reconciliation_sha256: evidence.reconciliation_sha256,
  run_identity: evidence.run_identity,
  contract_fingerprint: evidence.contract_fingerprint,
  source_accounting: { manifest_source_count: 545, runtime_diagnostic_source_count: diagnostics.source_diagnostics.length, unique_runtime_source_count: unique(runtimeSourceIds).size, runtime_duplicate_count: runtimeSourceIds.length - unique(runtimeSourceIds).size, missing_manifest_source_count: missing.length, unexpected_runtime_source_count: unexpected.length, target_source_count: targetRows.length, target_duplicate_count: 0, target_missing_count: 0 },
  target_action_class_counts: count(targetRows, "action_class"),
  target_evidence_basis_counts: count(targetRows, "evidence_basis"),
  transport_lane: targetRows.filter((row) => row.action_class === "transport_recovery").map((row) => ({ source_id: row.source_id, normalized_transport_failure: row.remediationEvidence.normalized_transport_failure })).sort((a, b) => a.source_id.localeCompare(b.source_id)),
  full_action_class_counts: count(diagnostics.source_diagnostics, "action_class"),
  full_evidence_basis_counts: count(diagnostics.source_diagnostics, "evidence_basis"),
  runtime_operational_summary: diagnostics.summary,
  target_sources: targetRows.map((row) => ({ source_id: row.source_id, action_class: row.action_class, evidence_basis: row.evidence_basis, runtime_result_status: row.runtime_result_status, capability_status: row.capability_status })).sort((a, b) => a.source_id.localeCompare(b.source_id)),
  validation: { operational_diagnostics_valid: true, summary_distribution_valid: true, source_set_valid: true, target_accounting_valid: true },
};
await fs.writeFile(output, `${JSON.stringify(closeout, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
console.log(JSON.stringify({ output: path.relative(root, output).replace(/\\/g, "/"), accounting: closeout.source_accounting, actions: closeout.target_action_class_counts }, null, 2));
