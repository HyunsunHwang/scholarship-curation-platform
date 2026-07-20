import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSchemaValidators, validateCanonicalRecord } from "../lib/engine-phase-4/contracts.mjs";
import { extractDeterministicScholarshipCandidate } from "../lib/engine-phase-4/deterministic-extractor.mjs";
import { buildP0RemediatedFullGateCRecord } from "../lib/engine-phase-4/full-gate-c-remediated-adapter.mjs";
import { validateGateCProvenance } from "../lib/engine-phase-4/gate-c-provenance.mjs";
import { extractP0RemediatedCandidateWithDiagnostics } from "../lib/engine-phase-4/p0-remediated-extractor.mjs";
import { buildSlices, deepEqual, ratio } from "../lib/engine-phase-4/representative-evaluation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readText = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const read = (relativePath) => JSON.parse(readText(relativePath));
const write = (relativePath, value) => fs.writeFileSync(path.join(root, relativePath), value);
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

export const FULL_GATE_C_REMEDIATED_REPORT_VERSION = "engine-phase-4-full-gate-c-p0-remediated-reevaluation/v1";
export const HISTORICAL_GATE_C_TIMESTAMP = "2026-07-19T06:30:00Z";
export const P0_LIFECYCLE_TIMESTAMP = "2026-07-20T00:00:00+09:00";
export const FULL_GATE_C_REMEDIATED_PROTECTED_SHA256 = Object.freeze({
  "lib/engine-phase-4/deterministic-extractor.mjs": "a6f7cc4134f593da2e52d93e86e012c96f5f5a6b1363230f1410148d54bbc024",
  "lib/engine-phase-4/deterministic-normalizers.mjs": "55d795977a4886081bd30757cd20646cd0ea3756e0854fffe4f42ae8f3fbac85",
  "lib/engine-phase-4/evidence-builder.mjs": "783ec29a18f28fa2dd8c111085657ebab18a91ed8c499a55534c8726c4eb1170",
  "lib/engine-phase-4/p0-remediated-extractor.mjs": "94b915f735d4282ac31476b566c419812a84186ff8184bc9d1db67c26efd18ae",
  "lib/engine-phase-4/contracts.mjs": "93baa60ccf0f6f5b0986283276ffdfb157435ed4a89ca64d6582a483da28c91d",
  "lib/engine-phase-4/representative-evaluation.mjs": "3cf7800b12c2eaace383a18bdfde2bdc88af345684c317df5dc24d1bf6b76c73",
  "lib/engine-phase-4/gate-c-provenance.mjs": "77308259057dd67880480edb0faeb18b9a8877d57244f1dd06ee17a1d1df5d6f",
  "scripts/evaluate-engine-phase-4-representative-gold.mjs": "ef642c7f3120685b7094a66aa417ea85edc2edb5e7424fa946b04c2c8bea469c",
  "scripts/validate-engine-phase-4-gate-c.mjs": "40e779940072b768c8ed36bd9e127223242b83f2551c41c5925b6e9998d32346",
  "reports/engine-phase-4-gate-c-representative-evaluation.json": "1ff1e39ead03c1bc1a4cf5f2ad927eb20715f07104dc708db3c7aa796cd0b160",
  "reports/engine-phase-4-gate-c-p0.json": "912dd110ed687433151d4f5dce985d152135f4e699a1f31d09e26666d71fe384",
  "reports/engine-phase-4-gate-c-p0-remediated.json": "fc412b26ebe4df1e0c12b47832ffe40d062b247434a72b2ac985fe96817ee41f",
  "reports/engine-phase-4-gate-c-p0-remediated.md": "7fdbee96329986bb1d01a2284c8378a0c805f9c91500210d2fc1d6e134d89e1f",
  "fixtures/engine-phase-4-representative-gold/cases.json": "f61b5be60b00a949ea0d0ec68a7585fdaffe42cc3f13472fd0538555e0c757fd",
  "fixtures/engine-phase-4-representative-gold/manifest.json": "c2db73ebcbb45127215cce2ba71844d3818166cf04a7be6d9726236387407dff",
  "fixtures/engine-phase-4-representative-gold/relations.json": "edbf4443936ea5f080dfd264cba9ac1bfc4ebeaf88126a12a75825e63cec43ad",
  "fixtures/engine-phase-4-representative-gold/adjudication/adjudication-decisions.json": "1c6be4798a279639bf5e44ca5ab34ab597e61a5272d854fcbaab020b726b62f4",
  "fixtures/engine-phase-4-gate-c-p0/p0-adjudication-overlay.json": "9307d96e5e5bee1b0906cbd166fd4c4910ae34b9038be76cf89a2611fdf319f7",
  "fixtures/engine-phase-4-gate-c-p0/production-source-review.json": "e92c8869f2779e6647cd8d06425a25d7c98466e428fbc0bd8a79cac8bad42738",
});

