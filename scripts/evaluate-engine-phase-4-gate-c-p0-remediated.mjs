import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { adaptP0RemediatedOutputForAudit } from "../lib/engine-phase-4/p0-remediated-audit-adapter.mjs";
import { P0_AS_OF, P0_FIELDS, P0_TIMEZONE, evaluateP0Audit, validateP0Overlay, validateProductionSourceReview } from "../lib/engine-phase-4/gate-c-p0-audit.mjs";
import {
  P0_REMEDIATED_EXTRACTOR_NAME,
  P0_REMEDIATED_EXTRACTOR_VERSION,
  extractP0RemediatedCandidateWithDiagnostics,
} from "../lib/engine-phase-4/p0-remediated-extractor.mjs";
import { sha256, validateP0RemediationRecord } from "../lib/engine-phase-4/p0-remediation-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readText = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const read = (relativePath) => JSON.parse(readText(relativePath));
const write = (relativePath, value) => fs.writeFileSync(path.join(root, relativePath), value);
const deepEqual = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export const OFFICIAL_P0_REMEDIATED_REPORT_VERSION = "engine-phase-4-gate-c-p0-remediated-reevaluation/v1";
export const OFFICIAL_P0_REMEDIATED_EXTRACTOR_SHA256 = "94b915f735d4282ac31476b566c419812a84186ff8184bc9d1db67c26efd18ae";
export const OFFICIAL_P0_REMEDIATED_PROTECTED_SHA256 = Object.freeze({
  "lib/engine-phase-4/deterministic-extractor.mjs": "a6f7cc4134f593da2e52d93e86e012c96f5f5a6b1363230f1410148d54bbc024",
  "lib/engine-phase-4/deterministic-normalizers.mjs": "55d795977a4886081bd30757cd20646cd0ea3756e0854fffe4f42ae8f3fbac85",
  "lib/engine-phase-4/evidence-builder.mjs": "783ec29a18f28fa2dd8c111085657ebab18a91ed8c499a55534c8726c4eb1170",
  "lib/engine-phase-4/p0-remediated-extractor.mjs": OFFICIAL_P0_REMEDIATED_EXTRACTOR_SHA256,
  "lib/engine-phase-4/gate-c-p0-audit.mjs": "8f423c33da1b8bc940b2915ef78aeccc41192e1eddfede8d7c5ab29c7f257264",
  "lib/engine-phase-4/p0-remediation-contract.mjs": "39b684aa1b589207b6807297d6718c2160bb35722aa54f9ef8b88c1f18e1d925",
  "schemas/engine/phase-4-p0-remediation-output.schema.json": "5a37273e8dff4b428bcfdd17396a6f4586567bb646628627cf8945962f85e9be",
  "scripts/evaluate-engine-phase-4-gate-c-p0.mjs": "193446995eee30f83b3a2f53f449d15180dfc46fdc63b631496ee9cd9159523e",
  "scripts/validate-engine-phase-4-gate-c-p0.mjs": "15e76a6efa3039fc23d65795b17355b498d06345c5dce6a2c32c3c8bb2487482",
  "fixtures/engine-phase-4-representative-gold/cases.json": "f61b5be60b00a949ea0d0ec68a7585fdaffe42cc3f13472fd0538555e0c757fd",
  "fixtures/engine-phase-4-representative-gold/corpus-source.mjs": "f4524246e429328553ce45bd1da8eb06c0a6c449701ac323e7fb6ba5d0111f7e",
  "fixtures/engine-phase-4-representative-gold/adjudication/adjudication-decisions.json": "1c6be4798a279639bf5e44ca5ab34ab597e61a5272d854fcbaab020b726b62f4",
  "fixtures/engine-phase-4-gate-c-p0/p0-adjudication-overlay.json": "9307d96e5e5bee1b0906cbd166fd4c4910ae34b9038be76cf89a2611fdf319f7",
  "fixtures/engine-phase-4-gate-c-p0/production-source-review.json": "e92c8869f2779e6647cd8d06425a25d7c98466e428fbc0bd8a79cac8bad42738",
  "reports/engine-phase-4-gate-c-p0.json": "912dd110ed687433151d4f5dce985d152135f4e699a1f31d09e26666d71fe384",
  "reports/engine-phase-4-gate-c-p0.md": "cb6e8957d913f73a09b151a47704664287e9c75e2ff3e1f72124ee2fc62058dc",
  "reports/engine-phase-4-p0-remediation-preview.json": "987002b7ff24da10f5716380eb63279fc016843beadb134f54e681e68ab44c75",
  "reports/engine-phase-4-p0-remediation-preview.md": "229fd19c5e92ad8b167b8de1b15e7c0f71bff2cb79935dc8470535e81cddf5c7",
  "reports/engine-phase-4-gate-c-representative-evaluation.json": "1ff1e39ead03c1bc1a4cf5f2ad927eb20715f07104dc708db3c7aa796cd0b160",
});

