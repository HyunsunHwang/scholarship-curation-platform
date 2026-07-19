import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FIXED_EXTRACTION_CONTEXT,
  deterministicBaselineCases,
} from "../fixtures/engine-phase-4-deterministic-baseline/cases.mjs";
import { extractDeterministicScholarshipCandidate } from "../lib/engine-phase-4/deterministic-extractor.mjs";
import { createSchemaValidators, validateCanonicalRecord } from "../lib/engine-phase-4/contracts.mjs";

const PARTIAL_NOT_EVALUATED_REASON = "No predeclared partial-overlap gold annotations exist in Gate B fixtures.";
const SOURCE_TYPE_SLICES = ["html_text", "pdf_text", "pdf_table_cell", "hwp_text", "hwpx_text", "ocr_text"];
const DOCUMENT_KIND_SLICES = [
  "recruitment_notice", "result_announcement", "information_session",
  "general_guidance", "correction_notice", "unknown",
];
const VALUE_STATUS_SLICES = ["present", "not_found", "unknown", "not_applicable", "ambiguous", "conflicting"];

export function notEvaluatedMetric(reason) {
  if (!String(reason ?? "").trim()) throw new TypeError("A concrete not-evaluated reason is required.");
  return {
    status: "not_evaluated",
    value: null,
    numerator: 0,
    denominator: 0,
    sample_count: 0,
    reason,
  };
}

export function evaluatedRatio(numerator, denominator, reasonWhenEmpty) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || numerator < 0 || denominator < 0 || numerator > denominator) {
    throw new RangeError("Metric numerator and denominator must be finite and satisfy 0 <= numerator <= denominator.");
  }
  if (denominator === 0) return notEvaluatedMetric(reasonWhenEmpty);
  return {
    status: "evaluated",
    value: numerator / denominator,
    numerator,
    denominator,
    sample_count: denominator,
  };
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function createAnnotationAccumulator() {
  return {
    sample_count: 0,
    present_true_positive: 0,
    present_false_positive: 0,
    present_false_negative: 0,
    status_exact_count: 0,
    normalized_exact_match_count: 0,
    normalized_exact_sample_count: 0,
    evidence_attribution_count: 0,
    evidence_attribution_sample_count: 0,
    unsupported_value_count: 0,
    review_required_count: 0,
  };
}

function observeAnnotation(bucket, observation) {
  bucket.sample_count += 1;
  const expectedPresent = observation.expected_status === "present";
  const predictedPresent = observation.predicted_status === "present";
  if (expectedPresent && predictedPresent) bucket.present_true_positive += 1;
  else if (!expectedPresent && predictedPresent) bucket.present_false_positive += 1;
  else if (expectedPresent && !predictedPresent) bucket.present_false_negative += 1;
  if (observation.expected_status === observation.predicted_status) bucket.status_exact_count += 1;
  if (observation.has_normalized_gold) {
    bucket.normalized_exact_sample_count += 1;
    if (observation.normalized_exact) bucket.normalized_exact_match_count += 1;
  }
  if (observation.has_evidence_gold) {
    bucket.evidence_attribution_sample_count += 1;
    if (observation.evidence_attributed) bucket.evidence_attribution_count += 1;
  }
  if (observation.unsupported_value) bucket.unsupported_value_count += 1;
  if (observation.review_required) bucket.review_required_count += 1;
}

function finalizeAnnotationSlice(bucket, emptyReason) {
  if (!bucket || bucket.sample_count === 0) {
    return { status: "not_evaluated", sample_count: 0, reason: emptyReason };
  }
  return {
    status: "evaluated",
    ...bucket,
    status_accuracy: evaluatedRatio(bucket.status_exact_count, bucket.sample_count, emptyReason),
    field_presence_precision: evaluatedRatio(
      bucket.present_true_positive,
      bucket.present_true_positive + bucket.present_false_positive,
      "No predicted-present annotations exist in this slice.",
    ),
    field_presence_recall: evaluatedRatio(
      bucket.present_true_positive,
      bucket.present_true_positive + bucket.present_false_negative,
      "No gold-present annotations exist in this slice.",
    ),
    normalized_exact_match: evaluatedRatio(
      bucket.normalized_exact_match_count,
      bucket.normalized_exact_sample_count,
      "No exact normalized-value gold annotations exist in this slice.",
    ),
    evidence_attribution_accuracy: evaluatedRatio(
      bucket.evidence_attribution_count,
      bucket.evidence_attribution_sample_count,
      "No evidence-attribution gold annotations exist in this slice.",
    ),
  };
}

