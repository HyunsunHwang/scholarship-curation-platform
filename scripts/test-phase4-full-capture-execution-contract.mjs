import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  preparePhase4FullCaptureExecution,
  executePreparedPhase4FullCapture,
} from "../lib/crawler-engine/runtime-diagnostics/phase4-full-capture-dry-run.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const prepared = await preparePhase4FullCaptureExecution({
  repositoryRoot: root,
  privateArtifactRoot: path.join(root, ".tmp", "phase4-private-artifacts"),
  checkpoint: "auto",
  readinessReportPath: path.join(root, "reports/runtime-diagnostics/phase4c-readiness-closeout-2026-07-27-run2.json"),
  runIdentity: "auto",
});
assert.equal(prepared.sources.length, 87);
assert.equal(Object.keys(prepared.historicalControls.controlConfigs).length, 87);
assert.equal(prepared.resolvedTransportPolicies.size, 87);
assert.equal(prepared.checkpointPath, path.join(prepared.runDirectory, "checkpoint.json"));
assert.equal(prepared.orchestrationArgs.sources, prepared.sources);
assert.equal(prepared.orchestrationArgs.controlConfigs, prepared.historicalControls.controlConfigs);
assert.equal(prepared.orchestrationArgs.artifactWriter.commit instanceof Function, true);
assert.equal(prepared.orchestrationArgs.artifactWriter.verify instanceof Function, true);
assert.equal(prepared.orchestrationArgs.artifactWriter.recover instanceof Function, true);
let calls = 0;
await assert.rejects(
  () => executePreparedPhase4FullCapture({ ...prepared, orchestration: async () => { calls += 1; } }),
  (error) => error?.code === "phase4_full_capture_execution_not_released",
);
assert.equal(calls, 0);
console.log("phase4_full_capture_execution_contract_tests_passed=10");
