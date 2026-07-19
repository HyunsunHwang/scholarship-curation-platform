import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FIXED_EXTRACTION_CONTEXT,
  deterministicBaselineCases,
  fixtureByScenario,
} from "../fixtures/engine-phase-4-deterministic-baseline/cases.mjs";
import {
  extractAmountCandidates,
  extractDateCandidates,
} from "../lib/engine-phase-4/deterministic-normalizers.mjs";
import { extractDeterministicScholarshipCandidate } from "../lib/engine-phase-4/deterministic-extractor.mjs";
import { createSchemaValidators, validateCanonicalRecord } from "../lib/engine-phase-4/contracts.mjs";
import {
  evaluatedRatio,
  evaluateDeterministicBaseline,
} from "./evaluate-engine-phase-4-deterministic-baseline.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const validators = createSchemaValidators();
const tests = [];
const outputs = new Map(deterministicBaselineCases.map((entry) => [
  entry.scenario,
  extractDeterministicScholarshipCandidate({ ...entry.input, extractionContext: FIXED_EXTRACTION_CONTEXT }),
]));
const evaluation = evaluateDeterministicBaseline();

function test(name, run) {
  tests.push({ name, run });
}

function output(scenario) {
  return outputs.get(scenario);
}

function cloneInput(scenario = "normal_html") {
  return structuredClone(fixtureByScenario(scenario).input);
}

function extractVariant(mutator, scenario = "normal_html") {
  const input = cloneInput(scenario);
  mutator(input);
  return extractDeterministicScholarshipCandidate({ ...input, extractionContext: FIXED_EXTRACTION_CONTEXT });
}

for (const fixture of deterministicBaselineCases) {
  test(`canonical schema and expected labels: ${fixture.scenario}`, () => {
    const record = output(fixture.scenario);
    assert.equal(validateCanonicalRecord(record, validators).valid, true);
    assert.equal(record.classification.document_kind, fixture.expected.classification);
    assert.equal(record.review.required, fixture.expected.review_required);
    for (const [fieldName, expectedStatus] of Object.entries(fixture.expected.field_statuses)) {
      assert.equal(record.fields[fieldName].value_status, expectedStatus, fieldName);
    }
  });
}

test("all evidence items satisfy Gate A evidence schema", () => {
  for (const record of outputs.values()) {
    for (const evidence of record.evidence) assert.equal(validators.evidence(evidence), true, JSON.stringify(validators.evidence.errors));
  }
});

test("all evidence references resolve", () => {
  for (const record of outputs.values()) assert.equal(validateCanonicalRecord(record, validators).errors.some((error) => error.code === "missing_evidence_ref"), false);
});

test("evidence identifiers are unique per record", () => {
  for (const record of outputs.values()) assert.equal(new Set(record.evidence.map((item) => item.evidence_id)).size, record.evidence.length);
});

test("present values are evidence-linked and not inferred", () => {
  for (const record of outputs.values()) {
    for (const value of Object.values(record.fields)) {
      if (value.value_status !== "present") continue;
      assert.ok(value.evidence_refs.length > 0);
      assert.equal(value.inference.is_inferred, false);
    }
  }
});

test("identical input and context rerun deep equal", () => {
  for (const fixture of deterministicBaselineCases) {
    const rerun = extractDeterministicScholarshipCandidate({ ...fixture.input, extractionContext: FIXED_EXTRACTION_CONTEXT });
    assert.deepEqual(rerun, output(fixture.scenario));
  }
});

test("evidence IDs remain stable", () => {
  const first = output("normal_html").evidence.map((item) => item.evidence_id);
  const second = extractVariant(() => {}).evidence.map((item) => item.evidence_id);
  assert.deepEqual(second, first);
});

test("program and cycle candidate keys remain stable", () => {
  const first = output("normal_html");
  const second = extractVariant(() => {});
  assert.equal(second.program_identity_candidate.candidate_key, first.program_identity_candidate.candidate_key);
  assert.equal(second.recruitment_cycle_identity_candidate.candidate_key, first.recruitment_cycle_identity_candidate.candidate_key);
});

test("content fingerprint remains stable", () => {
  assert.equal(extractVariant(() => {}).opportunity_revision.content_fingerprint, output("normal_html").opportunity_revision.content_fingerprint);
});

test("fixture execution order does not alter case outputs", () => {
  for (const fixture of [...deterministicBaselineCases].reverse()) {
    assert.deepEqual(
      extractDeterministicScholarshipCandidate({ ...fixture.input, extractionContext: FIXED_EXTRACTION_CONTEXT }),
      output(fixture.scenario),
    );
  }
});