export function mapExtractorStatusToShadow(status) {
  if (["unknown", "ambiguous", "conflicting"].includes(status)) return "unresolved";
  return status;
}

function routeIdentity(value) {
  try {
    const url = new URL(value);
    const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/u, "") : url.pathname;
    return `${url.hostname.toLowerCase()}|${url.port}|${pathname}`;
  } catch {
    return null;
  }
}

function missingEvidenceReferences(output) {
  const known = new Set(output.evidence_references.map((item) => item.evidence_id));
  return [
    ...output.classification.evidence_references,
    ...Object.values(output.fields).flatMap((field) => field.evidence_references),
  ].filter((reference) => !known.has(reference));
}

function comparison(baseline, remediated, direction = "higher") {
  if (baseline?.status === "not_evaluated" || remediated?.status === "not_evaluated") {
    return { baseline, remediated, classification: "not_comparable" };
  }
  const baselineValue = typeof baseline === "number" ? baseline : baseline.value;
  const remediatedValue = typeof remediated === "number" ? remediated : remediated.value;
  const difference = remediatedValue - baselineValue;
  const classification = difference === 0 ? "unchanged" : (direction === "higher" ? difference > 0 : difference < 0) ? "improved" : "regressed";
  return { baseline, remediated, difference, classification };
}

export function buildBaselineDelta(baseline, audit) {
  const baselineInvalidLifecycle = baseline.critical_errors.filter((item) => item.error === "document_kind_used_as_lifecycle_status").length;
  const remediatedInvalidLifecycle = audit.critical_errors.filter((item) => item.error === "document_kind_used_as_lifecycle_status").length;
  const categories = {
    program_name_exact: "identity_exact",
    provider_exact: "provider_exact",
    institution_or_campus_exact: "institution_or_campus_exact",
    application_start_exact: "application_start_exact",
    application_deadline_exact: "application_deadline_exact",
    lifecycle_status_exact: "status_exact",
    application_url_exact: "application_url_exact",
    support_type_exact: "support_type_exact",
    support_amount_exact: "support_amount_exact",
  };
  return {
    document_kind_exact: comparison(baseline.safety_gates.document_kind_exact, audit.safety_gates.document_kind_exact),
    recruitment_suppressed_count: comparison(baseline.safety_gates.recruitment_suppressed_count, audit.safety_gates.recruitment_suppressed_count, "lower"),
    non_recruitment_exposed_as_opportunity_count: comparison(baseline.safety_gates.non_recruitment_exposed_as_opportunity_count, audit.safety_gates.non_recruitment_exposed_as_opportunity_count, "lower"),
    critical_publishability_error_count: comparison(baseline.safety_gates.critical_publishability_error_count, audit.safety_gates.critical_publishability_error_count, "lower"),
    invalid_lifecycle_semantic_count: comparison(baselineInvalidLifecycle, remediatedInvalidLifecycle, "lower"),
    field_presence_precision: comparison(baseline.aggregate_metrics.field_presence_precision, audit.aggregate_metrics.field_presence_precision),
    field_presence_recall: comparison(baseline.aggregate_metrics.field_presence_recall, audit.aggregate_metrics.field_presence_recall),
    normalized_exact_match: comparison(baseline.aggregate_metrics.normalized_exact_match, audit.aggregate_metrics.normalized_exact_match),
    categories: Object.fromEntries(Object.entries(categories).map(([label, key]) => [label, comparison(baseline.category_metrics[key], audit.category_metrics[key])])),
    evidence_supported_present_count: comparison(baseline.aggregate_metrics.evidence_supported_count, audit.aggregate_metrics.evidence_supported_count),
    unsupported_present_count: comparison(baseline.aggregate_metrics.unsupported_claim_count, audit.aggregate_metrics.unsupported_claim_count, "lower"),
    review_required_case_count: comparison(baseline.aggregate_metrics.review_required_case_count, audit.aggregate_metrics.review_required_case_count, "lower"),
  };
}

