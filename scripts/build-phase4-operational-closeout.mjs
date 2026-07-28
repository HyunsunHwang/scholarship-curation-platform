import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { injectPhase4ActionEvidence, loadPhase4ActionEvidence } from "../lib/crawler-engine/runtime-diagnostics/phase4-action-evidence-loader.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimePath = path.join(root, ".tmp/runtime-analysis/phase4-authoritative-closeout/scholarship-notices-20260728.json");
const evidencePath = path.join(root, "reports/runtime-diagnostics/phase4-parser-evidence-gate-2026-07-28-run5.json");
const targetPath = path.join(root, "reports/runtime-diagnostics/phase2-parser-remediation/target-sources.json");
const output = path.join(root, "reports/runtime-diagnostics/phase4-operational-closeout-2026-07-28.json");
const [runtime, evidence, targets] = await Promise.all([runtimePath, evidencePath, targetPath].map(async (file) => JSON.parse(await fs.readFile(file, "utf8"))));
if (runtime?.totals?.sourceCount !== 545 || runtime?.operationalDiagnostics?.source_diagnostics?.length !== 545) throw new Error("phase4_closeout_545_accounting_failed");
const targetIds = targets.targets.map((target) => target.source_id);
const loaded = loadPhase4ActionEvidence(evidence, { expectedSourceIds: targetIds });
const diagnostics = injectPhase4ActionEvidence(runtime.operationalDiagnostics, loaded);
const targetRows = diagnostics.source_diagnostics.filter((row) => loaded.has(row.source_id));
if (targetRows.length !== 87 || new Set(targetRows.map((row) => row.source_id)).size !== 87) throw new Error("phase4_closeout_target_accounting_failed");
const count = (rows, field) => Object.entries(rows.reduce((result, row) => { const value = row[field] ?? "unknown"; result[value] = (result[value] ?? 0) + 1; return result; }, {})).sort(([a], [b]) => a.localeCompare(b)).map(([key, source_count]) => ({ [field]: key, source_count }));
const closeout = {
  schema_version: "phase4-operational-closeout-v1",
  runtime_report: path.basename(runtimePath),
  reconciliation_report: path.basename(evidencePath),
  source_accounting: { manifest_source_count: 545, runtime_diagnostic_source_count: diagnostics.source_diagnostics.length, target_source_count: targetRows.length, target_duplicate_count: 0, target_missing_count: 0 },
  target_action_class_counts: count(targetRows, "action_class"),
  target_evidence_basis_counts: count(targetRows, "evidence_basis"),
  transport_lane: targetRows.filter((row) => row.action_class === "transport_recovery").map((row) => ({ source_id: row.source_id, normalized_transport_failure: row.remediationEvidence.normalized_transport_failure })).sort((a, b) => a.source_id.localeCompare(b.source_id)),
  runtime_operational_summary: diagnostics.summary,
  target_sources: targetRows.map((row) => ({ source_id: row.source_id, action_class: row.action_class, evidence_basis: row.evidence_basis, runtime_result_status: row.runtime_result_status, capability_status: row.capability_status })).sort((a, b) => a.source_id.localeCompare(b.source_id)),
};
await fs.writeFile(output, `${JSON.stringify(closeout, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
console.log(JSON.stringify({ output: path.relative(root, output).replace(/\\/g, "/"), accounting: closeout.source_accounting, actions: closeout.target_action_class_counts }, null, 2));