function verifyProtectedFiles() {
  return Object.fromEntries(Object.entries(FULL_GATE_C_REMEDIATED_PROTECTED_SHA256).map(([relativePath, expected]) => {
    const actual = sha256(readText(relativePath));
    if (actual !== expected) throw new Error(`Protected file changed: ${relativePath} expected=${expected} actual=${actual}`);
    return [relativePath, { sha256: actual, unchanged: true }];
  }));
}

function fieldObservation(fieldName, gold, predicted) {
  const fallback = { value_status: "not_found", normalized_value: null, evidence_refs: [] };
  const value = predicted ?? fallback;
  const goldPresent = gold.value_status === "present";
  const predictedPresent = value.value_status === "present";
  return {
    field: fieldName,
    gold_status: gold.value_status,
    gold_value: gold.normalized_value,
    predicted_status: value.value_status,
    predicted_value: value.normalized_value,
    status_exact: value.value_status === gold.value_status,
    false_present: predictedPresent && !goldPresent,
    false_negative: !predictedPresent && goldPresent,
    normalized_exact: goldPresent && predictedPresent && deepEqual(value.normalized_value, gold.normalized_value),
    predicted_evidence_refs: value.evidence_refs ?? [],
  };
}

function summarizeObservations(observations) {
  const goldPresent = observations.filter((item) => item.gold_status === "present");
  const predictedPresent = observations.filter((item) => item.predicted_status === "present");
  const truePresent = observations.filter((item) => item.gold_status === "present" && item.predicted_status === "present");
  return {
    comparable_field_count: observations.length,
    field_presence_precision: ratio(truePresent.length, predictedPresent.length, "Extractor predicted no present fields."),
    field_presence_recall: ratio(truePresent.length, goldPresent.length, "Gold contains no present fields."),
    field_status_exact_accuracy: ratio(observations.filter((item) => item.status_exact).length, observations.length, "No field annotations."),
    normalized_exact_match: ratio(truePresent.filter((item) => item.normalized_exact).length, truePresent.length, "No jointly present normalized values."),
    evidence_attribution_accuracy: ratio(truePresent.filter((item) => item.predicted_evidence_refs.length > 0).length, truePresent.length, "No true-present predictions."),
    false_present_count: observations.filter((item) => item.false_present).length,
    false_negative_count: observations.filter((item) => item.false_negative).length,
  };
}

function compareMetric(baseline, remediated, direction = "higher", classificationOverride = null) {
  if (classificationOverride) return { baseline, remediated, classification: classificationOverride };
  if (baseline?.status === "not_evaluated" || remediated?.status === "not_evaluated") return { baseline, remediated, classification: "not_comparable" };
  const left = typeof baseline === "number" ? baseline : baseline.value;
  const right = typeof remediated === "number" ? remediated : remediated.value;
  const difference = right - left;
  const classification = difference === 0 ? "unchanged" : (direction === "higher" ? difference > 0 : difference < 0) ? "improved" : "regressed";
  return { baseline, remediated, difference, classification };
}

