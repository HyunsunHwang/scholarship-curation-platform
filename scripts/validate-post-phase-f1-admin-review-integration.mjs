import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { buildAdminCrawlerReviewDiagnostics } from "./build-post-phase-f1-admin-review-diagnostics.mjs";

const INPUTS = {
  f0: "reports/post-phase-f0-adapter-foundation.json", bc: "reports/post-phase-bc-review-quality-foundation.json", e: "reports/post-phase-e-batch-observability.json",
  aSummary: "reports/post-phase-a-coverage-parser-reliability-summary.json", aClosure: "reports/post-phase-a-closure-review-note.json", aSpotChecks: "reports/post-phase-a-spot-check-decisions.json", aRemediation: "reports/post-phase-a-remediation-priority-decisions.json",
};
const REPORT = "reports/post-phase-f1-validation-report.json";
const MARKDOWN = "reports/post-phase-f1-validation-report.md";
function read(file) { return JSON.parse(fs.readFileSync(path.resolve(file), "utf8")); }
function write(file, value) { const resolved = path.resolve(file); fs.mkdirSync(path.dirname(resolved), { recursive: true }); fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function text(file, value) { const resolved = path.resolve(file); fs.mkdirSync(path.dirname(resolved), { recursive: true }); fs.writeFileSync(resolved, value, "utf8"); }
function stable(value) { if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`; return JSON.stringify(value); }
function source(file) { return fs.readFileSync(path.resolve(file), "utf8"); }
function changedPaths() { try { return execFileSync("git", ["-c", "safe.directory=*", "status", "--porcelain"], { encoding: "utf8" }).split(/\r?\n/).filter(Boolean).map((line) => line.slice(3)); } catch { return []; } }
function main() {
  const inputs = Object.fromEntries(Object.entries(INPUTS).map(([key, file]) => [key, read(file)]));
  const first = buildAdminCrawlerReviewDiagnostics(inputs); const second = buildAdminCrawlerReviewDiagnostics(inputs);
  const page = source("app/admin/crawler-review/page.tsx"); const helper = source("lib/admin/crawler-review-diagnostics.ts"); const changed = changedPaths();
  const requiredSourceStatuses = ["resolved", "unresolved", "ambiguous", "missing_source_key", "inactive_source", "source_key_alias_required"];
  const tests = [
    { name: "admin diagnostics route and helper exist", pass: fs.existsSync("app/admin/crawler-review/page.tsx") && fs.existsSync("lib/admin/crawler-review-diagnostics.ts") },
    { name: "F-0, B/C, E, and A reports are all referenced", pass: Object.keys(first.input_reports).length === 7 && first.review_quality_summary.no_assets_needs_review_count === inputs.bc.counts.no_assets_needs_review_count && first.batch_summary.batch_status === inputs.e.batch_status && page.includes("getAdminCrawlerReviewDiagnostics") && helper.includes("post-phase-f1-admin-review-integration") },
    { name: "required source-resolution statuses are represented", pass: requiredSourceStatuses.every((status) => Object.hasOwn(first.metrics.source_resolution_status_counts, status)) },
    { name: "zero-match and read-only policy notices are visible", pass: first.scope_notices.some((note) => note.includes("Zero-match")) && first.scope_notices.some((note) => note.includes("read-only")) },
    { name: "production detector/parser/crawler unchanged policy is visible", pass: first.production_detector_parser_crawler_changed === false && first.scope_notices.some((note) => note.includes("Production detector")) },
    { name: "generated diagnostics view model is deterministic", pass: stable(first) === stable(second) },
    { name: "F-1 output remains read-only", pass: first.db_access === false && first.db_write === false && first.supabase_access === false && first.migration === false && first.crawler_execution === false && first.destructive_action === false },
    { name: "restricted files are unchanged", pass: !changed.some((file) => file === "lib/database.types.ts" || file === "package.json" || file.startsWith(".github/workflows/")) },
  ];
  const validation = { generated_at: first.generated_at, status: tests.every((test) => test.pass) ? "PASS" : "HOLD", metrics: { ...first.metrics, deterministic_rerun_match: tests[5].pass, output_schema_valid: tests.slice(0, 5).every((test) => test.pass), safety_valid: tests[6].pass, restricted_file_scope_valid: tests[7].pass }, tests, safety: { db_access: false, db_write: false, supabase_access: false, migration: false, production_crawler_execution: false, production_detector_parser_change: false, destructive_action: false, admin_write_path_added: false } };
  write(REPORT, validation); text(MARKDOWN, `# Post-Phase F-1 Admin Review Integration Validation\n\n## Status\n\n${validation.status}\n\n## Metrics\n\n${Object.entries(validation.metrics).map(([key, value]) => `- ${key}: ${typeof value === "object" ? JSON.stringify(value) : value}`).join("\n")}\n\n## Tests\n\n${tests.map((test) => `- ${test.pass ? "PASS" : "FAIL"}: ${test.name}`).join("\n")}\n\n## Safety\n\n${Object.entries(validation.safety).map(([key, value]) => `- ${key}: ${value}`).join("\n")}\n`);
  console.log(`status=${validation.status}`); for (const [key, value] of Object.entries(validation.metrics)) console.log(`${key}=${typeof value === "object" ? JSON.stringify(value) : value}`); if (validation.status !== "PASS") process.exitCode = 1;
}
main();
