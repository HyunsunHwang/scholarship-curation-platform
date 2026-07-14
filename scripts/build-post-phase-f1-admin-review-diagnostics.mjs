import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const INPUTS = {
  f0: "reports/post-phase-f0-adapter-foundation.json",
  bc: "reports/post-phase-bc-review-quality-foundation.json",
  e: "reports/post-phase-e-batch-observability.json",
  aSummary: "reports/post-phase-a-coverage-parser-reliability-summary.json",
  aClosure: "reports/post-phase-a-closure-review-note.json",
  aSpotChecks: "reports/post-phase-a-spot-check-decisions.json",
  aRemediation: "reports/post-phase-a-remediation-priority-decisions.json",
  f2: "reports/post-phase-f2-source-parser-remediation.json",
  f3: "reports/post-phase-f3-quality-attachment-encoding-remediation.json",
};
const DEFAULT_OUTPUT = "reports/post-phase-f1-admin-review-integration.json";

function read(file) { return JSON.parse(fs.readFileSync(path.resolve(file), "utf8")); }
function write(file, value) { const resolved = path.resolve(file); fs.mkdirSync(path.dirname(resolved), { recursive: true }); fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function relative(file) { return path.relative(process.cwd(), path.resolve(file)).split(path.sep).join("/"); }
function array(value) { return Array.isArray(value) ? value : []; }

function countBy(values) {
  return values.reduce((result, value) => ({ ...result, [value]: (result[value] ?? 0) + 1 }), {});
}

function priorityFor(remediation) {
  if (remediation.some((row) => row.priority === "P0")) return "P0";
  if (remediation.some((row) => row.priority === "P1")) return "P1";
  if (remediation.some((row) => row.priority === "P2")) return "P2";
  if (remediation.some((row) => row.priority === "P3")) return "P3";
  return null;
}

export function buildAdminCrawlerReviewDiagnostics(inputs) {
  const sourceSpotChecks = new Map(array(inputs.aSpotChecks.decisions).map((row) => [row.source_id, row]));
  const f2BySource = new Map(array(inputs.f2.source_spot_check_results).map((row) => [row.source_id, row]));
  const f3BySource = new Map(array(inputs.f3.source_item_spot_checks).map((row) => [row.source_id, row]));
  const remediationBySource = new Map();
  for (const remediation of array(inputs.aSummary.remediation_priorities)) {
    for (const sourceId of array(remediation.affected_source_ids)) {
      const rows = remediationBySource.get(sourceId) ?? [];
      rows.push(remediation);
      remediationBySource.set(sourceId, rows);
    }
  }
  const diagnostics = array(inputs.f0.review_read_model).map((row) => {
    const sourceId = row.source_id ?? undefined;
    const sourceKey = row.source_key_snapshot || undefined;
    const remediation = sourceId ? remediationBySource.get(sourceId) ?? [] : [];
    const spotCheck = sourceId ? sourceSpotChecks.get(sourceId) : null;
    const f2 = sourceId ? f2BySource.get(sourceId) : null;
    const f3 = sourceId ? f3BySource.get(sourceId) : null;
    const qualityFlags = [];
    if (row.no_assets) qualityFlags.push("no_assets");
    if (row.image_only_suspected) qualityFlags.push("image_only_suspected");
    if (String(row.body_quality).includes("short_body")) qualityFlags.push("short_body");
    if (remediation.some((item) => item.remediation_category === "attachment_parser_required")) qualityFlags.push("attachment_only_possible");
    if (remediation.some((item) => item.remediation_category === "second_pass_parser_recommended")) qualityFlags.push("second_pass_parser_recommended");
    if (remediation.some((item) => item.remediation_category === "encoding_normalization_review")) qualityFlags.push("encoding_or_mojibake_suspected");
    if (array(spotCheck?.fixture_backed_triage_types).some((item) => item === "detail_fetch_or_body_parse_issue")) qualityFlags.push("detail_body_not_parsed");
    if (f3?.attachment_only_possible) qualityFlags.push("attachment_only_possible");
    if (f3?.mojibake_suspected) qualityFlags.push("encoding_or_mojibake_suspected");
    if (f3?.image_only_suspected) qualityFlags.push("image_only_suspected");
    if (f3?.short_body_suspected) qualityFlags.push("short_body");
    const parserFailureReasonCodes = [
      ...new Set([
        ...qualityFlags,
        ...remediation.flatMap((item) => array(item.reason_codes)),
        ...array(spotCheck?.fixture_backed_triage_types),
        ...(f3?.attachment_metadata_status === "metadata_present_pdf" ? ["attachment_metadata_present", "attachment_download_unverified"] : []),
      ]),
    ];
    const remediationPriority = priorityFor(remediation);
    const nextAction = f3?.next_action ?? f2?.next_action ?? remediation[0]?.rationale ?? spotCheck?.bounded_real_source_spot_check?.next_action ?? row.recommended_action;
    const batchWarning = row.observability_issue_count > 0
      ? `${row.batch_observability_status}: ${row.observability_issue_count} observability issue(s)`
      : null;
    return {
      id: row.canonical_key,
      sourceId,
      sourceKey,
      title: row.title,
      sourceResolutionStatus: row.source_resolution_status,
      sourceResolutionReason: row.source_resolution_reason,
      reviewStatus: row.review_status,
      qualityStatus: row.quality_status,
      qualityFlags,
      zeroMatchObserved: Boolean(row.zero_match_observed),
      falseNegativeReview: Boolean(spotCheck?.fixture_backed_triage_types?.includes("high_priority_false_negative_review")),
      parserFailureReasonCodes,
      itemReadabilityStatus: row.body_quality,
      boardReadabilityStatus: spotCheck?.fixture_backed_triage_types?.join(", ") ?? null,
      remediationPriority,
      f2RemediationStatus: f2 ? (f2.p0_resolved ? "resolved" : "deferred") : null,
      f2ClassificationBefore: f2?.classification_before ?? null,
      f2ClassificationAfter: f2?.classification_after ?? null,
      f2NextAction: f2?.next_action ?? null,
      f3RemediationStatus: f3 ? (f3.p1_resolved ? "resolved" : "deferred") : null,
      f3ClassificationBefore: f3?.classification_before ?? null,
      f3ClassificationAfter: f3?.classification_after ?? null,
      f3RiskCodes: [
        ...(f3?.attachment_only_possible ? ["attachment_only_possible"] : []),
        ...(f3?.mojibake_suspected ? ["encoding_or_mojibake_suspected"] : []),
        ...(f3?.image_only_suspected ? ["image_only_suspected"] : []),
        ...(f3?.short_body_suspected ? ["short_body"] : []),
      ],
      f3NextAction: f3?.next_action ?? null,
      nextAction,
      batchWarning,
      batchStatus: row.batch_observability_status,
      sourceResultStatus: row.source_result_status,
      rollbackScopeAvailable: Boolean(row.rollback_scope_available),
      adminReviewRequired: Boolean(row.admin_review_required),
      autoApplyAllowed: Boolean(row.auto_apply_allowed),
    };
  });
  const metrics = {
    diagnostic_item_count: diagnostics.length,
    source_resolution_status_counts: countBy(diagnostics.map((row) => row.sourceResolutionStatus)),
    clean_count: diagnostics.filter((row) => row.reviewStatus === "clean").length,
    admin_review_required_count: diagnostics.filter((row) => row.adminReviewRequired).length,
    blocked_count: diagnostics.filter((row) => row.reviewStatus === "blocked").length,
    zero_match_observed_count: diagnostics.filter((row) => row.zeroMatchObserved).length,
    parser_readability_issue_count: diagnostics.filter((row) => row.parserFailureReasonCodes.length > 0).length,
    p0_remediation_count: inputs.aClosure.metrics.p0_remediation_count,
    p1_remediation_count: inputs.aClosure.metrics.p1_remediation_count,
    batch_warning_count: diagnostics.filter((row) => row.batchWarning).length,
    auto_apply_allowed_count: diagnostics.filter((row) => row.autoApplyAllowed).length,
  };
  return {
    generated_at: inputs.f0.generated_at,
    contract_version: "post-phase-f1-admin-review-integration/v1",
    read_only: true,
    db_access: false,
    db_write: false,
    supabase_access: false,
    migration: false,
    crawler_execution: false,
    destructive_action: false,
    production_detector_parser_crawler_changed: false,
    input_reports: Object.fromEntries(Object.entries(INPUTS).map(([key, file]) => [key, relative(file)])),
    diagnostics,
    quality_readability_policy: inputs.aClosure.quality_readability_policy,
    remediation_decisions: inputs.aRemediation.decisions,
    review_quality_summary: {
      clean_count: inputs.bc.counts.clean_count,
      duplicate_review_count: inputs.bc.counts.duplicate_review_count,
      quality_review_count: inputs.bc.counts.quality_review_count,
      no_assets_text_sufficient_count: inputs.bc.counts.no_assets_text_sufficient_count,
      no_assets_needs_review_count: inputs.bc.counts.no_assets_needs_review_count,
      image_only_suspected_count: inputs.bc.counts.image_only_suspected_count,
    },
    batch_summary: {
      batch_status: inputs.e.batch_status,
      batch_warning_count: inputs.f0.counts.batch_warning_count,
      rollback_scope_available_count: inputs.f0.counts.rollback_scope_available_count,
      zero_match_policy: inputs.e.zero_match_policy,
    },
    f2_summary: {
      p0_resolved_count: inputs.f2.metrics.p0_resolved_count,
      p0_deferred_count: inputs.f2.metrics.p0_deferred_count,
      source_spot_check_count: inputs.f2.metrics.source_spot_check_count,
      manual_review_retained_count: inputs.f2.metrics.manual_review_retained_count,
    },
    f3_summary: {
      p1_resolved_count: inputs.f3.metrics.p1_resolved_count,
      p1_deferred_count: inputs.f3.metrics.p1_deferred_count,
      attachment_metadata_present_count: inputs.f3.metrics.attachment_metadata_present_count,
      encoding_case_count: inputs.f3.metrics.encoding_case_count,
      review_retained_count: inputs.f3.metrics.review_retained_count,
    },
    scope_notices: [
      "This page is read-only and does not create an apply path.",
      "Zero-match is an observation, not proof of scholarship absence or source exhaustion.",
      "Post-Phase A Foundation does not mean full coverage remediation is complete.",
      "Production detector, parser, and crawler behavior are unchanged by this page.",
      "F-2 resolves only bounded P0 source/parser issues.",
      "Unverified detail/pagination/attachment cases remain review/backlog.",
      "Fail-closed behavior is preserved.",
      "No production apply or DB write is performed.",
      "F-3 resolves only bounded P1 quality, attachment, and encoding issues.",
      "Attachment-only or mojibake-suspected items are not silently promoted to clean.",
      "Evidence-limited items remain review/backlog.",
    ],
    metrics,
  };
}

function parseArgs(argv) { const args = {}; for (let index = 0; index < argv.length; index += 1) { if (!argv[index].startsWith("--")) continue; const key = argv[index].slice(2); args[key] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : true; } return args; }
function main() { const args = parseArgs(process.argv.slice(2)); const inputs = Object.fromEntries(Object.entries(INPUTS).map(([key, file]) => [key, read(file)])); const report = buildAdminCrawlerReviewDiagnostics(inputs); write(args.output ?? DEFAULT_OUTPUT, report); console.log(`admin_diagnostics=${relative(args.output ?? DEFAULT_OUTPUT)}`); }
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) main();