test("recruitment notice classification", () => assert.equal(output("normal_html").classification.document_kind, "recruitment_notice"));
test("result announcement classification", () => assert.equal(output("result_announcement").classification.document_kind, "result_announcement"));
test("information session classification", () => {
  const record = extractVariant((input) => {
    input.sourceNotice.title = "미래인재 장학금 설명회 개최 안내";
    input.sourceNotice.body = "미래인재 장학금 설명회를 개최합니다.";
  });
  assert.equal(record.classification.document_kind, "information_session");
});
test("general guidance classification", () => {
  const record = extractVariant((input) => {
    input.sourceNotice.title = "장학 제도 일반 안내";
    input.sourceNotice.body = "장학 제도 이용 가이드입니다.";
  });
  assert.equal(record.classification.document_kind, "general_guidance");
});
test("correction notice classification", () => {
  const record = extractVariant((input) => { input.sourceNotice.title = "미래인재 장학금 신청 마감 연장 변경 안내"; });
  assert.equal(record.classification.document_kind, "correction_notice");
});
test("ambiguous result and recruitment classification fails closed", () => {
  const record = extractVariant((input) => { input.sourceNotice.title = "장학생 선발 결과 발표 및 추가 모집 공고"; });
  assert.equal(record.classification.document_kind, "unknown");
  assert.equal(record.review.required, true);
});

function dateSegments(text) {
  return [{ text, source_type: "html_text", locator: { section: "body" } }];
}
test("date parser supports YYYY-MM-DD", () => assert.equal(extractDateCandidates(dateSegments("신청 마감: 2026-08-31")).candidates[0].normalized.date, "2026-08-31"));
test("date parser supports YYYY.MM.DD", () => assert.equal(extractDateCandidates(dateSegments("신청 마감: 2026.08.31.")).candidates[0].normalized.date, "2026-08-31"));
test("date parser supports YYYY/MM/DD", () => assert.equal(extractDateCandidates(dateSegments("신청 마감: 2026/08/31")).candidates[0].normalized.date, "2026-08-31"));
test("date parser supports Korean date", () => assert.equal(extractDateCandidates(dateSegments("신청 마감: 2026년 8월 31일")).candidates[0].normalized.date, "2026-08-31"));
test("date parser supports exact datetime", () => assert.equal(extractDateCandidates(dateSegments("신청 마감: 2026.08.31. 17:00")).candidates[0].normalized.datetime, "2026-08-31T17:00:00+09:00"));
test("date range separates start and deadline", () => {
  const values = extractDateCandidates(dateSegments("신청기간: 2026.08.01 ~ 2026.08.31")).candidates;
  assert.deepEqual(values.map((item) => item.role), ["application_start", "application_deadline"]);
});
test("date roles separate application recommendation and result", () => {
  const record = output("multiple_dates");
  for (const role of ["application_deadline", "recommendation_deadline", "result_announcement_date"]) assert.equal(record.fields[role].value_status, "present");
});
test("multiple source dates become conflicting", () => assert.equal(output("conflicting_sources").fields.application_deadline.value_status, "conflicting"));
test("yearless date is not invented", () => {
  const record = extractVariant((input) => { input.sourceNotice.body = input.sourceNotice.body.replace("2026.08.01 ~ 2026.08.31 17:00", "8.1 ~ 8.31"); });
  assert.equal(record.fields.application_deadline.value_status, "ambiguous");
  assert.equal(record.fields.application_deadline.normalized_value, null);
});

function amounts(text) {
  return extractAmountCandidates(dateSegments(`지원금액: ${text}`));
}
test("amount parser supports exact KRW", () => assert.equal(amounts("1,000,000원")[0].normalized.amount, 1_000_000));
test("amount parser supports 만원", () => assert.equal(amounts("100만원")[0].normalized.amount, 1_000_000));
test("amount parser supports range", () => assert.deepEqual([amounts("100만~200만원")[0].normalized.minimum, amounts("100만~200만원")[0].normalized.maximum], [1_000_000, 2_000_000]));
test("amount parser supports monthly period", () => assert.equal(amounts("월 50만원")[0].normalized.period, "month"));
test("amount parser supports full tuition", () => assert.equal(amounts("등록금 전액")[0].normalized.kind, "full_tuition"));
test("amount parser supports partial tuition", () => assert.equal(amounts("등록금 50%")[0].normalized.kind, "partial_tuition"));
test("amount parser supports non-cash benefit", () => assert.equal(amounts("기숙사 및 멘토링 지원")[0].normalized.kind, "non_cash"));
test("multiple benefit types require review", () => {
  assert.equal(output("amount_range_or_tuition").fields.amount.value_status, "ambiguous");
  assert.equal(output("amount_range_or_tuition").review.required, true);
});

