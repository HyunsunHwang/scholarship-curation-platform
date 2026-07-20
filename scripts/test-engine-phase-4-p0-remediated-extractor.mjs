import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import {
  extractP0RemediatedCandidate,
  extractP0RemediatedCandidateWithDiagnostics,
} from "../lib/engine-phase-4/p0-remediated-extractor.mjs";
import { validateP0RemediationRecord } from "../lib/engine-phase-4/p0-remediation-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schema = JSON.parse(fs.readFileSync(path.join(root, "schemas/engine/phase-4-p0-remediation-output.schema.json"), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });
const schemaValidator = ajv.compile(schema);
const tests = [];
const test = (name, run) => tests.push({ name, run });
let sequence = 0;

function extractDiagnostic({ title = "미래 장학금 신청 안내", body = "", canonicalUrl, sourceDocuments = [], sourceNotice = {} } = {}) {
  sequence += 1;
  const result = extractP0RemediatedCandidateWithDiagnostics({
    sourceNotice: {
      notice_id: `focused_${sequence}`,
      title,
      canonical_url: canonicalUrl ?? `https://example.org/notices/${sequence}`,
      body,
      ...sourceNotice,
    },
    sourceDocuments,
    extractionContext: { caseId: `focused_${sequence}`, asOf: "2026-07-20T00:00:00+09:00" },
  });
  const validation = validateP0RemediationRecord(result.output, schemaValidator);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  return result;
}

function extract(input = {}) {
  return extractDiagnostic(input).output;
}

test("recruitment is not silently suppressed", () => {
  const output = extract({ body: "신청기간: 2026.07.01 ~ 2026.07.31 신청방법: 온라인 접수" });
  assert.equal(output.classification.document_kind, "recruitment_notice");
  assert.equal(output.classification.publishable_opportunity, true);
});

test("unsafe recruitment suppression carries explicit review", () => {
  const output = extract({ title: "국가장학금 및 사전장학 신청 안내", body: "신청기간: 2026.07.01 ~ 2026.07.31 신청방법: 온라인 접수" });
  assert.equal(output.classification.document_kind, "recruitment_notice");
  assert.equal(output.classification.publishable_opportunity, false);
  assert.equal(output.review.reasons.includes("publishability_requires_confirmation"), true);
});

test("result announcement is terminal and not publishable", () => {
  const output = extract({ title: "미래 장학생 선발 결과", body: "과거 신청기간: 2026.07.01 ~ 2026.07.10 최종 선정자 안내" });
  assert.equal(output.classification.document_kind, "result_announcement");
  assert.equal(output.classification.terminal_non_opportunity, true);
  assert.equal(output.classification.publishable_opportunity, false);
});

test("general guidance is terminal", () => {
  const output = extract({ title: "장학 제도 안내", body: "장학 제도 FAQ와 이용 방법" });
  assert.equal(output.classification.document_kind, "general_guidance");
  assert.equal(output.classification.opportunity_kind, "not_applicable");
});

test("correction remains relation-dependent", () => {
  const output = extract({ title: "미래 장학금 마감 연장", body: "신청 마감: 2026.07.31" });
  assert.equal(output.classification.document_kind, "correction_notice");
  assert.equal(output.classification.relation_resolution_required, true);
  assert.equal(output.classification.publishable_opportunity, false);
});

test("unknown document always requires classification review", () => {
  const output = extract({ title: "장학 관련 알림", body: "세부 사항은 첨부를 확인하세요." });
  assert.equal(output.classification.document_kind, "unknown_document");
  assert.equal(output.review.reasons.includes("classification_uncertain"), true);
});

test("recommendation period is not an application window", () => {
  const output = extract({ body: "학교 추천기간: 2026.07.01 ~ 2026.07.31" });
  assert.equal(output.fields.application_start.status, "not_found");
  assert.equal(output.fields.application_deadline.status, "not_found");
});

test("result date is not an application deadline", () => {
  const output = extract({ body: "결과 발표일: 2026.07.31 신청방법: 온라인 접수" });
  assert.equal(output.fields.application_deadline.status, "not_found");
});