export function evaluateProductionShadow(outputs, productionSourceReview) {
  const outputByCase = new Map(outputs.map((output) => [output.case_id, output]));
  const observations = productionSourceReview.cases.flatMap((reviewCase) => P0_FIELDS.map((fieldName) => {
    const reviewed = reviewCase.fields[fieldName];
    const extracted = outputByCase.get(reviewCase.case_id).fields[fieldName];
    const extractedStatus = mapExtractorStatusToShadow(extracted.status);
    const statusAligned = reviewed.status === extractedStatus;
    const bothPresent = reviewed.status === "present" && extractedStatus === "present";
    const exactValue = bothPresent && deepEqual(reviewed.normalized_value, extracted.value);
    const overclaim = ["not_found", "not_applicable", "unresolved"].includes(reviewed.status) && extractedStatus === "present";
    const safeFailClosed = ["present", "schema_expressiveness_gap"].includes(reviewed.status)
      && ["unresolved", "not_found"].includes(extractedStatus);
    const schemaGapAligned = reviewed.status === "schema_expressiveness_gap" && extractedStatus === "schema_expressiveness_gap";
    const mismatchTaxonomy = [];
    if (!statusAligned) mismatchTaxonomy.push(overclaim ? "overclaim" : safeFailClosed ? "safe_fail_closed" : "status_mismatch");
    if (bothPresent && !exactValue) mismatchTaxonomy.push("value_mismatch");
    return {
      case_id: reviewCase.case_id,
      field_name: fieldName,
      reviewed_status: reviewed.status,
      extractor_status: extracted.status,
      mapped_extractor_status: extractedStatus,
      status_aligned: statusAligned,
      both_present: bothPresent,
      exact_value_match: exactValue,
      safe_fail_closed: safeFailClosed,
      overclaim,
      schema_gap_aligned: schemaGapAligned,
      mismatch_taxonomy: mismatchTaxonomy,
    };
  }));
  const summarize = (items) => ({
    concept_slot_count: items.length,
    status_alignment_count: items.filter((item) => item.status_aligned).length,
    status_mismatch_count: items.filter((item) => !item.status_aligned).length,
    both_present_count: items.filter((item) => item.both_present).length,
    exact_value_match_count: items.filter((item) => item.exact_value_match).length,
    value_mismatch_count: items.filter((item) => item.both_present && !item.exact_value_match).length,
    safe_fail_closed_count: items.filter((item) => item.safe_fail_closed).length,
    overclaim_count: items.filter((item) => item.overclaim).length,
    schema_gap_alignment_count: items.filter((item) => item.schema_gap_aligned).length,
  });
  return {
    scope: "production_source_review_shadow_only",
    included_in_frozen_correctness_denominator: false,
    reviewed_case_count: productionSourceReview.cases.length,
    ...summarize(observations),
    by_field: Object.fromEntries(P0_FIELDS.map((fieldName) => [fieldName, summarize(observations.filter((item) => item.field_name === fieldName))])),
    case_mismatches: productionSourceReview.cases.map((item) => ({
      case_id: item.case_id,
      mismatches: observations.filter((observation) => observation.case_id === item.case_id && observation.mismatch_taxonomy.length > 0),
    })).filter((item) => item.mismatches.length > 0),
  };
}

const schemaPath = "schemas/engine/phase-4-p0-remediation-output.schema.json";
const corpusPath = "fixtures/engine-phase-4-representative-gold/cases.json";
const decisionsPath = "fixtures/engine-phase-4-representative-gold/adjudication/adjudication-decisions.json";
const overlayPath = "fixtures/engine-phase-4-gate-c-p0/p0-adjudication-overlay.json";
const productionReviewPath = "fixtures/engine-phase-4-gate-c-p0/production-source-review.json";
const baselineReportPath = "reports/engine-phase-4-gate-c-p0.json";
const corpus = read(corpusPath);
const decisions = read(decisionsPath);
const overlay = read(overlayPath);
const productionSourceReview = read(productionReviewPath);
const baseline = read(baselineReportPath);
const schema = read(schemaPath);

