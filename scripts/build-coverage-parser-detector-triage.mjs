import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const REQUIRED_ITEM_FIELDS = [
  "item_id", "source_id", "source_key_snapshot", "canonical_key", "list_item_detected",
  "detail_url_resolved", "detail_fetch_status", "title_parsed", "published_at_parsed",
  "body_parsed", "body_text_length", "assets_detected", "asset_count", "keyword_matched",
  "scholarship_detected", "clean_candidate", "requires_review", "blocked",
  "item_readability_status", "failure_reason_codes", "matched_keywords",
  "missed_keyword_candidates", "replacement_character_count", "body_replacement_character_ratio",
  "encoding_issue_suspected", "keyword_detector_reason_code", "keyword_expansion_recommended",
];
const RISK_CODES = new Set([
  "no_keyword_match_observed", "list_items_read_but_no_scholarship_keyword", "detail_not_fetched",
  "detail_body_not_parsed", "body_too_short_for_detection", "attachment_only_possible",
  "pagination_depth_limited", "pinned_notice_not_checked", "js_or_api_board_suspected",
  "encoding_or_mojibake_suspected", "selector_mismatch_suspected", "true_no_recent_scholarship_possible",
  "manual_spot_check_required",
]);

function clean(value) { return String(value ?? "").trim(); }
function array(value) { return Array.isArray(value) ? value : []; }
function bool(value) { return value === true; }
function countReplacement(text) { return [...String(text ?? "")].filter((char) => char === "\uFFFD").length; }

function normalizeItem(raw, source) {
  const body = clean(raw.body_text);
  const assets = array(raw.assets);
  const replacementCharacterCount = Number.isInteger(raw.replacement_character_count)
    ? raw.replacement_character_count : countReplacement(body);
  const encodingIssue = bool(raw.encoding_issue_suspected) || replacementCharacterCount > 0 || bool(raw.body_mojibake_detected);
  const detailFetchStatus = clean(raw.detail_fetch_status) || (raw.detail_fetch_failed ? "failed" : "success");
  const titleParsed = raw.title_parsed !== false && Boolean(clean(raw.title));
  const publishedAtParsed = raw.published_at_parsed !== false && Boolean(clean(raw.published_at));
  const bodyParsed = raw.body_parsed !== false && Boolean(body);
  const detailUrlResolved = raw.detail_url_resolved !== false;
  const listItemDetected = raw.list_item_detected !== false;
  const failure = new Set(array(raw.failure_reason_codes));
  if (!titleParsed) failure.add("title_missing");
  if (!publishedAtParsed) failure.add(clean(raw.published_at) ? "published_at_invalid" : "published_at_missing");
  if (!detailUrlResolved) failure.add("detail_url_missing");
  if (detailFetchStatus === "failed") failure.add("detail_fetch_failed");
  if (!bodyParsed && detailFetchStatus === "success") failure.add("body_missing");
  if (bodyParsed && body.length < 80) failure.add("body_too_short");
  if (encodingIssue) {
    failure.add("body_mojibake_detected");
    failure.add("encoding_suspected");
    if (replacementCharacterCount > 0) failure.add("replacement_character_detected");
  }
  if (bool(raw.attachment_only_possible)) {
    failure.add("attachment_only_possible");
    failure.add("attachment_parser_recommended");
  }
  if (bool(raw.image_only_suspected)) failure.add("image_only_suspected");
  if (bool(raw.selector_mismatch_suspected)) failure.add("selector_mismatch");
  const keywordMatched = bool(raw.keyword_matched);
  const missedKeywords = array(raw.missed_keyword_candidates).map(clean).filter(Boolean);
  if (!keywordMatched && missedKeywords.length > 0) failure.add("keyword_not_detected");
  if (bool(raw.second_pass_parser_recommended)) failure.add("second_pass_parser_recommended");
  if (raw.requires_review === true && failure.size === 0) failure.add("second_pass_parser_recommended");

  let readability = "readable_clean";
  if (!listItemDetected) readability = "blocked";
  else if (!detailUrlResolved) readability = "detail_url_unresolved";
  else if (detailFetchStatus === "failed") readability = "detail_fetch_failed";
  else if (encodingIssue) readability = "encoding_or_mojibake_suspected";
  else if (bool(raw.selector_mismatch_suspected)) readability = "selector_mismatch_suspected";
  else if (bool(raw.image_only_suspected)) readability = "image_only_suspected";
  else if (bool(raw.attachment_only_possible)) readability = "attachment_only_suspected";
  else if (!bodyParsed) readability = "detail_fetched_body_missing";
  else if (body.length < 80) readability = "detail_fetched_body_short";
  else if (!publishedAtParsed) readability = "date_parse_failed";
  else if (failure.has("detail_url_invalid")) readability = "url_parse_failed";
  else if (failure.has("attachment_metadata_missing")) readability = "asset_parse_failed";
  else if (raw.requires_review === true) readability = "readable_needs_review";

  const blocked = ["blocked", "detail_url_unresolved", "detail_fetch_failed"].includes(readability);
  const requiresReview = raw.requires_review === true || (!blocked && readability !== "readable_clean");
  const cleanCandidate = bool(raw.clean_candidate) && readability === "readable_clean";
  const detectorReason = clean(raw.keyword_detector_reason_code) || (keywordMatched ? "keyword_matched" : missedKeywords.length ? "title_keyword_miss" : "scholarship_term_absent");
  return {
    item_id: clean(raw.item_id), source_id: clean(source.source_id), source_key_snapshot: clean(source.source_key_snapshot),
    canonical_key: clean(raw.canonical_key), list_item_detected: listItemDetected, detail_url_resolved: detailUrlResolved,
    detail_fetch_status: detailFetchStatus, title_parsed: titleParsed, published_at_parsed: publishedAtParsed,
    body_parsed: bodyParsed, body_text_length: body.length, assets_detected: assets.length > 0,
    asset_count: assets.length, keyword_matched: keywordMatched, scholarship_detected: bool(raw.scholarship_detected),
    clean_candidate: cleanCandidate, requires_review: requiresReview, blocked,
    item_readability_status: readability, failure_reason_codes: [...failure].sort(),
    matched_keywords: array(raw.matched_keywords).map(clean).filter(Boolean), missed_keyword_candidates: missedKeywords,
    replacement_character_count: replacementCharacterCount,
    body_replacement_character_ratio: body.length ? replacementCharacterCount / body.length : 0,
    encoding_issue_suspected: encodingIssue, keyword_detector_reason_code: detectorReason,
    keyword_expansion_recommended: missedKeywords.length > 0 && raw.keyword_expansion_recommended === true,
  };
}

