import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FIXED_EXTRACTION_CONTEXT,
  deterministicBaselineCases,
} from "../fixtures/engine-phase-4-deterministic-baseline/cases.mjs";
import { extractDeterministicScholarshipCandidate } from "../lib/engine-phase-4/deterministic-extractor.mjs";
import { createSchemaValidators, validateCanonicalRecord } from "../lib/engine-phase-4/contracts.mjs";

function ratio(numerator, denominator) {
  return denominator === 0 ? 1 : numerator / denominator;
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
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
  const perField = {};

  for (const { fixture, record } of rows) {
    for (const [fieldName, expectedStatus] of Object.entries(fixture.expected.field_statuses)) {
      const predicted = record.fields[fieldName]?.value_status;
      const expectedPresent = expectedStatus === "present";
      const predictedPresent = predicted === "present";
      if (expectedPresent && predictedPresent) presentTruePositive += 1;
      else if (!expectedPresent && predictedPresent) presentFalsePositive += 1;
      else if (expectedPresent && !predictedPresent) presentFalseNegative += 1;
      const bucket = perField[fieldName] ?? { annotated: 0, status_exact: 0 };
      bucket.annotated += 1;
      if (predicted === expectedStatus) bucket.status_exact += 1;
      perField[fieldName] = bucket;
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

  for (const value of Object.values(perField)) value.status_accuracy = ratio(value.status_exact, value.annotated);
  const risky = rows.filter(({ fixture }) => fixture.expected.review_required);
  const report = {
    evaluation_contract: "engine-phase-4-evaluation-cases/v1",
    fixture_version: FIXED_EXTRACTION_CONTEXT.evaluationFixtureVersion,
    case_count: rows.length,
    metrics: {
      document_classification_accuracy: ratio(rows.filter(({ fixture, record }) => fixture.expected.classification === record.classification.document_kind).length, rows.length),
      field_presence_precision: ratio(presentTruePositive, presentTruePositive + presentFalsePositive),
      field_presence_recall: ratio(presentTruePositive, presentTruePositive + presentFalseNegative),
      normalized_exact_match: ratio(normalizedMatches, normalizedTotal),
      normalized_partial_match: ratio(normalizedMatches, normalizedTotal),
      evidence_attribution_accuracy: ratio(evidenceMatches, evidenceTotal),
      unsupported_value_rate: ratio(unsupportedValueCount, presentValueCount),
      review_required_recall: ratio(risky.filter(({ record }) => record.review.required).length, risky.length),
      identity_candidate_pair_precision: { status: "not_evaluated", reason: "Gate B emits source-local candidates and has no pair resolver." },
      identity_candidate_pair_recall: { status: "not_evaluated", reason: "Gate B emits source-local candidates and has no pair resolver." },
      material_change_classification_accuracy: { status: "not_evaluated", reason: "Gate B receives no before/after revision pair and emits no material changes." },
    },
    acceptance: {
      schema_valid_record_rate: ratio(rows.filter(({ validation }) => validation.valid).length, rows.length),
      evidence_reference_integrity: ratio(rows.filter(({ validation }) => !validation.errors.some((error) => error.code === "missing_evidence_ref")).length, rows.length),
      unsupported_value_rate: ratio(unsupportedValueCount, presentValueCount),
      deterministic_rerun_match: rows.every(({ record, rerun }) => sameValue(record, rerun)),
      automatic_publish_allowed_count: rows.filter(({ record }) => record.review.automatic_publish_allowed).length,
      notification_allowed_count: rows.filter(({ record }) => record.review.notification_allowed).length,
      risky_review_required_recall: ratio(risky.filter(({ record }) => record.review.required).length, risky.length),
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
      normalized_gold_values: normalizedTotal,
      evidence_gold_attributions: evidenceTotal,
    },
    per_field_supported_results: perField,
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
    && Object.values(report.per_field_supported_results).every((value) => value.status_accuracy === 1);
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
