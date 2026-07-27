import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadNoticeSourceManifestRegistry } from "../lib/notice-source-manifest-loader.mjs";
import { buildPhase3RemediationClusters } from "../lib/crawler-engine/runtime-diagnostics/index.mjs";
import { writePhase3RemediationClusters } from "./build-phase3-parser-remediation-clusters.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseline = JSON.parse(fs.readFileSync(path.join(root, "reports", "runtime-diagnostics", "phase2-parser-remediation", "baseline.json"), "utf8"));
const registry = loadNoticeSourceManifestRegistry();
const first = buildPhase3RemediationClusters({ baseline, sameCaptureEvidence: [] });
const second = buildPhase3RemediationClusters({ baseline, sameCaptureEvidence: [] });
assert.deepEqual(first, second);
assert.equal(baseline.target_count, 87);
assert.equal(new Set(baseline.targets.map((target) => target.source_id)).size, 87);
assert.equal(registry.sources.length, 545);
const targetIds = baseline.targets.map((target) => target.source_id).sort();
assert.deepEqual(first.unclustered.map((item) => item.source_id), targetIds);
assert.equal(first.summary.clustered_source_count, 0);
assert.equal(first.summary.capture_required_source_count, 87);
assert.equal(first.unclustered.length, 87);
assert.ok(first.unclustered.every((item) => item.evidence_status === "capture_required" && item.next_phase_queue === "same_html_capture" && item.blocking_reason === "same_html_capture_absent"));
assert.ok(targetIds.every((sourceId) => registry.sources.some((source) => source.sourceId === sourceId)));
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "phase3-cluster-"));
try {
  const emptyEvidence = path.join(temporaryDirectory, "evidence");
  fs.mkdirSync(emptyEvidence);
  const firstPath = path.join(temporaryDirectory, "first.json");
  const secondPath = path.join(temporaryDirectory, "second.json");
  const baselinePath = path.join(root, "reports", "runtime-diagnostics", "phase2-parser-remediation", "baseline.json");
  writePhase3RemediationClusters({ baselinePath, evidenceDirectory: emptyEvidence, outputPath: firstPath });
  writePhase3RemediationClusters({ baselinePath, evidenceDirectory: emptyEvidence, outputPath: secondPath });
  assert.deepEqual(fs.readFileSync(firstPath), fs.readFileSync(secondPath));
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
console.log("phase3_parser_remediation_cluster_integration_tests_passed=11");
