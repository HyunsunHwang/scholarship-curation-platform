import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PHASE4B_PILOT_SOURCE_IDS,
  buildPhase4BOfflinePilot,
  loadLegacyPhase4PilotCapture,
  phase4BReportFiles,
  withOfflineNetworkGuard,
} from "../lib/crawler-engine/runtime-diagnostics/phase4b-offline-pilot.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const report = JSON.parse(fs.readFileSync(path.join(root, "reports/runtime-diagnostics/phase4-capture-pilot-2026-07-27-run2.json"), "utf8"));
const captures = path.join(root, ".tmp/runtime-analysis/phase4-capture-pilot-20260727-v3/captures");
const reportSource = report.sources.find((row) => row.source_id === "cau_003");

assert.equal(PHASE4B_PILOT_SOURCE_IDS.length, 9);
assert.equal(loadLegacyPhase4PilotCapture({ sourceId: "cau_003", artifactPath: path.join(captures, "absent.json"), reportSource }).raw_capture_status, "raw_capture_missing");
const temporary = await fsp.mkdtemp(path.join(os.tmpdir(), "phase4b-offline-"));
try {
  const corruptPath = path.join(temporary, "corrupt.json");
  fs.writeFileSync(corruptPath, "{", "utf8");
  assert.equal(loadLegacyPhase4PilotCapture({ sourceId: "cau_003", artifactPath: corruptPath, reportSource }).raw_capture_status, "raw_capture_corrupt");
  const artifact = JSON.parse(fs.readFileSync(path.join(captures, "cau_003.json"), "utf8"));
  const mismatchPath = path.join(temporary, "mismatch.json");
  fs.writeFileSync(mismatchPath, JSON.stringify({ ...artifact, capture: { ...artifact.capture, html_sha256: "0".repeat(64) } }), "utf8");
  assert.equal(loadLegacyPhase4PilotCapture({ sourceId: "cau_003", artifactPath: mismatchPath, reportSource }).raw_capture_status, "raw_capture_hash_mismatch");
  const reportMismatch = { ...reportSource, capture: { ...reportSource.capture, final_url: "https://example.test/other" } };
  assert.equal(loadLegacyPhase4PilotCapture({ sourceId: "cau_003", artifactPath: path.join(captures, "cau_003.json"), reportSource: reportMismatch }).raw_capture_status, "raw_capture_report_mismatch");
  await assert.rejects(() => withOfflineNetworkGuard(() => globalThis.fetch("https://example.test")), /forbids network/i);

  const options = { repositoryRoot: root, rawCaptureDirectory: captures, pilotReportPath: path.join(root, "reports/runtime-diagnostics/phase4-capture-pilot-2026-07-27-run2.json") };
  const first = await buildPhase4BOfflinePilot(options);
  const second = await buildPhase4BOfflinePilot(options);
  assert.deepEqual(first, second);
  assert.equal(first.offline_network_fetch_count, 0);
  assert.equal(first.accounting.raw_capture_verified_count, 8);
  assert.equal(first.accounting.comparison_ready_count, 8);
  assert.equal(first.accounting.transport_recovery_count, 1);
  assert.equal(first.comparisons.length, 8);
  assert.equal(first.clusters.summary.clustered_source_count, 8);
  assert.equal(first.inventory.find((row) => row.source_id === "hanyang_014").next_phase_queue, "transport_recovery");
  for (const row of first.comparisons) {
    assert.equal(row.capture.html_sha256, row.candidate_comparison.same_html_sha256);
    assert.equal(row.control.parser_status, "success");
    assert.equal(row.treatment.parser_status, "success");
  }
  for (const cluster of first.clusters.clusters) {
    const signature = JSON.stringify(cluster.structural_signature);
    assert.doesNotMatch(signature, /https?:\/\//i);
    assert.doesNotMatch(signature, /iadpr\.cau|hanyang\.ac\.kr|korea\.ac\.kr|skku\.edu|lauos\.or\.kr/i);
  }
  const serialized = JSON.stringify(phase4BReportFiles(first));
  assert.doesNotMatch(serialized, /html_base64|runtime-analysis|\\\\captures\\\\|\/captures\//i);
  console.log("phase4b_offline_pilot_tests_passed=17");
} finally {
  await fsp.rm(temporary, { recursive: true, force: true });
}