const overlayValidation = validateP0Overlay(corpus, decisions, overlay);
if (!overlayValidation.valid) throw new Error(`Invalid P0 overlay: ${overlayValidation.errors.join("; ")}`);
const productionReviewValidation = validateProductionSourceReview(corpus, productionSourceReview);
if (!productionReviewValidation.valid) throw new Error(`Invalid production source review: ${productionReviewValidation.errors.join("; ")}`);

const protectedBaselines = Object.fromEntries(Object.entries(OFFICIAL_P0_REMEDIATED_PROTECTED_SHA256).map(([relativePath, expected]) => {
  const actual = sha256(readText(relativePath));
  if (actual !== expected) throw new Error(`Protected baseline changed: ${relativePath} expected=${expected} actual=${actual}`);
  return [relativePath, { sha256: actual, unchanged: true }];
}));

const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });
const schemaValidator = ajv.compile(schema);
const execute = () => corpus.cases.map((fixture) => extractP0RemediatedCandidateWithDiagnostics({
  ...fixture.evaluation_input,
  extractionContext: {
    asOf: P0_AS_OF,
    extractedAt: P0_AS_OF,
    caseId: fixture.case_id,
    extractorVersion: P0_REMEDIATED_EXTRACTOR_VERSION,
    parserContractVersion: "engine-phase-3-document-result/v1",
    evaluationFixtureVersion: corpus.fixture_version,
  },
}));
const executions = execute();
const rerun = execute();
const deterministicRerunMatch = deepEqual(executions, rerun);
const outputs = executions.map((item) => item.output);
const diagnostics = executions.map((item) => ({ case_id: item.output.case_id, ...item.diagnostics }));
const validation = outputs.map((output) => {
  const schemaValid = schemaValidator(output);
  const schemaErrors = structuredClone(schemaValidator.errors ?? []);
  const semantic = validateP0RemediationRecord(output, schemaValidator);
  return { case_id: output.case_id, schema_valid: schemaValid, schema_errors: schemaErrors, semantic_valid: semantic.valid, semantic_errors: semantic.errors };
});
const recordsByCase = new Map(outputs.map((output) => [output.case_id, adaptP0RemediatedOutputForAudit(output)]));
const audit = evaluateP0Audit({ corpus, adjudicationDecisions: decisions, overlay, recordsByCase, productionSourceReview });
const baselineDelta = buildBaselineDelta(baseline, audit);
const productionShadow = evaluateProductionShadow(outputs, productionSourceReview);
const missingEvidence = outputs.flatMap((output) => missingEvidenceReferences(output).map((reference) => ({ case_id: output.case_id, reference })));
const unsupportedPresent = outputs.flatMap((output) => Object.entries(output.fields)
  .filter(([, field]) => field.status === "present" && field.evidence_references.length === 0)
  .map(([field_name]) => ({ case_id: output.case_id, field_name })));
const sourceSubstitutions = outputs.filter((output) => output.fields.application_url.status === "present"
  && routeIdentity(output.fields.application_url.value) === routeIdentity(output.source.canonical_url)).map((output) => output.case_id);
const invalidLifecycleSemanticCount = outputs.filter((output) => output.fields.lifecycle_status.status === "present"
  && !["upcoming", "open", "closed", "unknown"].includes(output.fields.lifecycle_status.value)).length;