test("explicit application URL is canonicalized", () => assert.equal(output("normal_html").fields.application_url.normalized_value, "https://apply.example.invalid/future"));
test("explicit email and phone are extracted", () => assert.deepEqual(output("normal_html").fields.contact.normalized_value, ["scholarship@example.invalid", "02-1234-5678"]));
test("required document allowlist is extracted", () => assert.deepEqual(output("normal_html").fields.required_documents.normalized_value, ["application_form", "transcript"]));
test("application method allowlist is extracted", () => assert.deepEqual(output("normal_html").fields.application_method.normalized_value, ["online"]));
test("simple explicit eligibility is extracted", () => assert.equal(output("normal_html").fields.eligibility.normalized_value.conditions[0].dimension, "enrollment_status"));
test("complex eligibility is review required", () => assert.equal(output("complex_eligibility").fields.eligibility.value_status, "ambiguous"));

test("HTML evidence links source notice", () => assert.ok(output("normal_html").evidence.every((item) => item.source_notice_id === output("normal_html").source_notice_identity.notice_id)));
test("PDF evidence links document revision and hash", () => {
  const evidence = output("pdf_primary").evidence.find((item) => item.source_type === "pdf_text");
  assert.ok(evidence.document_revision_id && /^[a-f0-9]{64}$/u.test(evidence.document_hash));
});
test("table evidence includes coordinates", () => assert.ok(output("table_primary").evidence.some((item) => item.source_type === "pdf_table_cell" && item.locator.table_coordinates)));
test("HWPX evidence is supported", () => assert.ok(output("attachment_only").evidence.some((item) => item.source_type === "hwpx_text")));
test("safe OCR evidence requires page and bounding box", () => {
  const input = cloneInput("low_quality_ocr");
  input.sourceNotice.body = fixtureByScenario("normal_html").input.sourceNotice.body;
  input.sourceNotice.body_quality_status = "text_sufficient";
  Object.assign(input.sourceDocuments[0], { extraction_status: "ocr_succeeded", quality_status: "ocr_succeeded", manual_review_required: false });
  const record = extractDeterministicScholarshipCandidate({ ...input, extractionContext: FIXED_EXTRACTION_CONTEXT });
  const evidence = record.evidence.find((item) => item.source_type === "ocr_text");
  assert.ok(evidence.locator.page_number && evidence.locator.bounding_box);
});
test("attachment-only input requires review", () => assert.equal(output("attachment_only").review.required, true));
test("low-quality OCR input requires review and unknown values", () => {
  assert.equal(output("low_quality_ocr").review.required, true);
  assert.equal(output("low_quality_ocr").fields.amount.value_status, "unknown");
});

test("proposed program candidate has evidence", () => {
  const candidate = output("normal_html").program_identity_candidate;
  assert.equal(candidate.resolution_status, "proposed");
  assert.ok(candidate.evidence_refs.length > 0);
});
test("proposed cycle candidate has evidence", () => {
  const candidate = output("normal_html").recruitment_cycle_identity_candidate;
  assert.equal(candidate.resolution_status, "proposed");
  assert.ok(candidate.evidence_refs.length > 0);
});
test("insufficient program and cycle remain unresolved", () => {
  const record = output("low_quality_ocr");
  assert.equal(record.program_identity_candidate.resolution_status, "unresolved");
  assert.equal(record.recruitment_cycle_identity_candidate.resolution_status, "unresolved");
});
test("cross-source relationship is never auto-resolved", () => assert.ok(output("result_announcement").review.reason_codes.includes("cross_source_relationship_requires_phase_5")));
test("material changes are never invented without before and after", () => {
  for (const record of outputs.values()) assert.deepEqual(record.material_changes, []);
});

