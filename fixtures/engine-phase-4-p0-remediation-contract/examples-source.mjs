import { P0_REMEDIATION_SCHEMA_VERSION } from "../../lib/engine-phase-4/p0-remediation-contract.mjs";

const ev = (caseId, sourceText) => ({
  evidence_id: `${caseId}_ev_1`,
  source_type: "html_text",
  source_notice_id: `${caseId}_notice`,
  document_id: null,
  document_revision_id: null,
  document_hash: null,
  source_text: sourceText,
  locator: "main",
});
const field = (status, value, refs = []) => ({ status, value, evidence_references: refs });
const present = (value, ref) => field("present", value, [ref]);
const notFound = () => field("not_found", null);
const unknown = (refs = []) => field("unknown", null, refs);
const notApplicable = () => field("not_applicable", null);
const lifecycleUnknown = () => field("unknown", "unknown");
const amount = (status, value, ref) => field(status, value, [ref]);
const amountValue = (ref, value) => ({
  currency: "KRW",
  period: "one_time",
  source_text: value.display,
  evidence_references: [ref],
  ...value,
});

function baseExample({
  caseId,
  scenario,
  sourceText,
  documentKind = "recruitment_notice",
  publishable = true,
  opportunityKind = "scholarship",
  terminal = false,
  relationRequired = false,
  sourceRevisionMode = "standalone_document",
  revisionNote = null,
  reviewRequired = false,
  reviewReasons = [],
  fields = {},
}) {
  const evidence = ev(caseId, sourceText);
  const ref = evidence.evidence_id;
  const terminalField = terminal ? notApplicable : unknown;
  return {
    scenario,
    expected_responsibility: [],
    output: {
      schema_version: P0_REMEDIATION_SCHEMA_VERSION,
      case_id: caseId,
      source: { notice_id: `${caseId}_notice`, canonical_url: `https://example.org/notices/${caseId}` },
      classification: {
        document_kind: documentKind,
        publishable_opportunity: publishable,
        opportunity_kind: opportunityKind,
        terminal_non_opportunity: terminal,
        relation_resolution_required: relationRequired,
        source_revision_mode: sourceRevisionMode,
        revision_note: revisionNote,
        evidence_references: [ref],
      },
      fields: {
        program_name: terminalField(),
        provider: terminalField(),
        posting_organization: present("예시 게시기관", ref),
        institution_or_campus: terminalField(),
        application_start: terminalField(),
        application_deadline: terminalField(),
        lifecycle_status: terminal ? notApplicable() : lifecycleUnknown(),
        application_url: terminalField(),
        support_type: terminalField(),
        support_amount: terminalField(),
        ...fields(ref),
      },
      review: { required: reviewRequired, reasons: reviewReasons, automatic_publish_allowed: false },
      evidence_references: [evidence],
    },
  };
}