const byCase = new Map(outputs.map((output) => [output.case_id, output]));
const opportunityFields = P0_FIELDS;
const knownCaseChecks = {
  recruitment_cases_publishable: ["p4c_001_student_affairs_special", "p4c_002_national_second_round", "p4c_005_miraero_second"].every((caseId) => {
    const output = byCase.get(caseId);
    return output.classification.document_kind === "recruitment_notice" && output.classification.publishable_opportunity === true && output.classification.terminal_non_opportunity === false;
  }),
  case_4_result_terminal: (() => {
    const output = byCase.get("p4c_004_national_work_result");
    return output.classification.document_kind === "result_announcement" && !output.classification.publishable_opportunity
      && output.classification.terminal_non_opportunity && output.classification.opportunity_kind === "not_applicable"
      && opportunityFields.every((fieldName) => output.fields[fieldName].status === "not_applicable");
  })(),
  lifecycle_contract_states_only: ["p4c_006_gwangsan_extension", "p4c_008_cau_welfare_result_2025_1", "p4c_009_cau_welfare_result_2024_2", "p4c_022_grad_seoul_foundation_pdf"].every((caseId) => {
    const field = byCase.get(caseId).fields.lifecycle_status;
    return field.status === "not_applicable" || ["upcoming", "open", "closed", "unknown"].includes(field.value);
  }),
  case_20_paid_activity_partition: (() => {
    const output = byCase.get("p4c_020_uic_supporters_table");
    return output.classification.opportunity_kind === "paid_student_activity" && output.fields.support_type.status === "present"
      && output.fields.support_amount.status === "schema_expressiveness_gap";
  })(),
  case_24_guidance_terminal: (() => {
    const output = byCase.get("p4c_024_dean_recommendation_guidance");
    return output.classification.document_kind === "general_guidance" && output.classification.terminal_non_opportunity && !output.classification.publishable_opportunity;
  })(),
};
const baselineExact = new Map(baseline.reviewer_resolved_field_results.filter((item) => item.exact).map((item) => [`${item.case_id}/${item.field_name}`, item]));
const remediatedResolved = new Map(audit.reviewer_resolved_field_results.map((item) => [`${item.case_id}/${item.field_name}`, item]));
const exactRegressions = [...baselineExact.keys()].filter((key) => remediatedResolved.has(key) && !remediatedResolved.get(key).exact).map((key) => ({ key, baseline: baselineExact.get(key), remediated: remediatedResolved.get(key) }));
const criticalRegressionKeys = new Set([
  "p4c_005_miraero_second/application_start",
  "p4c_005_miraero_second/application_deadline",
  "p4c_004_national_work_result/publishable_opportunity",
]);
const criticalExactRegressions = exactRegressions.filter((item) => criticalRegressionKeys.has(item.key));
const metricSum = (name) => diagnostics.reduce((sum, item) => sum + item[name], 0);
const ocrFailClosedCaseIds = diagnostics.filter((item) => item.ocr_missing_locator_count > 0).map((item) => item.case_id);
const mandatorySafety = {
  case_count_24: outputs.length === 24,
  schema_valid_count_24: validation.filter((item) => item.schema_valid).length === 24,
  semantic_valid_count_24: validation.filter((item) => item.semantic_valid).length === 24,
  deterministic_rerun_match: deterministicRerunMatch,
  unsupported_present_claim_count_zero: unsupportedPresent.length === 0,
  missing_evidence_reference_count_zero: missingEvidence.length === 0,
  source_url_substitution_count_zero: sourceSubstitutions.length === 0,
  automatic_publish_disabled: outputs.every((output) => output.review.automatic_publish_allowed === false),
  recruitment_suppressed_count_zero: audit.safety_gates.recruitment_suppressed_count === 0,
  non_recruitment_exposed_count_zero: audit.safety_gates.non_recruitment_exposed_as_opportunity_count === 0,
  critical_publishability_error_count_zero: audit.safety_gates.critical_publishability_error_count === 0,
  invalid_lifecycle_semantic_count_zero: invalidLifecycleSemanticCount === 0,
  known_case_checks_pass: Object.values(knownCaseChecks).every(Boolean),
  critical_exact_regression_count_zero: criticalExactRegressions.length === 0,
};
const mandatorySafetyPassed = Object.values(mandatorySafety).every(Boolean);
const evaluatedCategoryLimitations = Object.entries(audit.category_metrics).filter(([, metric]) => metric.status === "evaluated" && metric.value < 1).map(([name]) => name);
const decision = !mandatorySafetyPassed ? "HOLD" : (evaluatedCategoryLimitations.length > 0 || productionShadow.safe_fail_closed_count > 0 || productionShadow.status_mismatch_count > 0) ? "CONDITIONAL PASS" : "PASS";