function finalizeCaseSlice(bucket, emptyReason) {
  if (!bucket || bucket.sample_count === 0) return { status: "not_evaluated", sample_count: 0, reason: emptyReason };
  return {
    status: "evaluated",
    sample_count: bucket.sample_count,
    classification_exact_count: bucket.classification_exact_count,
    classification_accuracy: evaluatedRatio(bucket.classification_exact_count, bucket.sample_count, emptyReason),
    review_required_count: bucket.review_required_count,
  };
}

function incrementCaseSlice(map, key, classificationExact, reviewRequired) {
  const bucket = map[key] ?? { sample_count: 0, classification_exact_count: 0, review_required_count: 0 };
  bucket.sample_count += 1;
  if (classificationExact) bucket.classification_exact_count += 1;
  if (reviewRequired) bucket.review_required_count += 1;
  map[key] = bucket;
}

export function evaluateDeterministicBaseline() {
  const validators = createSchemaValidators();
  const rows = deterministicBaselineCases.map((fixture) => {
    const record = extractDeterministicScholarshipCandidate({ ...fixture.input, extractionContext: FIXED_EXTRACTION_CONTEXT });
    const rerun = extractDeterministicScholarshipCandidate({ ...fixture.input, extractionContext: FIXED_EXTRACTION_CONTEXT });
    return { fixture, record, rerun, validation: validateCanonicalRecord(record, validators) };
  });

  let presentTruePositive = 0;
  let presentFalsePositive = 0;
  let presentFalseNegative = 0;
  let normalizedMatches = 0;
  let normalizedTotal = 0;
  let evidenceMatches = 0;
  let evidenceTotal = 0;
  let presentValueCount = 0;
  let unsupportedValueCount = 0;
  const fieldAccumulators = {};
  const sourceTypeAccumulators = Object.fromEntries(SOURCE_TYPE_SLICES.map((key) => [key, createAnnotationAccumulator()]));
  const valueStatusAccumulators = Object.fromEntries(VALUE_STATUS_SLICES.map((key) => [key, createAnnotationAccumulator()]));
  const documentKindAccumulators = {};
  const fixtureVersionAccumulators = {};

  for (const { fixture, record } of rows) {
    const classificationExact = fixture.expected.classification === record.classification.document_kind;
    incrementCaseSlice(documentKindAccumulators, fixture.expected.classification, classificationExact, record.review.required);
    incrementCaseSlice(fixtureVersionAccumulators, FIXED_EXTRACTION_CONTEXT.evaluationFixtureVersion, classificationExact, record.review.required);

    for (const [fieldName, expectedStatus] of Object.entries(fixture.expected.field_statuses)) {
      const predictedField = record.fields[fieldName];
      const predictedStatus = predictedField?.value_status;
      const expectedPresent = expectedStatus === "present";
      const predictedPresent = predictedStatus === "present";
      if (expectedPresent && predictedPresent) presentTruePositive += 1;
      else if (!expectedPresent && predictedPresent) presentFalsePositive += 1;
      else if (expectedPresent && !predictedPresent) presentFalseNegative += 1;

      const expectedValueExists = Object.hasOwn(fixture.expected.normalized_values, fieldName);
      const expectedValue = fixture.expected.normalized_values[fieldName];
      const expectedTypes = fixture.expected.evidence_source_types[fieldName] ?? [];
      const refs = new Set(predictedField?.evidence_refs ?? []);
      const actualTypes = new Set(record.evidence.filter((item) => refs.has(item.evidence_id)).map((item) => item.source_type));
      const evidenceAttributed = expectedTypes.length > 0 && expectedTypes.every((type) => actualTypes.has(type));
      const unsupportedValue = predictedPresent && (predictedField.evidence_refs.length === 0 || predictedField.inference?.is_inferred === true);
      const observation = {
        expected_status: expectedStatus,
        predicted_status: predictedStatus,
        has_normalized_gold: expectedValueExists,
        normalized_exact: expectedValueExists && sameValue(predictedField?.normalized_value, expectedValue),
        has_evidence_gold: expectedTypes.length > 0,
        evidence_attributed: evidenceAttributed,
        unsupported_value: unsupportedValue,
        review_required: record.review.required,
      };
      const fieldBucket = fieldAccumulators[fieldName] ?? createAnnotationAccumulator();
      observeAnnotation(fieldBucket, observation);
      fieldAccumulators[fieldName] = fieldBucket;
      observeAnnotation(valueStatusAccumulators[expectedStatus], observation);
      for (const sourceType of expectedTypes) {
        if (!sourceTypeAccumulators[sourceType]) sourceTypeAccumulators[sourceType] = createAnnotationAccumulator();
        observeAnnotation(sourceTypeAccumulators[sourceType], observation);
      }
    }
    for (const [fieldName, expectedValue] of Object.entries(fixture.expected.normalized_values)) {
      normalizedTotal += 1;
      if (sameValue(record.fields[fieldName]?.normalized_value, expectedValue)) normalizedMatches += 1;
    }
    for (const [fieldName, expectedTypes] of Object.entries(fixture.expected.evidence_source_types)) {
      evidenceTotal += 1;
      const refs = new Set(record.fields[fieldName]?.evidence_refs ?? []);
      const types = new Set(record.evidence.filter((item) => refs.has(item.evidence_id)).map((item) => item.source_type));
      if (expectedTypes.every((type) => types.has(type))) evidenceMatches += 1;
    }
    for (const candidate of Object.values(record.fields)) {
      if (candidate.value_status !== "present") continue;
      presentValueCount += 1;
      if (candidate.evidence_refs.length === 0 || candidate.inference?.is_inferred === true) unsupportedValueCount += 1;
    }
  }

  const byField = Object.fromEntries(Object.entries(fieldAccumulators).map(([key, bucket]) => [
    key, finalizeAnnotationSlice(bucket, `No field annotations exist for ${key}.`),
  ]));
  const bySourceType = Object.fromEntries(Object.entries(sourceTypeAccumulators).map(([key, bucket]) => [
    key, finalizeAnnotationSlice(bucket, `No evidence-attribution gold annotations exist for source type ${key}.`),
  ]));
  const byValueStatus = Object.fromEntries(Object.entries(valueStatusAccumulators).map(([key, bucket]) => [
    key, finalizeAnnotationSlice(bucket, `No field-status gold annotations exist for value status ${key}.`),
  ]));
  const byDocumentKind = Object.fromEntries(DOCUMENT_KIND_SLICES.map((key) => [
    key, finalizeCaseSlice(documentKindAccumulators[key], `No Gate B fixture is annotated as document kind ${key}.`),
  ]));
  const byFixtureVersion = {
    [FIXED_EXTRACTION_CONTEXT.evaluationFixtureVersion]: finalizeCaseSlice(
      fixtureVersionAccumulators[FIXED_EXTRACTION_CONTEXT.evaluationFixtureVersion],
      `No cases exist for fixture version ${FIXED_EXTRACTION_CONTEXT.evaluationFixtureVersion}.`,
    ),
  };
  const byExtractorKind = {
    deterministic: {
      status: "evaluated",
      sample_count: rows.length,
      schema_valid_count: rows.filter(({ validation }) => validation.valid).length,
      review_required_count: rows.filter(({ record }) => record.review.required).length,
    },
    model: {
      status: "not_evaluated",
      sample_count: 0,
      reason: "External model extraction is out of scope for Gate B.",
    },
  };

  const risky = rows.filter(({ fixture }) => fixture.expected.review_required);
  const schemaValidMetric = evaluatedRatio(
    rows.filter(({ validation }) => validation.valid).length,
    rows.length,
    "No canonical records were evaluated.",
  );
  const evidenceIntegrityMetric = evaluatedRatio(
    rows.filter(({ validation }) => !validation.errors.some((error) => error.code === "missing_evidence_ref")).length,
    rows.length,
    "No canonical records were evaluated for evidence integrity.",
  );
  const unsupportedValueMetric = evaluatedRatio(
    unsupportedValueCount,
    presentValueCount,
    "No present values were available for unsupported-value evaluation.",
  );
  const riskyReviewMetric = evaluatedRatio(
    risky.filter(({ record }) => record.review.required).length,
    risky.length,
    "No risky review-required fixtures were annotated.",
  );
  const report = {
    evaluation_contract: "engine-phase-4-evaluation-cases/v1",
    fixture_version: FIXED_EXTRACTION_CONTEXT.evaluationFixtureVersion,
    case_count: rows.length,
    metrics: {
      document_classification_accuracy: evaluatedRatio(
        rows.filter(({ fixture, record }) => fixture.expected.classification === record.classification.document_kind).length,
        rows.length,
        "No document-classification gold annotations exist.",
      ),
      field_presence_precision: evaluatedRatio(
        presentTruePositive,
        presentTruePositive + presentFalsePositive,
        "No predicted-present field annotations exist.",
      ),
      field_presence_recall: evaluatedRatio(
        presentTruePositive,
        presentTruePositive + presentFalseNegative,
        "No gold-present field annotations exist.",
      ),
      normalized_exact_match: evaluatedRatio(
        normalizedMatches,
        normalizedTotal,
        "No exact normalized-value gold annotations exist.",
      ),
      normalized_partial_match: notEvaluatedMetric(PARTIAL_NOT_EVALUATED_REASON),
      evidence_attribution_accuracy: evaluatedRatio(
        evidenceMatches,
        evidenceTotal,
        "No evidence-attribution gold annotations exist.",
      ),
      unsupported_value_rate: unsupportedValueMetric,
      review_required_recall: riskyReviewMetric,
      identity_candidate_pair_precision: notEvaluatedMetric("Gate B emits source-local candidates and has no pair resolver."),
      identity_candidate_pair_recall: notEvaluatedMetric("Gate B emits source-local candidates and has no pair resolver."),
      material_change_classification_accuracy: notEvaluatedMetric("Gate B receives no before/after revision pair and emits no material changes."),
    },
    acceptance: {
      schema_valid_record_rate: schemaValidMetric.value,
      evidence_reference_integrity: evidenceIntegrityMetric.value,
      unsupported_value_rate: unsupportedValueMetric.value,
      deterministic_rerun_match: rows.every(({ record, rerun }) => sameValue(record, rerun)),
      automatic_publish_allowed_count: rows.filter(({ record }) => record.review.automatic_publish_allowed).length,
      notification_allowed_count: rows.filter(({ record }) => record.review.notification_allowed).length,
      risky_review_required_recall: riskyReviewMetric.value,
      proposed_identity_evidence_missing_count: rows.filter(({ record }) =>
        [record.program_identity_candidate, record.recruitment_cycle_identity_candidate]
          .some((candidate) => candidate.resolution_status === "proposed" && candidate.evidence_refs.length === 0)).length,
      material_change_invented_count: rows.reduce((sum, { record }) => sum + record.material_changes.length, 0),
    },
    counts: {
      canonical_records: rows.length,
      schema_valid_records: rows.filter(({ validation }) => validation.valid).length,
      risky_cases: risky.length,
      present_values: presentValueCount,
      unsupported_values: unsupportedValueCount,
      normalized_exact_gold_values: normalizedTotal,
      normalized_partial_gold_values: 0,
      evidence_gold_attributions: evidenceTotal,
    },
    slices: {
      by_field: byField,
      by_source_type: bySourceType,
      by_document_kind: byDocumentKind,
      by_value_status: byValueStatus,
      by_extractor_kind: byExtractorKind,
      by_fixture_version: byFixtureVersion,
    },
  };
  report.pass = report.acceptance.schema_valid_record_rate === 1
    && report.acceptance.evidence_reference_integrity === 1
    && report.acceptance.unsupported_value_rate === 0
    && report.acceptance.deterministic_rerun_match
    && report.acceptance.automatic_publish_allowed_count === 0
    && report.acceptance.notification_allowed_count === 0
    && report.acceptance.risky_review_required_recall === 1
    && report.acceptance.proposed_identity_evidence_missing_count === 0
    && report.acceptance.material_change_invented_count === 0
    && Object.values(report.slices.by_field).every((value) => value.status_accuracy?.value === 1);
  return report;
}

const modulePath = fileURLToPath(import.meta.url);
if (path.resolve(process.argv[1] ?? "") === modulePath) {
  const report = evaluateDeterministicBaseline();
  const outputArgument = process.argv.find((value) => value.startsWith("--output="));
  if (outputArgument) {
    const root = path.resolve(path.dirname(modulePath), "..");
    const outputPath = path.resolve(root, outputArgument.slice("--output=".length));
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  console.log(JSON.stringify(report, null, 2));
  console.log(`ENGINE PHASE 4 DETERMINISTIC BASELINE EVALUATION: ${report.pass ? "PASS" : "FAIL"}`);
  if (!report.pass) process.exitCode = 1;
}
