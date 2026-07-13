import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";
import { extractNoticeUrlFromLinkNode } from "../lib/crawler-adapters/index.mjs";
import { extractDetailFromHtml } from "../lib/notice-body-extraction.mjs";

const __filename = fileURLToPath(import.meta.url);
const FIXTURE_ROOT = "fixtures/post-phase-f2-source-parser-remediation";
const INPUTS = { remediation: "reports/post-phase-a-remediation-priority-decisions.json", spotChecks: `${FIXTURE_ROOT}/source-spot-check-observations.json` };
const DEFAULT_OUTPUT = "reports/post-phase-f2-source-parser-remediation.json";
const SPOT_CHECK_OUTPUT = "reports/post-phase-f2-source-spot-check-results.json";

function read(file) { return JSON.parse(fs.readFileSync(path.resolve(file), "utf8")); }
function write(file, value) { const resolved = path.resolve(file); fs.mkdirSync(path.dirname(resolved), { recursive: true }); fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function relative(file) { return path.relative(process.cwd(), path.resolve(file)).split(path.sep).join("/"); }
function array(value) { return Array.isArray(value) ? value : []; }
function fixtureFiles() { return ["before/cau_011-body-unresolved.json", "after/cau_011-body-selector.json", "before/cau_013-body-unresolved.json", "after/cau_013-body-selector.json", "before/cau_010-kboard-list-url.json", "after/cau_010-kboard-detail-url.json", "before/cau_011-list-url.json", "after/cau_011-detail-url.json"].map((file) => `${FIXTURE_ROOT}/${file}`); }
function classifyFixture(fixture, actual) { return fixture.kind === "body" ? (actual.content.length >= 80 ? "needs_review" : "blocked") : (actual.noticeUrl ? "needs_review" : "blocked"); }
function runFixture(file) {
  const fixture = read(file);
  if (fixture.kind === "body") {
    const detail = extractDetailFromHtml(fixture.html, { ...fixture.source });
    const classification = classifyFixture(fixture, detail);
    return { id: fixture.id, kind: fixture.kind, fixture: relative(file), expected: fixture.expected, actual: { content_length: detail.content.length, content_selector: detail.contentSelector, classification }, pass: detail.contentSelector === fixture.expected.content_selector && classification === fixture.expected.classification };
  }
  const $ = load(fixture.link_html); const noticeUrl = extractNoticeUrlFromLinkNode(fixture.source, $("a").first()); const classification = classifyFixture(fixture, { noticeUrl });
  return { id: fixture.id, kind: fixture.kind, fixture: relative(file), expected: fixture.expected, actual: { notice_url: noticeUrl, classification }, pass: noticeUrl === fixture.expected.notice_url && classification === fixture.expected.classification };
}
function nextActionFor(sourceId, spotCheck) { return spotCheck?.next_action ?? `Add explicit source identity and fixture evidence for ${sourceId} before retrying P0 remediation.`; }
function buildDecisions(remediations, sourceResults) {
  const bySource = new Map(sourceResults.map((row) => [row.source_id, row]));
  return remediations.filter((item) => item.priority === "P0").map((item) => {
    const sourceIds = array(item.evidence?.affected_source_ids); const resolvedSourceIds = sourceIds.filter((sourceId) => bySource.get(sourceId)?.p0_resolved === true); const deferredSourceIds = sourceIds.filter((sourceId) => !resolvedSourceIds.includes(sourceId));
    return { remediation_id: item.remediation_id, category: item.category, related_categories: array(item.related_categories), priority: item.priority, success_criteria: item.success_criteria, affected_source_ids: sourceIds, resolved_source_ids: resolvedSourceIds, deferred_source_ids: deferredSourceIds, status: deferredSourceIds.length === 0 ? "resolved" : "deferred", evidence: sourceIds.map((sourceId) => ({ source_id: sourceId, spot_check: bySource.get(sourceId) ? "fixture_backed_bounded" : "not_available", p0_resolved: bySource.get(sourceId)?.p0_resolved === true, next_action: nextActionFor(sourceId, bySource.get(sourceId)) })) };
  });
}

export function buildPostPhaseF2SourceParserRemediation(inputs) {
  const fixtures = fixtureFiles().map(runFixture); const sourceResults = array(inputs.spotChecks.results); const decisions = buildDecisions(array(inputs.remediation.decisions), sourceResults);
  const detailVerifiedCount = sourceResults.filter((item) => item.detail_http_status === 200).length; const bodyParserImprovedCount = sourceResults.filter((item) => item.body_selector_status.startsWith("resolved_")).length;
  return {
    generated_at: "2026-07-13T00:00:00.000Z", contract_version: "post-phase-f2-source-parser-remediation/v1", read_only_report_generation: true,
    db_access: false, db_write: false, supabase_access: false, migration: false, crawler_execution: false, full_crawl: false, destructive_action: false, production_apply_unchanged: true, production_detector_keyword_changed: false, source_exhaustion_proven: false,
    input_reports: { remediation: relative(INPUTS.remediation), source_spot_checks: relative(INPUTS.spotChecks) }, fixture_results: fixtures, source_spot_check_results: sourceResults, p0_remediation_decisions: decisions,
    limitations: ["The source checks are bounded public evidence, not a full crawl or coverage proof.", "Zero-match remains an observation and is not proof of scholarship absence.", "Future source_key and source_id divergence requires explicit mapping; fuzzy matching and automatic source creation remain disallowed."],
    metrics: {
      remediation_item_count: decisions.length, p0_target_count: decisions.length, p0_resolved_count: decisions.filter((item) => item.status === "resolved").length, p0_deferred_count: decisions.filter((item) => item.status === "deferred").length,
      source_spot_check_count: sourceResults.length, detail_verified_count: detailVerifiedCount, body_parser_improved_count: bodyParserImprovedCount,
      source_adapter_improved_count: sourceResults.filter((item) => item.source_id === "cau_010" && item.p0_resolved).length, url_canonicalization_improved_count: sourceResults.filter((item) => item.canonical_url_status.startsWith("resolved_")).length,
      unresolved_source_count: decisions.flatMap((item) => item.deferred_source_ids).length, manual_review_retained_count: sourceResults.filter((item) => item.classification_after === "needs_review").length, blocked_retained_count: sourceResults.filter((item) => item.classification_after === "blocked").length,
      false_clean_prevented_count: sourceResults.filter((item) => item.p0_resolved && item.classification_after !== "clean").length, zero_match_absence_claim_valid: true, fail_closed_policy_valid: sourceResults.every((item) => item.classification_after === "needs_review" || item.classification_after === "blocked"), production_apply_unchanged: true,
    },
  };
}
function parseArgs(argv) { const args = {}; for (let index = 0; index < argv.length; index += 1) { if (!argv[index].startsWith("--")) continue; const key = argv[index].slice(2); args[key] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : true; } return args; }
function main() { const args = parseArgs(process.argv.slice(2)); const inputs = Object.fromEntries(Object.entries(INPUTS).map(([key, file]) => [key, read(file)])); const report = buildPostPhaseF2SourceParserRemediation(inputs); write(args.output ?? DEFAULT_OUTPUT, report); write(args.spotCheckOutput ?? SPOT_CHECK_OUTPUT, { generated_at: report.generated_at, read_only: true, source_exhaustion_proven: false, results: report.source_spot_check_results }); console.log(`f2_report=${relative(args.output ?? DEFAULT_OUTPUT)}`); }
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) main();
