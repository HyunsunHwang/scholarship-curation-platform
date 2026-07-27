import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runPhase4SameHtmlCapture } from "../lib/crawler-engine/runtime-diagnostics/phase4-capture-orchestration.mjs";
import { validatePhase4CaptureArtifact } from "../lib/crawler-engine/runtime-diagnostics/phase4-capture-artifact-validator.mjs";
import { createPhase4CaptureArtifactWriter } from "./run-phase4-same-html-capture-pilot.mjs";

function source(sourceId) {
  return { sourceId, sourceName: sourceId, universitySlug: "test", listUrl: `https://example.test/${sourceId}`, baseUrl: "https://example.test", enabled: true, keywords: [] };
}

function transportFactory(error, calls) {
  return () => ({
    async fetchHtml() { calls.count += 1; throw error; },
    evidence() { return { request_attempt_count: calls.count, request_retry_count: 0, transport_error_code: error.code }; },
  });
}

function policyResolver({ sources }) {
  return new Map(sources.map((item) => [item.sourceId, { policyFingerprint: "b".repeat(64) }]));
}

async function terminalCase({ sourceId, error, expectedStatus, expectedQueue }) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `phase4-${expectedStatus}-`));
  try {
    const checkpointPath = path.join(root, "checkpoint.json");
    const calls = { count: 0 };
    const writer = createPhase4CaptureArtifactWriter(root);
    const options = {
      sources: [source(sourceId)], sourceRegistry: { mode: "manifest", sourceCount: 1 },
      checkpointPath, artifactWriter: writer, codeSha: "1".repeat(40),
      transportRegistry: { registryFingerprint: "a".repeat(64) }, transportPolicyResolver: policyResolver,
      transportClientFactory: transportFactory(error, calls), retryCount: 0,
    };
    const first = await runPhase4SameHtmlCapture(options);
    const result = first.results[0];
    assert.equal(result.capture_status, expectedStatus);
    assert.notEqual(result.capture_status, "artifact_commit_failure");
    assert.equal(calls.count, 1);
    assert.deepEqual(first.checkpoint.completed_source_keys, []);
    assert.equal(first.phase4_checkpoint.terminal_artifacts[sourceId].artifact_status, "committed");

    const artifactPath = path.join(root, "captures", `${sourceId}.json`);
    const artifact = JSON.parse(await fs.readFile(artifactPath, "utf8"));
    assert.equal(artifact.capture_status, expectedStatus);
    assert.equal(artifact.next_phase_queue, expectedQueue);
    assert.equal(artifact.capture, null);
    assert.equal(artifact.treatment, null);
    assert.equal(artifact.same_html_comparison, null);
    assert.equal(artifact.transport_evidence.request_attempt_count, artifact.request_attempt_count);
    validatePhase4CaptureArtifact(artifact, { expected: { sourceId, runIdentity: first.run_identity, contractFingerprint: first.contract_fingerprint } });

    const resumed = await runPhase4SameHtmlCapture({ ...options, resume: true });
    assert.equal(calls.count, 1);
    assert.equal(resumed.results[0].capture_status, "resume_skipped");
    assert.equal(resumed.results[0].resumed_capture_status, expectedStatus);
    return 1;
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

const transportFailure = Object.assign(new Error("ECONNRESET"), { code: "ECONNRESET" });
const blockedExternal = Object.assign(new Error("HTTP 403"), { code: "http_403", httpStatus: 403 });
const counts = await Promise.all([
  terminalCase({ sourceId: "transport_001", error: transportFailure, expectedStatus: "transport_failure", expectedQueue: "transport_recovery" }),
  terminalCase({ sourceId: "blocked_001", error: blockedExternal, expectedStatus: "blocked_external", expectedQueue: "external_retry" }),
]);
console.log(`phase4_capture_real_writer_integration_tests_passed=${counts.reduce((sum, value) => sum + value, 0)}`);