test("explicit application range is used and lifecycle is injected-clock based", () => {
  const output = extract({ body: "신청기간: 2026.07.01 ~ 2026.07.31 신청방법: 온라인 접수" });
  assert.equal(output.fields.application_start.value, "2026-07-01");
  assert.equal(output.fields.application_deadline.value, "2026-07-31");
  assert.equal(output.fields.lifecycle_status.value, "open");
});

test("reversed application dates fail closed", () => {
  const output = extract({ body: "신청기간: 2026.08.31 ~ 2026.08.01 신청방법: 온라인 접수" });
  assert.equal(output.fields.application_start.status, "conflicting");
  assert.equal(output.fields.application_deadline.status, "conflicting");
  assert.equal(output.fields.lifecycle_status.value, "unknown");
});

test("same-day reversed times fail closed", () => {
  const output = extract({ body: "신청기간: 2026.07.31 18:00 ~ 2026.07.31 09:00 신청방법: 온라인 접수" });
  assert.equal(output.fields.application_start.status, "conflicting");
  assert.equal(output.fields.application_deadline.status, "conflicting");
});

test("yearless dates are not assigned the injected year", () => {
  const output = extract({ body: "신청기간: 7.1 ~ 7.31 신청방법: 온라인 접수" });
  assert.equal(output.fields.application_start.status, "ambiguous");
  assert.equal(output.fields.application_deadline.status, "ambiguous");
});

test("source route is not copied as an application URL", () => {
  const output = extract({ canonicalUrl: "https://example.org/notices/route", body: "온라인 신청: https://example.org/notices/route" });
  assert.equal(output.fields.application_url.status, "not_found");
});

test("HTTP source-route variant is blocked", () => {
  const output = extract({ canonicalUrl: "https://example.org/notices/route", body: "온라인 신청: http://example.org/notices/route" });
  assert.equal(output.fields.application_url.status, "not_found");
});

test("source query and fragment variant is blocked", () => {
  const output = extract({ canonicalUrl: "https://example.org/notices/route", body: "온라인 신청: https://example.org/notices/route/?apply=1#form" });
  assert.equal(output.fields.application_url.status, "not_found");
});

test("separate explicit application route is accepted", () => {
  const output = extract({ canonicalUrl: "https://example.org/notices/route", body: "온라인 신청: https://apply.example.org/forms/2026" });
  assert.equal(output.fields.application_url.value, "https://apply.example.org/forms/2026");
});

test("reference URL is not treated as an application route", () => {
  const output = extract({ body: "참고 링크: https://reference.example.org/policy 신청방법은 방문 제출" });
  assert.equal(output.fields.application_url.status, "not_found");
});

test("provider is not copied into posting organization or campus", () => {
  const output = extract({ title: "푸른장학재단 장학금 신청 안내", body: "신청기간: 2026.07.01 ~ 2026.07.31" });
  assert.equal(output.fields.provider.status, "present");
  assert.equal(output.fields.posting_organization.status, "not_found");
  assert.equal(output.fields.institution_or_campus.status, "not_found");
});

test("campus is not copied into provider", () => {
  const output = extract({ title: "미래 장학금 신청 안내", body: "서울캠퍼스 지원대상 신청기간: 2026.07.01 ~ 2026.07.31" });
  assert.equal(output.fields.institution_or_campus.value, "서울캠퍼스");
  assert.equal(output.fields.provider.status, "not_found");
  assert.equal(output.review.reasons.includes("provider_posting_organization_ambiguous"), true);
});

const amountCase = (amountText) => extract({ body: `신청기간: 2026.07.01 ~ 2026.07.31 지원금액: ${amountText}` }).fields.support_amount;

test("exact and maximum-cap amounts remain distinct", () => {
  assert.equal(amountCase("100만원").value.kind, "exact");
  assert.equal(amountCase("100만원 이내").value.kind, "maximum_cap");
});