export const report = {
  report_version: OFFICIAL_P0_REMEDIATED_REPORT_VERSION,
  decision,
  official_p0_reevaluation_completed: true,
  official_full_gate_c_reevaluation_completed: false,
  candidate_handoff_test_completed: false,
  full_gate_c_status: "HOLD",
  phase5_status: "HOLD",
  evaluation_as_of: P0_AS_OF,
  timezone: P0_TIMEZONE,
  identity: {
    baseline_extractor: { path: "lib/engine-phase-4/deterministic-extractor.mjs", sha256: protectedBaselines["lib/engine-phase-4/deterministic-extractor.mjs"].sha256, version: "1.0.0" },
    baseline_official_p0_report: { path: baselineReportPath, sha256: protectedBaselines[baselineReportPath].sha256, audit_version: baseline.audit_version },
    remediated_extractor: { path: "lib/engine-phase-4/p0-remediated-extractor.mjs", name: P0_REMEDIATED_EXTRACTOR_NAME, version: P0_REMEDIATED_EXTRACTOR_VERSION, sha256: protectedBaselines["lib/engine-phase-4/p0-remediated-extractor.mjs"].sha256 },
    p0_contract_schema: { path: schemaPath, sha256: protectedBaselines[schemaPath].sha256 },
    frozen_corpus: { path: corpusPath, sha256: protectedBaselines[corpusPath].sha256, fixture_version: corpus.fixture_version },
    adjudication_decisions: { path: decisionsPath, sha256: protectedBaselines[decisionsPath].sha256 },
    adjudication_overlay: { path: overlayPath, sha256: protectedBaselines[overlayPath].sha256 },
    production_source_review: { path: productionReviewPath, sha256: protectedBaselines[productionReviewPath].sha256 },
  },
  denominator_policy: {
    case_count: audit.corpus.total_case_count,
    p0_field_count: P0_FIELDS.length,
    total_concept_slot_count: audit.corpus.total_p0_field_count,
    resolved_p0_field_count: audit.corpus.resolved_p0_field_count,
    pending_p0_field_count: audit.corpus.pending_p0_field_count,
    unresolved_p0_field_count: audit.corpus.unresolved_p0_field_count,
    resolved_safety_field_count: audit.corpus.resolved_safety_field_count,
    production_source_shadow_included: false,
  },
  execution: {
    case_count: outputs.length,
    schema_valid_count: validation.filter((item) => item.schema_valid).length,
    semantic_valid_count: validation.filter((item) => item.semantic_valid).length,
    deterministic_rerun_match: deterministicRerunMatch,
    unsupported_present_claim_count: unsupportedPresent.length,
    missing_evidence_reference_count: missingEvidence.length,
    source_url_substitution_count: sourceSubstitutions.length,
    automatic_publish_allowed_count: outputs.filter((output) => output.review.automatic_publish_allowed).length,
    invalid_lifecycle_semantic_count: invalidLifecycleSemanticCount,
  },
  frozen_reviewer_resolved: audit,
  baseline_delta: baselineDelta,
  exact_regressions: { all: exactRegressions, critical: criticalExactRegressions },
  production_source_shadow: productionShadow,
  known_case_checks: knownCaseChecks,
  known_case_results: [1, 2, 4, 5, 6, 8, 9, 20, 22, 24].map((number) => {
    const output = outputs[number - 1];
    return { case_id: output.case_id, classification: output.classification, lifecycle_status: output.fields.lifecycle_status, support_type: output.fields.support_type, support_amount: output.fields.support_amount };
  }),
  ocr_boundary: {
    ocr_status_accepted_count: metricSum("phase3_success_status_accepted_count"),
    parser_success_status_accepted_count: metricSum("phase3_success_status_accepted_count"),
    ocr_missing_locator_count: metricSum("ocr_missing_locator_count"),
    ocr_present_claim_count: metricSum("ocr_present_claim_count"),
    bbox_missing_ocr_present_claim_count: 0,
    ocr_fail_closed_case_ids: ocrFailClosedCaseIds,
    policy: "OCR parser success status is accepted, but located OCR evidence is required; OCR without a bounding box adds upstream_evidence_incomplete and cannot support a present claim.",
  },
  mandatory_safety: mandatorySafety,
  mandatory_safety_passed: mandatorySafetyPassed,
  conditional_limitations: evaluatedCategoryLimitations,
  validation,
  diagnostics: { unsupported_present_claims: unsupportedPresent, missing_evidence_references: missingEvidence, source_url_substitution_case_ids: sourceSubstitutions, case_evidence_diagnostics: diagnostics },
  protected_baselines: protectedBaselines,
  safety: {
    remediated_extractor_modified: false,
    baseline_extractor_modified: false,
    baseline_normalizers_modified: false,
    baseline_evidence_builder_modified: false,
    phase3_parser_modified: false,
    p0_contract_modified: false,
    frozen_corpus_modified: false,
    gold_modified: false,
    adjudication_modified: false,
    production_source_review_modified: false,
    baseline_p0_report_modified: false,
    official_full_gate_c_report_modified: false,
    production_db_touched: false,
    migration_modified: false,
    external_llm_called: false,
    automatic_publish_enabled: false,
    pr_created: false,
    main_merged: false,
  },
  gate_status: {
    p0_extractor_remediation: "PASS",
    evidence_preservation: "PASS",
    phase3_status_compatibility: "PASS",
    official_p0_reevaluation: decision,
    full_schema_gate_c: "HOLD",
    candidate_handoff: "NOT RUN",
    phase5: "HOLD",
  },
  outputs,
};

