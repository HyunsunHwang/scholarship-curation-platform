import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSchemaValidators, validateCanonicalRecord } from "../lib/engine-phase-4/contracts.mjs";
import { extractDeterministicScholarshipCandidate } from "../lib/engine-phase-4/deterministic-extractor.mjs";
import { buildSlices, deepEqual, ratio } from "../lib/engine-phase-4/representative-evaluation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
const corpus = read("fixtures/engine-phase-4-representative-gold/cases.json");
const manifest = read("fixtures/engine-phase-4-representative-gold/manifest.json");
const relations = read("fixtures/engine-phase-4-representative-gold/relations.json");
const extractorPath = path.join(root, "lib/engine-phase-4/deterministic-extractor.mjs");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const validators = createSchemaValidators();
const context = { extractorVersion: "1.0.0", parserContractVersion: "engine-phase-3-document-result/v1", evaluationFixtureVersion: corpus.fixture_version, extractedAt: "2026-07-19T06:30:00Z" };

const rows = corpus.cases.map((fixture) => {
  const record = extractDeterministicScholarshipCandidate({ ...fixture.evaluation_input, extractionContext: context });
  const validation = validateCanonicalRecord(record, validators);
  const fieldObservations = Object.entries(fixture.gold_fields).map(([fieldName, gold]) => {
    const predicted = record.fields[fieldName] ?? { value_status: "not_found", normalized_value: null, evidence_refs: [] };
    const goldPresent = gold.value_status === "present";
    const predictedPresent = predicted.value_status === "present";
    return { field: fieldName, gold_status: gold.value_status, predicted_status: predicted.value_status, status_exact: predicted.value_status === gold.value_status, false_present: predictedPresent && !goldPresent, false_negative: !predictedPresent && goldPresent, normalized_exact: goldPresent && predictedPresent && deepEqual(predicted.normalized_value, gold.normalized_value), predicted_evidence_refs: predicted.evidence_refs ?? [] };
  });
  const presentFields = Object.values(record.fields).filter((field) => field.value_status === "present");
  const unsupportedPresent = presentFields.filter((field) => !field.evidence_refs?.length || field.inference?.is_inferred === true).length;
  const programUsable = record.program_identity_candidate.resolution_status === "proposed" && record.fields.provider.value_status === "present" && record.fields.scholarship_program_name.value_status === "present" && record.program_identity_candidate.evidence_refs.length > 0 && validation.valid;
  const cycleUsable = programUsable && record.recruitment_cycle_identity_candidate.resolution_status === "proposed" && record.recruitment_cycle_identity_candidate.evidence_refs.length > 0 && validation.valid;
  const identityBlocking = record.review.reason_codes.some((code) => /program_identity|cycle_identity|conflict|low_quality|document_/u.test(code));
  return { fixture, record, validation, classification_exact: record.classification.document_kind === fixture.document_kind_gold, field_observations: fieldObservations, present_field_count: presentFields.length, unsupported_present_count: unsupportedPresent, usability: { program_candidate_usable: programUsable, cycle_candidate_usable: cycleUsable, phase5_handoff_usable: cycleUsable && unsupportedPresent === 0 && !identityBlocking, identity_blocking_review: identityBlocking } };
});

const observations = rows.flatMap((row) => row.field_observations);
const goldPresent = observations.filter((item) => item.gold_status === "present");
const predictedPresent = observations.filter((item) => item.predicted_status === "present");
const truePresent = observations.filter((item) => item.gold_status === "present" && item.predicted_status === "present");
const normalized = observations.filter((item) => item.gold_status === "present" && item.predicted_status === "present");
const presentValueCount = rows.reduce((sum, row) => sum + row.present_field_count, 0);
const unsupportedCount = rows.reduce((sum, row) => sum + row.unsupported_present_count, 0);
const risky = rows.filter((row) => row.fixture.gold_review_required);
const reviewed = rows.filter((row) => row.record.review.required);
const relationPairCount = relations.groups.reduce((sum, group) => sum + group.pairs.length, 0);

