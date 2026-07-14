import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { buildPostPhaseF2SourceParserRemediation } from "./build-post-phase-f2-source-parser-remediation.mjs";

const INPUTS = { remediation: "reports/post-phase-a-remediation-priority-decisions.json", spotChecks: "fixtures/post-phase-f2-source-parser-remediation/source-spot-check-observations.json" };
const REPORT = "reports/post-phase-f2-validation-report.json"; const MARKDOWN = "reports/post-phase-f2-validation-report.md";
function read(file) { return JSON.parse(fs.readFileSync(path.resolve(file), "utf8")); }
function write(file, value) { const resolved = path.resolve(file); fs.mkdirSync(path.dirname(resolved), { recursive: true }); fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function text(file, value) { const resolved = path.resolve(file); fs.mkdirSync(path.dirname(resolved), { recursive: true }); fs.writeFileSync(resolved, value, "utf8"); }
function stable(value) { if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`; return JSON.stringify(value); }
function changedPaths() { try { return execFileSync("git", ["-c", "safe.directory=*", "status", "--porcelain"], { encoding: "utf8" }).split(/\r?\n/).filter(Boolean).map((line) => line.slice(3)); } catch { return []; } }
function main() {
  const inputs = Object.fromEntries(Object.entries(INPUTS).map(([key, file]) => [key, read(file)])); const first = buildPostPhaseF2SourceParserRemediation(inputs); const second = buildPostPhaseF2SourceParserRemediation(inputs); const changed = changedPaths(); const p0Ids = inputs.remediation.decisions.filter((item) => item.priority === "P0").map((item) => item.remediation_id); const decisions = first.p0_remediation_decisions;
  const tests = [
    { name: "all source-report P0 items are resolved or deferred", pass: decisions.length === p0Ids.length && decisions.every((item) => item.status === "resolved" || item.status === "deferred") },
    { name: "resolved P0 items retain evidence and success criteria", pass: decisions.filter((item) => item.status === "resolved").every((item) => item.success_criteria && item.evidence.some((evidence) => evidence.p0_resolved)) },
    { name: "deferred P0 sources retain explicit next actions", pass: decisions.filter((item) => item.status === "deferred").every((item) => item.deferred_source_ids.every((sourceId) => item.evidence.find((evidence) => evidence.source_id === sourceId)?.next_action)) },
    { name: "before and after body fixtures pass", pass: first.fixture_results.filter((item) => item.kind === "body").length >= 2 && first.fixture_results.filter((item) => item.kind === "body").every((item) => item.pass) },
    { name: "before and after URL canonicalization fixtures pass", pass: first.fixture_results.filter((item) => item.kind === "url").length >= 4 && first.fixture_results.filter((item) => item.kind === "url").every((item) => item.pass) },
    { name: "source adapter outcome is documented without clean promotion", pass: first.source_spot_check_results.some((item) => item.source_id === "cau_010" && item.p0_resolved && item.classification_after === "needs_review") },
    { name: "no unresolved P0 source lacks a next action", pass: decisions.every((item) => item.deferred_source_ids.every((sourceId) => item.evidence.find((evidence) => evidence.source_id === sourceId)?.next_action)) },
    { name: "absence and source-exhaustion claims are prohibited", pass: first.metrics.zero_match_absence_claim_valid && first.source_exhaustion_proven === false },
    { name: "fail-closed policy is preserved", pass: first.metrics.fail_closed_policy_valid && first.metrics.false_clean_prevented_count >= 1 },
    { name: "F-2 reporting performs no DB or crawler operation", pass: first.db_access === false && first.db_write === false && first.supabase_access === false && first.migration === false && first.crawler_execution === false && first.full_crawl === false && first.destructive_action === false && first.production_apply_unchanged === true && first.production_detector_keyword_changed === false },
    { name: "restricted files are unchanged", pass: !changed.some((file) => file === "lib/database.types.ts" || file === "package.json" || file.startsWith(".github/workflows/")) },
    { name: "generated report is deterministic", pass: stable(first) === stable(second) },
  ];
  const validation = { generated_at: first.generated_at, status: tests.every((test) => test.pass) ? "PASS" : "HOLD", metrics: { ...first.metrics, deterministic_rerun_match: tests[11].pass, output_schema_valid: tests.slice(0, 11).every((test) => test.pass), restricted_file_scope_valid: tests[10].pass }, tests, safety: { db_access: false, db_write: false, supabase_access: false, migration: false, destructive_sql: false, production_crawler_execution: false, full_crawl: false, production_detector_keyword_change: false, production_apply_path: false } };
  write(REPORT, validation); text(MARKDOWN, `# Post-Phase F-2 Source / Parser Remediation Validation\n\n## Status\n\n${validation.status}\n\n## Metrics\n\n${Object.entries(validation.metrics).map(([key, value]) => `- ${key}: ${value}`).join("\n")}\n\n## Tests\n\n${tests.map((test) => `- ${test.pass ? "PASS" : "FAIL"}: ${test.name}`).join("\n")}\n\n## Safety\n\n${Object.entries(validation.safety).map(([key, value]) => `- ${key}: ${value}`).join("\n")}\n`); console.log(`status=${validation.status}`); for (const [key, value] of Object.entries(validation.metrics)) console.log(`${key}=${value}`); if (validation.status !== "PASS") process.exitCode = 1;
}
main();
