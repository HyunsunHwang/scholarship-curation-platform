import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPhase4ResumeIntegrationValidation } from "../lib/crawler-engine/runtime-diagnostics/phase4-resume-integration-validation.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = await runPhase4ResumeIntegrationValidation({ repositoryRoot: root, readinessReportPath: path.join(root, "reports/runtime-diagnostics/phase4c-readiness-closeout-2026-07-27-run2.json") });
assert.equal(result.passed, true); assert.equal(result.verified_terminal_count, 4); assert.equal(result.remaining_source_count, 83); assert.equal(result.temporary_fixture_removed, true); assert.equal(result.production_network_fetch_count, 0);
console.log("phase4_resume_integration_tests_passed=5");
