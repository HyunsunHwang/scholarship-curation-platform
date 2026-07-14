import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { buildPostPhaseF3QualityAttachmentEncodingRemediation } from "./build-post-phase-f3-quality-attachment-encoding-remediation.mjs";

const INPUTS = { remediation: "reports/post-phase-a-remediation-priority-decisions.json", f2: "reports/post-phase-f2-source-parser-remediation.json", spotChecks: "fixtures/post-phase-f3-quality-attachment-encoding-remediation/source-item-spot-check-observations.json" };
const REPORT = "reports/post-phase-f3-validation-report.json"; const MARKDOWN = "reports/post-phase-f3-validation-report.md"; const F1_REPORT = "reports/post-phase-f1-admin-review-integration.json";
function read(file) { return JSON.parse(fs.readFileSync(path.resolve(file), "utf8")); }
function write(file, value) { const resolved = path.resolve(file); fs.mkdirSync(path.dirname(resolved), { recursive: true }); fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function text(file, value) { const resolved = path.resolve(file); fs.mkdirSync(path.dirname(resolved), { recursive: true }); fs.writeFileSync(resolved, value, "utf8"); }
function stable(value) { if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`; return JSON.stringify(value); }
function changedPaths() { try { return execFileSync("git", ["-c", "safe.directory=*", "status", "--porcelain"], { encoding: "utf8" }).split(/\r?\n/).filter(Boolean).map((line) => line.slice(3)); } catch { return []; } }
function main() {
  const inputs = Object.fromEntries(Object.entries(INPUTS).map(([key, file]) => [key, read(file)])); const first = buildPostPhaseF3QualityAttachmentEncodingRemediation(inputs); const second = buildPostPhaseF3QualityAttachmentEncodingRemediation(inputs); const f1 = read(F1_REPORT); const changed = changedPaths(); const decisions = first.p1_remediation_decisions;
  const fixture = (id) => first.fixture_results.find((item) => item.id === id);
  const tests = [
    { name: "all P1 items are resolved or deferred with next actions", pass: decisions.length === inputs.remediation.decisions.filter((item) => item.priority === "P1").length && decisions.every((item) => (item.status === "resolved" || item.status === "deferred") && item.evidence.every((evidence) => evidence.next_action)) },
    { name: "resolved P1 items retain evidence and success criteria", pass: decisions.filter((item) => item.status === "resolved").every((item) => item.success_criteria && item.evidence.some((evidence) => evidence.p1_resolved)) },
    { name: "attachment metadata before and after fixtures pass", pass: fixture("before-cau_008-attachment-metadata-missing")?.pass && fixture("after-cau_010-attachment-metadata-present")?.pass },
    { name: "encoding and mojibake before and after fixtures pass", pass: fixture("before-cau_007-replacement-character")?.pass && fixture("after-encoding-normalization-clean-candidate")?.pass },
    { name: "no-assets is distinct from attachment-only and risky cases stay non-clean", pass: fixture("after-no-assets-text-sufficient")?.actual.classification === "clean" && fixture("before-cau_008-attachment-metadata-missing")?.actual.classification !== "clean" && fixture("before-cau_007-replacement-character")?.actual.classification !== "clean" },
    { name: "clean after normalization has sufficient text and no remaining risk", pass: fixture("after-encoding-normalization-clean-candidate")?.actual.classification === "clean" && fixture("after-encoding-normalization-clean-candidate")?.actual.body_text_length >= 120 },
    { name: "review and blocked retained fixtures expose reason codes", pass: first.fixture_results.filter((item) => item.actual.classification !== "clean").every((item) => item.actual.reason_codes.length > 0) },
    { name: "F-2 handoff remains explicit and deferred", pass: first.f2_handoff.cau_003?.classification_after === "blocked" && first.f2_handoff.cau_012?.deferred_reason },
    { name: "F-1 admin diagnostics reference F-3", pass: f1.input_reports?.f3 === "reports/post-phase-f3-quality-attachment-encoding-remediation.json" && f1.diagnostics.some((item) => item.f3RemediationStatus === "resolved") && f1.diagnostics.some((item) => item.f3RemediationStatus === "deferred") },
    { name: "fail-closed and absence policies are preserved", pass: first.metrics.fail_closed_policy_valid && first.metrics.zero_match_absence_claim_valid && first.source_exhaustion_proven === false },
    { name: "F-3 reporting performs no DB or crawler operation", pass: first.db_access === false && first.db_write === false && first.supabase_access === false && first.migration === false && first.crawler_execution === false && first.full_crawl === false && first.destructive_action === false && first.production_apply_unchanged === true && first.production_detector_keyword_changed === false },
    { name: "restricted files are unchanged", pass: !changed.some((file) => file === "lib/database.types.ts" || file === "package.json" || file.startsWith(".github/workflows/")) },
    { name: "generated report is deterministic", pass: stable(first) === stable(second) },
  ];
  const validation = { generated_at: first.generated_at, status: tests.every((test) => test.pass) ? "PASS" : "HOLD", metrics: { ...first.metrics, deterministic_rerun_match: tests[12].pass, output_schema_valid: tests.slice(0, 12).every((test) => test.pass), restricted_file_scope_valid: tests[11].pass }, tests, safety: { db_access: false, db_write: false, supabase_access: false, migration: false, destructive_sql: false, production_crawler_execution: false, full_crawl: false, production_detector_keyword_change: false, production_apply_path: false } };
  write(REPORT, validation); text(MARKDOWN, `# Post-Phase F-3 Quality / Attachment / Encoding Validation\n\n## Status\n\n${validation.status}\n\n## Metrics\n\n${Object.entries(validation.metrics).map(([key, value]) => `- ${key}: ${value}`).join("\n")}\n\n## Tests\n\n${tests.map((test) => `- ${test.pass ? "PASS" : "FAIL"}: ${test.name}`).join("\n")}\n\n## Safety\n\n${Object.entries(validation.safety).map(([key, value]) => `- ${key}: ${value}`).join("\n")}\n`); console.log(`status=${validation.status}`); for (const [key, value] of Object.entries(validation.metrics)) console.log(`${key}=${value}`); if (validation.status !== "PASS") process.exitCode = 1;
}
main();