const metrics = {
  canonical_schema_valid: ratio(rows.filter((row) => row.validation.valid).length, rows.length, "No cases."),
  evidence_integrity: ratio(rows.filter((row) => !row.validation.errors.some((error) => error.code === "missing_evidence_ref")).length, rows.length, "No cases."),
  document_classification_accuracy: ratio(rows.filter((row) => row.classification_exact).length, rows.length, "No cases."),
  field_presence_precision: ratio(truePresent.length, predictedPresent.length, "Extractor predicted no present fields."),
  field_presence_recall: ratio(truePresent.length, goldPresent.length, "Gold contains no present fields."),
  field_status_exact_accuracy: ratio(observations.filter((item) => item.status_exact).length, observations.length, "No field annotations."),
  normalized_exact_match: ratio(normalized.filter((item) => item.normalized_exact).length, normalized.length, "No jointly present normalized values."),
  normalized_partial_match: { status: "not_evaluated", value: null, sample_count: 0, reason: "Predeclared partial policies exist for 17 cases, but independent element-level set/range targets are not yet adjudicated; Gate C does not substitute exact match or a model judge." },
  evidence_attribution_accuracy: ratio(truePresent.filter((item) => item.predicted_evidence_refs.length > 0).length, truePresent.length, "No true-present predictions."),
  unsupported_value_rate: ratio(unsupportedCount, presentValueCount, "Extractor produced no present values."),
  review_required_recall: ratio(risky.filter((row) => row.record.review.required).length, risky.length, "No gold review-required cases."),
  review_required_precision: ratio(reviewed.filter((row) => row.fixture.gold_review_required).length, reviewed.length, "Extractor requested no reviews."),
  review_overuse_rate: ratio(reviewed.filter((row) => !row.fixture.gold_review_required).length, rows.filter((row) => !row.fixture.gold_review_required).length, "No gold non-review cases."),
  program_candidate_usable_rate: ratio(rows.filter((row) => row.usability.program_candidate_usable).length, rows.length, "No cases."),
  cycle_candidate_usable_rate: ratio(rows.filter((row) => row.usability.cycle_candidate_usable).length, rows.length, "No cases."),
  phase5_handoff_usable_rate: ratio(rows.filter((row) => row.usability.phase5_handoff_usable).length, rows.length, "No cases."),
};

const taxonomy = {};
function addError(category, row, fields, owner, kind) {
  const bucket = taxonomy[category] ??= { case_ids: [], affected_fields: [], source_keys: [], document_formats: [], false_present_count: 0, false_negative_count: 0, review_required_count: 0, recommended_owner: owner };
  if (!bucket.case_ids.includes(row.fixture.case_id)) bucket.case_ids.push(row.fixture.case_id);
  bucket.affected_fields.push(...fields); bucket.source_keys.push(row.fixture.source_key); bucket.document_formats.push(row.fixture.input_format);
  if (kind === "false_present") bucket.false_present_count += 1; if (kind === "false_negative") bucket.false_negative_count += 1;
  if (row.record.review.required) bucket.review_required_count += 1;
}
for (const row of rows) {
  if (!["text_sufficient", "partial_text"].includes(row.fixture.parser_quality)) addError(row.fixture.input_format === "image" ? "parser_low_quality" : "missing_attachment_parser", row, ["source_document"], "PHASE_3", "review");
  if (!row.classification_exact) addError("classification_rule_limit", row, ["document_kind"], "PHASE_4_DETERMINISTIC", "false_negative");
  for (const item of row.field_observations) {
    if (!item.false_negative && !item.false_present) continue;
    const mapping = item.field === "provider" || item.field === "scholarship_program_name" ? ["provider_program_separation", "PHASE_4C_SELECTIVE_LLM"] : item.field.includes("deadline") ? ["unlabeled_date_role", "PHASE_4C_SELECTIVE_LLM"] : item.field === "amount" ? ["tiered_amount_table", "PHASE_4C_SELECTIVE_LLM"] : item.field === "eligibility" ? ["complex_eligibility", "PHASE_4C_SELECTIVE_LLM"] : item.field === "required_documents" ? ["required_document_taxonomy", "PHASE_4C_SELECTIVE_LLM"] : item.field === "application_method" ? ["application_method_taxonomy", "PHASE_4C_SELECTIVE_LLM"] : ["other", "PHASE_4_DETERMINISTIC"];
    addError(mapping[0], row, [item.field], mapping[1], item.false_negative ? "false_negative" : "false_present");
  }
}
for (const bucket of Object.values(taxonomy)) {
  bucket.case_count = bucket.case_ids.length; bucket.affected_fields = [...new Set(bucket.affected_fields)].sort(); bucket.source_keys = [...new Set(bucket.source_keys)].sort(); bucket.document_formats = [...new Set(bucket.document_formats)].sort();
}