export function buildFullGateCBaselineDelta(baseline, metrics, counts, usability, taxonomy) {
  const metricDirections = {
    canonical_schema_valid: "higher",
    evidence_integrity: "higher",
    document_classification_accuracy: "higher",
    field_presence_precision: "higher",
    field_presence_recall: "higher",
    field_status_exact_accuracy: "higher",
    normalized_exact_match: "higher",
    evidence_attribution_accuracy: "higher",
    unsupported_value_rate: "lower",
    review_required_recall: "higher",
    review_required_precision: "higher",
    review_overuse_rate: "lower",
    program_candidate_usable_rate: "higher",
    cycle_candidate_usable_rate: "higher",
    phase5_handoff_usable_rate: "higher",
  };
  const semanticChanged = new Set(["field_status_exact_accuracy", "normalized_exact_match"]);
  const metricDelta = Object.fromEntries(Object.entries(metricDirections).map(([name, direction]) => [name, compareMetric(baseline.metrics[name], metrics[name], direction, semanticChanged.has(name) ? "semantic_contract_changed" : null)]));
  const countDirections = { canonical_schema_valid_count: "higher", evidence_integrity_count: "higher", false_present_count: "lower", false_negative_count: "lower", unsupported_present_value_count: "lower" };
  const countDelta = Object.fromEntries(Object.entries(countDirections).map(([name, direction]) => [name, compareMetric(baseline.counts[name], counts[name], direction, ["false_present_count", "false_negative_count"].includes(name) ? "semantic_contract_changed" : null)]));
  const usabilityDelta = Object.fromEntries(Object.keys(usability).map((name) => [name, compareMetric(baseline.usability[name], usability[name]) ]));
  const taxonomyNames = [...new Set([...Object.keys(baseline.error_taxonomy), ...Object.keys(taxonomy)])].sort();
  const errorTaxonomyDelta = Object.fromEntries(taxonomyNames.map((name) => [name, {
    baseline_case_count: baseline.error_taxonomy[name]?.case_count ?? 0,
    remediated_case_count: taxonomy[name]?.case_count ?? 0,
    classification: baseline.error_taxonomy[name] && taxonomy[name] ? "not_comparable" : "not_comparable",
  }]));
  return { metrics: metricDelta, counts: countDelta, usability: usabilityDelta, error_taxonomy: errorTaxonomyDelta };
}

const corpusPath = "fixtures/engine-phase-4-representative-gold/cases.json";
const manifestPath = "fixtures/engine-phase-4-representative-gold/manifest.json";
const relationsPath = "fixtures/engine-phase-4-representative-gold/relations.json";
const baselineReportPath = "reports/engine-phase-4-gate-c-representative-evaluation.json";
const officialP0Path = "reports/engine-phase-4-gate-c-p0-remediated.json";
const corpus = read(corpusPath);
const manifest = read(manifestPath);
const relations = read(relationsPath);
const baselineReport = read(baselineReportPath);
const officialP0 = read(officialP0Path);
const protectedFiles = verifyProtectedFiles();
const officialP0Sha = sha256(readText(officialP0Path));
if (officialP0.decision !== "CONDITIONAL PASS") throw new Error(`Official P0 decision changed: ${officialP0.decision}`);

const validators = createSchemaValidators();
const baselineContext = { extractorVersion: "1.0.0", parserContractVersion: "engine-phase-3-document-result/v1", evaluationFixtureVersion: corpus.fixture_version, extractedAt: HISTORICAL_GATE_C_TIMESTAMP };
const p0Context = { asOf: P0_LIFECYCLE_TIMESTAMP, extractedAt: P0_LIFECYCLE_TIMESTAMP, extractorVersion: "1.1.1", parserContractVersion: "engine-phase-3-document-result/v1", evaluationFixtureVersion: corpus.fixture_version };
const execute = () => corpus.cases.map((fixture) => {
  const baselineRecord = extractDeterministicScholarshipCandidate({ ...fixture.evaluation_input, extractionContext: baselineContext });
  const remediatedExecution = extractP0RemediatedCandidateWithDiagnostics({ ...fixture.evaluation_input, extractionContext: { ...p0Context, caseId: fixture.case_id } });
  const hybrid = buildP0RemediatedFullGateCRecord({ baselineRecord, remediatedOutput: remediatedExecution.output, extractedAt: HISTORICAL_GATE_C_TIMESTAMP });
  return { fixture, baselineRecord, remediatedOutput: remediatedExecution.output, p0Diagnostics: remediatedExecution.diagnostics, ...hybrid };
});
const executions = execute();
const rerun = execute();
const deterministicRerun = deepEqual(executions, rerun);

