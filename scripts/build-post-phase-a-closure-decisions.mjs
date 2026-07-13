import fs from "node:fs";
import path from "node:path";

const SUMMARY = "reports/post-phase-a-coverage-parser-reliability-summary.json";
const CLOSURE = "reports/post-phase-a-closure-review-note.json";
const SPOT_CHECKS = "reports/post-phase-a-spot-check-decisions.json";
const REMEDIATION = "reports/post-phase-a-remediation-priority-decisions.json";
const OBSERVED_ON = "2026-07-13";

function read(file) { return JSON.parse(fs.readFileSync(path.resolve(file), "utf8")); }
function write(file, value) { const resolved = path.resolve(file); fs.mkdirSync(path.dirname(resolved), { recursive: true }); fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function relative(file) { return path.relative(process.cwd(), path.resolve(file)).split(path.sep).join("/"); }
function array(value) { return Array.isArray(value) ? value : []; }

const SOURCE_OBSERVATIONS = {
  cau_001: { url: "https://biz.cau.ac.kr/2016/sub06/sub06_01_list.php", decision: ["keyword_miss", "manual_spot_check_required"], inference: "The public list page was reachable and contained a scholarship-related term, but no detail item was sampled; the fixture keyword-miss diagnosis remains unresolved.", next: "Manually compare a recent financial-support title/body with detector context before considering a contextual keyword rule." },
  cau_002: { url: "https://econ.cau.ac.kr/news/notice/", decision: ["pagination_depth_limited", "manual_spot_check_required"], inference: "The public list page was reachable and contained a scholarship-related term. The bounded check did not inspect pinned notices or later pages.", next: "Inspect the pinned region and one later page before treating depth as a crawler remediation." },
  cau_003: { url: "https://iadpr.cau.ac.kr/fm/fm_1.php", decision: ["detail_fetch_or_body_parse_issue", "selector_mismatch_suspected", "manual_spot_check_required"], inference: "The public list page was reachable and contained a scholarship-related term, but this check did not resolve a detail URL or parse a detail body.", next: "Capture one current detail URL and compare the rendered body with the configured selector before a parser change." },
  cau_004: { url: "https://log.cau.ac.kr/dm/dm_1.php", decision: ["true_no_recent_scholarship_possible", "manual_spot_check_required"], inference: "The public list page was reachable and contained a scholarship-related term. That observation prevents confirming the fixture's possible no-recent-scholarship explanation.", next: "Review a bounded recent-title sample before retaining or rejecting the no-recent-scholarship hypothesis." },
};

const KEYWORD_DECISIONS = {
  "financial-support": { decision: "contextual_only", risk: "high", standalone: false, context: ["scholarship", "financial-aid", "tuition", "eligibility", "application"], recommendation: "Keep as review evidence only; do not add a standalone production detector rule." },
  "grant-support": { decision: "contextual_only", risk: "high", standalone: false, context: ["scholarship", "grant", "award", "eligibility", "application"], recommendation: "Keep as review evidence only; require a scholarship or award context before any future experiment." },
};

const REMEDIATION_DETAILS = {
  selector_fix_required: { id: "A-P0-001", owner: "crawler parsing follow-up", related: ["body_parser_fix_required"], impact: "Restores detail body evidence where selector/body extraction is missing.", success: "A bounded fixture and one approved source sample retain a non-empty normalized body without lowering review safeguards." },
  source_specific_adapter_required: { id: "A-P0-002", owner: "source adapter follow-up", related: [], impact: "Restores detail access for sources whose generic parsing path fails.", success: "The source-specific adapter resolves a representative detail page and preserves fail-closed classification." },
  url_canonicalization_fix_required: { id: "A-P0-003", owner: "URL resolution follow-up", related: [], impact: "Prevents missing or malformed detail URLs from blocking candidate evidence.", success: "A representative list item resolves to one canonical detail URL with duplicate protection." },
  encoding_normalization_review: { id: "A-P1-001", owner: "text normalization follow-up", related: [], impact: "Prevents corrupted text from concealing eligibility and review evidence.", success: "A mojibake fixture is diagnosed before review, with uncertain text still routed to review." },
  attachment_parser_required: { id: "A-P1-002", owner: "attachment parsing follow-up", related: [], impact: "Retains attachment-only eligibility evidence instead of silently passing it.", success: "Attachment-only cases expose metadata or remain explicitly blocked for review." },
};

const QUALITY_POLICY = [
  { case: "no_assets", disposition: "auto_pass_allowed", policy: "No assets alone is not a blocker when title, body, date, and classification evidence are otherwise clean." },
  { case: "image_only_suspected", disposition: "admin_review_required", policy: "Image-only evidence requires review; do not infer readable detail text." },
  { case: "attachment_only_possible", disposition: "blocked_until_parser_fix", policy: "Do not silently pass; expose the attachment gap and route it to the attachment-parser follow-up." },
  { case: "short_body", disposition: "manual_spot_check_required", policy: "Require a reason-level diagnosis before deciding that the body is adequate." },
  { case: "second_pass_parser_recommended", disposition: "admin_review_required", policy: "Keep the first-pass evidence and request a second parser pass or reviewer confirmation." },
  { case: "encoding_or_mojibake_suspected", disposition: "blocked_until_parser_fix", policy: "Treat corrupted text as insufficient evidence until normalization review resolves it." },
  { case: "detail_body_not_parsed", disposition: "blocked_until_source_check", policy: "Require a bounded detail and selector check before treating the source as readable." },
  { case: "list_only_supported", disposition: "admin_review_required", policy: "List evidence can be retained, but one matched item never proves full board readability." },
];

export function buildPostPhaseAClosureDecisions(summary) {
  const planned = array(summary.bounded_real_source_spot_check_plan);
  const spotChecks = planned.map((row) => {
    const observed = SOURCE_OBSERVATIONS[row.source_id];
    return {
      source_id: row.source_id, source_key_snapshot: row.source_key_snapshot, list_url: observed?.url ?? null,
      fixture_backed_triage_types: row.triage_types, bounded_real_source_spot_check: observed ? {
        observed_on: OBSERVED_ON, method: "single public list-page HTTP fetch; no crawler workflow", http_status: 200,
        scholarship_term_observed: true, detail_pages_sampled: 0, decision_categories: observed.decision,
        evidence_limited_inference: observed.inference, next_action: observed.next,
      } : null,
      verified_source: Boolean(observed), unresolved_backlog: true, source_exhaustion_proven: false,
    };
  });
  const keywordDecisions = array(summary.keyword_expansion_recommendations).map((row) => {
    const decision = KEYWORD_DECISIONS[row.term] ?? { decision: "reject", risk: "unknown", standalone: false, context: [], recommendation: "Reject until evidence is recorded." };
    return {
      candidate_keyword: row.term, supporting_evidence: row.evidence, false_positive_noise_risk: decision.risk,
      standalone_allowed: decision.standalone, required_context_terms: decision.context, recommendation: decision.recommendation,
      decision: decision.decision, production_detector_change_in_this_pr: false,
    };
  });
  const remediation = array(summary.remediation_priorities).filter((row) => ["P0", "P1"].includes(row.priority)).map((row) => {
    const detail = REMEDIATION_DETAILS[row.remediation_category];
    return {
      remediation_id: detail?.id ?? `A-${row.priority}-UNASSIGNED`, category: row.remediation_category, related_categories: detail?.related ?? [], priority: row.priority,
      evidence: { reason_codes: row.reason_codes, affected_source_ids: row.affected_source_ids, affected_item_count: row.affected_item_count },
      expected_impact: detail?.impact ?? row.rationale, suggested_owner_or_next_work_unit: detail?.owner ?? "manual review follow-up",
      implement_in_this_pr: false, defer_to_followup: true, success_criteria: detail?.success ?? "Record a source-specific evidence decision before implementation.",
    };
  });
  const followups = remediation.map((row) => ({ work_unit: row.remediation_id, priority: row.priority, owner_or_next_work_unit: row.suggested_owner_or_next_work_unit }));
  followups.push({ work_unit: "A-SPOT-CHECK-001", priority: "P0", owner_or_next_work_unit: "bounded manual source review for four unresolved source decisions" });
  const exitGate = {
    phase_a_exit_gate_status: "ready_for_review", ready_to_merge_after_review: true, blocking_open_questions: [],
    unresolved_backlog_source_ids: spotChecks.filter((row) => row.unresolved_backlog).map((row) => row.source_id), followup_work_units: followups,
    required_conditions: {
      p0_p1_next_work_unit_assigned: remediation.every((row) => Boolean(row.suggested_owner_or_next_work_unit)), keyword_candidates_decided: keywordDecisions.every((row) => ["high_confidence", "contextual_only", "reject"].includes(row.decision)),
      unresolved_spot_checks_backlogged: spotChecks.filter((row) => row.unresolved_backlog).length > 0, f1_dependency_policy_documented: true,
      production_behavior_changed: false, source_exhaustion_proven: false,
    },
  };
  const report = {
    generated_at: OBSERVED_ON, contract_version: "post-phase-a-closure-decisions/v1", read_only: true, db_access: false, db_write: false, supabase_access: false, migration: false, crawler_execution: false, destructive_action: false,
    input_path: relative(SUMMARY), fixture_backed_validation_result: { metrics: summary.metrics, scope: "A-0/A-1 fixtures and deterministic read-model validation" },
    bounded_real_source_spot_check_result: spotChecks, evidence_limited_inference: "Four public list pages were fetched once. This is reachability and visible-term evidence only, not a full crawl, detail-body verification, nationwide coverage claim, or source-exhaustion proof.",
    keyword_expansion_decisions: keywordDecisions, remediation_priority_decisions: remediation, quality_readability_policy: QUALITY_POLICY, phase_a_exit_gate: exitGate,
    metrics: {
      spot_check_source_count: spotChecks.length, verified_source_count: spotChecks.filter((row) => row.verified_source).length, unresolved_backlog_source_count: spotChecks.filter((row) => row.unresolved_backlog).length,
      keyword_candidate_count: keywordDecisions.length, high_confidence_keyword_count: keywordDecisions.filter((row) => row.decision === "high_confidence").length, contextual_only_keyword_count: keywordDecisions.filter((row) => row.decision === "contextual_only").length, rejected_keyword_count: keywordDecisions.filter((row) => row.decision === "reject").length,
      p0_remediation_count: remediation.filter((row) => row.priority === "P0").length, p1_remediation_count: remediation.filter((row) => row.priority === "P1").length,
      followup_work_unit_count: followups.length, blocking_open_question_count: exitGate.blocking_open_questions.length,
    },
  };
  return { report, spotChecks, remediation };
}

function main() { const built = buildPostPhaseAClosureDecisions(read(SUMMARY)); write(CLOSURE, built.report); write(SPOT_CHECKS, { generated_at: OBSERVED_ON, read_only: true, source_exhaustion_proven: false, decisions: built.spotChecks }); write(REMEDIATION, { generated_at: OBSERVED_ON, read_only: true, production_behavior_changed: false, decisions: built.remediation }); console.log(`closure_report=${relative(CLOSURE)}`); }
main();
