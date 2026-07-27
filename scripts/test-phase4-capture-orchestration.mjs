import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runPhase4SameHtmlCapture } from "../lib/crawler-engine/runtime-diagnostics/phase4-capture-orchestration.mjs";
import { validatePhase4CaptureArtifact } from "../lib/crawler-engine/runtime-diagnostics/phase4-capture-artifact-validator.mjs";

const html = Buffer.from('<table><tr><td><a href="/notice?id=7">장학 공지</a></td><td>2026-07-27</td></tr></table>', "utf8");
const source = Object.freeze({ sourceId: "pilot_001", sourceName: "Pilot", listUrl: "https://example.edu/notice", baseUrl: "https://example.edu", enabled: true, adapter: "", listItemSelector: "table tr", linkSelector: "a[href]", titleSelector: "a[href]", dateSelector: "td:last-child", noticeUrlPattern: "[?&]id=\\d+", listParserProfile: "" });
const sourceB = Object.freeze({ ...source, sourceId: "pilot_002", sourceName: "Pilot B", listUrl: "https://example.edu/notice-b" });
const registry = Object.freeze({ registryFingerprint: "a".repeat(64) });
const policy = Object.freeze({ policyFingerprint: "b".repeat(64) });
const resolve = ({ sources = [source] } = {}) => new Map(sources.map((item) => [item.sourceId, policy]));
function fakeFactory({ response = null, error = null, calls }) {
  return () => ({
    async fetchHtml() { calls.count += 1; if (error) throw error; return response; },
    evidence() { return { request_attempt_count: calls.count, request_retry_count: 0, redirect_chain: [], final_url: response?.finalUrl ?? null }; },
  });
}
function response(bytes = html, contentType = "text/html; charset=utf-8") { return { bytes, httpStatus: 200, finalUrl: source.listUrl, contentType, redirectChain: [] }; }
function artifactWriter() {
  const artifacts = new Map();
  return {
    async commit(artifact) {
      const canonical = validatePhase4CaptureArtifact(artifact, { expected: { sourceId: artifact.source_id, runIdentity: artifact.run_identity, contractFingerprint: artifact.contract_fingerprint } });
      const value = JSON.stringify(canonical);
      const metadata = { artifact_committed: true, artifact_path: canonical.source_id, artifact_sha256: crypto.createHash("sha256").update(value).digest("hex") };
      artifacts.set(canonical.source_id, { artifact: canonical, metadata });
      return metadata;
    },
    async verify(metadata, expected) {
      const found = artifacts.get(expected.sourceId);
      if (!found || found.metadata.artifact_sha256 !== metadata.artifact_sha256) return false;
      try { validatePhase4CaptureArtifact(found.artifact, { expected }); return true; } catch { return false; }
    },
    async recover(expected) {
      const found = artifacts.get(expected.sourceId);
      if (!found || found.artifact.run_identity !== expected.runIdentity || found.artifact.contract_fingerprint !== expected.contractFingerprint) return null;
      return { source_id: expected.sourceId, capture_id: found.artifact.capture?.capture_id ?? null, capture_status: found.artifact.capture_status, evidence_status: found.artifact.evidence_status, next_phase_queue: found.artifact.next_phase_queue, blocking_reason: found.artifact.blocking_reason, artifact_status: "committed", artifact_path: found.metadata.artifact_path, artifact_sha256: found.metadata.artifact_sha256, artifact_schema_version: found.artifact.schema_version, capture_contract_version: found.artifact.capture_contract_version };
    },
    invalidate(sourceId) { artifacts.delete(sourceId); },
  };
}
async function run(options = {}) {
  return runPhase4SameHtmlCapture({ sources: options.sources ?? [source], sourceRegistry: { mode: "manifest", sourceCount: 1 }, transportRegistry: registry, transportPolicyResolver: resolve, artifactWriter: options.artifactWriter ?? artifactWriter(), ...options });
}

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "phase4-capture-"));
try {
  {
    const calls = { count: 0 };
    const output = await run({ transportClientFactory: fakeFactory({ response: response(), calls }) });
    assert.equal(calls.count, 1);
    assert.equal(output.results[0].list_fetch_count, 1);
    assert.equal(output.results[0].request_attempt_count, 1);
    assert.equal(output.results[0].capture_status, "capture_success");
    assert.equal(output.results[0].evidence_status, "insufficient_evidence");
    assert.equal(output.results[0].capture.html_sha256, crypto.createHash("sha256").update(html).digest("hex"));
    assert.equal(output.results[0].treatment.html_sha256, output.results[0].capture.html_sha256);
    assert.equal(output.results[0].treatment.candidates[0].source_capture_hash, output.results[0].capture.html_sha256);
  }
  {
    const calls = { count: 0 };
    const output = await run({ controlConfigs: { pilot_001: source }, transportClientFactory: fakeFactory({ response: response(), calls }) });
    assert.equal(calls.count, 1);
    assert.equal(output.results[0].same_html_comparison.capture.html_sha256, output.results[0].same_html_comparison.control.html_sha256);
    assert.equal(output.results[0].same_html_comparison.control.html_sha256, output.results[0].same_html_comparison.treatment.html_sha256);
  }
  {
    const calls = { count: 0 };
    const output = await run({ transportClientFactory: fakeFactory({ response: response(Buffer.from("{}"), "application/json"), calls }) });
    assert.equal(calls.count, 1);
    assert.equal(output.results[0].capture_status, "invalid_content");
  }
  {
    const calls = { count: 0 };
    const error = Object.assign(new Error("HTTP 403"), { httpStatus: 403, code: "http_403" });
    const output = await run({ transportClientFactory: fakeFactory({ error, calls }) });
    assert.equal(output.results[0].capture_status, "blocked_external");
  }
  {
    const calls = { count: 0 };
    const checkpointPath = path.join(temporary, "checkpoint.json");
    const writer = artifactWriter();
    await run({ checkpointPath, artifactWriter: writer, transportClientFactory: fakeFactory({ response: response(), calls }) });
    assert.equal(calls.count, 1);
    const resumed = await run({ checkpointPath, resume: true, artifactWriter: writer, transportClientFactory: fakeFactory({ response: response(), calls }) });
    assert.equal(calls.count, 1);
    assert.equal(resumed.results[0].capture_status, "resume_skipped");
    assert.equal(resumed.results[0].list_fetch_count, 0);
  }
  {
    const calls = { count: 0 };
    const checkpointPath = path.join(temporary, "journal-recovery.json");
    const writer = artifactWriter();
    await run({ checkpointPath, artifactWriter: writer, transportClientFactory: fakeFactory({ response: response(), calls }) });
    await fs.unlink(`${checkpointPath}.phase4-capture.json`);
    const resumed = await run({ checkpointPath, resume: true, artifactWriter: writer, transportClientFactory: fakeFactory({ response: response(), calls }) });
    assert.equal(calls.count, 1);
    assert.equal(resumed.results[0].capture_status, "resume_skipped");
  }
  {
    const calls = { count: 0 };
    const checkpointPath = path.join(temporary, "artifact-failure.json");
    const writer = { async commit() { throw Object.assign(new Error("disk full"), { code: "artifact_temporary_write_failure" }); }, async verify() { return false; } };
    const output = await run({ checkpointPath, artifactWriter: writer, transportClientFactory: fakeFactory({ response: response(), calls }) });
    assert.equal(output.results[0].capture_status, "artifact_commit_failure");
    assert.equal(output.checkpoint.completed_source_keys.length, 0);
    assert.equal(output.phase4_checkpoint.attempts.pilot_001.artifact_status, "failed");
    const recoveryWriter = artifactWriter();
    const resumed = await run({ checkpointPath, resume: true, artifactWriter: recoveryWriter, transportClientFactory: fakeFactory({ response: response(), calls }) });
    assert.equal(calls.count, 2);
    assert.equal(resumed.results[0].capture_status, "capture_success");
  }
  {
    const calls = { count: 0 };
    const checkpointPath = path.join(temporary, "blocked.json");
    const writer = artifactWriter();
    const error = Object.assign(new Error("HTTP 403"), { httpStatus: 403, code: "http_403" });
    const first = await run({ checkpointPath, artifactWriter: writer, transportClientFactory: fakeFactory({ error, calls }) });
    assert.equal(first.results[0].capture_status, "blocked_external");
    assert.equal(first.checkpoint.completed_source_keys.length, 0);
    const resumed = await run({ checkpointPath, resume: true, artifactWriter: writer, transportClientFactory: fakeFactory({ error, calls }) });
    assert.equal(calls.count, 1);
    assert.equal(resumed.results[0].capture_status, "resume_skipped");
  }
  {
    const calls = { count: 0 };
    const checkpointPath = path.join(temporary, "corrupt.json");
    const writer = artifactWriter();
    await run({ checkpointPath, artifactWriter: writer, transportClientFactory: fakeFactory({ response: response(), calls }) });
    writer.invalidate(source.sourceId);
    await assert.rejects(() => run({ checkpointPath, resume: true, artifactWriter: writer, transportClientFactory: fakeFactory({ response: response(), calls }) }), /artifact is missing, corrupt, or mismatched/);
    assert.equal(calls.count, 1);
  }
  {
    const calls = { count: 0 };
    const checkpointPath = path.join(temporary, "contract.json");
    const writer = artifactWriter();
    await run({ checkpointPath, artifactWriter: writer, codeSha: "1".repeat(40), transportClientFactory: fakeFactory({ response: response(), calls }) });
    await assert.rejects(() => run({ checkpointPath, resume: true, artifactWriter: writer, codeSha: "2".repeat(40), transportClientFactory: fakeFactory({ response: response(), calls }) }), /run identity|contract/i);
    await assert.rejects(() => run({ checkpointPath, resume: true, artifactWriter: writer, controlConfigs: { pilot_001: source }, codeSha: "1".repeat(40), transportClientFactory: fakeFactory({ response: response(), calls }) }), /run identity|contract/i);
    await assert.rejects(() => run({ checkpointPath, resume: true, artifactWriter: writer, timeoutMs: 20_000, codeSha: "1".repeat(40), transportClientFactory: fakeFactory({ response: response(), calls }) }), /configuration|run identity|contract/i);
  }
  {
    const first = await run({ sources: [sourceB, source], codeSha: "3".repeat(40), controlConfigs: { pilot_002: sourceB, pilot_001: source }, transportClientFactory: fakeFactory({ response: response(), calls: { count: 0 } }) });
    const second = await run({ sources: [source, sourceB], codeSha: "3".repeat(40), controlConfigs: { pilot_001: source, pilot_002: sourceB }, transportClientFactory: fakeFactory({ response: response(), calls: { count: 0 } }) });
    assert.equal(first.run_identity, second.run_identity);
    assert.deepEqual(first.results.map((row) => row.source_id), ["pilot_001", "pilot_002"]);
  }
  console.log("phase4 capture orchestration: 11 tests passed");
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}