const rows = executions.map((execution) => {
  const validation = validateCanonicalRecord(execution.record, validators);
  const fieldObservations = Object.entries(execution.fixture.gold_fields).map(([fieldName, gold]) => fieldObservation(fieldName, gold, execution.record.fields[fieldName]));
  const presentFields = Object.values(execution.record.fields).filter((field) => field.value_status === "present");
  const unsupportedPresent = presentFields.filter((field) => !field.evidence_refs?.length || field.inference?.is_inferred === true).length;
  const programUsable = execution.record.program_identity_candidate.resolution_status === "proposed"
    && execution.record.fields.provider.value_status === "present"
    && execution.record.fields.scholarship_program_name.value_status === "present"
    && execution.record.program_identity_candidate.evidence_refs.length > 0 && validation.valid;
  const cycleUsable = programUsable && execution.record.recruitment_cycle_identity_candidate.resolution_status === "proposed"
    && execution.record.recruitment_cycle_identity_candidate.evidence_refs.length > 0 && validation.valid;
  const identityBlocking = execution.record.review.reason_codes.some((code) => /program_identity|cycle_identity|conflict|low_quality|document_/u.test(code));
  return {
    ...execution,
    validation,
    classification_exact: execution.record.classification.document_kind === execution.fixture.document_kind_gold,
    field_observations: fieldObservations,
    present_field_count: presentFields.length,
    unsupported_present_count: unsupportedPresent,
    usability: { program_candidate_usable: programUsable, cycle_candidate_usable: cycleUsable, phase5_handoff_usable: cycleUsable && unsupportedPresent === 0 && !identityBlocking, identity_blocking_review: identityBlocking },
  };
});

const rawObservations = rows.flatMap((row) => row.field_observations);
const rawSummary = summarizeObservations(rawObservations);
const presentValueCount = rows.reduce((sum, row) => sum + row.present_field_count, 0);
const unsupportedCount = rows.reduce((sum, row) => sum + row.unsupported_present_count, 0);
const risky = rows.filter((row) => row.fixture.gold_review_required);
const reviewed = rows.filter((row) => row.record.review.required);
const rawMetrics = {
  canonical_schema_valid: ratio(rows.filter((row) => row.validation.valid).length, rows.length, "No cases."),
  evidence_integrity: ratio(rows.filter((row) => !row.validation.errors.some((error) => error.code === "missing_evidence_ref")).length, rows.length, "No cases."),
  document_classification_accuracy: ratio(rows.filter((row) => row.classification_exact).length, rows.length, "No cases."),
  field_presence_precision: rawSummary.field_presence_precision,
  field_presence_recall: rawSummary.field_presence_recall,
  field_status_exact_accuracy: rawSummary.field_status_exact_accuracy,
  normalized_exact_match: rawSummary.normalized_exact_match,
  normalized_partial_match: { status: "not_evaluated", value: null, sample_count: 0, reason: "No independently adjudicated element-level partial targets." },
  evidence_attribution_accuracy: rawSummary.evidence_attribution_accuracy,
  unsupported_value_rate: ratio(unsupportedCount, presentValueCount, "Extractor produced no present values."),
  review_required_recall: ratio(risky.filter((row) => row.record.review.required).length, risky.length, "No gold review-required cases."),
  review_required_precision: ratio(reviewed.filter((row) => row.fixture.gold_review_required).length, reviewed.length, "Extractor requested no reviews."),
  review_overuse_rate: ratio(reviewed.filter((row) => !row.fixture.gold_review_required).length, rows.filter((row) => !row.fixture.gold_review_required).length, "No gold non-review cases."),
  program_candidate_usable_rate: ratio(rows.filter((row) => row.usability.program_candidate_usable).length, rows.length, "No cases."),
  cycle_candidate_usable_rate: ratio(rows.filter((row) => row.usability.cycle_candidate_usable).length, rows.length, "No cases."),
  phase5_handoff_usable_rate: ratio(rows.filter((row) => row.usability.phase5_handoff_usable).length, rows.length, "No cases."),
};

const legacyComparable = rows.flatMap((row) => row.field_observations.filter((item) => item.field !== "status"));
const lifecycleComparable = officialP0.frozen_reviewer_resolved.reviewer_resolved_field_results
  .filter((item) => item.field_name === "lifecycle_status")
  .map((item) => fieldObservation("lifecycle_status", { value_status: item.gold.status, normalized_value: item.gold.normalized_value }, {
    value_status: item.prediction.status,
    normalized_value: item.prediction.normalized_value,
    evidence_refs: item.prediction.evidence_ids,
  }));
