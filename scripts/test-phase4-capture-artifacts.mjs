import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createPhase4CaptureArtifactWriter } from "./run-phase4-same-html-capture-pilot.mjs";
import { canonicalPhase4ArtifactJson, phase4ArtifactSha256 } from "../lib/crawler-engine/runtime-diagnostics/phase4-capture-artifact-validator.mjs";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "phase4-artifact-"));
const writer = createPhase4CaptureArtifactWriter(root);
const competingWriter = createPhase4CaptureArtifactWriter(root);
const contract = { code_sha: "test-code", sources: [{ source_id: "source_001", source_config_sha256: "a".repeat(64), treatment_config_sha256: "a".repeat(64), historical_control_config_sha256: "historical_control_unavailable" }] };
const artifact = {
  schema_version: "phase4-capture-artifact-v1",
  run_identity: "phase4-capture-test",
  capture_contract_version: "phase4-capture-contract-v2",
  contract_fingerprint: phase4ArtifactSha256(canonicalPhase4ArtifactJson(contract)),
  source_id: "source_001",
  capture_status: "transport_failure",
  evidence_status: "insufficient_evidence",
  next_phase_queue: "transport_recovery",
  blocking_reason: "ECONNRESET",
  list_fetch_count: 1,
  request_attempt_count: 1,
  transport_evidence: {},
  contract,
};
try {
  const concurrent = await Promise.allSettled([writer.commit(artifact), competingWriter.commit(artifact)]);
  assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(concurrent.filter((result) => result.status === "rejected")[0].reason.code, "artifact_already_exists");
  const committed = concurrent.find((result) => result.status === "fulfilled").value;
  const metadata = { ...committed, source_id: artifact.source_id, capture_id: null, capture_status: artifact.capture_status, evidence_status: artifact.evidence_status, next_phase_queue: artifact.next_phase_queue, blocking_reason: artifact.blocking_reason, artifact_status: "committed", artifact_schema_version: artifact.schema_version, capture_contract_version: artifact.capture_contract_version, run_identity: artifact.run_identity, contract_fingerprint: artifact.contract_fingerprint };
  assert.equal(await writer.verify(metadata, { sourceId: artifact.source_id, runIdentity: artifact.run_identity, contractFingerprint: artifact.contract_fingerprint }), true);
  const recovered = await writer.recover({ sourceId: artifact.source_id, runIdentity: artifact.run_identity, contractFingerprint: artifact.contract_fingerprint });
  assert.equal(recovered.artifact_sha256, committed.artifact_sha256);
  await assert.rejects(() => writer.commit(artifact), (error) => error?.code === "artifact_already_exists");
  await fs.writeFile(committed.artifact_path, "{}\n", "utf8");
  assert.equal(await writer.verify(metadata, { sourceId: artifact.source_id, runIdentity: artifact.run_identity, contractFingerprint: artifact.contract_fingerprint }), false);
  console.log("phase4_capture_artifact_tests_passed=8");
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
