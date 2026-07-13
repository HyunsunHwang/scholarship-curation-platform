import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const DEFAULT_INPUT = "reports/post-phase-a0-a1-coverage-readability-triage.json";
const DEFAULT_OUTPUT = "reports/post-phase-a-coverage-parser-reliability-summary.json";
const HIGH_CONFIDENCE_TERMS = new Set(["scholarship", "scholar", "scholarship-fund", "external-scholarship", "internal-scholarship"]);
const CONDITIONAL_TERMS = new Set(["selection", "recommendation", "financial-support", "foundation", "living-expense", "tuition", "grant-support"]);

function clean(value) { return String(value ?? "").trim(); }
function array(value) { return Array.isArray(value) ? value : []; }
function relative(file) { return path.relative(process.cwd(), path.resolve(file)).split(path.sep).join("/"); }
function readJson(file) { return JSON.parse(fs.readFileSync(path.resolve(file), "utf8")); }
function writeJson(file, value) { const resolved = path.resolve(file); fs.mkdirSync(path.dirname(resolved), { recursive: true }); fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }

function spotCheckTypes(row) {
  const reasons = new Set(array(row.zero_match_reason_codes));
  const types = [];
  if (row.false_negative_risk) types.push("high_priority_false_negative_review");
  if (reasons.has("no_keyword_match_observed")) types.push("keyword_miss_suspected");
  if (reasons.has("pagination_depth_limited") || reasons.has("pinned_notice_not_checked")) types.push("pagination_depth_limited");
  if (reasons.has("detail_not_fetched") || reasons.has("detail_body_not_parsed") || reasons.has("selector_mismatch_suspected")) types.push("detail_fetch_or_body_parse_issue");
  if (reasons.has("attachment_only_possible")) types.push("attachment_only_possible");
  if (reasons.has("encoding_or_mojibake_suspected")) types.push("encoding_or_mojibake_suspected");
  if (reasons.has("true_no_recent_scholarship_possible")) types.push("true_no_recent_scholarship_possible");
  if (row.needs_manual_spot_check) types.push("manual_spot_check_required");
  return types;
}

function buildSpotChecks(input) {
  return array(input.zero_match_triage)
    .filter((row) => row.zero_match_observed)
    .map((row) => {
      const types = spotCheckTypes(row);
      const priority = row.false_negative_risk
        ? types.includes("detail_fetch_or_body_parse_issue") ? "P0" : "P1"
        : "P2";
      return {
        source_id: row.source_id,
        source_key_snapshot: row.source_key_snapshot,
        spot_check_priority: priority,
        triage_types: types,
        reason_codes: row.zero_match_reason_codes,
        crawl_depth: row.crawl_depth,
        listed_item_count: row.listed_item_count,
        detail_attempt_count: row.detail_attempt_count,
        keyword_match_count: row.keyword_match_count,
        candidate_count: row.candidate_count,
        manual_spot_check_required: row.needs_manual_spot_check,
        source_exhaustion_proven: false,
        recommended_evidence: ["sample recent list items", "inspect pinned and pagination scope", "compare title/body/attachment text before any detector change"],
      };
    })
    .sort((a, b) => a.spot_check_priority.localeCompare(b.spot_check_priority) || a.source_id.localeCompare(b.source_id));
}

function keywordClass(term) {
  if (HIGH_CONFIDENCE_TERMS.has(term)) return { confidence: "high_confidence", noise_risk: "low", usage: "standalone_candidate" };
  if (CONDITIONAL_TERMS.has(term)) return { confidence: "conditional_noisy", noise_risk: "high", usage: "requires_scholarship_context" };
  return { confidence: "conditional_noisy", noise_risk: "medium", usage: "requires_manual_evidence_review" };
}

function buildKeywordRecommendations(input) {
  const byTerm = new Map();
  for (const item of array(input.item_readability)) {
    if (!item.keyword_expansion_recommended) continue;
    for (const term of array(item.missed_keyword_candidates).map(clean).filter(Boolean)) {
      const current = byTerm.get(term) ?? { term, evidence: [] };
      current.evidence.push({ source_id: item.source_id, item_id: item.item_id, detector_reason: item.keyword_detector_reason_code, false_negative_evidence: true });
      byTerm.set(term, current);
    }
  }
  return [...byTerm.values()].sort((a, b) => a.term.localeCompare(b.term)).map((row) => ({
    ...row,
    ...keywordClass(row.term),
    production_detector_rule_changed: false,
    recommendation_status: "evidence_review_required",
  }));
}

