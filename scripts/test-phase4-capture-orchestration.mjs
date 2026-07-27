import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runPhase4SameHtmlCapture } from "../lib/crawler-engine/runtime-diagnostics/phase4-capture-orchestration.mjs";

const html = Buffer.from('<table><tr><td><a href="/notice?id=7">장학 공지</a></td><td>2026-07-27</td></tr></table>', "utf8");
const source = Object.freeze({ sourceId: "pilot_001", sourceName: "Pilot", listUrl: "https://example.edu/notice", baseUrl: "https://example.edu", enabled: true, adapter: "", listItemSelector: "table tr", linkSelector: "a[href]", titleSelector: "a[href]", dateSelector: "td:last-child", noticeUrlPattern: "[?&]id=\\d+", listParserProfile: "" });
const registry = Object.freeze({ registryFingerprint: "a".repeat(64) });
const policy = Object.freeze({ policyFingerprint: "b".repeat(64) });
const resolve = () => new Map([[source.sourceId, policy]]);
function fakeFactory({ response = null, error = null, calls }) {
  return () => ({
    async fetchHtml() { calls.count += 1; if (error) throw error; return response; },
    evidence() { return { request_attempt_count: calls.count, request_retry_count: 0, redirect_chain: [], final_url: response?.finalUrl ?? null }; },
  });
}
function response(bytes = html, contentType = "text/html; charset=utf-8") { return { bytes, httpStatus: 200, finalUrl: source.listUrl, contentType, redirectChain: [] }; }
async function run(options = {}) {
  return runPhase4SameHtmlCapture({ sources: [source], sourceRegistry: { mode: "manifest", sourceCount: 1 }, transportRegistry: registry, transportPolicyResolver: resolve, ...options });
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
    await run({ checkpointPath, transportClientFactory: fakeFactory({ response: response(), calls }) });
    assert.equal(calls.count, 1);
    const resumed = await run({ checkpointPath, resume: true, transportClientFactory: fakeFactory({ response: response(), calls }) });
    assert.equal(calls.count, 1);
    assert.equal(resumed.results[0].capture_status, "resume_skipped");
    assert.equal(resumed.results[0].list_fetch_count, 0);
  }
  console.log("phase4 capture orchestration: 5 tests passed");
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}
