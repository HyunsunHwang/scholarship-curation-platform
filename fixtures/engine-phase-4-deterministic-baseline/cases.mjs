import { sha256 } from "../../lib/post-phase-l/normalized-graph.mjs";

export const FIXTURE_VERSION = "engine-phase-4-deterministic-fixtures/v1";
export const FIXED_EXTRACTION_CONTEXT = Object.freeze({
  extractorVersion: "1.0.0",
  parserContractVersion: "engine-phase-3-document-result/v1",
  evaluationFixtureVersion: FIXTURE_VERSION,
  extractedAt: "2026-07-19T00:00:00Z",
});

function baseBody({ includeAmount = true, includeEligibility = true, includeDocuments = true } = {}) {
  return [
    "제공기관: 미래장학재단",
    "장학사업명: 미래인재 장학금",
    "모집회차: 2026년 2학기",
    "신청기간: 2026.08.01 ~ 2026.08.31 17:00",
    includeAmount ? "지원금액: 학기당 200만원" : null,
    "신청방법: 온라인 신청",
    "신청링크: https://apply.example.invalid/future",
    "문의: scholarship@example.invalid / 02-1234-5678",
    includeDocuments ? "제출서류: 지원서, 성적증명서" : null,
    includeEligibility ? "지원자격: 재학생" : null,
  ].filter(Boolean).join("\n");
}

function makeNotice(caseId, overrides = {}) {
  const sourceId = `synthetic_${caseId}`;
  return {
    source_id: sourceId,
    source_key_snapshot: sourceId,
    notice_id: `notice_${caseId}`,
    identity_kind: "external_article_id",
    identity_key: `external:articleNo:${caseId}`,
    canonical_url: `https://example.invalid/notices/${caseId}`,
    revision_id: `notice_revision_${caseId}_1`,
    revision_ordinal: 1,
    parser_version: "normalized-source-notice/v1",
    title: "2026년 2학기 미래인재 장학금 모집 공고",
    body: baseBody(),
    published_at: "2026-07-01T00:00:00+09:00",
    body_quality_status: "text_sufficient",
    ...overrides,
  };
}

function makeDocument(caseId, format, blocks, overrides = {}) {
  const documentId = `document_${caseId}_${format}`;
  const documentHash = sha256(`fixture|${caseId}|${format}|${JSON.stringify(blocks)}`);
  const text = blocks.map((block) => block.text ?? (block.rows ?? []).flat().join("\n")).join("\n");
  return {
    contract_version: "engine-phase-3-document-result/v1",
    document_id: documentId,
    document_revision_id: `document_revision_${caseId}_${format}_1`,
    source_key: `synthetic_${caseId}`,
    source_id: `synthetic_${caseId}`,
    notice_identity_reference: `https://example.invalid/notices/${caseId}`,
    original_url: `https://example.invalid/files/${caseId}.${format}`,
    canonical_url: `https://example.invalid/files/${caseId}.${format}`,
    filename: `${caseId}.${format}`,
    detected_format: format,
    detected_mime_type: format === "pdf" ? "application/pdf" : "application/octet-stream",
    byte_sha256: documentHash,
    extraction_status: "text_sufficient",
    extraction_method: "synthetic_contract_fixture",
    parser_name: `synthetic-${format}-parser`,
    parser_version: "1.0.0",
    ocr_used: false,
    normalized_text: text,
    content_blocks: blocks,
    quality_status: "text_sufficient",
    quality_reasons: [],
    manual_review_required: false,
    manual_review_reasons: [],
    provenance: { synthetic: true },
    ...overrides,
  };
}

function expected(classification, fieldStatuses, reviewRequired, normalizedValues = {}, evidenceSourceTypes = {}) {
  return {
    classification,
    field_statuses: fieldStatuses,
    normalized_values: normalizedValues,
    evidence_source_types: evidenceSourceTypes,
    review_required: reviewRequired,
    material_change_count: 0,
    unsupported_values: [],
  };
}