function remediationForReason(reason) {
  if (["selector_mismatch", "body_missing"].includes(reason)) return ["selector_fix_required", "P0"];
  if (["detail_fetch_failed"].includes(reason)) return ["source_specific_adapter_required", "P0"];
  if (["detail_url_missing", "detail_url_invalid"].includes(reason)) return ["url_canonicalization_fix_required", "P0"];
  if (["published_at_missing", "published_at_invalid"].includes(reason)) return ["date_parser_fix_required", "P1"];
  if (["body_mojibake_detected", "encoding_suspected", "replacement_character_detected"].includes(reason)) return ["encoding_normalization_review", "P1"];
  if (["attachment_metadata_missing", "attachment_only_possible", "attachment_parser_recommended"].includes(reason)) return ["attachment_parser_required", "P1"];
  if (["body_too_short", "second_pass_parser_recommended", "image_only_suspected"].includes(reason)) return ["second_pass_parser_recommended", "P2"];
  return ["manual_review_only", "P3"];
}

function buildRemediation(input) {
  const grouped = new Map();
  for (const item of array(input.item_readability)) {
    for (const reason of array(item.failure_reason_codes)) {
      const [category, priority] = remediationForReason(reason);
      const key = `${category}:${priority}`;
      const entry = grouped.get(key) ?? { remediation_category: category, priority, reason_codes: new Set(), affected_source_ids: new Set(), affected_item_ids: new Set() };
      entry.reason_codes.add(reason); entry.affected_source_ids.add(item.source_id); entry.affected_item_ids.add(item.item_id); grouped.set(key, entry);
    }
  }
  return [...grouped.values()].map((row) => ({
    remediation_category: row.remediation_category, priority: row.priority, reason_codes: [...row.reason_codes].sort(),
    affected_source_ids: [...row.affected_source_ids].sort(), affected_item_count: row.affected_item_ids.size,
    rationale: row.priority === "P0" ? "Blocks candidate creation or can cause major false negatives." : row.priority === "P1" ? "Sends many candidates to review or obscures key evidence." : row.priority === "P2" ? "Improves quality after blocking failures are addressed." : "Future enhancement or manual-only follow-up.",
  })).sort((a, b) => a.priority.localeCompare(b.priority) || a.remediation_category.localeCompare(b.remediation_category));
}

export function buildPostPhaseACoverageParserReliabilitySummary(input, options = {}) {
  const spotChecks = buildSpotChecks(input);
  const keywords = buildKeywordRecommendations(input);
  const remediation = buildRemediation(input);
  const prior = input.metrics ?? {};
  const metrics = {
    zero_match_source_count: Number(prior.zero_match_source_count ?? 0), false_negative_review_count: Number(prior.false_negative_review_count ?? 0),
    keyword_expansion_candidate_count: keywords.length, high_confidence_keyword_candidate_count: keywords.filter((row) => row.confidence === "high_confidence").length,
    noisy_keyword_candidate_count: keywords.filter((row) => row.confidence === "conditional_noisy").length,
    parser_failure_count: Number(prior.parser_failure_count ?? 0), remediation_category_count: remediation.length,
    p0_remediation_count: remediation.filter((row) => row.priority === "P0").length, p1_remediation_count: remediation.filter((row) => row.priority === "P1").length,
    encoding_issue_count: Number(prior.encoding_issue_count ?? 0), attachment_parser_required_count: remediation.filter((row) => row.remediation_category === "attachment_parser_required").length,
    board_count: Number(prior.board_count ?? 0), item_count: Number(prior.item_count ?? 0), carry_forward_risk_count: Number(prior.carry_forward_risk_count ?? 0),
  };
  return {
    generated_at: options.generatedAt ?? input.generated_at ?? "1970-01-01T00:00:00.000Z", contract_version: "post-phase-a-coverage-parser-reliability/v1",
    read_only: true, db_access: false, db_write: false, migration: false, crawler_execution: false, destructive_action: false,
    input_path: options.inputPath ? relative(options.inputPath) : null,
    post_phase_a_scope: { a0_a1_triage_reused: true, combined_pr_scope: "Post-Phase A", production_detector_rule_changed: false, source_exhaustion_proven: false },
    bounded_real_source_spot_check_plan: spotChecks, keyword_expansion_recommendations: keywords, remediation_priorities: remediation,
    carry_forward_risks: ["zero-match false-negative risk", "non-clean parsing risk", "board/item-level readability risk"], metrics,
  };
}

function parseArgs(argv) { const out = {}; for (let i = 0; i < argv.length; i += 1) { if (!argv[i].startsWith("--")) continue; const key = argv[i].slice(2); out[key] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true; } return out; }
async function main() { const args = parseArgs(process.argv.slice(2)); const inputPath = args.input ?? DEFAULT_INPUT; const outputPath = args.output ?? DEFAULT_OUTPUT; writeJson(outputPath, buildPostPhaseACoverageParserReliabilitySummary(readJson(inputPath), { inputPath, generatedAt: args["generated-at"] })); console.log(`post_phase_a_summary=${relative(outputPath)}`); }
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) main().catch((error) => { console.error(error); process.exitCode = 1; });
