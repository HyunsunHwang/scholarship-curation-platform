import assert from "node:assert/strict";
import {
  crossValidatePhase4ResumeAccounting,
} from "../lib/crawler-engine/runtime-diagnostics/phase4-full-capture-dry-run.mjs";

const ids = ["a_001", "a_002", "a_003", "a_004"];
const terminal = (sourceId, capture_status, blocking_reason = null) => ({ source_id: sourceId, capture_status, blocking_reason });
const generic = {
  completed_source_keys: ["a_001"],
  failed_work_items: [
    { source_key: "a_002", work_item_key: null, reason_code: "blocked_external" },
    { source_key: "a_003", work_item_key: null, reason_code: "transport_failure" },
    { source_key: "a_004", work_item_key: null, reason_code: "invalid_content" },
  ],
};
const journal = { terminal_artifacts: { a_001: terminal("a_001", "capture_success"), a_002: terminal("a_002", "blocked_external"), a_003: terminal("a_003", "transport_failure"), a_004: terminal("a_004", "invalid_content") }, attempts: {} };
const artifacts = Object.fromEntries(Object.entries(journal.terminal_artifacts).map(([id, item]) => [id, item]));
const result = crossValidatePhase4ResumeAccounting({ genericCheckpoint: generic, phase4Journal: journal, verifiedArtifacts: artifacts, targetSourceIds: ids });
assert.equal(result.successfulTerminalCount, 1); assert.equal(result.failedTerminalCount, 3); assert.equal(result.verifiedArtifactCount, 4); assert.equal(result.remainingSourceIds.length, 0);
assert.throws(() => crossValidatePhase4ResumeAccounting({ genericCheckpoint: { ...generic, completed_source_keys: [] }, phase4Journal: journal, verifiedArtifacts: artifacts, targetSourceIds: ids }), /contradict/i);
assert.throws(() => crossValidatePhase4ResumeAccounting({ genericCheckpoint: generic, phase4Journal: { ...journal, terminal_artifacts: { ...journal.terminal_artifacts, a_002: terminal("a_002", "capture_success") } }, verifiedArtifacts: artifacts, targetSourceIds: ids }), /contradict/i);
console.log("phase4_resume_contract_tests_passed=7");
