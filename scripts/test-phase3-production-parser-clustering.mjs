import assert from "node:assert/strict";
import { buildPhase2SameHtmlComparison, buildPhase3RemediationClusters } from "../lib/crawler-engine/runtime-diagnostics/index.mjs";

function source(sourceId, origin, family) {
  return {
    sourceId, sourceName: sourceId, universitySlug: "fixture", listUrl: `${origin}/board`, baseUrl: origin,
    listItemSelector: family === "table" ? "table.board tr" : "ul.cards li",
    linkSelector: "a[href]", titleSelector: ".subject", dateSelector: ".date", noticeUrlPattern: "[?&]id=\\d+",
  };
}
function capture(sourceId, origin, family) {
  const row = family === "table"
    ? `<table class="board"><tr><td><a class="subject" href="${origin}/board/view?id=123">장학 공지</a></td><td class="date">2026-07-27</td></tr></table>`
    : `<ul class="cards"><li><a class="subject" href="${origin}/board/view?id=123">장학 공지</a><span class="date">2026-07-27</span></li></ul>`;
  const html = `<html><body>${row}</body></html>`;
  return { source_id: sourceId, capture_id: `${sourceId}-capture`, requested_url: `${origin}/board`, final_url: `${origin}/board`, captured_at: "2026-07-27T00:00:00.000Z", content_type: "text/html", charset: "utf-8", response_byte_count: Buffer.byteLength(html), redirect_chain: [], html };
}
function sameCapture(sourceId, origin, family) {
  const config = source(sourceId, origin, family);
  return buildPhase2SameHtmlComparison({ capture: capture(sourceId, origin, family), controlConfig: config, treatmentConfig: config });
}
const sourceA = sameCapture("phase3_a", "https://university-a.test", "table");
const sourceB = sameCapture("phase3_b", "https://university-b.test", "table");
const sourceC = sameCapture("phase3_c", "https://university-c.test", "list");
const result = buildPhase3RemediationClusters({ baseline: { target_count: 3, targets: ["phase3_a", "phase3_b", "phase3_c"].map((source_id) => ({ source_id })) }, sameCaptureEvidence: [sourceC, sourceA, sourceB] });
const tableCluster = result.clusters.find((cluster) => cluster.source_ids.includes("phase3_a"));
const listCluster = result.clusters.find((cluster) => cluster.source_ids.includes("phase3_c"));
assert.deepEqual(tableCluster.source_ids, ["phase3_a", "phase3_b"]);
assert.notEqual(tableCluster.cluster_id, listCluster.cluster_id);
assert.equal(tableCluster.normalized_dom_signature.candidate_locator_templates.length, 0);
assert.ok(tableCluster.members.every((member) => member.raw_dom_evidence.candidate_node_fingerprints.some((fingerprint) => fingerprint.includes("https://university-"))));
assert.equal(JSON.stringify(tableCluster.structural_signature).includes("university-a.test"), false);
assert.equal(JSON.stringify(tableCluster.structural_signature).includes("university-b.test"), false);
console.log("phase3_production_parser_clustering_tests_passed=7");
