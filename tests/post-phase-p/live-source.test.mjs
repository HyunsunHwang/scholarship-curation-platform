import assert from "node:assert/strict";
import fs from "node:fs";

const inspection = JSON.parse(
  fs.readFileSync(
    "reports/post-phase-n-q/live-source-inspection.json",
    "utf8",
  ),
);
const attachment = JSON.parse(
  fs.readFileSync(
    "reports/post-phase-n-q/live-attachment-inspection.json",
    "utf8",
  ),
);
assert.equal(inspection.bounded_scope.source_count, 10);
assert.equal(inspection.bounded_scope.max_pages_per_source <= 5, true);
assert.equal(inspection.bounded_scope.max_items_per_source <= 30, true);
assert.equal(inspection.live_true_positive_source_count >= 2, true);
assert.equal(inspection.cau_002_tls_status, "TLS_REMEDIATED");
assert.equal(inspection.tls_verification_disabled, false);
assert.equal(inspection.yonsei_060_body_status, "BODY_EXTRACTION_REMEDIATED");
for (const source of inspection.sources.filter(
  (item) => item.status === "BOUNDED_ZERO_MATCH",
)) {
  assert.equal(
    source.limitations.some((message) => /not evidence.*absent/i.test(message)),
    true,
  );
}
assert.equal(attachment.stages.metadata_discovered, true);
assert.equal(attachment.stages.bytes_received, true);
assert.equal(attachment.stages.extraction_attempted, false);
assert.equal(attachment.live_file_committed, false);
console.log(JSON.stringify({
  passed: true,
  live_source_count: inspection.live_source_count,
  live_true_positive_source_count:
    inspection.live_true_positive_source_count,
  zero_match_absence_claim_count: 0,
  live_attachment_parser_result: attachment.parser_result,
}, null, 2));
