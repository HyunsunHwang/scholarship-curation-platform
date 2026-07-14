import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractDetailFromHtml } from "../lib/notice-body-extraction.mjs";

const __filename = fileURLToPath(import.meta.url);
const FIXTURE_ROOT = "fixtures/post-phase-f3-quality-attachment-encoding-remediation";
const INPUTS = { remediation: "reports/post-phase-a-remediation-priority-decisions.json", f2: "reports/post-phase-f2-source-parser-remediation.json", spotChecks: `${FIXTURE_ROOT}/source-item-spot-check-observations.json` };
const DEFAULT_OUTPUT = "reports/post-phase-f3-quality-attachment-encoding-remediation.json";
const SPOT_OUTPUT = "reports/post-phase-f3-quality-attachment-encoding-spot-checks.json";

function read(file) { return JSON.parse(fs.readFileSync(path.resolve(file), "utf8")); }
function write(file, value) { const resolved = path.resolve(file); fs.mkdirSync(path.dirname(resolved), { recursive: true }); fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function relative(file) { return path.relative(process.cwd(), path.resolve(file)).split(path.sep).join("/"); }
function array(value) { return Array.isArray(value) ? value : []; }
function fixtureFiles() { return ["before/cau_008-attachment-metadata-missing.json", "after/cau_010-attachment-metadata-present.json", "before/cau_007-replacement-character.json", "after/encoding-normalization-clean-candidate.json", "after/no-assets-text-sufficient.json", "before/image-only-suspected.json", "after/short-body-with-attachment.json"].map((file) => `${FIXTURE_ROOT}/${file}`); }
function runFixture(file) {
  const fixture = read(file); const detail = extractDetailFromHtml(fixture.html, { baseUrl: "https://example.edu/notices/detail" }); const quality = detail.qualitySignals;
  const actual = { attachment_metadata_count: detail.attachmentMetadata.length, attachment_extension: detail.attachmentMetadata[0]?.extension ?? "", attachment_download_unverified: quality.attachmentDownloadUnverified, replacement_character_count: quality.replacementCharacterCount, encoding_or_mojibake_suspected: quality.encodingOrMojibakeSuspected, encoding_normalization_improved: quality.encodingNormalizationImproved, no_assets: quality.noAssets, image_only_suspected: quality.imageOnlySuspected, attachment_only_possible: quality.attachmentOnlyPossible, short_body_suspected: quality.shortBodySuspected, classification: quality.classification, disposition: quality.disposition, reason_codes: quality.reasonCodes, body_text_length: quality.bodyTextLength };
  const pass = Object.entries(fixture.expected).every(([key, value]) => actual[key] === value);
  return { id: fixture.id, kind: fixture.kind, source_id: fixture.source_id, fixture: relative(file), expected: fixture.expected, actual, attachment_metadata: detail.attachmentMetadata, pass };
}
function buildDecisions(remediations, spotChecks) {
  const bySource = new Map(spotChecks.map((row) => [row.source_id, row]));
  return remediations.filter((item) => item.priority === "P1").map((item) => {
    const sourceIds = array(item.evidence?.affected_source_ids); const resolvedSourceIds = sourceIds.filter((sourceId) => bySource.get(sourceId)?.p1_resolved === true); const deferredSourceIds = sourceIds.filter((sourceId) => !resolvedSourceIds.includes(sourceId));
    return { remediation_id: item.remediation_id, category: item.category, priority: item.priority, success_criteria: item.success_criteria, affected_source_ids: sourceIds, resolved_source_ids: resolvedSourceIds, deferred_source_ids: deferredSourceIds, status: deferredSourceIds.length === 0 ? "resolved" : "deferred", evidence: sourceIds.map((sourceId) => { const row = bySource.get(sourceId); return { source_id: sourceId, spot_check: row ? "fixture_backed_bounded" : "not_available", p1_resolved: row?.p1_resolved === true, reason: row?.deferred_reason ?? null, next_action: row?.next_action ?? `Add explicit bounded evidence for ${sourceId} before retrying P1 remediation.` }; }) };
  });
}
const QUALITY_POLICY = [
  ["no_assets", "auto_pass_allowed", "No assets alone is not a blocker when readable text evidence is sufficient."],
  ["image_only_suspected", "admin_review_required", "Image-only evidence is not readable text evidence."],
  ["attachment_only_possible", "blocked_until_attachment_check", "Do not silently pass without attachment metadata."],
  ["short_body", "manual_spot_check_required", "Short text requires a reason-level review."],
  ["second_pass_parser_recommended", "admin_review_required", "Keep the first pass and request reviewer or parser confirmation."],
  ["encoding_or_mojibake_suspected", "blocked_until_encoding_review", "Corrupted text is insufficient for clean promotion."],
  ["detail_body_not_parsed", "blocked_until_parser_fix", "No detail body is not sufficient evidence."],
  ["list_only_supported", "manual_spot_check_required", "List evidence does not prove detail readability."],
  ["attachment_metadata_present", "admin_review_required", "Metadata is preserved, but download or short-body uncertainty remains review work."],
  ["attachment_download_unverified", "deferred_to_followup", "No attachment download is attempted by this bounded remediation."],
].map(([caseName, disposition, policy]) => ({ case: caseName, disposition, policy }));

export function buildPostPhaseF3QualityAttachmentEncodingRemediation(inputs) {
  const fixtures = fixtureFiles().map(runFixture); const spotChecks = array(inputs.spotChecks.results); const decisions = buildDecisions(array(inputs.remediation.decisions), spotChecks);
  const fixtureById = new Map(fixtures.map((item) => [item.id, item]));
  const count = (predicate) => fixtures.filter(predicate).length;
  return {
    generated_at: "2026-07-13T00:00:00.000Z", contract_version: "post-phase-f3-quality-attachment-encoding-remediation/v1", read_only_report_generation: true,
    db_access: false, db_write: false, supabase_access: false, migration: false, crawler_execution: false, full_crawl: false, destructive_action: false, production_apply_unchanged: true, production_detector_keyword_changed: false, source_exhaustion_proven: false,
    input_reports: { remediation: relative(INPUTS.remediation), f2: relative(INPUTS.f2), source_item_spot_checks: relative(INPUTS.spotChecks) }, fixture_results: fixtures, source_item_spot_checks: spotChecks, p1_remediation_decisions: decisions, quality_readability_policy: QUALITY_POLICY,
    f2_handoff: { cau_003: spotChecks.find((item) => item.source_id === "cau_003"), cau_012: spotChecks.find((item) => item.source_id === "cau_012") },
    limitations: ["Attachment evidence is metadata-level only; no attachment was downloaded.", "cau_003 and cau_012 remain deferred F-2 handoff items.", "Zero-match is an observation, not proof of scholarship absence or source exhaustion."],
    metrics: {
      p1_target_count: decisions.length, p1_resolved_count: decisions.filter((item) => item.status === "resolved").length, p1_deferred_count: decisions.filter((item) => item.status === "deferred").length,
      unresolved_without_next_action_count: decisions.flatMap((item) => item.deferred_source_ids).filter((sourceId) => !decisions.flatMap((item) => item.evidence).find((evidence) => evidence.source_id === sourceId)?.next_action).length,
      source_spot_check_count: spotChecks.length, item_spot_check_count: fixtures.length, detail_verified_count: spotChecks.filter((item) => item.detail_url_found).length,
      attachment_case_count: count((item) => item.kind === "attachment" || item.actual.attachment_metadata_count > 0), attachment_metadata_present_count: count((item) => item.actual.attachment_metadata_count > 0), attachment_only_possible_count: count((item) => item.actual.attachment_only_possible), attachment_download_unverified_count: count((item) => item.actual.attachment_download_unverified),
      encoding_case_count: count((item) => item.kind === "encoding"), mojibake_suspected_count: count((item) => item.actual.encoding_or_mojibake_suspected), replacement_character_case_count: count((item) => item.actual.replacement_character_count > 0), encoding_normalization_improved_count: count((item) => item.actual.encoding_normalization_improved),
      image_only_suspected_count: count((item) => item.actual.image_only_suspected), short_body_case_count: count((item) => item.actual.short_body_suspected), second_pass_parser_recommended_count: count((item) => item.actual.reason_codes.includes("second_pass_parser_recommended")), clean_after_fix_count: fixtureById.get("after-encoding-normalization-clean-candidate")?.actual.classification === "clean" ? 1 : 0,
      review_retained_count: count((item) => item.actual.classification === "needs_review"), blocked_retained_count: count((item) => item.actual.classification === "blocked"), false_clean_prevented_count: count((item) => item.actual.classification !== "clean" && (item.actual.attachment_only_possible || item.actual.encoding_or_mojibake_suspected || item.actual.image_only_suspected || item.actual.short_body_suspected)), manual_review_required_count: count((item) => item.actual.classification === "needs_review"),
      fail_closed_policy_valid: fixtures.every((item) => item.actual.classification !== "clean" || (!item.actual.encoding_or_mojibake_suspected && !item.actual.attachment_only_possible && !item.actual.image_only_suspected && !item.actual.short_body_suspected)), zero_match_absence_claim_valid: true, production_apply_unchanged: true,
    },
  };
}
function parseArgs(argv) { const args = {}; for (let index = 0; index < argv.length; index += 1) { if (!argv[index].startsWith("--")) continue; const key = argv[index].slice(2); args[key] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : true; } return args; }
function main() { const args = parseArgs(process.argv.slice(2)); const inputs = Object.fromEntries(Object.entries(INPUTS).map(([key, file]) => [key, read(file)])); const report = buildPostPhaseF3QualityAttachmentEncodingRemediation(inputs); write(args.output ?? DEFAULT_OUTPUT, report); write(args.spotCheckOutput ?? SPOT_OUTPUT, { generated_at: report.generated_at, read_only: true, source_exhaustion_proven: false, results: report.source_item_spot_checks }); console.log(`f3_report=${relative(args.output ?? DEFAULT_OUTPUT)}`); }
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) main();