function boardStatus(source, items, metrics) {
  if (source.zero_match_observed) return "zero_match_observed";
  if (metrics.listed_item_count > 0 && metrics.detail_attempt_count === 0) return "list_only_supported";
  if (metrics.detail_attempt_count > 0 && metrics.detail_success_count === 0) return "detail_access_unstable";
  if (items.some((item) => item.encoding_issue_suspected || item.failure_reason_codes.includes("selector_mismatch"))) return "parser_unstable";
  if (metrics.clean_candidate_count > 0 && metrics.readability_issue_count > 0) return "supported_partial_readability";
  if (metrics.clean_candidate_count > 0 && metrics.readability_issue_count === 0) return "supported_readable";
  if (items.some((item) => item.keyword_detector_reason_code !== "keyword_matched")) return "keyword_detector_unverified";
  return metrics.blocked_item_count > 0 ? "blocked" : "needs_manual_review";
}

function normalizeSource(input) {
  return {
    source_id: clean(input.source_id), source_key_snapshot: clean(input.source_key_snapshot ?? input.source_id),
    crawl_depth: Math.max(0, Number(input.crawl_depth ?? 1) || 0),
    zero_match_observed: bool(input.zero_match_observed), zero_match_reason_codes: array(input.zero_match_reason_codes).filter((code) => RISK_CODES.has(code)),
  };
}