const contractObservations = [...legacyComparable, ...lifecycleComparable];
const contractSummary = summarizeObservations(contractObservations);
const contractAligned = {
  legacy_status_semantic_incompatible: true,
  legacy_status_field_excluded_from_contract_aligned_accuracy: true,
  legacy_status_excluded_count: rows.length,
  comparable_field_count: contractSummary.comparable_field_count,
  lifecycle_reviewer_resolved_count: lifecycleComparable.length,
  field_presence_precision: contractSummary.field_presence_precision,
  field_presence_recall: contractSummary.field_presence_recall,
  field_status_exact_accuracy: contractSummary.field_status_exact_accuracy,
  normalized_exact_match: contractSummary.normalized_exact_match,
  document_kind_accuracy: rawMetrics.document_classification_accuracy,
  p0_safety_metrics: {
    recruitment_suppressed_count: officialP0.frozen_reviewer_resolved.safety_gates.recruitment_suppressed_count,
    non_recruitment_exposed_as_opportunity_count: officialP0.frozen_reviewer_resolved.safety_gates.non_recruitment_exposed_as_opportunity_count,
    critical_publishability_error_count: officialP0.frozen_reviewer_resolved.safety_gates.critical_publishability_error_count,
    invalid_lifecycle_semantic_count: officialP0.execution.invalid_lifecycle_semantic_count,
    unsupported_present_p0_claim_count: officialP0.execution.unsupported_present_claim_count,
    source_url_substitution_count: officialP0.execution.source_url_substitution_count,
  },
};

const taxonomy = {};
function addTaxonomy(name, row, field, owner, kind) {
  const bucket = taxonomy[name] ??= { case_ids: [], affected_fields: [], false_present_count: 0, false_negative_count: 0, recommended_owner: owner };
  if (!bucket.case_ids.includes(row.fixture.case_id)) bucket.case_ids.push(row.fixture.case_id);
  if (!bucket.affected_fields.includes(field)) bucket.affected_fields.push(field);
  if (kind === "false_present") bucket.false_present_count += 1;
  if (kind === "false_negative") bucket.false_negative_count += 1;
}
for (const row of rows) {
  if (!row.validation.valid) addTaxonomy("canonical_validation_failure", row, "record", "EVALUATION_ADAPTER", "validation");
  if (!row.classification_exact) addTaxonomy("classification_rule_limit", row, "document_kind", "PHASE_4_DETERMINISTIC", "false_negative");
  for (const item of row.field_observations) {
    if (!item.false_present && !item.false_negative) continue;
    const name = item.field === "status" ? "legacy_status_semantic_incompatibility"
      : ["provider", "scholarship_program_name"].includes(item.field) ? "provider_program_separation"
        : item.field.includes("deadline") ? "unlabeled_date_role"
          : item.field === "amount" ? "amount_representation_or_extraction_limit"
            : "non_p0_semantic_limit";
    addTaxonomy(name, row, item.field, item.field === "status" ? "CONTRACT_ALIGNMENT" : "PHASE_4C_SELECTIVE_LLM", item.false_present ? "false_present" : "false_negative");
  }
  for (const item of row.diagnostics.conversion_diagnostics) addTaxonomy("canonical_v1_representation_gap", row, item.field_name, "CANONICAL_SCHEMA", "representation");
}
for (const bucket of Object.values(taxonomy)) bucket.case_count = bucket.case_ids.length;

