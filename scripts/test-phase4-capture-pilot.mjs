import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PHASE4_PILOT_SOURCES, runPhase4CapturePilot } from "./run-phase4-same-html-capture-pilot.mjs";

const rootDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "phase4-pilot-"));
const directory = path.join(rootDirectory, "artifacts");
let calls = 0;
const registry = { fingerprint: { mode: "manifest", sourceCount: PHASE4_PILOT_SOURCES.length }, sources: PHASE4_PILOT_SOURCES.map(({ sourceId }) => ({ sourceId, sourceName: sourceId, listUrl: `https://example.test/${sourceId}`, enabled: true })) };
const runner = async ({ onResult, resume }) => {
  calls += 1;
  const row = { source_id: "cau_003", capture_status: resume ? "resume_skipped" : "capture_success", evidence_status: "insufficient_evidence", list_fetch_count: resume ? 0 : 1, request_attempt_count: 0 };
  await onResult(row);
  return { source_count: PHASE4_PILOT_SOURCES.length, results: [row], checkpoint: { summary: {} } };
};
try {
  await runPhase4CapturePilot({ outputDirectory: directory, loadRegistry: () => registry, captureRunner: runner });
  assert.equal(calls, 1);
  assert.equal(await fs.stat(path.join(directory, "captures", "cau_003.json")).then(() => true), true);
  await assert.rejects(() => runPhase4CapturePilot({ outputDirectory: directory, loadRegistry: () => registry, captureRunner: runner }), /already exists/);
  assert.equal(calls, 1);
  await runPhase4CapturePilot({ outputDirectory: directory, resume: true, loadRegistry: () => registry, captureRunner: runner });
  assert.equal(calls, 2);
  await assert.rejects(() => runPhase4CapturePilot({ outputDirectory: directory, resume: true, loadRegistry: () => registry, captureRunner: runner }), /resume summary already exists/);
  assert.equal(calls, 2);
  console.log("phase4_capture_pilot_tests_passed=6");
} finally {
  await fs.rm(rootDirectory, { recursive: true, force: true });
}