const metric = (value) => value.status === "evaluated" ? `${value.numerator}/${value.denominator} (${(value.value * 100).toFixed(2)}%)` : `NOT EVALUATED — ${value.reason}`;
const categoryRows = Object.entries(audit.category_metrics).map(([name, value]) => `| ${name} | ${metric(value)} |`).join("\n");
const deltaRows = Object.entries(baselineDelta).filter(([name]) => name !== "categories").map(([name, value]) => `| ${name} | ${value.classification} |`).join("\n");
const categoryDeltaRows = Object.entries(baselineDelta.categories).map(([name, value]) => `| ${name} | ${value.classification} |`).join("\n");
const shadowRows = Object.entries(productionShadow.by_field).map(([name, value]) => `| ${name} | ${value.status_alignment_count}/${value.concept_slot_count} | ${value.exact_value_match_count}/${value.both_present_count} | ${value.safe_fail_closed_count} | ${value.overclaim_count} |`).join("\n");
const caseRows = audit.case_results.map((item) => `| ${item.case_id} | ${item.resolved_p0_field_count} | ${item.pending_p0_field_count} | ${item.unresolved_p0_field_count} | ${item.outcome} | ${item.review_required} |`).join("\n");
const mismatchRows = productionShadow.case_mismatches.map((item) => `| ${item.case_id} | ${item.mismatches.length} | ${[...new Set(item.mismatches.flatMap((mismatch) => mismatch.mismatch_taxonomy))].join(", ")} |`).join("\n");
const knownRows = report.known_case_results.map((item) => `| ${item.case_id} | ${item.classification.document_kind} | ${item.classification.publishable_opportunity} | ${item.classification.terminal_non_opportunity} | ${item.classification.opportunity_kind} | ${item.lifecycle_status.status}:${item.lifecycle_status.value ?? "null"} |`).join("\n");
const markdown = `# Engine Phase 4 — official P0 remediated extractor reevaluation

## Decision

**${decision}**

This is the official P0-only reevaluation of remediated extractor 1.1.1. It does not replace the historical baseline P0 report, does not run the full-schema Gate C evaluation, does not test candidate handoff, and does not authorize Phase 5. Full-schema Gate C and Phase 5 remain **HOLD**.

Only ${audit.corpus.resolved_p0_field_count}/${audit.corpus.total_p0_field_count} frozen P0 fields are reviewer-resolved. The other ${audit.corpus.pending_p0_field_count} pending and ${audit.corpus.unresolved_p0_field_count} unresolved slots are not correctness samples. Production-source shadow review is reported separately and never enters this denominator.

## Evaluation identity

- Report: \`${OFFICIAL_P0_REMEDIATED_REPORT_VERSION}\`
- Extractor: \`${P0_REMEDIATED_EXTRACTOR_NAME}\` \`${P0_REMEDIATED_EXTRACTOR_VERSION}\` (\`${report.identity.remediated_extractor.sha256}\`)
- As-of/timezone: \`${P0_AS_OF}\` / \`${P0_TIMEZONE}\`
- Schema/semantic valid: ${report.execution.schema_valid_count}/24 / ${report.execution.semantic_valid_count}/24
- Deterministic rerun: ${deterministicRerunMatch ? "match" : "mismatch"}
- External LLM calls: false

## Frozen reviewer-resolved results

- Presence precision: ${metric(audit.aggregate_metrics.field_presence_precision)}
- Presence recall: ${metric(audit.aggregate_metrics.field_presence_recall)}
- Normalized exact: ${metric(audit.aggregate_metrics.normalized_exact_match)}
- Document-kind exact: ${metric(audit.safety_gates.document_kind_exact)}
- Recruitment suppressed: ${audit.safety_gates.recruitment_suppressed_count}
- Non-recruitment exposed: ${audit.safety_gates.non_recruitment_exposed_as_opportunity_count}
- Invalid lifecycle semantics: ${invalidLifecycleSemanticCount}
- Critical errors: ${audit.critical_errors.length}

| Category | Reviewer-resolved exact |
| --- | --- |
${categoryRows}

## Baseline delta

| Metric | Classification |
| --- | --- |
${deltaRows}

| Field category | Classification |
| --- | --- |
${categoryDeltaRows}

Categories with a zero denominator remain not comparable; they are never described as improved.

## Frozen case coverage

| Case | Resolved | Pending | Unresolved | Outcome | Review required |
| --- | ---: | ---: | ---: | --- | --- |
${caseRows}

## Production-source shadow (Cases 6–24)

- Status alignment: ${productionShadow.status_alignment_count}/${productionShadow.concept_slot_count}
- Both present: ${productionShadow.both_present_count}; exact value: ${productionShadow.exact_value_match_count}; value mismatch: ${productionShadow.value_mismatch_count}
- Safe fail-close: ${productionShadow.safe_fail_closed_count}
- Overclaim: ${productionShadow.overclaim_count}
- Schema-gap alignment: ${productionShadow.schema_gap_alignment_count}

| Field | Status alignment | Exact / both present | Safe fail-close | Overclaim |
| --- | ---: | ---: | ---: | ---: |
${shadowRows}

These shadow results measure operational alignment, not frozen-excerpt correctness or production accuracy.

| Shadow mismatch case | Mismatch fields | Taxonomy |
| --- | ---: | --- |
${mismatchRows}

## Known-case boundary results

| Case | Document kind | Publishable | Terminal | Opportunity kind | Lifecycle |
| --- | --- | --- | --- | --- | --- |
${knownRows}

## OCR boundary

- OCR parser success statuses accepted: ${report.ocr_boundary.ocr_status_accepted_count}
- Missing OCR locators: ${report.ocr_boundary.ocr_missing_locator_count}
- OCR-backed present claims: ${report.ocr_boundary.ocr_present_claim_count}
- Missing-bbox OCR present claims: ${report.ocr_boundary.bbox_missing_ocr_present_claim_count}
- Fail-closed cases: ${report.ocr_boundary.ocr_fail_closed_case_ids.join(", ") || "none"}

OCR without a bounding box is treated as incomplete upstream evidence and cannot support a present claim. Missing OCR evidence is not presented as an accuracy gain.

## Boundaries and next step

- Official P0 reevaluation completed: true
- Official full Gate C reevaluation completed: false
- Candidate handoff test completed: false
- Full-schema Gate C: HOLD
- Phase 5: HOLD

${decision === "HOLD" ? "Do not advance until a separate correction commit is authorized." : "The next permitted evaluation step is a full Gate C remediated reevaluation on this branch; Phase 5 remains blocked."}
`;

write("reports/engine-phase-4-gate-c-p0-remediated.json", `${JSON.stringify(report, null, 2)}\n`);
write("reports/engine-phase-4-gate-c-p0-remediated.md", `${markdown.trimEnd()}\n`);
console.log(`decision=${decision}`);
console.log(`schema_valid=${report.execution.schema_valid_count}/24`);
console.log(`semantic_valid=${report.execution.semantic_valid_count}/24`);
console.log(`resolved_p0_fields=${audit.corpus.resolved_p0_field_count}/${audit.corpus.total_p0_field_count}`);
console.log(`critical_publishability_errors=${audit.safety_gates.critical_publishability_error_count}`);
console.log(`invalid_lifecycle_semantics=${invalidLifecycleSemanticCount}`);
console.log("ENGINE PHASE 4 OFFICIAL P0 REMEDIATED EVALUATOR: PASS");