export function buildCoverageParserDetectorTriage(input, options = {}) {
  const generatedAt = options.generatedAt ?? input.generated_at ?? "1970-01-01T00:00:00.000Z";
  const source = normalizeSource(input);
  const items = array(input.items).map((item) => normalizeItem(item, source));
  const metrics = items.reduce((acc, item) => {
    acc.listed_item_count += item.list_item_detected ? 1 : 0;
    acc.detail_attempt_count += item.detail_url_resolved ? 1 : 0;
    acc.detail_success_count += item.detail_fetch_status === "success" ? 1 : 0;
    acc.body_success_count += item.body_parsed ? 1 : 0;
    acc.keyword_match_count += item.keyword_matched ? 1 : 0;
    acc.candidate_count += item.scholarship_detected ? 1 : 0;
    acc.clean_candidate_count += item.clean_candidate ? 1 : 0;
    acc.review_candidate_count += item.requires_review ? 1 : 0;
    acc.blocked_item_count += item.blocked ? 1 : 0;
    acc.readability_issue_count += item.item_readability_status === "readable_clean" ? 0 : 1;
    return acc;
  }, { listed_item_count: 0, detail_attempt_count: 0, detail_success_count: 0, body_success_count: 0, keyword_match_count: 0, candidate_count: 0, clean_candidate_count: 0, review_candidate_count: 0, blocked_item_count: 0, readability_issue_count: 0 });
  const explicitZeroReasons = new Set(source.zero_match_reason_codes);
  const zeroReasons = new Set(explicitZeroReasons);
  if (source.zero_match_observed && metrics.keyword_match_count === 0) zeroReasons.add("no_keyword_match_observed");
  if (source.zero_match_observed && metrics.listed_item_count > 0) zeroReasons.add("list_items_read_but_no_scholarship_keyword");
  if (source.zero_match_observed && metrics.detail_attempt_count === 0) zeroReasons.add("detail_not_fetched");
  const benignNoRecentObservation = explicitZeroReasons.has("true_no_recent_scholarship_possible") &&
    [...explicitZeroReasons].every((code) => ["true_no_recent_scholarship_possible", "manual_spot_check_required"].includes(code));
  const falseNegative = source.zero_match_observed && !benignNoRecentObservation &&
    [...zeroReasons].some((code) => !["true_no_recent_scholarship_possible", "manual_spot_check_required"].includes(code));
  const keywordCandidates = [...new Set(items.flatMap((item) => item.missed_keyword_candidates))];
  const risks = [];
  if (source.zero_match_observed) risks.push({ risk_type: "zero_match_false_negative", source_id: source.source_id, reason_codes: [...zeroReasons].sort(), needs_review: falseNegative || true });
  for (const item of items.filter((item) => item.item_readability_status !== "readable_clean")) {
    risks.push({ risk_type: "non_clean_parsing", source_id: source.source_id, item_id: item.item_id, reason_codes: item.failure_reason_codes, needs_review: true });
  }
  if (metrics.readability_issue_count > 0) risks.push({ risk_type: "board_item_readability", source_id: source.source_id, reason_codes: ["item_level_readability_not_uniform"], needs_review: true });
  const zeroMatch = {
    source_id: source.source_id, source_key_snapshot: source.source_key_snapshot, crawl_depth: source.crawl_depth,
    listed_item_count: metrics.listed_item_count, detail_attempt_count: metrics.detail_attempt_count,
    keyword_match_count: metrics.keyword_match_count, candidate_count: metrics.candidate_count,
    zero_match_observed: source.zero_match_observed, zero_match_reason_codes: [...zeroReasons].sort(),
    false_negative_risk: falseNegative, needs_manual_spot_check: source.zero_match_observed,
    keyword_expansion_candidate: keywordCandidates.length > 0, depth_expansion_candidate: zeroReasons.has("pagination_depth_limited"),
    parser_review_required: zeroReasons.has("detail_body_not_parsed") || zeroReasons.has("selector_mismatch_suspected") || zeroReasons.has("encoding_or_mojibake_suspected"),
    source_exhaustion_proven: false,
  };
  return {
    generated_at: generatedAt, contract_version: "post-phase-a0-a1-coverage-readability-triage/v1",
    read_only: true, db_access: false, db_write: false, migration: false, crawler_execution: false, destructive_action: false,
    fixture_name: clean(input.fixture_name) || null, zero_match_triage: zeroMatch,
    board_read_model: { source_id: source.source_id, source_key_snapshot: source.source_key_snapshot, board_readability_status: boardStatus(source, items, metrics), ...metrics },
    item_readability: items,
    keyword_detector_triage: { matched_keywords: [...new Set(items.flatMap((item) => item.matched_keywords))], missed_keyword_candidates: keywordCandidates, keyword_expansion_recommended: keywordCandidates.length > 0, detector_rule_changed: false },
    carry_forward_risks: risks, required_item_fields: REQUIRED_ITEM_FIELDS,
  };
}

function parseArgs(argv) { const out = {}; for (let i = 0; i < argv.length; i += 1) { if (!argv[i].startsWith("--")) continue; const key = argv[i].slice(2); out[key] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true; } return out; }
function readJson(filePath) { return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8")); }
function writeJson(filePath, value) { const resolved = path.resolve(filePath); fs.mkdirSync(path.dirname(resolved), { recursive: true }); fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
async function main() { const args = parseArgs(process.argv.slice(2)); if (!args.input || !args.output) throw new Error("Usage: node scripts/build-coverage-parser-detector-triage.mjs --input <fixture.json> --output <report.json>"); writeJson(args.output, buildCoverageParserDetectorTriage(readJson(args.input))); console.log(`triage_report=${path.resolve(args.output)}`); }
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) main().catch((error) => { console.error(error); process.exitCode = 1; });