export const exampleManifest = {
  fixture_version: "engine-phase-4-p0-remediation-contract-examples/v1",
  contract_schema_version: P0_REMEDIATION_SCHEMA_VERSION,
  examples: [
    baseExample({
      caseId: "normal_open_recruitment",
      scenario: "normal_recruitment_notice",
      sourceText: "정상 장학금 신청기간 2026-07-01 09:00부터 2026-07-31 18:00까지, 신청 https://apply.example.org/normal",
      fields: (ref) => ({
        program_name: present("정상 장학금", ref), provider: present("예시장학재단", ref), institution_or_campus: present("예시대학교", ref),
        application_start: present("2026-07-01T09:00:00+09:00", ref), application_deadline: present("2026-07-31T18:00:00+09:00", ref), lifecycle_status: present("open", ref),
        application_url: present("https://apply.example.org/normal", ref), support_type: present(["cash_award"], ref),
        support_amount: amount("present", amountValue(ref, { display: "1인당 1,000,000원", kind: "exact", exact_amount: 1000000 }), ref),
      }),
    }),
    baseExample({
      caseId: "closed_recruitment",
      scenario: "closed_recruitment_notice",
      sourceText: "마감된 장학금 신청기간 2025-01-01부터 2025-01-31까지",
      fields: (ref) => ({
        program_name: present("마감된 장학금", ref), provider: present("예시장학재단", ref), institution_or_campus: notApplicable(),
        application_start: present("2025-01-01", ref), application_deadline: present("2025-01-31", ref), lifecycle_status: present("closed", ref),
        application_url: notFound(), support_type: present(["cash_award"], ref), support_amount: amount("present", amountValue(ref, { display: "500,000원", kind: "exact", exact_amount: 500000 }), ref),
      }),
    }),
    baseExample({
      caseId: "result_announcement",
      scenario: "result_announcement",
      sourceText: "2025학년도 복지장학금 선발 결과 발표",
      documentKind: "result_announcement", publishable: false, opportunityKind: "not_applicable", terminal: true, relationRequired: true,
      reviewRequired: true, reviewReasons: ["relation_resolution_required"], fields: () => ({}),
    }),
    baseExample({
      caseId: "application_support_guidance",
      scenario: "application_support_guidance",
      sourceText: "외부장학금 신청을 위한 학장 추천서 발급 절차 안내",
      documentKind: "general_guidance", publishable: false, opportunityKind: "not_applicable", terminal: true,
      fields: () => ({}),
    }),
    baseExample({
      caseId: "standalone_correction",
      scenario: "standalone_correction_notice",
      sourceText: "광산장학금 신청기간은 2025-09-01부터이며 마감일을 2025-09-19로 연장합니다.",
      documentKind: "correction_notice", publishable: false, terminal: false, relationRequired: true,
      reviewRequired: true, reviewReasons: ["relation_resolution_required", "support_type_uncertain", "support_amount_uncertain"],
      fields: (ref) => ({
        program_name: present("광산장학금", ref), provider: present("광산장학회", ref), institution_or_campus: notApplicable(),
        application_start: present("2025-09-01", ref), application_deadline: present("2025-09-19", ref), lifecycle_status: lifecycleUnknown(),
        application_url: notFound(), support_type: unknown(), support_amount: unknown(),
      }),
    }),
    baseExample({
      caseId: "updated_existing_page",
      scenario: "updated_existing_recruitment_page",
      sourceText: "Global Hope Scholarship, application 2025-06-18 to 2025-07-18, updated as of 2025-06-16",
      sourceRevisionMode: "updated_existing_page", revisionNote: "Updated as of 2025-06-16; prior revision is not retained.",
      reviewRequired: true, reviewReasons: ["source_revision_history_missing"],
      fields: (ref) => ({
        program_name: present("Global Hope Scholarship", ref), provider: present("Samsung", ref), institution_or_campus: present("Underwood International College", ref),
        application_start: present("2025-06-18", ref), application_deadline: present("2025-07-18", ref), lifecycle_status: present("closed", ref),
        application_url: notFound(), support_type: present(["cash_award"], ref), support_amount: amount("present", amountValue(ref, { display: "KRW 4,800,000 per semester", kind: "recurring_semester", exact_amount: 4800000, period: "semester" }), ref),
      }),
    }),
    baseExample({
      caseId: "maximum_cap",
      scenario: "maximum_cap_amount",
      sourceText: "지원금액은 1,000,000원 이내이며 등록금 실납입액을 초과할 수 없음",
      fields: (ref) => ({
        program_name: present("상한 장학금", ref), provider: present("예시대학교", ref), institution_or_campus: present("예시대학교", ref),
        application_start: present("2026-01-01", ref), application_deadline: present("2026-01-31", ref), lifecycle_status: present("closed", ref),
        application_url: notFound(), support_type: present(["tuition_support"], ref),
        support_amount: amount("present", amountValue(ref, { display: "1,000,000원 이내", kind: "maximum_cap", maximum_amount: 1000000, cap_basis: "actual_tuition_paid" }), ref),
      }),
    }),
    baseExample({
      caseId: "full_tuition",
      scenario: "full_tuition_amount",
      sourceText: "매 학기 등록금 전액 지원",
      fields: (ref) => ({
        program_name: present("등록금 전액 장학금", ref), provider: present("예시장학재단", ref), institution_or_campus: notApplicable(),
        application_start: present("2026-02-01", ref), application_deadline: present("2026-02-28", ref), lifecycle_status: present("closed", ref),
        application_url: notFound(), support_type: present(["tuition_support"], ref),
        support_amount: amount("present", amountValue(ref, { display: "등록금 전액", kind: "full_tuition", currency: null, period: "semester" }), ref),
      }),
    }),
    baseExample({
      caseId: "tiered_target_amount",
      scenario: "tiered_by_target_amount",
      sourceText: "중고생 50만원, 전문대생 150만원, 종합대생 200만원",
      reviewRequired: true, reviewReasons: ["complex_amount_structure", "amount_schema_expressiveness_gap"],
      fields: (ref) => ({
        program_name: present("대상별 장학금", ref), provider: present("예시장학재단", ref), institution_or_campus: notApplicable(),
        application_start: present("2026-03-01", ref), application_deadline: present("2026-03-31", ref), lifecycle_status: present("closed", ref), application_url: notFound(), support_type: present(["cash_award"], ref),
        support_amount: amount("schema_expressiveness_gap", amountValue(ref, { display: "중고생 50만원 / 전문대생 150만원 / 종합대생 200만원", kind: "tiered_by_target", components: [
          { kind: "exact", display: "500,000원", currency: "KRW", exact_amount: 500000, target_label: "중·고생" },
          { kind: "exact", display: "1,500,000원", currency: "KRW", exact_amount: 1500000, target_label: "전문대생" },
          { kind: "exact", display: "2,000,000원", currency: "KRW", exact_amount: 2000000, target_label: "종합대생" }
        ] }), ref),
      }),
    }),
    baseExample({
      caseId: "paid_student_activity",
      scenario: "paid_student_activity",
      sourceText: "Global Service Desk Supporters 활동장학금 월 20만원 및 근로장학금 시간당 10,320원",
      opportunityKind: "paid_student_activity", reviewRequired: true,
      reviewReasons: ["paid_activity_feed_partition_required", "complex_amount_structure", "amount_schema_expressiveness_gap"],
      fields: (ref) => ({
        program_name: present("Global Service Desk Supporters", ref), provider: present("Underwood International College", ref), institution_or_campus: present("Underwood International College", ref),
        application_start: present("2026-01-15T00:00:00+09:00", ref), application_deadline: present("2026-01-28T23:59:00+09:00", ref), lifecycle_status: present("closed", ref), application_url: notFound(), support_type: present(["activity_scholarship", "work_scholarship"], ref),
        support_amount: amount("schema_expressiveness_gap", amountValue(ref, { display: "월 200,000원 + 시간당 10,320원", kind: "composite_components", components: [
          { kind: "recurring_monthly", display: "월 200,000원", currency: "KRW", exact_amount: 200000, period: "month" },
          { kind: "hourly_rate", display: "시간당 10,320원", currency: "KRW", exact_amount: 10320, period: "hour" }
        ] }), ref),
      }),
    }),
    baseExample({
      caseId: "application_url_absent",
      scenario: "application_url_not_found",
      sourceText: "신청서는 학과 이메일로 제출",
      fields: (ref) => ({
        program_name: present("이메일 접수 장학금", ref), provider: present("예시대학교", ref), institution_or_campus: present("예시대학교", ref),
        application_start: present("2026-04-01", ref), application_deadline: present("2026-04-30", ref), lifecycle_status: present("closed", ref), application_url: notFound(),
        support_type: present(["cash_award"], ref), support_amount: amount("present", amountValue(ref, { display: "300,000원", kind: "exact", exact_amount: 300000 }), ref),
      }),
    }),
    baseExample({
      caseId: "ambiguous_date_role",
      scenario: "ambiguous_application_date_role",
      sourceText: "신청 및 서류 보완 일정 2026-05-01 ~ 2026-05-31",
      publishable: false, opportunityKind: "unknown", reviewRequired: true,
      reviewReasons: ["ambiguous_date_role", "publishability_requires_confirmation", "provider_posting_organization_ambiguous", "campus_scope_ambiguous", "support_type_uncertain", "support_amount_uncertain"],
      fields: (ref) => ({
        program_name: present("날짜 역할 불명 장학금", ref), provider: unknown([ref]), institution_or_campus: unknown([ref]),
        application_start: field("ambiguous", null, [ref]), application_deadline: field("ambiguous", null, [ref]), lifecycle_status: lifecycleUnknown(),
        application_url: notFound(), support_type: unknown(), support_amount: unknown(),
      }),
    }),
    baseExample({
      caseId: "unknown_document",
      scenario: "unknown_document_requires_review",
      sourceText: "신청기간은 2026-05-01부터 2026-05-31까지이나 문서가 모집 공고인지 안내문인지 확인되지 않음",
      documentKind: "unknown_document", publishable: false, opportunityKind: "unknown", terminal: false,
      reviewRequired: true,
      reviewReasons: ["classification_uncertain", "program_identity_insufficient", "provider_posting_organization_ambiguous", "campus_scope_ambiguous", "application_url_unverified", "support_type_uncertain", "support_amount_uncertain"],
      fields: (ref) => ({
        application_start: present("2026-05-01", ref),
        application_deadline: present("2026-05-31", ref),
        lifecycle_status: lifecycleUnknown(),
      }),
    }),
    baseExample({
      caseId: "amount_range",
      scenario: "range_amount",
      sourceText: "1인당 500,000원~1,000,000원 지원",
      fields: (ref) => ({
        program_name: present("범위 장학금", ref), provider: present("예시장학재단", ref), institution_or_campus: notApplicable(),
        application_start: present("2026-05-01", ref), application_deadline: present("2026-05-31", ref), lifecycle_status: present("closed", ref), application_url: notFound(), support_type: present(["cash_award"], ref),
        support_amount: amount("present", amountValue(ref, { display: "500,000원~1,000,000원", kind: "range", minimum_amount: 500000, maximum_amount: 1000000 }), ref),
      }),
    }),
    baseExample({
      caseId: "percentage_tuition",
      scenario: "percentage_of_tuition_amount",
      sourceText: "등록금의 50% 지원",
      fields: (ref) => ({
        program_name: present("등록금 비율 장학금", ref), provider: present("예시대학교", ref), institution_or_campus: present("예시대학교", ref),
        application_start: present("2026-06-01", ref), application_deadline: present("2026-06-30", ref), lifecycle_status: present("closed", ref), application_url: notFound(), support_type: present(["tuition_support"], ref),
        support_amount: amount("present", amountValue(ref, { display: "등록금의 50%", kind: "percentage_of_tuition", currency: null, percentage: 50, period: "semester" }), ref),
      }),
    }),
    baseExample({
      caseId: "applicant_requested",
      scenario: "applicant_requested_amount",
      sourceText: "신청자가 희망 지원금액을 기재",
      reviewRequired: true, reviewReasons: ["llm_assisted_draft_recommended"],
      fields: (ref) => ({
        program_name: present("희망금액 장학금", ref), provider: present("예시대학교", ref), institution_or_campus: present("예시대학교", ref),
        application_start: present("2026-07-01", ref), application_deadline: present("2026-07-31", ref), lifecycle_status: present("open", ref), application_url: notFound(), support_type: present(["applicant_requested"], ref),
        support_amount: amount("present", amountValue(ref, { display: "신청자 희망금액", kind: "applicant_requested", currency: null, period: "not_applicable", cap_basis: "requested_amount" }), ref),
      }),
    }),
    baseExample({
      caseId: "not_predefined",
      scenario: "not_predefined_amount",
      sourceText: "지원금액은 심사 후 결정",
      reviewRequired: true, reviewReasons: ["llm_assisted_draft_recommended"],
      fields: (ref) => ({
        program_name: present("심사결정 장학금", ref), provider: present("예시장학재단", ref), institution_or_campus: notApplicable(),
        application_start: present("2026-08-01", ref), application_deadline: present("2026-08-31", ref), lifecycle_status: present("upcoming", ref), application_url: notFound(), support_type: present(["cash_award"], ref),
        support_amount: amount("present", amountValue(ref, { display: "심사 후 결정", kind: "not_predefined", currency: null, period: "not_applicable", cap_basis: "review_decision" }), ref),
      }),
    }),
  ],
};