test("extractor source has no LLM provider call", () => {
  const source = fs.readFileSync(path.join(root, "lib/engine-phase-4/deterministic-extractor.mjs"), "utf8");
  assert.equal(/openai|anthropic|generateText|chat\.completions/iu.test(source), false);
});
test("extractor source has no database access", () => {
  const source = fs.readFileSync(path.join(root, "lib/engine-phase-4/deterministic-extractor.mjs"), "utf8");
  assert.equal(/supabase|\.from\(|DATABASE_URL|process\.env/iu.test(source), false);
});
test("automatic publish is always false", () => {
  for (const record of outputs.values()) assert.equal(record.review.automatic_publish_allowed, false);
});
test("notification is always false", () => {
  for (const record of outputs.values()) assert.equal(record.review.notification_allowed, false);
});

test("empty denominator does not return one", () => {
  assert.notEqual(evaluatedRatio(0, 0, "No samples."), 1);
  assert.notEqual(evaluatedRatio(0, 0, "No samples.").value, 1);
});
test("empty denominator returns not_evaluated", () => assert.equal(evaluatedRatio(0, 0, "No samples.").status, "not_evaluated"));
test("empty denominator includes a concrete reason", () => assert.ok(evaluatedRatio(0, 0, "No samples.").reason.length > 0));
test("empty denominator sample count is zero", () => assert.equal(evaluatedRatio(0, 0, "No samples.").sample_count, 0));
test("normalized partial match is not an exact scalar copy", () => {
  assert.equal(typeof evaluation.metrics.normalized_exact_match, "object");
  assert.equal(typeof evaluation.metrics.normalized_partial_match, "object");
  assert.notDeepEqual(evaluation.metrics.normalized_partial_match, evaluation.metrics.normalized_exact_match);
});
test("normalized partial match is not evaluated without partial gold", () => assert.equal(evaluation.metrics.normalized_partial_match.status, "not_evaluated"));
test("normalized partial reason matches the Gate A contract boundary", () => assert.equal(
  evaluation.metrics.normalized_partial_match.reason,
  "No predeclared partial-overlap gold annotations exist in Gate B fixtures.",
));
test("tracked report does not claim partial match 100 percent", () => {
  const report = JSON.parse(fs.readFileSync(path.join(root, "reports/engine-phase-4-gate-b-baseline.json"), "utf8"));
  assert.equal(report.evaluation_summary.normalized_partial_match.status, "not_evaluated");
  assert.equal(report.evaluation_summary.normalized_partial_match.value, null);
});
test("all required evaluation slice groups exist", () => assert.deepEqual(
  Object.keys(evaluation.slices).sort(),
  ["by_document_kind", "by_extractor_kind", "by_field", "by_fixture_version", "by_source_type", "by_value_status"].sort(),
));
test("by_field slice exists", () => assert.ok(Object.keys(evaluation.slices.by_field).length > 0));
test("by_source_type slice exists", () => assert.ok(Object.keys(evaluation.slices.by_source_type).length > 0));
test("by_document_kind slice exists", () => assert.ok(Object.keys(evaluation.slices.by_document_kind).length > 0));
test("by_value_status slice exists", () => assert.ok(Object.keys(evaluation.slices.by_value_status).length > 0));
test("by_extractor_kind slice exists", () => assert.ok(evaluation.slices.by_extractor_kind.deterministic));
test("by_fixture_version slice exists", () => assert.ok(evaluation.slices.by_fixture_version[FIXED_EXTRACTION_CONTEXT.evaluationFixtureVersion]));
test("every evaluated top-level slice has a positive sample count", () => {
  for (const group of Object.values(evaluation.slices)) {
    for (const slice of Object.values(group)) {
      if (slice.status === "evaluated") assert.ok(slice.sample_count > 0);
    }
  }
});
test("empty slices never contain a fake 100 percent value", () => {
  for (const group of Object.values(evaluation.slices)) {
    for (const slice of Object.values(group)) {
      if (slice.status !== "not_evaluated") continue;
      assert.equal(slice.sample_count, 0);
      assert.notEqual(slice.value, 1);
    }
  }
});
test("deterministic extractor slice matches fixture count", () => assert.equal(evaluation.slices.by_extractor_kind.deterministic.sample_count, deterministicBaselineCases.length));
test("model extractor slice is not evaluated", () => {
  assert.equal(evaluation.slices.by_extractor_kind.model.status, "not_evaluated");
  assert.equal(evaluation.slices.by_extractor_kind.model.sample_count, 0);
});
test("fixture version slice key is exact", () => assert.deepEqual(Object.keys(evaluation.slices.by_fixture_version), ["engine-phase-4-deterministic-fixtures/v1"]));
test("exact match reports its real sample count", () => {
  assert.equal(evaluation.metrics.normalized_exact_match.status, "evaluated");
  assert.equal(evaluation.metrics.normalized_exact_match.sample_count, 2);
});
test("existing Gate B acceptance remains satisfied after evaluator remediation", () => {
  assert.equal(evaluation.acceptance.schema_valid_record_rate, 1);
  assert.equal(evaluation.acceptance.evidence_reference_integrity, 1);
  assert.equal(evaluation.acceptance.unsupported_value_rate, 0);
  assert.equal(evaluation.acceptance.deterministic_rerun_match, true);
  assert.equal(evaluation.acceptance.risky_review_required_recall, 1);
  assert.equal(evaluation.acceptance.proposed_identity_evidence_missing_count, 0);
  assert.equal(evaluation.acceptance.material_change_invented_count, 0);
});

let passed = 0;
for (const entry of tests) {
  try {
    await entry.run();
    passed += 1;
    console.log(`PASS ${entry.name}`);
  } catch (error) {
    console.error(`FAIL ${entry.name}`);
    console.error(error);
  }
}
console.log(`ENGINE PHASE 4 DETERMINISTIC BASELINE TESTS: ${passed === tests.length ? "PASS" : "FAIL"}`);
console.log(`tests=${passed}/${tests.length}`);
if (passed !== tests.length) process.exitCode = 1;
