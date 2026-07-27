import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzePhase2ParserRemediation, buildPhase2SameHtmlComparison } from "../lib/crawler-engine/runtime-diagnostics/index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDir = path.join(root, "fixtures", "phase2-same-html-comparison");
const read = (name) => JSON.parse(fs.readFileSync(path.join(fixtureDir, name), "utf8"));
const capture = read("capture.json");
const controlConfig = read("control-config.json");
const treatmentConfig = read("treatment-config.json");
capture.response_byte_count = Buffer.byteLength(capture.html, "utf8");

const calls = [];
const parser = ({ source, htmlBytes, html, label }) => {
  calls.push({ source, htmlBytes, html, label });
  const candidate = label === "control"
    ? { candidateKey: "notice-1", noticeUrl: "https://example.test/notice/1#top", title: "공지", classification: "real_notice", __crawlerCandidateProvenance: { candidate_origin: "configured_selector", candidate_node_fingerprint: "tr:nth-child(1)", matched_list_selector: ".board tr", inside_navigation_container: false, inside_pagination_container: false } }
    : { candidateKey: "notice-1", noticeUrl: "https://example.test/notice/1", title: "공지", classification: "real_notice", __crawlerCandidateProvenance: { candidate_origin: "configured_selector", candidate_node_fingerprint: "tr:nth-child(1)", matched_list_selector: ".board tr", inside_navigation_container: false, inside_pagination_container: false } };
  const items = [candidate];
  Object.defineProperty(items, "operational_parser_evidence", { value: { parser_strategy: "configured_selector", matched_list_selector: ".board tr" } });
  return items;
};
const first = buildPhase2SameHtmlComparison({ capture, controlConfig, treatmentConfig, parser });
const second = buildPhase2SameHtmlComparison({ capture, controlConfig, treatmentConfig, parser });
assert.deepEqual(first, second);
assert.equal(calls.length, 4);
assert.strictEqual(calls[0].htmlBytes, calls[1].htmlBytes);
assert.equal(first.capture.html_sha256, crypto.createHash("sha256").update(Buffer.from(capture.html, "utf8")).digest("hex"));
assert.equal(first.candidate_comparison.candidate_recall_verified, true);
assert.equal(first.control.candidates[0].source_capture_hash, first.capture.html_sha256);

const parsedByRuntime = buildPhase2SameHtmlComparison({ capture, controlConfig, treatmentConfig });
assert.equal(parsedByRuntime.control.candidates.length, 1);
assert.equal(parsedByRuntime.control.candidates[0].noticeUrl, "https://example.test/notice?id=123#top");
assert.match(parsedByRuntime.control.candidates[0].provenance.candidate_node_fingerprint, /configured_selector/);
assert.equal(parsedByRuntime.treatment.parser_config.list_item_selector, "table.board tr");
assert.equal(parsedByRuntime.candidate_comparison.common_candidate_keys.length, 1);
assert.equal(parsedByRuntime.control.parser_evidence.filtered_navigation_anchor_count, 0);

const isolatedCalls = [];
const isolated = buildPhase2SameHtmlComparison({
  capture, controlConfig, treatmentConfig,
  controlParser: ({ htmlBytes }) => { isolatedCalls.push(["control", htmlBytes]); const rows = []; Object.defineProperty(rows, "operational_parser_evidence", { value: { parser_strategy: "historical_control" } }); return rows; },
  treatmentParser: ({ htmlBytes }) => { isolatedCalls.push(["treatment", htmlBytes]); const rows = []; Object.defineProperty(rows, "operational_parser_evidence", { value: { parser_strategy: "current_treatment" } }); return rows; },
});
assert.equal(isolated.control.parser_evidence.parser_strategy, "historical_control");
assert.equal(isolated.treatment.parser_evidence.parser_strategy, "current_treatment");
assert.strictEqual(isolatedCalls[0][1], isolatedCalls[1][1]);

const mismatch = { ...capture, html_sha256: "0".repeat(64) };
assert.throws(() => buildPhase2SameHtmlComparison({ capture: mismatch, controlConfig, treatmentConfig }), /does not match/);
assert.throws(() => buildPhase2SameHtmlComparison({ capture, controlConfig: { ...controlConfig, sourceId: "other" }, treatmentConfig }), /source ID/);
assert.throws(() => buildPhase2SameHtmlComparison({ capture, controlConfig: { ...controlConfig, html: "different" }, treatmentConfig }), /separate HTML/);

const diagnostic = {
  runtime_result_status: "success", capability_status: "valid_zero_candidates",
  parser_evidence: { parser_strategy: "configured_selector", configured_list_selector: ".board tr", selector_match_count: 1 },
  metrics: { candidate_navigation_leak_count: 0, detail_identity_verified_count: 3 },
};
const analyzed = analyzePhase2ParserRemediation({
  source: { sourceId: "fixture_001", sourceName: "Fixture" },
  controlDiagnostic: diagnostic,
  treatmentDiagnostic: diagnostic,
  candidateComparison: first.candidate_comparison,
});
assert.equal(analyzed.candidate_recall_status, "verified");
console.log("phase2_same_html_comparison_tests_passed=11");
