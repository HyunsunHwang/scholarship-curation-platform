import fs from "node:fs";
import path from "node:path";
import { buildPostPhaseAClosureDecisions } from "./build-post-phase-a-closure-decisions.mjs";

const SUMMARY = "reports/post-phase-a-coverage-parser-reliability-summary.json";
const JSON_REPORT = "reports/post-phase-a-closure-validation-report.json";
const MD_REPORT = "reports/post-phase-a-closure-validation-report.md";
function read(file) { return JSON.parse(fs.readFileSync(path.resolve(file), "utf8")); }
function write(file, value) { const resolved = path.resolve(file); fs.mkdirSync(path.dirname(resolved), { recursive: true }); fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function text(file, value) { const resolved = path.resolve(file); fs.mkdirSync(path.dirname(resolved), { recursive: true }); fs.writeFileSync(resolved, value, "utf8"); }
function stable(value) { if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`; return JSON.stringify(value); }
function main() {
  const summary = read(SUMMARY); const first = buildPostPhaseAClosureDecisions(summary).report; const second = buildPostPhaseAClosureDecisions(summary).report;
  const tests = [
    { name: "closure output is deterministic", pass: stable(first) === stable(second) },
    { name: "every keyword candidate has a terminal review decision", pass: first.keyword_expansion_decisions.every((row) => ["high_confidence", "contextual_only", "reject"].includes(row.decision) && row.production_detector_change_in_this_pr === false) },
    { name: "every P0/P1 remediation has a follow-up owner and success criteria", pass: first.remediation_priority_decisions.every((row) => row.suggested_owner_or_next_work_unit && row.success_criteria && row.implement_in_this_pr === false && row.defer_to_followup === true) },
    { name: "unresolved spot checks are explicit backlog entries", pass: first.bounded_real_source_spot_check_result.every((row) => row.unresolved_backlog === true && row.source_exhaustion_proven === false) },
    { name: "fixture and bounded real-source evidence remain separate", pass: Boolean(first.fixture_backed_validation_result) && Boolean(first.bounded_real_source_spot_check_result) && first.evidence_limited_inference.includes("not a full crawl") },
    { name: "F-1 dependency policy and quality policy are documented", pass: first.phase_a_exit_gate.required_conditions.f1_dependency_policy_documented === true && first.quality_readability_policy.length === 8 },
    { name: "closure runtime is read-only", pass: first.db_access === false && first.db_write === false && first.supabase_access === false && first.migration === false && first.crawler_execution === false && first.destructive_action === false },
  ];
  const validation = { generated_at: first.generated_at, status: tests.every((test) => test.pass) ? "PASS" : "HOLD", input: "reports/post-phase-a-coverage-parser-reliability-summary.json", metrics: { ...first.metrics, deterministic_rerun_match: tests[0].pass, output_schema_valid: tests.slice(1, 6).every((test) => test.pass), safety_valid: tests[6].pass }, tests, safety: { db_access: false, db_write: false, supabase_access: false, migration: false, crawler_execution: false, destructive_action: false, production_detector_change: false, admin_ui_modified: false, workflow_or_package_modified: false } };
  write(JSON_REPORT, validation); text(MD_REPORT, `# Post-Phase A Closure Decisions Validation\n\n## Status\n\n${validation.status}\n\n## Metrics\n\n${Object.entries(validation.metrics).map(([key, value]) => `- ${key}: ${value}`).join("\n")}\n\n## Tests\n\n${tests.map((test) => `- ${test.pass ? "PASS" : "FAIL"}: ${test.name}`).join("\n")}\n\n## Safety\n\n${Object.entries(validation.safety).map(([key, value]) => `- ${key}: ${value}`).join("\n")}\n`);
  console.log(`status=${validation.status}`); for (const [key, value] of Object.entries(validation.metrics)) console.log(`${key}=${value}`); if (validation.status !== "PASS") process.exitCode = 1;
}
main();
