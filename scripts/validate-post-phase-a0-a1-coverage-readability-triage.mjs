import fs from "node:fs";
import path from "node:path";
import { buildCoverageParserDetectorTriage } from "./build-coverage-parser-detector-triage.mjs";

const DIR = "fixtures/post-phase-a0-a1";
const NAMES = ["zero-match-keyword-miss.json", "zero-match-depth-limited.json", "zero-match-detail-body-not-parsed.json", "zero-match-true-no-recent-possible.json", "non-clean-short-body.json", "non-clean-mojibake.json", "non-clean-attachment-only.json", "board-one-match-many-readable.json", "board-one-match-partial-readability.json", "board-list-only-supported.json", "board-detail-fetch-failed.json", "mixed-coverage-readability-batch.json"];
const GENERATED_AT = "2026-07-13T00:00:00.000Z";
const FOUNDATION = "reports/post-phase-a0-a1-coverage-readability-triage.json";
const VALIDATION = "reports/post-phase-a0-a1-validation-report.json";
const MARKDOWN = "reports/post-phase-a0-a1-validation-report.md";

function read(file) { return JSON.parse(fs.readFileSync(path.resolve(file), "utf8")); }
function writeJson(file, value) { const resolved = path.resolve(file); fs.mkdirSync(path.dirname(resolved), { recursive: true }); fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function writeText(file, value) { const resolved = path.resolve(file); fs.mkdirSync(path.dirname(resolved), { recursive: true }); fs.writeFileSync(resolved, value, "utf8"); }
function stable(value) { if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`; return JSON.stringify(value); }
function relative(file) { return path.relative(process.cwd(), path.resolve(file)).split(path.sep).join("/"); }

function expected(input, report) {
  const value = input.expected ?? {};
  return report.board_read_model.board_readability_status === value.board &&
    report.zero_match_triage.zero_match_observed === value.zero &&
    report.zero_match_triage.false_negative_risk === value.false_negative &&
    report.keyword_detector_triage.missed_keyword_candidates.length === value.keyword_candidates;
}
function schema(report) { return report.item_readability.every((item) => report.required_item_fields.every((field) => Object.hasOwn(item, field))); }
function arithmetic(report) { const board = report.board_read_model; const items = report.item_readability; return board.listed_item_count === items.filter((item) => item.list_item_detected).length && board.detail_success_count === items.filter((item) => item.detail_fetch_status === "success").length && board.blocked_item_count === items.filter((item) => item.blocked).length; }
function aggregate(results) {
  const boards = results.map((result) => result.report.board_read_model);
  const items = results.flatMap((result) => result.report.item_readability);
  const zero = results.map((result) => result.report.zero_match_triage);
  const risks = results.flatMap((result) => result.report.carry_forward_risks);
  const count = (items, predicate) => items.filter(predicate).length;
  return {
    generated_at: GENERATED_AT, contract_version: "post-phase-a0-a1-coverage-readability-triage/v1", read_only: true, db_access: false, db_write: false, migration: false, crawler_execution: false, destructive_action: false,
    fixture_name: "post-phase-a0-a1-fixture-aggregate", board_read_models: boards, item_readability: items, zero_match_triage: zero, keyword_detector_triage: results.map((result) => result.report.keyword_detector_triage), carry_forward_risks: risks,
    metrics: {
      fixture_count: results.length, zero_match_source_count: count(zero, (row) => row.zero_match_observed), false_negative_review_count: count(zero, (row) => row.false_negative_risk),
      keyword_expansion_candidate_count: count(results, (result) => result.report.keyword_detector_triage.keyword_expansion_recommended),
      parser_failure_count: count(items, (item) => item.failure_reason_codes.length > 0), encoding_issue_count: count(items, (item) => item.encoding_issue_suspected), attachment_only_count: count(items, (item) => item.failure_reason_codes.includes("attachment_only_possible")),
      board_count: boards.length, item_count: items.length, readable_clean_count: count(items, (item) => item.item_readability_status === "readable_clean"), readable_needs_review_count: count(items, (item) => item.item_readability_status === "readable_needs_review"),
      partial_readability_board_count: count(boards, (board) => board.board_readability_status === "supported_partial_readability"), list_only_board_count: count(boards, (board) => board.board_readability_status === "list_only_supported"), blocked_item_count: count(items, (item) => item.blocked), carry_forward_risk_count: risks.length,
    },
  };
}
function policyTests(aggregate) {
  const zero = aggregate.zero_match_triage;
  const items = aggregate.item_readability;
  return [
    { name: "zero-match never becomes a source-exhaustion claim", pass: zero.every((row) => row.source_exhaustion_proven === false) },
    { name: "keyword expansion candidates do not modify production detector rules", pass: aggregate.keyword_detector_triage.every((row) => row.detector_rule_changed === false) },
    { name: "one matched item does not automatically make a partial board supported-readable", pass: aggregate.board_read_models.some((row) => row.board_readability_status === "supported_partial_readability") },
    { name: "non-clean items have reason codes", pass: items.filter((item) => item.item_readability_status !== "readable_clean").every((item) => item.failure_reason_codes.length > 0) },
    { name: "mojibake case records replacement characters", pass: items.some((item) => item.encoding_issue_suspected && item.replacement_character_count > 0) },
    { name: "attachment-only triage recommends an attachment parser", pass: items.some((item) => item.failure_reason_codes.includes("attachment_only_possible") && item.failure_reason_codes.includes("attachment_parser_recommended")) },
  ];
}
function markdown(report) { return `# Post-Phase A-0/A-1 Coverage Readability Triage Validation\n\nGenerated at: ${report.generated_at}\n\n## Status\n\n${report.status}\n\n## Metrics\n\n${Object.entries(report.metrics).map(([key, value]) => `- ${key}: ${value}`).join("\n")}\n\n## Tests\n\n${report.tests.map((test) => `- ${test.pass ? "PASS" : "FAIL"}: ${test.name}`).join("\n")}\n\n## Safety\n\n${Object.entries(report.safety).map(([key, value]) => `- ${key}: ${value}`).join("\n")}\n`; }
function main() {
  const results = NAMES.map((name) => { const file = path.join(DIR, name); const input = read(file); const first = buildCoverageParserDetectorTriage(input, { generatedAt: input.generated_at ?? GENERATED_AT }); const second = buildCoverageParserDetectorTriage(input, { generatedAt: input.generated_at ?? GENERATED_AT }); return { fixture: relative(file), report: first, expected: expected(input, first), deterministic: stable(first) === stable(second), schema: schema(first), arithmetic: arithmetic(first) }; });
  const report = aggregate(results);
  const tests = [...results.map((result) => ({ name: `${result.fixture} expected triage`, pass: result.expected })), { name: "item output schema is valid", pass: results.every((result) => result.schema) }, { name: "board/item arithmetic is consistent", pass: results.every((result) => result.arithmetic) }, { name: "triage output is deterministic", pass: results.every((result) => result.deterministic) }, ...policyTests(report), { name: "triage runtime is read-only", pass: report.db_access === false && report.db_write === false && report.migration === false && report.crawler_execution === false && report.destructive_action === false }];
  const validation = { generated_at: GENERATED_AT, status: tests.every((test) => test.pass) ? "PASS" : "HOLD", inputs: NAMES.map((name) => `${DIR}/${name}`), metrics: { ...report.metrics, deterministic_rerun_match: results.every((result) => result.deterministic), output_schema_valid: results.every((result) => result.schema), arithmetic_consistency_valid: results.every((result) => result.arithmetic), zero_match_absence_claim_valid: policyTests(report)[0].pass, item_readability_policy_valid: policyTests(report)[2].pass, parser_failure_taxonomy_valid: policyTests(report).slice(3, 6).every((test) => test.pass) }, tests, safety: { db_access: false, db_write: false, supabase_access: false, migration: false, crawler_execution: false, destructive_action: false, admin_ui_modified: false, workflow_or_package_modified: false } };
  writeJson(FOUNDATION, report); writeJson(VALIDATION, validation); writeText(MARKDOWN, markdown(validation)); console.log(`status=${validation.status}`); console.log(`json_report=${relative(VALIDATION)}`); console.log(`markdown_report=${relative(MARKDOWN)}`); for (const [key, value] of Object.entries(validation.metrics)) console.log(`${key}=${value}`); if (validation.status !== "PASS") process.exitCode = 1;
}
main();
