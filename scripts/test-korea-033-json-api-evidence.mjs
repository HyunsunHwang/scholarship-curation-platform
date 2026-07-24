import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidencePath = path.join(
  repositoryRoot,
  "reports",
  "runtime-diagnostics",
  "korea-033-json-api-evidence-2026-07-24.json",
);
const fixturePath = path.join(
  repositoryRoot,
  "fixtures",
  "crawler",
  "runtime-remediation",
  "korea-033-board.json",
);
const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

assert.equal(evidence.schema_version, "json-api-board-live-evidence-v1");
assert.equal(evidence.source_id, "korea_033");
assert.equal(evidence.probe_policy.request_count, 3);
assert.equal(evidence.probe_policy.retry_count, 0);
assert.equal(evidence.probe_policy.full_response_body_recorded, false);
assert.equal(evidence.sensitive_response_body_recorded, false);
assert.equal(evidence.list_page.http_status, 200);
assert.equal(evidence.api_page.http_status, 200);
assert.match(evidence.api_page.content_type, /^application\/json\b/i);
assert.equal(evidence.api_page.required_list_path, "boardList");
assert.equal(evidence.api_page.total_pages_path, "paging.totalPages");
assert.equal(Number.isInteger(evidence.api_page.total_pages) && evidence.api_page.total_pages > 0, true);
assert.equal(evidence.api_page.list_count > 0, true);
assert.equal(evidence.representative_item_contract.id_present, true);
assert.equal(evidence.representative_item_contract.title_present, true);
assert.equal(evidence.representative_item_contract.date_present, true);
assert.equal(evidence.representative_item_contract.content_present, true);
assert.equal(evidence.representative_item_contract.is_pinned_present, true);
assert.equal(evidence.representative_detail.http_status, 200);

const shape = {
  top_level_keys: Object.keys(fixture).sort(),
  paging_keys: Object.keys(fixture.paging).sort(),
  representative_item_keys: Object.keys(fixture.boardList[0]).sort(),
};
const fingerprint = createHash("sha256").update(JSON.stringify(shape)).digest("hex");
assert.equal(fingerprint, evidence.api_page.api_shape_sha256);
assert.deepEqual(Object.keys(fixture.boardList[0]).sort(), evidence.representative_item_contract.item_key_names);
assert.equal(JSON.stringify(fixture).includes("@"), false);

console.log("korea_033_json_api_evidence_tests_passed=1");
