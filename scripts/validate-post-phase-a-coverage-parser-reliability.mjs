import fs from "node:fs";
import path from "node:path";
import { buildPostPhaseACoverageParserReliabilitySummary } from "./build-post-phase-a-coverage-parser-reliability-summary.mjs";

const INPUT = "reports/post-phase-a0-a1-coverage-readability-triage.json";
const SUMMARY = "reports/post-phase-a-coverage-parser-reliability-summary.json";
const JSON_REPORT = "reports/post-phase-a-coverage-parser-reliability-validation-report.json";
const MD_REPORT = "reports/post-phase-a-coverage-parser-reliability-validation-report.md";
const GENERATED_AT = "2026-07-13T00:00:00.000Z";
function read(file) { return JSON.parse(fs.readFileSync(path.resolve(file), "utf8")); }
function writeJson(file, value) { const resolved = path.resolve(file); fs.mkdirSync(path.dirname(resolved), { recursive: true }); fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function writeText(file, value) { const resolved = path.resolve(file); fs.mkdirSync(path.dirname(resolved), { recursive: true }); fs.writeFileSync(resolved, value, "utf8"); }
function stable(value) { if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`; return JSON.stringify(value); }
function relative(file) { return path.relative(process.cwd(), path.resolve(file)).split(path.sep).join("/"); }
function arithmetic(summary) { const metrics = summary.metrics; return metrics.keyword_expansion_candidate_count === summary.keyword_expansion_recommendations.length && metrics.high_confidence_keyword_candidate_count + metrics.noisy_keyword_candidate_count === metrics.keyword_expansion_candidate_count && metrics.remediation_category_count === summary.remediation_priorities.length && metrics.p0_remediation_count === summary.remediation_priorities.filter((row) => row.priority === "P0").length && metrics.p1_remediation_count === summary.remediation_priorities.filter((row) => row.priority === "P1").length; }
function markdown(report) { return `# Post-Phase A Coverage Parser Reliability Validation\n\nGenerated at: ${report.generated_at}\n\n## Status\n\n${report.status}\n\n## Metrics\n\n${Object.entries(report.metrics).map(([key, value]) => `- ${key}: ${value}`).join("\n")}\n\n## Tests\n\n${report.tests.map((test) => `- ${test.pass ? "PASS" : "FAIL"}: ${test.name}`).join("\n")}\n\n## Safety\n\n${Object.entries(report.safety).map(([key, value]) => `- ${key}: ${value}`).join("\n")}\n`; }
function main() {
  const input = read(INPUT); const first = buildPostPhaseACoverageParserReliabilitySummary(input, { inputPath: INPUT, generatedAt: GENERATED_AT }); const second = buildPostPhaseACoverageParserReliabilitySummary(input, { inputPath: INPUT, generatedAt: GENERATED_AT });
  const tests = [
    { name: "summary output is deterministic", pass: stable(first) === stable(second) },
    { name: "summary schema contains required completion sections", pass: Array.isArray(first.bounded_real_source_spot_check_plan) && Array.isArray(first.keyword_expansion_recommendations) && Array.isArray(first.remediation_priorities) && Array.isArray(first.carry_forward_risks) },
    { name: "summary arithmetic is consistent", pass: arithmetic(first) },
    { name: "zero-match absence claim remains false", pass: first.post_phase_a_scope.source_exhaustion_proven === false && first.bounded_real_source_spot_check_plan.every((row) => row.source_exhaustion_proven === false) },
    { name: "keyword review does not change production detector rules", pass: first.post_phase_a_scope.production_detector_rule_changed === false && first.keyword_expansion_recommendations.every((row) => row.production_detector_rule_changed === false && row.evidence.length > 0) },
    { name: "every observed remediation has a valid priority", pass: first.remediation_priorities.length > 0 && first.remediation_priorities.every((row) => ["P0", "P1", "P2", "P3"].includes(row.priority)) },
    { name: "spot-check plan covers every observed zero-match source", pass: first.metrics.zero_match_source_count === first.bounded_real_source_spot_check_plan.length },
    { name: "completion runtime is read-only", pass: first.db_access === false && first.db_write === false && first.migration === false && first.crawler_execution === false && first.destructive_action === false },
  ];
  const validation = { generated_at: GENERATED_AT, status: tests.every((test) => test.pass) ? "PASS" : "HOLD", input: relative(INPUT), metrics: { ...first.metrics, deterministic_rerun_match: tests[0].pass, output_schema_valid: tests[1].pass, arithmetic_consistency_valid: tests[2].pass, zero_match_absence_claim_valid: tests[3].pass, production_detector_unchanged: tests[4].pass, remediation_priority_valid: tests[5].pass }, tests, safety: { db_access: false, db_write: false, supabase_access: false, migration: false, crawler_execution: false, destructive_action: false, admin_ui_modified: false, workflow_or_package_modified: false } };
  writeJson(SUMMARY, first); writeJson(JSON_REPORT, validation); writeText(MD_REPORT, markdown(validation)); console.log(`status=${validation.status}`); for (const [key, value] of Object.entries(validation.metrics)) console.log(`${key}=${value}`); if (validation.status !== "PASS") process.exitCode = 1;
}
main();