export const deterministicBaselineCases = [
  {
    case_id: "p4b_normal_html",
    scenario: "normal_html",
    input: { sourceNotice: makeNotice("normal_html"), sourceDocuments: [] },
    expected: expected("recruitment_notice", { title: "present", application_deadline: "present", amount: "present" }, false, {
      application_deadline: { kind: "exact_datetime", datetime: "2026-08-31T17:00:00+09:00", timezone: "Asia/Seoul", inferred: false },
      amount: { kind: "exact", currency: "KRW", amount: 2_000_000, period: "semester", description: null },
    }, { title: ["html_text"], application_deadline: ["html_text"] }),
  },
  {
    case_id: "p4b_pdf_primary",
    scenario: "pdf_primary",
    input: {
      sourceNotice: makeNotice("pdf_primary", { body: baseBody({ includeDocuments: false }) }),
      sourceDocuments: [makeDocument("pdf_primary", "pdf", [
        { type: "pdf_page", page_number: 1, text: "제출서류: 지원서, 성적증명서", source_order: 0 },
      ])],
    },
    expected: expected("recruitment_notice", { required_documents: "present" }, false, {}, { required_documents: ["pdf_text"] }),
  },
  {
    case_id: "p4b_table_primary",
    scenario: "table_primary",
    input: {
      sourceNotice: makeNotice("table_primary", { body: baseBody({ includeAmount: false, includeEligibility: false }) }),
      sourceDocuments: [makeDocument("table_primary", "pdf", [
        { type: "table", page_number: 1, caption: "지원 기준", rows: [["지원금액: 학기당 200만원", "지원자격: 재학생"]], source_order: 0 },
      ])],
    },
    expected: expected("recruitment_notice", { amount: "present", eligibility: "present" }, false, {}, { amount: ["pdf_table_cell"], eligibility: ["pdf_table_cell"] }),
  },
  {
    case_id: "p4b_attachment_only",
    scenario: "attachment_only",
    input: {
      sourceNotice: makeNotice("attachment_only", { body: "", body_quality_status: "missing_body" }),
      sourceDocuments: [makeDocument("attachment_only", "hwpx", [
        { type: "section", section: "main", text: baseBody(), source_order: 0 },
      ])],
    },
    expected: expected("recruitment_notice", { application_deadline: "present", notes: "not_found" }, true, {}, { application_deadline: ["hwpx_text"] }),
  },
  {
    case_id: "p4b_multiple_dates",
    scenario: "multiple_dates",
    input: {
      sourceNotice: makeNotice("multiple_dates", { body: `${baseBody()}\n학교 추천 마감: 2026.08.25 15:00\n선발 결과 발표: 2026.09.15` }),
      sourceDocuments: [],
    },
    expected: expected("recruitment_notice", {
      application_deadline: "present", recommendation_deadline: "present", result_announcement_date: "present",
    }, false),
  },
  {
    case_id: "p4b_deadline_extension",
    scenario: "deadline_extension",
    input: { sourceNotice: makeNotice("deadline_extension"), sourceDocuments: [] },
    expected: expected("recruitment_notice", { application_deadline: "present" }, false),
  },
  {
    case_id: "p4b_new_term",
    scenario: "new_term",
    input: { sourceNotice: makeNotice("new_term"), sourceDocuments: [] },
    expected: expected("recruitment_notice", { academic_term: "present", recruitment_cycle_label: "present" }, false),
  },
  {
    case_id: "p4b_result_announcement",
    scenario: "result_announcement",
    input: {
      sourceNotice: makeNotice("result_announcement", {
        title: "2026년 2학기 미래인재 장학생 선발 결과 발표",
        body: "제공기관: 미래장학재단\n장학사업명: 미래인재 장학금\n모집회차: 2026년 2학기\n장학생 선발 결과를 발표합니다.",
        relationship_hints: { cross_source_required: true },
      }),
      sourceDocuments: [],
    },
    expected: expected("result_announcement", { application_deadline: "not_applicable", status: "present" }, true),
  },
  {
    case_id: "p4b_school_recommendation",
    scenario: "school_recommendation",
    input: {
      sourceNotice: makeNotice("school_recommendation", {
        title: "2026년 2학기 미래인재 장학금 교내 추천자 모집",
        body: `${baseBody()}\n학교 추천 마감: 2026.08.25 15:00`,
        relationship_hints: { school_recommendation: true },
      }),
      sourceDocuments: [],
    },
    expected: expected("recruitment_notice", { recommendation_deadline: "present" }, true),
  },
  {
    case_id: "p4b_reposted_notice",
    scenario: "reposted_notice",
    input: {
      sourceNotice: makeNotice("reposted_notice", { relationship_hints: { possible_repost: true } }),
      sourceDocuments: [],
    },
    expected: expected("recruitment_notice", { title: "present" }, true),
  },
  {
    case_id: "p4b_complex_eligibility",
    scenario: "complex_eligibility",
    input: {
      sourceNotice: makeNotice("complex_eligibility", {
        body: `${baseBody({ includeEligibility: false })}\n지원자격: 재학생 및 GPA 3.0 이상, 또는 소득 5구간 이하 중 하나`,
      }),
      sourceDocuments: [],
    },
    expected: expected("recruitment_notice", { eligibility: "ambiguous" }, true),
  },
  {
    case_id: "p4b_amount_range_tuition",
    scenario: "amount_range_or_tuition",
    input: {
      sourceNotice: makeNotice("amount_range_tuition", {
        body: `${baseBody({ includeAmount: false })}\n지원혜택: 학기당 100만~200만원 또는 등록금 전액`,
      }),
      sourceDocuments: [],
    },
    expected: expected("recruitment_notice", { amount: "ambiguous", benefit_type: "ambiguous" }, true),
  },
  {
    case_id: "p4b_missing_value",
    scenario: "missing_value",
    input: {
      sourceNotice: makeNotice("missing_value", { body: baseBody({ includeAmount: false }) }),
      sourceDocuments: [],
    },
    expected: expected("recruitment_notice", { amount: "not_found" }, false),
  },
  {
    case_id: "p4b_conflicting_sources",
    scenario: "conflicting_sources",
    input: {
      sourceNotice: makeNotice("conflicting_sources"),
      sourceDocuments: [makeDocument("conflicting_sources", "pdf", [
        { type: "pdf_page", page_number: 1, text: "신청 마감: 2026.09.05 17:00", source_order: 0 },
      ])],
    },
    expected: expected("recruitment_notice", { application_deadline: "conflicting" }, true, {}, { application_deadline: ["html_text", "pdf_text"] }),
  },
  {
    case_id: "p4b_low_quality_ocr",
    scenario: "low_quality_ocr",
    input: {
      sourceNotice: makeNotice("low_quality_ocr", { title: "미래인재 장학금 안내", body: "", body_quality_status: "missing_body" }),
      sourceDocuments: [makeDocument("low_quality_ocr", "image", [
        { type: "ocr_text", page_number: 1, bounding_box: { x: 0, y: 0, width: 600, height: 80, unit: "pixel" }, text: "신청 마감 2026.08.31 지원금액 200만원", source_order: 0 },
      ], {
        extraction_status: "ocr_low_quality",
        quality_status: "ocr_low_quality",
        manual_review_required: true,
        manual_review_reasons: ["ocr_confidence_below_threshold"],
        ocr_used: true,
      })],
    },
    expected: expected("unknown", { application_deadline: "unknown", amount: "unknown" }, true, {}, { title: ["html_text"] }),
  },
];

export function fixtureByScenario(scenario) {
  return deterministicBaselineCases.find((entry) => entry.scenario === scenario) ?? null;
}