test("amount range is preserved", () => {
  const amount = amountCase("50만~100만원");
  assert.equal(amount.value.kind, "range");
  assert.equal(amount.value.minimum_amount, 500000);
  assert.equal(amount.value.maximum_amount, 1000000);
});

test("tuition percentage is preserved", () => {
  const amount = amountCase("등록금의 50%");
  assert.equal(amount.value.kind, "percentage_of_tuition");
  assert.equal(amount.value.percentage, 50);
});

test("full tuition does not invent a scalar", () => {
  const amount = amountCase("등록금 전액");
  assert.equal(amount.value.kind, "full_tuition");
  assert.equal(Object.hasOwn(amount.value, "exact_amount"), false);
});

test("monthly semester and hourly periods are preserved", () => {
  assert.equal(amountCase("월 30만원").value.kind, "recurring_monthly");
  assert.equal(amountCase("학기당 100만원").value.kind, "recurring_semester");
  assert.equal(amountCase("시간당 12,000원").value.kind, "hourly_rate");
});

test("multi-component amount is not reduced to a representative scalar", () => {
  const amount = amountCase("등록금 100만원 및 생활비 50만원");
  assert.equal(amount.status, "schema_expressiveness_gap");
  assert.equal(amount.value.kind, "composite_components");
  assert.equal(amount.value.components.length, 2);
  assert.equal(Object.hasOwn(amount.value, "exact_amount"), false);
});

test("all present fields carry known evidence references", () => {
  const output = extract({ body: "신청기간: 2026.07.01 ~ 2026.07.31 온라인 신청: https://apply.example.org/form 지원금액: 100만원" });
  const known = new Set(output.evidence_references.map((evidence) => evidence.evidence_id));
  for (const field of Object.values(output.fields)) {
    if (field.status === "present") {
      assert.ok(field.evidence_references.length > 0);
      assert.equal(field.evidence_references.every((reference) => known.has(reference)), true);
    }
  }
});

test("semantic validator rejects a nonexistent evidence ID", () => {
  const output = extract({ body: "신청기간: 2026.07.01 ~ 2026.07.31 지원금액: 100만원" });
  output.fields.support_amount.evidence_references = ["p0ev_missing_reference"];
  const validation = validateP0RemediationRecord(output, schemaValidator);
  assert.equal(validation.errors.some((error) => error.code === "missing_evidence_reference"), true);
});

test("failed parser document does not create present values", () => {
  const output = extract({
    body: "신청 방법은 공고 본문을 확인하세요.",
    sourceDocuments: [{
      document_id: "failed_document",
      extraction_status: "parser_failed",
      detected_format: "hwp",
      extracted_text: "신청기간: 2026.07.01 ~ 2026.07.31 지원금액: 500만원",
    }],
  });
  assert.notEqual(output.fields.support_amount.status, "present");
  assert.equal(output.review.reasons.includes("upstream_evidence_incomplete"), true);
});

test("low-quality HTML body cannot create present dates amounts or URLs", () => {
  const { output, diagnostics } = extractDiagnostic({
    title: "장학 관련 알림",
    body: "신청기간: 2026.07.01 ~ 2026.07.31 지원금액: 500만원 온라인 신청: https://apply.example.org/form",
    sourceNotice: { body_quality_status: "partial" },
  });
  assert.equal(output.classification.document_kind, "unknown_document");
  assert.notEqual(output.fields.application_start.status, "present");
  assert.notEqual(output.fields.support_amount.status, "present");
  assert.notEqual(output.fields.application_url.status, "present");
  assert.equal(output.review.reasons.includes("upstream_evidence_incomplete"), true);
  assert.equal(diagnostics.low_quality_body_rejected_count, 1);
});

test("missing body status remains backward-compatible", () => {
  const output = extract({ body: "신청기간: 2026.07.01 ~ 2026.07.31 지원금액: 100만원" });
  assert.equal(output.fields.application_start.status, "present");
  assert.equal(output.fields.support_amount.status, "present");
});

