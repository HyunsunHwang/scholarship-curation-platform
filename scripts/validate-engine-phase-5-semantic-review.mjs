import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildReplayReport, PHASE_5_PROTECTED_SHA256 } from "./run-engine-phase-5-semantic-review.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readText = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const read = (relativePath) => JSON.parse(readText(relativePath));
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const report = read("reports/engine-phase-5-semantic-review.json");
let checks = 0;

function check(name, run) {
  run();
  checks += 1;
  console.log(`PASS ${name}`);
}

check("tracked report matches a fresh deterministic replay", () => {
  const fresh = buildReplayReport();
  fresh.deterministic_replay_match = true;
  assert.deepEqual(report, fresh);
});

check("report and proposal versions are exact", () => {
  assert.equal(report.report_version, "engine-phase-5-semantic-review/v1");
  assert.equal(report.target_results.every((item) => item.proposal.schema_version === "engine-phase-5-semantic-review-proposal/v1"), true);
});

check("bounded cohort is exactly ten review candidates plus two corrections", () => {
  assert.equal(report.metrics.input_case_count, 24);
  assert.equal(report.metrics.llm_target_case_count, 12);
  assert.equal(report.inputs.target_case_ids.length, 12);
});

check("all target proposals are schema evidence and semantic valid", () => {
  assert.equal(report.metrics.schema_valid_proposal_count, 12);
  assert.equal(report.metrics.schema_invalid_proposal_count, 0);
  assert.equal(report.metrics.evidence_reference_valid_count, 12);
  assert.equal(report.metrics.unsupported_assertion_count, 0);
});

check("terminal negative replay is rejected", () => {
  assert.equal(report.negative_replay_proof.rejected, true);
  assert.equal(report.negative_replay_proof.errors.includes("terminal_recruitment_promotion"), true);
});

check("representation gaps are preserved additively", () => {
  assert.equal(report.metrics.representation_gap_case_count, 4);
  assert.equal(report.metrics.schema_gap_collapsed_to_present_count, 0);
  assert.equal(report.representation_gap_preservation.every((item) => item.preserved_without_canonical_mutation), true);
});

check("identity remains proposal-only", () => {
  assert.equal(report.metrics.canonical_identity_auto_resolved_count, 0);
  assert.equal(report.identity_policy.phase4_program_candidates_modified, false);
  assert.equal(report.identity_policy.phase4_cycle_candidates_modified, false);
  assert.equal(report.identity_policy.administrator_approval_required, true);
});

check("review packets cover the target cohort and expose no persisted choice", () => {
  assert.equal(report.review_packets.length, 12);
  assert.equal(report.review_packets.every((packet) => packet.admin_decision.selected === null && packet.admin_decision.persisted === false), true);
  assert.equal(report.review_packets.every((packet) => ["accept", "edit", "reject", "insufficient_evidence", "defer_relation_resolution"].every((option) => packet.admin_decision.options.includes(option))), true);
});

check("replay and live boundaries are explicit", () => {
  assert.equal(report.execution_mode, "replay");
  assert.equal(report.metrics.live_call_count, 0);
  assert.equal(report.live_run.completed, false);
  assert.equal(report.safety.external_llm_called, false);
});

check("provider implementation is reused by notice extraction", () => {
  const noticeSource = readText("lib/notice-extraction.ts");
  const providerSource = readText("lib/llm/provider-client.mjs");
  assert.match(noticeSource, /callConfiguredLlm as callLlm/);
  assert.doesNotMatch(noticeSource, /chat\/completions|anthropic-version|function resolveLlmConfig/);
  assert.match(providerSource, /chat\/completions/);
  assert.match(providerSource, /anthropic-version/);
});

check("all protected Phase 4 files retain fixed hashes", () => {
  for (const [relativePath, expected] of Object.entries(PHASE_5_PROTECTED_SHA256)) assert.equal(sha256(readText(relativePath)), expected, relativePath);
});

check("side effects and automatic actions remain zero", () => {
  assert.deepEqual({
    production_db_accessed: report.safety.production_db_accessed,
    database_write_count: report.safety.database_write_count,
    migration_modified: report.safety.migration_modified,
    generated_types_modified: report.safety.generated_types_modified,
    admin_ui_modified: report.safety.admin_ui_modified,
    automatic_publish_count: report.safety.automatic_publish_count,
    notification_count: report.safety.notification_count,
  }, {
    production_db_accessed: false,
    database_write_count: 0,
    migration_modified: false,
    generated_types_modified: false,
    admin_ui_modified: false,
    automatic_publish_count: 0,
    notification_count: 0,
  });
});

check("report avoids prohibited claims", () => {
  assert.equal(Object.values(report.claims_boundary).filter((value) => typeof value === "boolean").every((value) => value === false), true);
});

check("tracked artifacts contain no local path credential or raw key", () => {
  const text = readText("reports/engine-phase-5-semantic-review.json") + readText("reports/engine-phase-5-semantic-review.md");
  assert.doesNotMatch(text, /\/Users\/|[A-Za-z]:\\|LLM_API_KEY|Authorization|x-api-key/);
  assert.doesNotMatch(text, /sk-(?:ant-)?[A-Za-z0-9_-]{16,}/);
});

check("final status is PASS without a production-readiness claim", () => {
  assert.equal(report.status, "PASS");
  assert.equal(report.claims_boundary.production_ready_claimed, false);
  assert.equal(report.claims_boundary.phase5_complete_claimed, false);
});

console.log(`${checks}/${checks} Phase 5 semantic review validation checks passed`);