const counts = {
  canonical_schema_valid_count: rows.filter((row) => row.validation.valid).length,
  evidence_integrity_count: rows.filter((row) => !row.validation.errors.some((error) => error.code === "missing_evidence_ref")).length,
  false_present_count: rawSummary.false_present_count,
  false_negative_count: rawSummary.false_negative_count,
  unsupported_present_value_count: unsupportedCount,
  missing_evidence_reference_count: rows.reduce((sum, row) => sum + row.validation.errors.filter((error) => error.code === "missing_evidence_ref").length, 0),
  automatic_publish_count: rows.filter((row) => row.record.review.automatic_publish_allowed).length,
  stale_program_candidate_count: rows.reduce((sum, row) => sum + row.diagnostics.stale_program_candidate_count, 0),
  stale_cycle_candidate_count: rows.reduce((sum, row) => sum + row.diagnostics.stale_cycle_candidate_count, 0),
};
const usability = {
  program_candidate_usable_count: rows.filter((row) => row.usability.program_candidate_usable).length,
  cycle_candidate_usable_count: rows.filter((row) => row.usability.cycle_candidate_usable).length,
  phase5_handoff_usable_count: rows.filter((row) => row.usability.phase5_handoff_usable).length,
};
const baselineDelta = buildFullGateCBaselineDelta(baselineReport, rawMetrics, counts, usability, taxonomy);
const provenanceValidation = validateGateCProvenance({ repoRoot: root, corpusFreezeSha: manifest.corpus_freeze_sha, relationCorrectionSha: manifest.relation_correction_sha });
const mandatorySafety = {
  case_count_24: rows.length === 24,
  canonical_schema_24: counts.canonical_schema_valid_count === 24,
  evidence_integrity_24: counts.evidence_integrity_count === 24 && counts.missing_evidence_reference_count === 0,
  deterministic_rerun: deterministicRerun,
  unsupported_present_zero: counts.unsupported_present_value_count === 0,
  automatic_publish_zero: counts.automatic_publish_count === 0,
  stale_identity_candidates_zero: counts.stale_program_candidate_count === 0 && counts.stale_cycle_candidate_count === 0,
  p0_critical_safety_zero: Object.values(contractAligned.p0_safety_metrics).every((value) => value === 0),
  representation_loss_explicit: officialP0.production_source_shadow.representation_loss_risk_count === officialP0.production_source_shadow.schema_gap_collapsed_to_present_count,
  provenance_pass: provenanceValidation.provenance_validation_status === "PASS",
};
const mandatorySafetyPassed = Object.values(mandatorySafety).every(Boolean);
const decision = !mandatorySafetyPassed ? "HOLD" : usability.phase5_handoff_usable_count === 24 ? "PASS" : "CONDITIONAL PASS";

export const report = {
  report_version: FULL_GATE_C_REMEDIATED_REPORT_VERSION,
  decision,
  official_phase: "ENGINE_PHASE_4",
  official_gate: "FULL_GATE_C_P0_REMEDIATED_REEVALUATION",
  evaluation_record_kind: "p0_remediated_hybrid",
  non_p0_fields_source: "historical_baseline_extractor",
  p0_fields_source: "p0_remediated_extractor_1.1.1",
  production_engine_claimed: false,
  full_field_remediated_extractor_claimed: false,
  timestamps: { historical_full_gate_c_extracted_at: HISTORICAL_GATE_C_TIMESTAMP, p0_lifecycle_as_of: P0_LIFECYCLE_TIMESTAMP, p0_timezone: "Asia/Seoul", wall_clock_used: false },
  identity: {
    baseline_extractor: { path: "lib/engine-phase-4/deterministic-extractor.mjs", sha256: protectedFiles["lib/engine-phase-4/deterministic-extractor.mjs"].sha256, version: "1.0.0" },
    remediated_extractor: { path: "lib/engine-phase-4/p0-remediated-extractor.mjs", sha256: protectedFiles["lib/engine-phase-4/p0-remediated-extractor.mjs"].sha256, version: "1.1.1" },
    official_p0_reevaluation_path: officialP0Path,
    official_p0_reevaluation_sha256: officialP0Sha,
    official_p0_decision: officialP0.decision,
    corpus: { path: corpusPath, sha256: protectedFiles[corpusPath].sha256 },
    manifest: { path: manifestPath, sha256: protectedFiles[manifestPath].sha256 },
    relations: { path: relationsPath, sha256: protectedFiles[relationsPath].sha256 },
    historical_full_gate_c: { path: baselineReportPath, sha256: protectedFiles[baselineReportPath].sha256 },
  },
  provenance_validation: provenanceValidation,
  execution_safety: { case_count: rows.length, ...counts, deterministic_rerun: deterministicRerun },
  historical_raw_lens: {
    legacy_status_compared_verbatim: true,
    legacy_status_semantic_incompatible: true,
    metrics: rawMetrics,
    observations: rawObservations,
  },
  contract_aligned_comparable_lens: contractAligned,
  baseline_delta: baselineDelta,
  error_taxonomy: taxonomy,
  production_shadow_risks: {
    overclaim_count: officialP0.production_source_shadow.overclaim_count,
    safe_fail_closed_count: officialP0.production_source_shadow.safe_fail_closed_count,
    schema_gap_alignment_count: officialP0.production_source_shadow.schema_gap_alignment_count,
    schema_gap_collapsed_to_present_count: officialP0.production_source_shadow.schema_gap_collapsed_to_present_count,
    representation_loss_risk_count: officialP0.production_source_shadow.representation_loss_risk_count,
    note: "overclaim_count and representation_loss_risk_count are distinct risk classes",
  },
  ocr_boundary: structuredClone(officialP0.ocr_boundary),
  usability,
  mandatory_safety: mandatorySafety,
  mandatory_safety_passed: mandatorySafetyPassed,
  slices: buildSlices(rows, relations, corpus.fixture_version),
  case_results: rows.map((row) => ({
    case_id: row.fixture.case_id,
    document_kind_gold: row.fixture.document_kind_gold,
    document_kind_predicted: row.record.classification.document_kind,
    publishable_opportunity: row.record.classification.is_recruitment,
    canonical_schema_valid: row.validation.valid,
    validation_errors: row.validation.errors,
    review_required: row.record.review.required,
    program_candidate_usable: row.usability.program_candidate_usable,
    cycle_candidate_usable: row.usability.cycle_candidate_usable,
    phase5_handoff_usable: row.usability.phase5_handoff_usable,
    conversion_diagnostics: row.diagnostics.conversion_diagnostics,
    p0_extensions: row.p0_extensions,
  })),
  protected_files: protectedFiles,
  safety: {
    historical_full_gate_c_modified: false,
    historical_p0_report_modified: false,
    remediated_extractor_modified: false,
    baseline_extractor_modified: false,
    phase3_parser_modified: false,
    frozen_corpus_modified: false,
    gold_modified: false,
    adjudication_modified: false,
    production_review_modified: false,
    production_db_touched: false,
    migration_modified: false,
    external_llm_called: false,
    automatic_publish_enabled: false,
    candidate_handoff_executed: false,
    pr_created: false,
    main_merged: false,
  },
  gate_status: {
    p0_extractor_remediation: "PASS",
    evidence_preservation: "PASS",
    phase3_status_compatibility: "PASS",
    official_p0_reevaluation: officialP0.decision,
    full_gate_c_remediated_reevaluation: decision,
    candidate_handoff: "NOT RUN",
    phase5: "HOLD",
  },
  records: rows.map((row) => row.record),
};

