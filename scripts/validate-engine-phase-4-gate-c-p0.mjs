import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { P0_AS_OF, P0_TIMEZONE, P0_FIELDS, validateP0Overlay, validateProductionSourceReview } from "../lib/engine-phase-4/gate-c-p0-audit.mjs";
import { report as evaluated } from "./evaluate-engine-phase-4-gate-c-p0.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
const readText = (name) => fs.readFileSync(path.join(root, name), "utf8");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const report = read("reports/engine-phase-4-gate-c-p0.json");
const markdown = readText("reports/engine-phase-4-gate-c-p0.md");
const contract = readText("docs/engine/engine-phase-4-gate-c-p0-audit.md");
const validationShortlist = readText("reports/engine-phase-4-gate-c-p0-additional-validation.md");
const fullReport = read("reports/engine-phase-4-gate-c-representative-evaluation.json");
const corpus = read("fixtures/engine-phase-4-representative-gold/cases.json");
const decisions = read("fixtures/engine-phase-4-representative-gold/adjudication/adjudication-decisions.json");
const overlay = read("fixtures/engine-phase-4-gate-c-p0/p0-adjudication-overlay.json");
const productionSourceReview = read("fixtures/engine-phase-4-gate-c-p0/production-source-review.json");
const checks = [];
const check = (name, pass, detail = null) => {
  checks.push({ name, pass: Boolean(pass) });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

check("report matches a fresh deterministic evaluator run", JSON.stringify(report) === JSON.stringify(evaluated));
check("report identifies the separate P0 diagnostic", report.official_phase === "ENGINE_PHASE_4" && report.official_gate === "GATE_C_P0_DIAGNOSTIC_AUDIT");
check("fixed evaluation clock is recorded", report.as_of === P0_AS_OF && report.timezone === P0_TIMEZONE);
check("P0 overlay is valid", validateP0Overlay(corpus, decisions, overlay).valid);
check("production-source review is valid", validateProductionSourceReview(corpus, productionSourceReview).valid);
check("all 24 frozen cases are evaluated", corpus.cases.length === 24 && report.corpus.total_case_count === 24);
check("all nine P0 opportunity fields are represented without standalone timezone", P0_FIELDS.length === 9 && !P0_FIELDS.includes("timezone") && report.p0_contract.standalone_timezone_field === false && report.corpus.total_p0_field_count === 216 && P0_FIELDS.every((name) => report.by_field[name]) && !report.by_field.timezone);
check("frozen-excerpt denominator states are exact", report.corpus.resolved_p0_field_count === 14 && report.corpus.pending_p0_field_count === 198 && report.corpus.unresolved_p0_field_count === 4 && report.corpus.resolved_safety_field_count === 10);
check("partial cases are not scored as correct or failed", report.case_metrics.pending_p0_case_count === 24 && report.case_metrics.partially_adjudicated_p0_case_count === 5 && report.case_metrics.fully_pending_p0_case_count === 19 && report.case_metrics.fully_correct_p0_case_count === 0 && report.case_metrics.partially_correct_p0_case_count === 0 && report.case_metrics.failed_p0_case_count === 0);
check("aggregate correctness uses resolved-only denominators", report.aggregate_metrics.field_presence_precision.denominator === 3 && report.aggregate_metrics.field_presence_recall.denominator === 14 && report.aggregate_metrics.normalized_exact_match.denominator === 3);
const expectedCategoryDenominators = { identity_exact: 2, provider_exact: 4, institution_or_campus_exact: 2, application_start_exact: 1, application_deadline_exact: 1, status_exact: 4, application_url_exact: 0, support_type_exact: 0, support_amount_exact: 0 };
check("category denominators include only resolved gold", Object.entries(expectedCategoryDenominators).every(([name, denominator]) => report.category_metrics[name].denominator === denominator && (denominator > 0 ? report.category_metrics[name].status === "evaluated" : report.category_metrics[name].status === "not_evaluated")));
check("publishability safety subset is scored honestly", report.safety_gates.pending_publishability_case_count === 19 && report.safety_gates.document_kind_exact.numerator === 1 && report.safety_gates.document_kind_exact.denominator === 5 && report.safety_gates.recruitment_suppressed_count === 3 && report.safety_gates.critical_publishability_error_count === 3);
check("unsupported claims are visible", Number.isInteger(report.aggregate_metrics.unsupported_claim_count) && report.aggregate_metrics.unsupported_claim_count >= 0 && report.by_field.application_url.unsupported_claim_count >= 0);
check("application URL provenance is not credited from the notice URL", report.by_field.application_url.evidence_supported_count === 0 && /not counted as extracted application URLs/u.test(markdown));
check("invalid lifecycle semantics are exposed", report.critical_errors.filter((item) => item.error === "document_kind_used_as_lifecycle_status").length === 5);
check("lifecycle risks distinguish verified and pending gold", report.critical_errors.filter((item) => item.error === "document_kind_used_as_lifecycle_status" && item.verified_against_gold).map((item) => item.case_id).join() === "p4c_004_national_work_result" && report.critical_errors.filter((item) => item.error === "document_kind_used_as_lifecycle_status" && !item.verified_against_gold).length === 4);
check("critical errors include ownership and case IDs", report.critical_errors.every((item) => typeof item.case_id === "string" && typeof item.classification === "string") && report.error_taxonomy.deterministic_extractor_defect?.count === report.critical_errors.length);
const case4Publishability = report.reviewer_resolved_field_results.find((item) => item.case_id === "p4c_004_national_work_result" && item.field_name === "publishable_opportunity");
const case5 = Object.fromEntries(report.reviewer_resolved_field_results.filter((item) => item.case_id === "p4c_005_miraero_second").map((item) => [item.field_name, item]));
check("Case 4 result announcement is safely suppressed", case4Publishability?.gold.normalized_value === false && case4Publishability?.prediction.normalized_value === false && case4Publishability?.exact);
check("Case 5 provider and campus remain distinct", case5.provider?.gold.normalized_value === "고려대학교" && case5.institution_or_campus?.gold.normalized_value === "고려대학교 세종캠퍼스");
check("Case 5 dates retain embedded offsets and normalize exactly", case5.application_start?.exact && case5.application_deadline?.exact && /\+09:00$/u.test(case5.application_start.gold.normalized_value) && /\+09:00$/u.test(case5.application_deadline.gold.normalized_value) && !case5.timezone);
check("Case 5 closed lifecycle exposes extractor miss", case5.lifecycle_status?.gold.normalized_value === "closed" && case5.lifecycle_status?.prediction.status === "not_applicable" && !case5.lifecycle_status?.exact);
check("Case 6 remains pending in frozen scope and reviewed in production scope", decisions.cases[5].decision === "pending_independent_review" && decisions.cases[5].fields.every((item) => item.decision === "pending") && overlay.cases[5].fields.every((item) => item.decision === "pending") && productionSourceReview.cases[0].case_id === decisions.cases[5].case_id && productionSourceReview.cases[0].review_status === "reviewed");
const expectedFullBatch = {
  p4c_001_student_affairs_special: ["document_kind:approved", "provider:corrected", "scholarship_program_name:approved"],
  p4c_002_national_second_round: ["document_kind:approved", "provider:approved"],
  p4c_003_hope_ladder_extension: ["document_kind:approved", "provider:approved"],
  p4c_004_national_work_result: ["document_kind:approved", "provider:unresolved"],
  p4c_005_miraero_second: ["document_kind:approved", "provider:corrected", "scholarship_program_name:approved", "application_start:corrected", "application_deadline:approved"],
};
const expectedOverlayBatch = {
  p4c_001_student_affairs_special: ["institution_or_campus:resolved", "lifecycle_status:resolved"],
  p4c_002_national_second_round: ["institution_or_campus:unresolved"],
  p4c_003_hope_ladder_extension: ["institution_or_campus:unresolved", "lifecycle_status:resolved"],
  p4c_004_national_work_result: ["institution_or_campus:unresolved", "lifecycle_status:resolved"],
  p4c_005_miraero_second: ["institution_or_campus:resolved", "lifecycle_status:resolved"],
};
const decisionKeys = (items, pendingValue) => items.filter((item) => item.decision !== pendingValue).map((item) => `${item.field_name}:${item.decision}`);
check("full-field Batch 1 contains only explicitly listed decisions", decisions.cases.every((item) => JSON.stringify(decisionKeys(item.fields, "pending")) === JSON.stringify(expectedFullBatch[item.case_id] ?? [])));
check("P0 overlay Batch 1 contains only explicitly listed decisions", overlay.cases.every((item) => JSON.stringify(decisionKeys(item.fields, "pending")) === JSON.stringify(expectedOverlayBatch[item.case_id] ?? [])));
const reviewedItems = [...decisions.cases.flatMap((item) => item.fields), ...overlay.cases.flatMap((item) => item.fields)].filter((item) => !["pending", "not_reviewed"].includes(item.decision));
check("Batch 1 reviewer metadata identifies one actual adjudication event", reviewedItems.every((item) => item.reviewer_role === "adjudication_lead" && item.reviewed_at === "2026-07-20T00:53:07+09:00"));

const expectedFullMetrics = {
  canonical_schema_valid: [24, 24],
  evidence_integrity: [24, 24],
  document_classification_accuracy: [4, 24],
  field_presence_precision: [64, 70],
  field_presence_recall: [64, 189],
  field_status_exact_accuracy: [187, 336],
  normalized_exact_match: [50, 64],
  evidence_attribution_accuracy: [64, 64],
  unsupported_value_rate: [0, 84],
  review_required_recall: [19, 19],
  review_required_precision: [19, 24],
  program_candidate_usable_rate: [0, 24],
  cycle_candidate_usable_rate: [0, 24],
  phase5_handoff_usable_rate: [0, 24],
};
check("full-schema Gate C metric counts remain unchanged", Object.entries(expectedFullMetrics).every(([name, [numerator, denominator]]) => fullReport.metrics[name].numerator === numerator && fullReport.metrics[name].denominator === denominator));
check("full-schema Gate C remains an official HOLD", fullReport.official_gate === "GATE_C" && fullReport.recommendation.phase5_ready === "HOLD" && fullReport.recommendation.production_ready === "HOLD");
check("frozen extractor source matches the full Gate C hash", fullReport.extractor.source_sha256 === sha256(readText("lib/engine-phase-4/deterministic-extractor.mjs")));
check("P0 audit did not claim prohibited side effects", Object.values(report.safety).every((value) => value === false));
check("Markdown explains subset scope and denominator maturity", /does not replace or invalidate the full-schema Gate C report/u.test(markdown) && /denominator maturity/u.test(markdown) && /cannot be generalized/u.test(markdown) && /NOT_EVALUATED/u.test(markdown));
check("responsibility boundaries are explicit", Object.values(report.responsibility_boundary).every((items) => Array.isArray(items) && items.length > 0));
check("documentation separates Batch 1 frozen and Batch 2 production scopes", /bounded reviewer-resolved subset across Cases 1–5/u.test(contract) && /Cases 6–24/u.test(contract) && /production-source review scope/u.test(contract) && /Batch 2 records Cases 6–24 only in production-source review scope/u.test(markdown));
check("lifecycle responsibility permits only clear deterministic derivation", report.responsibility_boundary.deterministic_fields.some((item) => /lifecycle derivation from unambiguous start\/deadline\/timezone/u.test(item)) && report.responsibility_boundary.human_review_required.some((item) => /date roles or timezone are ambiguous/u.test(item)) && !report.responsibility_boundary.human_review_required.includes("lifecycle status") && /Lifecycle is deterministic only when a confirmed recruitment opportunity/u.test(markdown) && /fail closed as `unknown` or require human review/u.test(contract));
const recommendedSourceCases = [4, 6, 7, 8, 9, 10, 11, 14, 15, 16, 17, 18, 20, 22, 23, 24].map((number) => `p4c_${String(number).padStart(3, "0")}_`);
check("completed validation shortlist preserves its sixteen-source provenance", /sixteen-source shortlist below is retained as the provenance/u.test(validationShortlist) && /no longer an outstanding request list/u.test(validationShortlist) && /Case 5 feedback was the priority/u.test(validationShortlist) && recommendedSourceCases.every((prefix) => validationShortlist.includes(prefix)) && /full re-review of all 24 sources was not necessary/u.test(validationShortlist));
check("Batch 2 key classifications and early stops are exact", report.production_source_review.combined_p0_case_review_count === 24 && JSON.stringify(report.production_source_review.terminal_non_opportunity_case_ids) === JSON.stringify(["p4c_008_cau_welfare_result_2025_1", "p4c_009_cau_welfare_result_2024_2", "p4c_024_dean_recommendation_guidance"]) && productionSourceReview.cases.find((item) => item.case_id === "p4c_018_uic_samsung_updated")?.document_kind === "recruitment_notice" && productionSourceReview.cases.find((item) => item.case_id === "p4c_020_uic_supporters_table")?.opportunity_kind === "paid_student_activity" && productionSourceReview.cases.find((item) => item.case_id === "p4c_024_dean_recommendation_guidance")?.content_kind === "application_support_guidance");
check("date and amount capability diagnostics are exact", report.production_source_review.date_normalization.reviewed_field_count === 38 && report.production_source_review.date_normalization.applicable_field_count === 32 && report.production_source_review.date_normalization.present_count === 30 && report.production_source_review.amount_semantics.reviewed_field_count === 19 && report.production_source_review.amount_semantics.applicable_field_count === 16 && report.production_source_review.amount_semantics.semantically_resolved_count === 15 && report.production_source_review.amount_semantics.canonical_schema_representable_count === 6 && report.production_source_review.amount_semantics.schema_gap_count === 9 && report.production_source_review.amount_semantics.unresolved_count === 1);
check("production review never enters frozen-excerpt denominators", report.production_source_review.production_review_concept_slots === 171 && report.corpus.resolved_p0_field_count === 14 && /never inserted into frozen-excerpt accuracy denominators/u.test(report.evidence_scopes.production_source_review_scope));
const serialized = `${JSON.stringify(report)}\n${JSON.stringify(productionSourceReview)}\n${markdown}\n${contract}\n${validationShortlist}`;
check("reports contain no local paths or apparent secrets", !/(?:\/Users\/|\/home\/|DATABASE_URL|SUPABASE_URL|service_role|gho_|sk-[A-Za-z0-9]{12,})/u.test(serialized));

const passed = checks.filter((item) => item.pass).length;
console.log(`ENGINE PHASE 4 GATE C P0 VALIDATOR: ${passed === checks.length ? "PASS" : "FAIL"}`);
console.log(`checks=${passed}/${checks.length}`);
if (passed !== checks.length) process.exitCode = 1;