test("attachment without hash cannot create a present amount", () => {
  const { output, diagnostics } = extractDiagnostic({
    sourceDocuments: [{
      document_id: "missing_hash",
      media_type: "pdf",
      extraction_status: "text_sufficient",
      quality_status: "text_sufficient",
      content_blocks: [{ type: "pdf_page", page_number: 1, text: "지원금액: 500만원" }],
    }],
  });
  assert.notEqual(output.fields.support_amount.status, "present");
  assert.equal(diagnostics.attachment_missing_provenance_count, 1);
});

test("PDF without document ID cannot create present dates", () => {
  const { output, diagnostics } = extractDiagnostic({
    sourceDocuments: [{
      document_hash: "a".repeat(64),
      media_type: "pdf",
      extraction_status: "text_sufficient",
      quality_status: "text_sufficient",
      content_blocks: [{ type: "pdf_page", page_number: 1, text: "신청기간: 2026.07.01 ~ 2026.07.31" }],
    }],
  });
  assert.notEqual(output.fields.application_start.status, "present");
  assert.equal(diagnostics.attachment_missing_provenance_count, 1);
});

test("valid attachment provenance permits present evidence", () => {
  const { output, diagnostics } = extractDiagnostic({
    sourceDocuments: [{
      document_id: "valid_pdf",
      document_hash: "b".repeat(64),
      media_type: "pdf",
      extraction_status: "text_sufficient",
      quality_status: "text_sufficient",
      content_blocks: [{ type: "pdf_page", page_number: 1, text: "신청기간: 2026.07.01 ~ 2026.07.31 지원금액: 500만원" }],
    }],
  });
  assert.equal(output.fields.application_start.status, "present");
  assert.equal(output.fields.support_amount.status, "present");
  assert.ok(diagnostics.attachment_present_claim_count > 0);
  const evidence = output.evidence_references.find((item) => item.evidence_id === output.fields.support_amount.evidence_references[0]);
  assert.equal(evidence.document_id, "valid_pdf");
  assert.equal(evidence.document_hash, "b".repeat(64));
  assert.ok(evidence.document_revision_id);
});

test("derived revision and evidence IDs are deterministic", () => {
  const input = {
    sourceNotice: { notice_id: "stable_attachment", title: "미래 장학금 신청 안내", canonical_url: "https://example.org/stable", body: "" },
    sourceDocuments: [{
      document_id: "stable_pdf",
      document_hash: "c".repeat(64),
      media_type: "pdf",
      extraction_status: "text_sufficient",
      quality_status: "text_sufficient",
      content_blocks: [{ type: "pdf_page", page_number: 1, text: "신청기간: 2026.07.01 ~ 2026.07.31" }],
    }],
    extractionContext: { caseId: "stable_attachment", asOf: "2026-07-20T00:00:00+09:00" },
  };
  const first = extractP0RemediatedCandidate(input);
  const second = extractP0RemediatedCandidate(input);
  assert.deepEqual(first, second);
  assert.equal(first.evidence_references.find((item) => item.document_id === "stable_pdf").document_revision_id,
    second.evidence_references.find((item) => item.document_id === "stable_pdf").document_revision_id);
});

