import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createPhase4CaptureArtifactWriter } from "./run-phase4-same-html-capture-pilot.mjs";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "phase4-artifact-"));
const writer = createPhase4CaptureArtifactWriter(root);
const artifact = {
  schema_version: "phase4-capture-artifact-v1",
  run_identity: "phase4-capture-test",
  capture_contract_version: "phase4-capture-contract-v2",
  contract_fingerprint: "a".repeat(64),
  source_id: "source_001",
  capture_status: "capture_success",
  capture: { capture_id: "source_001-capture" },
};
try {
  const committed = await writer.commit(artifact);
  const metadata = { ...committed, source_id: artifact.source_id, capture_id: artifact.capture.capture_id, artifact_schema_version: artifact.schema_version, capture_contract_version: artifact.capture_contract_version };
  assert.equal(await writer.verify(metadata, { sourceId: artifact.source_id, runIdentity: artifact.run_identity, contractFingerprint: artifact.contract_fingerprint }), true);
  const recovered = await writer.recover({ sourceId: artifact.source_id, runIdentity: artifact.run_identity, contractFingerprint: artifact.contract_fingerprint });
  assert.equal(recovered.artifact_sha256, committed.artifact_sha256);
  await assert.rejects(() => writer.commit(artifact), /artifact_already_exists/);
  await fs.writeFile(committed.artifact_path, "{}\n", "utf8");
  assert.equal(await writer.verify(metadata, { sourceId: artifact.source_id, runIdentity: artifact.run_identity, contractFingerprint: artifact.contract_fingerprint }), false);
  console.log("phase4_capture_artifact_tests_passed=5");
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
