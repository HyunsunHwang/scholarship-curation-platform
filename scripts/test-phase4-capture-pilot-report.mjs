import assert from "node:assert/strict";
import { buildPhase4CapturePilotReport } from "./build-phase4-capture-pilot-report.mjs";

const hash = "a".repeat(64);
const comparison = { capture: { html_sha256: hash }, control: { html_sha256: hash }, treatment: { html_sha256: hash } };
const report = buildPhase4CapturePilotReport({ results: [
  { source_id: "b", capture_status: "capture_success", evidence_status: "ready_for_fixture", next_phase_queue: "fixture", blocking_reason: null, list_fetch_count: 1, request_attempt_count: 1, capture: { html_sha256: hash, requested_url: "https://b.test", final_url: "https://b.test", http_status: 200, content_type: "text/html", charset: "utf-8", response_byte_count: 2, redirect_chain: [], source_config_sha256: hash, code_sha: hash }, treatment: { parser_evidence: { parser_strategy: "heuristic_anchor" }, candidates: [{ source_capture_hash: hash }] }, same_html_comparison: comparison },
  { source_id: "a", capture_status: "transport_failure", evidence_status: "insufficient_evidence", next_phase_queue: "transport_recovery", blocking_reason: "ECONNRESET", list_fetch_count: 1, request_attempt_count: 2 },
] });
assert.deepEqual(report.sources.map((row) => row.source_id), ["a", "b"]);
assert.equal(report.invariants.one_logical_list_fetch_per_non_resumed_source, true);
assert.equal(report.invariants.comparison_rows_use_same_capture, true);
assert.equal(report.invariants.treatment_candidate_source_hashes_match, true);
assert.equal(report.invariants.structural_clustering_input_count, 1);
assert.equal(report.sources[0].capture, null);
console.log("phase4_capture_pilot_report_tests_passed=6");