test("identical evidence entries are deterministically deduplicated", () => {
  const document = {
    document_id: "duplicate_pdf",
    document_hash: "9".repeat(64),
    media_type: "pdf",
    extraction_status: "text_sufficient",
    quality_status: "text_sufficient",
    content_blocks: [{ type: "pdf_page", page_number: 1, text: "신청기간: 2026.07.01 ~ 2026.07.31" }],
  };
  const { output, diagnostics } = extractDiagnostic({ sourceDocuments: [document, structuredClone(document)] });
  const ids = output.evidence_references.map((item) => item.evidence_id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(diagnostics.duplicate_evidence_suppressed_count > 0);
});

test("unlocated OCR cannot create present evidence", () => {
  const { output, diagnostics } = extractDiagnostic({
    sourceDocuments: [{
      document_id: "unlocated_ocr",
      document_hash: "d".repeat(64),
      media_type: "image",
      extraction_status: "text_sufficient",
      quality_status: "text_sufficient",
      content_blocks: [{ type: "ocr_text", page_number: 1, text: "지원금액: 500만원" }],
    }],
  });
  assert.notEqual(output.fields.support_amount.status, "present");
  assert.equal(diagnostics.ocr_missing_locator_count, 1);
});

test("low-quality OCR cannot create present evidence", () => {
  const { output, diagnostics } = extractDiagnostic({
    sourceDocuments: [{
      document_id: "low_quality_ocr",
      document_hash: "e".repeat(64),
      media_type: "image",
      extraction_status: "ocr_low_quality",
      quality_status: "ocr_low_quality",
      content_blocks: [{ type: "ocr_text", page_number: 1, bounding_box: [0, 0, 100, 20], text: "지원금액: 500만원" }],
    }],
  });
  assert.notEqual(output.fields.support_amount.status, "present");
  assert.equal(diagnostics.ocr_low_quality_rejected_count, 1);
});

test("located safe OCR preserves page and bounding box", () => {
  const { output, diagnostics } = extractDiagnostic({
    sourceDocuments: [{
      document_id: "located_ocr",
      document_hash: "f".repeat(64),
      media_type: "image",
      extraction_status: "text_sufficient",
      quality_status: "text_sufficient",
      content_blocks: [{ type: "ocr_text", page_number: 2, bounding_box: { x: 1, y: 2, width: 100, height: 20 }, text: "지원금액: 500만원" }],
    }],
  });
  assert.equal(output.fields.support_amount.status, "present");
  assert.ok(diagnostics.ocr_present_claim_count > 0);
  const evidence = output.evidence_references.find((item) => item.source_type === "ocr_text");
  assert.match(evidence.locator, /page:2:bbox:/u);
  assert.match(evidence.locator, /height/u);
});

test("body-driven recruitment classification includes the actual body signal", () => {
  const { output } = extractDiagnostic({
    title: "2026학년도 교내장학금 안내",
    body: "신청기간: 2026.07.01 ~ 2026.07.31\n신청방법: 온라인 접수",
  });
  const locators = output.classification.evidence_references.map((reference) => output.evidence_references.find((item) => item.evidence_id === reference).locator);
  assert.equal(output.classification.document_kind, "recruitment_notice");
  assert.equal(locators.some((locator) => locator.startsWith("notice:body")), true);
});

test("result-title classification retains title evidence", () => {
  const output = extract({ title: "미래 장학생 선발 결과", body: "최종 선정자를 안내합니다." });
  const locators = output.classification.evidence_references.map((reference) => output.evidence_references.find((item) => item.evidence_id === reference).locator);
  assert.equal(locators.some((locator) => locator.startsWith("notice:title")), true);
});

test("body-driven correction classification includes correction body evidence", () => {
  const output = extract({ title: "미래 장학금 안내", body: "기존 신청 마감 연장 안내입니다." });
  const locators = output.classification.evidence_references.map((reference) => output.evidence_references.find((item) => item.evidence_id === reference).locator);
  assert.equal(output.classification.document_kind, "correction_notice");
  assert.equal(locators.some((locator) => locator.startsWith("notice:body")), true);
});

test("attachment-driven recruitment references attachment evidence", () => {
  const output = extract({
    title: "2026 지원 안내",
    sourceDocuments: [{
      document_id: "classification_pdf",
      document_hash: "1".repeat(64),
      media_type: "pdf",
      extraction_status: "text_sufficient",
      quality_status: "text_sufficient",
      content_blocks: [{ type: "pdf_page", page_number: 1, text: "신청기간: 2026.07.01 ~ 2026.07.31 신청방법: 온라인 접수" }],
    }],
  });
  assert.equal(output.classification.document_kind, "recruitment_notice");
  assert.equal(output.classification.evidence_references.some((reference) => output.evidence_references.find((item) => item.evidence_id === reference).document_id === "classification_pdf"), true);
});

test("all classification evidence IDs resolve", () => {
  const output = extract({ body: "신청기간: 2026.07.01 ~ 2026.07.31 신청방법: 온라인 접수" });
  const known = new Set(output.evidence_references.map((item) => item.evidence_id));
  assert.equal(output.classification.evidence_references.every((reference) => known.has(reference)), true);
});

test("attachment complex amount overrides a body summary scalar", () => {
  const output = extract({
    body: "신청기간: 2026.07.01 ~ 2026.07.31 지원금액: 100만원",
    sourceDocuments: [{
      document_id: "complex_pdf",
      document_hash: "2".repeat(64),
      media_type: "pdf",
      extraction_status: "text_sufficient",
      quality_status: "text_sufficient",
      content_blocks: [{ type: "pdf_page", page_number: 1, text: "등록금 100만원 및 생활비 50만원" }],
    }],
  });
  assert.equal(output.fields.support_amount.status, "schema_expressiveness_gap");
  assert.equal(output.fields.support_amount.value.kind, "composite_components");
});

test("duplicate dates across body and attachment resolve once by priority", () => {
  const output = extract({
    body: "신청기간: 2026.07.01 ~ 2026.07.31",
    sourceDocuments: [{
      document_id: "same_date_pdf",
      document_hash: "3".repeat(64),
      media_type: "pdf",
      extraction_status: "text_sufficient",
      quality_status: "text_sufficient",
      content_blocks: [{ type: "pdf_page", page_number: 1, text: "신청기간: 2026.07.01 ~ 2026.07.31" }],
    }],
  });
  assert.equal(output.fields.application_deadline.status, "present");
  assert.equal(output.fields.application_deadline.evidence_references.length, 1);
  const evidence = output.evidence_references.find((item) => item.evidence_id === output.fields.application_deadline.evidence_references[0]);
  assert.equal(evidence.source_type, "html_text");
});

test("different safe deadlines conflict", () => {
  const output = extract({
    body: "신청기간: 2026.07.01 ~ 2026.07.31",
    sourceDocuments: [{
      document_id: "different_date_pdf",
      document_hash: "4".repeat(64),
      media_type: "pdf",
      extraction_status: "text_sufficient",
      quality_status: "text_sufficient",
      content_blocks: [{ type: "pdf_page", page_number: 1, text: "신청기간: 2026.07.01 ~ 2026.08.15" }],
    }],
  });
  assert.equal(output.fields.application_deadline.status, "conflicting");
  assert.equal(output.fields.lifecycle_status.value, "unknown");
});

test("Case 20 support types are present while only amount remains a schema gap", () => {
  const output = extract({
    title: "UIC Supporters Scholarship Application Announcement",
    body: "Benefits: supporters scholarship KRW 200,000 per month; work scholarship KRW 10,320 per hour. Application Jan 15–28, 2026 23:59 KST.",
  });
  assert.equal(output.classification.opportunity_kind, "paid_student_activity");
  assert.equal(output.fields.support_type.status, "present");
  assert.deepEqual(output.fields.support_type.value, ["activity_scholarship", "work_scholarship"]);
  assert.equal(output.fields.support_amount.status, "schema_expressiveness_gap");
  assert.equal(output.review.reasons.includes("support_type_uncertain"), false);
});

test("identical inputs are deterministic", () => {
  const input = {
    sourceNotice: { notice_id: "deterministic", title: "미래 장학금 신청 안내", canonical_url: "https://example.org/notices/deterministic", body: "신청기간: 2026.07.01 ~ 2026.07.31" },
    extractionContext: { caseId: "deterministic", asOf: "2026-07-20T00:00:00+09:00" },
  };
  assert.deepEqual(extractP0RemediatedCandidate(input), extractP0RemediatedCandidate(input));
});

let passed = 0;
for (const item of tests) {
  try {
    item.run();
    passed += 1;
    console.log(`PASS ${item.name}`);
  } catch (error) {
    console.error(`FAIL ${item.name}`);
    throw error;
  }
}
console.log(`${passed}/${tests.length} focused P0 remediated extractor tests passed`);
