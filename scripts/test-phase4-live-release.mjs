import assert from "node:assert/strict";
import { assertPhase4LiveCaptureReleased, executePreparedPhase4FullCapture } from "../lib/crawler-engine/runtime-diagnostics/phase4-full-capture-dry-run.mjs";
const prepared = { plan: { current_code_sha: "a".repeat(40) }, contractFingerprint: "b".repeat(64), sources: Array.from({ length: 87 }, () => ({})), orchestrationArgs: {}, orchestration: async () => { calls += 1; } }; let calls = 0;
const authority = { requestedCodeSha: "a".repeat(40), requestedContractFingerprint: "b".repeat(64), confirmedTargetCount: 87, confirmedLogicalFetchBudget: 87, confirmedPrivateOnly: true };
assert.throws(() => assertPhase4LiveCaptureReleased({ ...authority, prepared: null }), /not_released/);
assert.throws(() => assertPhase4LiveCaptureReleased({ prepared, ...authority, requestedCodeSha: "c".repeat(40) }), /SHA/);
assert.throws(() => assertPhase4LiveCaptureReleased({ prepared, ...authority, confirmedTargetCount: 86 }), /target/);
await executePreparedPhase4FullCapture(prepared, authority); assert.equal(calls, 1);
console.log("phase4_live_release_tests_passed=4");