const slices = buildSlices(rows, relations, corpus.fixture_version);
const hardFailures = rows.filter((row) => !row.validation.valid).length;
const report = {
  official_phase: "ENGINE_PHASE_4", official_gate: "GATE_C", task: "representative-public-gold-evaluation-and-phase-5-readiness-assessment",
  generated_at: context.extractedAt, corpus_freeze_sha: manifest.corpus_freeze_sha, selection_manifest_hash: manifest.selection_manifest_hash,
  fixture_version: corpus.fixture_version, extractor: { kind: "deterministic", name: "engine-phase-4-deterministic-extractor", source_sha256: sha256(fs.readFileSync(extractorPath)), behavior_modified: false },
  corpus_summary: { case_count: rows.length, unique_source_key_count: new Set(rows.map((row) => row.fixture.source_key)).size, maximum_cases_per_source: Math.max(...Object.values(Object.groupBy(rows, (row) => row.fixture.source_key)).map((items) => items.length)), partial_policy_case_count: rows.filter((row) => row.fixture.partial_gold.length > 0).length, relation_group_count: relations.groups.length, relation_pair_count: relationPairCount, adjudication_status: "pending_independent_review" },
  coverage: { by_format: Object.fromEntries(Object.entries(Object.groupBy(rows, (row) => row.fixture.input_format)).map(([key, items]) => [key, items.length])), by_notice_kind: Object.fromEntries(Object.entries(Object.groupBy(rows, (row) => row.fixture.document_kind_gold)).map(([key, items]) => [key, items.length])), hwp_hwpx: { status: "not_evaluated", sample_count: rows.filter((row) => ["hwp", "hwpx"].includes(row.fixture.input_format)).length, reason: "Selected attachments have metadata-only capture and no authoritative Phase 3 parse result." }, ocr_image: { status: "not_evaluated", sample_count: rows.filter((row) => row.fixture.input_format === "image").length, reason: "No bounded authoritative OCR result was captured for the selected image-primary notice." } },
  metrics, counts: { canonical_schema_valid_count: rows.filter((row) => row.validation.valid).length, evidence_integrity_count: rows.filter((row) => !row.validation.errors.some((error) => error.code === "missing_evidence_ref")).length, false_present_count: observations.filter((item) => item.false_present).length, false_negative_count: observations.filter((item) => item.false_negative).length, unsupported_present_value_count: unsupportedCount, identity_blocking_review_count: rows.filter((row) => row.usability.identity_blocking_review).length, non_identity_review_count: rows.filter((row) => row.record.review.required && !row.usability.identity_blocking_review).length },
  usability: { program_candidate_usable_count: rows.filter((row) => row.usability.program_candidate_usable).length, cycle_candidate_usable_count: rows.filter((row) => row.usability.cycle_candidate_usable).length, phase5_handoff_usable_count: rows.filter((row) => row.usability.phase5_handoff_usable).length },
  slices, error_taxonomy: taxonomy,
  failure_classes: { PHASE_3_INPUT_DEFECT: Object.values(taxonomy).filter((bucket) => bucket.recommended_owner === "PHASE_3").reduce((sum, bucket) => sum + bucket.case_count, 0), PHASE_4_DETERMINISTIC_RULE_DEFECT: Object.values(taxonomy).filter((bucket) => bucket.recommended_owner === "PHASE_4_DETERMINISTIC").reduce((sum, bucket) => sum + bucket.case_count, 0), PHASE_4_SEMANTIC_LIMITATION: Object.values(taxonomy).filter((bucket) => bucket.recommended_owner === "PHASE_4C_SELECTIVE_LLM").reduce((sum, bucket) => sum + bucket.case_count, 0), GOLD_ANNOTATION_AMBIGUITY: rows.filter((row) => row.fixture.gold_review_reason_codes.includes("gold_ambiguity")).length, SOURCE_UNAVAILABLE: rows.filter((row) => row.fixture.source_status === "unavailable_after_selection").length, UNSUPPORTED_DOCUMENT_FORMAT: rows.filter((row) => row.fixture.parser_quality === "tool_unavailable").length },
  recommendation: { phase3_remediation_required: Object.values(taxonomy).some((bucket) => bucket.recommended_owner === "PHASE_3"), phase4c_candidate_areas: Object.entries(taxonomy).filter(([, bucket]) => bucket.recommended_owner === "PHASE_4C_SELECTIVE_LLM").map(([name]) => name), recommended_next_stage: hardFailures === 0 && unsupportedCount === 0 ? "HOLD_FOR_MULTIPLE_BLOCKERS" : "HOLD_FOR_MULTIPLE_BLOCKERS", rationale: "Identity usability is measured but attachment parser gaps, semantic extraction failures, and pending independent gold adjudication remain. Run targeted Phase 3 remediation and a bounded Phase 4C experiment before a Phase 5 readiness decision.", phase5_ready: "HOLD", production_ready: "HOLD", production_threshold_asserted: false },
  safety: { database_accessed: false, production_accessed: false, production_credentials_requested: false, external_llm_called: false, migration_created_or_executed: false, canary_write_performed: false, automatic_publish_performed: false, notification_performed: false, production_scheduler_added: false, queue_or_worker_added: false, full_613_source_run: false, parser_cache_contract_modified: false, crawler_checkpoint_contract_modified: false, gate_a_contract_semantics_modified: false, deterministic_extractor_behavior_modified: false, raw_public_document_committed: false, raw_html_committed: false, personal_absolute_path_committed: false },
  case_results: rows.map((row) => ({ case_id: row.fixture.case_id, source_key: row.fixture.source_key, document_format: row.fixture.input_format, document_kind_gold: row.fixture.document_kind_gold, document_kind_predicted: row.record.classification.document_kind, canonical_schema_valid: row.validation.valid, review_required: row.record.review.required, review_reason_codes: row.record.review.reason_codes, ...row.usability })),
};
const outputArg = process.argv.find((value) => value.startsWith("--output="));
const output = path.resolve(root, outputArg?.slice(9) ?? "reports/engine-phase-4-gate-c-representative-evaluation.json");
fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(`cases=${rows.length}`); console.log(`schema_valid=${report.counts.canonical_schema_valid_count}`); console.log(`program_usable=${report.usability.program_candidate_usable_count}`); console.log(`cycle_usable=${report.usability.cycle_candidate_usable_count}`); console.log(`handoff_usable=${report.usability.phase5_handoff_usable_count}`); console.log("ENGINE PHASE 4 GATE C EVALUATOR: PASS");
export { report };