const showMetric = (value) => value.status === "evaluated" ? `${value.numerator}/${value.denominator} (${(value.value * 100).toFixed(2)}%)` : `NOT EVALUATED — ${value.reason}`;
const rawRows = Object.entries(rawMetrics).filter(([, value]) => value?.status).map(([name, value]) => `| ${name} | ${showMetric(value)} |`).join("\n");
const comparableRows = ["field_presence_precision", "field_presence_recall", "field_status_exact_accuracy", "normalized_exact_match", "document_kind_accuracy"].map((name) => `| ${name} | ${showMetric(contractAligned[name])} |`).join("\n");
const deltaRows = Object.entries(baselineDelta.metrics).map(([name, value]) => `| ${name} | ${value.classification} |`).join("\n");
const caseRows = report.case_results.map((item) => `| ${item.case_id} | ${item.document_kind_gold} | ${item.document_kind_predicted} | ${item.publishable_opportunity} | ${item.canonical_schema_valid} | ${item.review_required} | ${item.phase5_handoff_usable} |`).join("\n");
const markdown = `# Engine Phase 4 — remediated full Gate C reevaluation

## Decision

**${decision}**

This evaluates a \`p0_remediated_hybrid\`: non-P0 fields come from the historical baseline extractor and P0 fields/classification/evidence/review come from remediated extractor 1.1.1. It is neither a production engine nor a complete full-field remediated extractor. Candidate handoff was not executed and Phase 5 remains **HOLD**.

## Identity and execution

- Historical timestamp: \`${HISTORICAL_GATE_C_TIMESTAMP}\`
- P0 lifecycle as-of: \`${P0_LIFECYCLE_TIMESTAMP}\` (Asia/Seoul)
- Canonical schema: ${counts.canonical_schema_valid_count}/24
- Evidence integrity: ${counts.evidence_integrity_count}/24
- Deterministic rerun: ${deterministicRerun}
- Unsupported present: ${counts.unsupported_present_value_count}
- Missing evidence refs: ${counts.missing_evidence_reference_count}
- Automatic publish: ${counts.automatic_publish_count}
- Stale program/cycle candidates: ${counts.stale_program_candidate_count}/${counts.stale_cycle_candidate_count}

## Legacy status semantic boundary

The historical raw lens compares all original 14 fields verbatim, so legacy \`status\` gold containing document kinds is reported as a real mismatch against lifecycle values. Gold is not rewritten. In the contract-aligned lens, all ${contractAligned.legacy_status_excluded_count} legacy status annotations are excluded and ${contractAligned.lifecycle_reviewer_resolved_count} reviewer-resolved lifecycle annotations are added separately.

- \`legacy_status_semantic_incompatible=true\`
- \`legacy_status_field_excluded_from_contract_aligned_accuracy=true\`

## Historical raw metrics

| Metric | Result |
| --- | --- |
${rawRows}

## Contract-aligned comparable metrics

- Comparable fields: ${contractAligned.comparable_field_count}

| Metric | Result |
| --- | --- |
${comparableRows}

P0 safety remains: suppression ${contractAligned.p0_safety_metrics.recruitment_suppressed_count}, non-recruitment exposure ${contractAligned.p0_safety_metrics.non_recruitment_exposed_as_opportunity_count}, invalid lifecycle ${contractAligned.p0_safety_metrics.invalid_lifecycle_semantic_count}, unsupported P0 present ${contractAligned.p0_safety_metrics.unsupported_present_p0_claim_count}, source substitution ${contractAligned.p0_safety_metrics.source_url_substitution_count}.

## Baseline delta

| Metric | Classification |
| --- | --- |
${deltaRows}

Status-exact and normalized-exact changes are classified as \`semantic_contract_changed\`, not accuracy improvements, because lifecycle semantics replaced legacy document-kind status semantics.

## Production shadow and OCR

- Overclaim: ${report.production_shadow_risks.overclaim_count}
- Safe fail-close: ${report.production_shadow_risks.safe_fail_closed_count}
- Schema-gap alignment: ${report.production_shadow_risks.schema_gap_alignment_count}
- Schema gap collapsed to present / representation-loss risk: ${report.production_shadow_risks.schema_gap_collapsed_to_present_count}/${report.production_shadow_risks.representation_loss_risk_count}
- Parser success accepted: ${report.ocr_boundary.parser_success_status_accepted_count}
- Actual OCR accepted: ${report.ocr_boundary.ocr_status_accepted_count}
- OCR missing locator / present / missing-bbox present: ${report.ocr_boundary.ocr_missing_locator_count}/${report.ocr_boundary.ocr_present_claim_count}/${report.ocr_boundary.bbox_missing_ocr_present_claim_count}

Overclaim and representation loss are separate risk classes; zero hallucination-style overclaim does not erase representation-loss findings.

## Identity usability

- Program candidate usable: ${usability.program_candidate_usable_count}/24
- Cycle candidate usable: ${usability.cycle_candidate_usable_count}/24
- Phase 5 handoff usable: ${usability.phase5_handoff_usable_count}/24

All historical identity candidates are withheld rather than copied into a stale proposed state. This conservative boundary is why the result is conditional despite passing schema, evidence, and P0 safety gates.

## Cases

| Case | Gold kind | Predicted kind | Publishable | Schema | Review | Handoff usable |
| --- | --- | --- | --- | --- | --- | --- |
${caseRows}

## Gate boundary

- Official P0 reevaluation: ${officialP0.decision}
- Full Gate C remediated reevaluation: ${decision}
- Candidate handoff: NOT RUN
- Phase 5: HOLD

${decision === "HOLD" ? "A correction commit is required before any handoff test." : "The next bounded step is an actual candidate handoff dry-run; this report does not execute or authorize persistence."}
`;

write("reports/engine-phase-4-gate-c-remediated.json", `${JSON.stringify(report, null, 2)}\n`);
write("reports/engine-phase-4-gate-c-remediated.md", `${markdown.trimEnd()}\n`);
console.log(`decision=${decision}`);
console.log(`cases=${rows.length}`);
console.log(`canonical_schema_valid=${counts.canonical_schema_valid_count}`);
console.log(`evidence_integrity=${counts.evidence_integrity_count}`);
console.log(`program_usable=${usability.program_candidate_usable_count}`);
console.log(`cycle_usable=${usability.cycle_candidate_usable_count}`);
console.log(`handoff_usable=${usability.phase5_handoff_usable_count}`);
console.log(`FULL GATE C REMEDIATED EVALUATOR: ${mandatorySafetyPassed ? "PASS" : "FAIL"}`);
if (!mandatorySafetyPassed) process.exitCode = 1;
