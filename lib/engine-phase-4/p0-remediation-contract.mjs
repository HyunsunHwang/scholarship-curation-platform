import crypto from "node:crypto";

export const P0_REMEDIATION_SCHEMA_VERSION = "engine-phase-4-p0-remediation-output/v1";
export const P0_REMEDIATION_DESIGN_VERSION = "engine-phase-4-p0-remediation-design/v1";

export const DOCUMENT_KINDS = Object.freeze([
  "recruitment_notice",
  "result_announcement",
  "information_session",
  "general_guidance",
  "correction_notice",
  "unknown_document",
]);
export const LIFECYCLE_STATUSES = Object.freeze(["upcoming", "open", "closed", "unknown"]);
export const OPPORTUNITY_KINDS = Object.freeze(["scholarship", "paid_student_activity", "not_applicable", "unknown"]);
export const P0_OPPORTUNITY_FIELDS = Object.freeze([
  "program_name",
  "provider",
  "institution_or_campus",
  "application_start",
  "application_deadline",
  "lifecycle_status",
  "application_url",
  "support_type",
  "support_amount",
]);
export const AMOUNT_KINDS = Object.freeze([
  "exact",
  "maximum_cap",
  "range",
  "percentage_of_tuition",
  "full_tuition",
  "actual_tuition_paid_cap",
  "tiered_by_target",
  "tiered_by_degree_level",
  "composite_components",
  "recurring_monthly",
  "recurring_semester",
  "installment",
  "hourly_rate",
  "applicant_requested",
  "not_predefined",
  "variable_by_review",
  "non_cash_or_service",
  "multiple_program_schema_gap",
]);
export const FIRST_REMEDIATION_AMOUNT_KINDS = Object.freeze([
  "exact",
  "maximum_cap",
  "range",
  "percentage_of_tuition",
  "full_tuition",
  "recurring_monthly",
  "recurring_semester",
  "hourly_rate",
]);
export const COMPLEX_AMOUNT_KINDS = Object.freeze([
  "tiered_by_target",
  "tiered_by_degree_level",
  "composite_components",
  "installment",
  "multiple_program_schema_gap",
]);

export const PROTECTED_BASELINE_SHA256 = Object.freeze({
  "lib/engine-phase-4/deterministic-extractor.mjs": "a6f7cc4134f593da2e52d93e86e012c96f5f5a6b1363230f1410148d54bbc024",
  "fixtures/engine-phase-4-representative-gold/cases.json": "f61b5be60b00a949ea0d0ec68a7585fdaffe42cc3f13472fd0538555e0c757fd",
  "fixtures/engine-phase-4-representative-gold/corpus-source.mjs": "f4524246e429328553ce45bd1da8eb06c0a6c449701ac323e7fb6ba5d0111f7e",
  "reports/engine-phase-4-gate-c-representative-evaluation.json": "1ff1e39ead03c1bc1a4cf5f2ad927eb20715f07104dc708db3c7aa796cd0b160",
  "reports/engine-phase-4-gate-c-p0.json": "912dd110ed687433151d4f5dce985d152135f4e699a1f31d09e26666d71fe384",
});

export const RESPONSIBILITY_CLASSIFICATION = Object.freeze({
  deterministic_extractor: [
    "conservative document-kind classification",
    "explicit primary application start/deadline with embedded offset",
    "explicit program/provider labels",
    "explicit application URL",
    "simple first-remediation amount kinds",
    "lifecycle derivation only for confirmed recruitment with an unambiguous window",
    "evidence-linked fail-closed output",
  ],
  output_contract_or_schema: [
    "explicit publishable_opportunity and opportunity_kind",
    "posting_organization separate from provider and institution_or_campus",
    "lifecycle enum separate from document kind",
    "lossless amount taxonomy, components, installments, caps, labels, and source display",
    "schema_expressiveness_gap distinct from ambiguity",
  ],
  upstream_collection: [
    "preserve sufficient HTML before requesting attachment parsing",
    "minimal OCR/vision for image-only P0 facts",
    "HWP/HWPX/PDF text only when accessible HTML lacks P0 facts",
    "retain document revision identity and source locators",
  ],
  llm_assisted_draft: [
    "provider/program/posting-role separation when labels are contextual",
    "complex date-role and process-timeline interpretation",
    "cross-table component/program amount alignment",
    "complex Korean eligibility and exception semantics outside P0",
  ],
  mandatory_admin_review: [
    "publishability before promotion",
    "ambiguous provider, campus, date role, URL, or amount",
    "schema gaps and paid-activity feed partition",
    "correction, result, revision, or conflicting-source decisions",
  ],
  relation_resolution: [
    "standalone correction and deadline-extension documents",
    "result announcements linked to the originating recruitment cycle",
    "before/after revision evidence and material-change ownership",
  ],
  deferred_out_of_scope: [
    "complete eligibility and exception interpretation",
    "automatic multi-program splitting",
    "automatic relation linking completion",
    "full parsing of every attachment and image",
    "production migration, persistence, UI redesign, automatic publication, and Phase 5",
  ],
});

export const COMPATIBILITY_PLAN = Object.freeze([
  { field: "document_kind", classification: "existing_semantics_correction", current: "classification.document_kind", plan: "reuse known kinds, map legacy unknown to unknown_document, and strengthen cross-field safety" },
  { field: "publishable_opportunity", classification: "new_phase4_internal_field", current: "classification.is_recruitment is only a classifier projection", plan: "separate semantic publishability from automatic publication" },
  { field: "opportunity_kind", classification: "new_phase4_internal_field", current: "missing", plan: "distinguish scholarship and paid_student_activity before Phase 5" },
  { field: "program_name", classification: "existing_reuse", current: "fields.scholarship_program_name", plan: "rename only in the P0 adapter" },
  { field: "provider", classification: "existing_semantics_correction", current: "fields.provider", plan: "remove posting/administrative labels from provider matching" },
  { field: "posting_organization", classification: "new_phase4_internal_field", current: "source metadata and admin source_name only", plan: "preserve separately without DB migration" },
  { field: "institution_or_campus", classification: "existing_semantics_correction", current: "optional fields.host_institution", plan: "do not infer from provider or posting source" },
  { field: "application_start", classification: "existing_semantics_correction", current: "fields.application_start", plan: "primary application window only" },
  { field: "application_deadline", classification: "existing_semantics_correction", current: "fields.application_deadline", plan: "primary application window only" },
  { field: "lifecycle_status", classification: "deprecated_or_replaced", current: "fields.status accepts document-kind-like strings", plan: "replace through a Phase 4 adapter with a closed enum" },
  { field: "lifecycle_status calculation", classification: "derived_field", current: "not implemented safely", plan: "derive only from confirmed recruitment and an unambiguous primary window at fixed as_of" },
  { field: "application_url", classification: "existing_semantics_correction", current: "fields.application_url; admin apply_url defaults to notice URL", plan: "retain only explicit application-path evidence" },
  { field: "support_type", classification: "existing_reuse", current: "fields.benefit_type / NoticeDraft.support_types", plan: "add paid-activity benefit kinds" },
  { field: "support_amount", classification: "future_phase5_field", current: "fields.amount and admin support_amount_text", plan: "validate rich Phase 4 value; project display text to legacy admin draft" },
  { field: "structured support amount persistence", classification: "future_db_migration_required", current: "legacy support_amount_text", plan: "defer migration until Phase 5 contract approval" },
]);

export const NEXT_EXTRACTOR_SCOPE = Object.freeze({
  included: [
    "separate document_kind, publishable_opportunity, and lifecycle_status",
    "fix verified recruitment suppression without weakening terminal-document blocking",
    "block result and guidance documents from standalone publication",
    "extract explicit primary application windows and derive lifecycle conservatively",
    "extract explicit program, provider, institution/campus, and application URL values",
    "normalize the eight first-remediation amount kinds",
    "preserve evidence references for every present value",
    "return unknown/ambiguous/conflicting plus review reasons when an auto-decision is unsafe",
    "emit paid_student_activity as a distinct opportunity kind",
  ],
  excluded: [
    "complete eligibility/exception interpretation",
    "automatic decomposition of multi-program notices",
    "automatic relation-resolution completion",
    "automatic extraction of complex amount structures",
    "unbounded HWP/HWPX/PDF parsing or full-image OCR",
    "external LLM calls, admin UI changes, database migration/write, automatic publication, and Phase 5 persistence",
  ],
});

export const CURRENT_CODE_FINDINGS = Object.freeze([
  { id: "publishability_alias", finding: "classification.is_recruitment is used as the P0 publishability prediction, so classification misses suppress real opportunities.", code_refs: ["lib/engine-phase-4/deterministic-extractor.mjs:195", "lib/engine-phase-4/gate-c-p0-audit.mjs:237"] },
  { id: "lifecycle_document_kind_mix", finding: "fields.status is populated with result_announced or recruitment_notice rather than a lifecycle enum.", code_refs: ["lib/engine-phase-4/deterministic-extractor.mjs:350", "lib/engine-phase-4/deterministic-extractor.mjs:353"] },
  { id: "provider_role_mix", finding: "provider matching accepts 주관기관 and 재단 labels while posting organization has no canonical field.", code_refs: ["lib/engine-phase-4/deterministic-extractor.mjs:299", "schemas/engine/phase-4-canonical-scholarship.schema.json:64"] },
  { id: "limited_date_roles", finding: "date rules recognize only four roles and can generalize any 신청/접수 기간 range without a process-role model.", code_refs: ["lib/engine-phase-4/deterministic-normalizers.mjs:56", "lib/engine-phase-4/deterministic-normalizers.mjs:63"] },
  { id: "url_boundary", finding: "the extractor requires an application-context URL, but the legacy admin review default still copies notice_url into apply_url.", code_refs: ["lib/engine-phase-4/deterministic-normalizers.mjs:198", "app/admin/review/scholarships/[id]/page.tsx:108"] },
  { id: "amount_shape", finding: "canonical amountValue supports only exact/range/tuition/non-cash and the extractor treats multiple benefit candidates as ambiguity.", code_refs: ["schemas/engine/phase-4-canonical-scholarship.schema.json:294", "lib/engine-phase-4/deterministic-extractor.mjs:245"] },
  { id: "paid_activity_missing", finding: "canonical extraction has no opportunity_kind, so paid student activity cannot be partitioned from scholarships.", code_refs: ["schemas/engine/phase-4-canonical-scholarship.schema.json:23"] },
  { id: "llm_admin_flow", finding: "the existing admin path calls an LLM on demand, stores extracted_draft, then requires an administrator form submission.", code_refs: ["app/admin/crawled-notices/actions.ts:166", "app/admin/review/scholarships/[id]/page.tsx:258"] },
]);

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function error(code, path, message) {
  return { code, path, message };
}

function isPresent(field) {
  return field?.status === "present";
}

function evidenceIds(record) {
  return new Set((record.evidence_references ?? []).map((item) => item.evidence_id));
}

function validateAmount(field, errors) {
  if (!field?.value) return;
  const value = field.value;
  const path = "fields.support_amount.value";
  if (value.kind === "exact" && !Number.isFinite(value.exact_amount)) errors.push(error("exact_amount_missing", path, "exact requires exact_amount"));
  if (["maximum_cap", "actual_tuition_paid_cap"].includes(value.kind) && !Number.isFinite(value.maximum_amount)) errors.push(error("maximum_amount_missing", path, `${value.kind} requires maximum_amount`));
  if (value.kind === "range" && (!Number.isFinite(value.minimum_amount) || !Number.isFinite(value.maximum_amount) || value.minimum_amount > value.maximum_amount)) errors.push(error("invalid_amount_range", path, "range requires ordered minimum/maximum"));
  if (value.kind === "percentage_of_tuition" && !Number.isFinite(value.percentage)) errors.push(error("percentage_missing", path, "percentage_of_tuition requires percentage"));
  if (["recurring_monthly", "recurring_semester", "hourly_rate"].includes(value.kind) && !Number.isFinite(value.exact_amount)) errors.push(error("periodic_amount_missing", path, `${value.kind} requires exact_amount`));
  if (value.kind === "recurring_monthly" && value.period !== "month") errors.push(error("period_mismatch", path, "recurring_monthly requires month"));
  if (value.kind === "recurring_semester" && value.period !== "semester") errors.push(error("period_mismatch", path, "recurring_semester requires semester"));
  if (value.kind === "hourly_rate" && value.period !== "hour") errors.push(error("period_mismatch", path, "hourly_rate requires hour"));
  if (["tiered_by_target", "tiered_by_degree_level", "composite_components"].includes(value.kind) && !(value.components?.length >= 2)) errors.push(error("amount_components_missing", path, `${value.kind} requires at least two components`));
  if (value.kind === "tiered_by_target" && value.components?.some((item) => !item.target_label)) errors.push(error("target_label_missing", path, "every target tier requires target_label"));
  if (value.kind === "tiered_by_degree_level" && value.components?.some((item) => !item.degree_level)) errors.push(error("degree_level_missing", path, "every degree tier requires degree_level"));
  if (value.kind === "installment" && !(value.installments?.length >= 2)) errors.push(error("installments_missing", path, "installment requires at least two installments"));
  if (value.kind === "applicant_requested" && value.cap_basis !== "requested_amount") errors.push(error("applicant_requested_basis_missing", path, "applicant_requested requires requested_amount cap_basis"));
  if (COMPLEX_AMOUNT_KINDS.includes(value.kind) && field.status !== "schema_expressiveness_gap") errors.push(error("complex_amount_not_schema_gap", "fields.support_amount.status", "complex first-remediation amounts must be explicit schema gaps"));
}

export function validateP0RemediationRecord(record, schemaValidator = null) {
  const errors = [];
  if (schemaValidator && !schemaValidator(record)) errors.push(error("schema_invalid", "$", JSON.stringify(schemaValidator.errors ?? [])));
  const knownEvidence = evidenceIds(record);
  if (knownEvidence.size !== (record.evidence_references ?? []).length) errors.push(error("duplicate_evidence_id", "evidence_references", "evidence IDs must be unique"));
  const referencedGroups = [record.classification?.evidence_references ?? [], ...Object.values(record.fields ?? {}).map((field) => field?.evidence_references ?? [])];
  for (const evidenceId of referencedGroups.flat()) if (!knownEvidence.has(evidenceId)) errors.push(error("missing_evidence_reference", "evidence_references", evidenceId));

  const classification = record.classification ?? {};
  const fields = record.fields ?? {};
  if (classification.terminal_non_opportunity) {
    for (const fieldName of P0_OPPORTUNITY_FIELDS) {
      if (fields[fieldName]?.status !== "not_applicable") errors.push(error("terminal_field_not_applicable", `fields.${fieldName}`, "terminal documents stop downstream opportunity extraction"));
    }
  }
  if (classification.publishable_opportunity && classification.document_kind !== "recruitment_notice") errors.push(error("unsafe_publishability", "classification.publishable_opportunity", "only recruitment_notice may be publishable"));
  if (["result_announcement", "information_session", "general_guidance"].includes(classification.document_kind) && classification.publishable_opportunity) errors.push(error("terminal_document_publishable", "classification.publishable_opportunity", "terminal document cannot be publishable"));
  if (classification.document_kind === "correction_notice" && (!classification.relation_resolution_required || classification.publishable_opportunity)) errors.push(error("correction_relation_rule", "classification", "standalone correction requires relation resolution and is not publishable"));
  if (classification.source_revision_mode === "updated_existing_page" && !classification.revision_note) errors.push(error("revision_note_missing", "classification.revision_note", "updated page requires revision note"));

  if (isPresent(fields.application_start) && isPresent(fields.application_deadline) && fields.application_start.value.slice(0, 10) > fields.application_deadline.value.slice(0, 10)) errors.push(error("invalid_application_window", "fields.application_start", "application_start cannot be after application_deadline"));
  const dateUnsafe = [fields.application_start?.status, fields.application_deadline?.status].some((status) => ["ambiguous", "conflicting", "unknown"].includes(status));
  if (dateUnsafe && fields.lifecycle_status?.value !== "unknown") errors.push(error("unsafe_lifecycle_derivation", "fields.lifecycle_status", "unsafe date roles require unknown lifecycle"));
  if (isPresent(fields.lifecycle_status) && (classification.document_kind !== "recruitment_notice" || !isPresent(fields.application_start) || !isPresent(fields.application_deadline))) errors.push(error("lifecycle_without_confirmed_window", "fields.lifecycle_status", "lifecycle requires confirmed recruitment and primary window"));
  if (isPresent(fields.application_url) && fields.application_url.value === record.source?.canonical_url) errors.push(error("source_url_used_as_application_url", "fields.application_url", "source detail URL is not automatically an application URL"));

  validateAmount(fields.support_amount, errors);
  const review = record.review ?? {};
  if (review.required && !(review.reasons?.length > 0)) errors.push(error("review_reason_missing", "review.reasons", "required review needs a reason"));
  if (!review.required && (review.reasons?.length ?? 0) > 0) errors.push(error("unexpected_review_reason", "review.reasons", "non-required review must have no reasons"));
  if (fields.support_amount?.status === "schema_expressiveness_gap" && (!review.required || !review.reasons?.includes("amount_schema_expressiveness_gap"))) errors.push(error("schema_gap_review_missing", "review", "amount schema gap requires review"));
  if (review.reasons?.includes("amount_schema_expressiveness_gap") && fields.support_amount?.status !== "schema_expressiveness_gap") errors.push(error("schema_gap_status_lost", "fields.support_amount.status", "schema-gap review reason requires schema_expressiveness_gap status"));
  if (fields.support_type?.value?.includes("applicant_requested") && fields.support_amount?.value?.kind !== "applicant_requested") errors.push(error("applicant_requested_semantics_lost", "fields.support_amount", "applicant-requested support must not become not_found or another amount kind"));
  if (classification.relation_resolution_required && (!review.required || !review.reasons?.includes("relation_resolution_required"))) errors.push(error("relation_review_missing", "review", "relation resolution requires admin review"));
  if (classification.opportunity_kind === "paid_student_activity" && (!review.required || !review.reasons?.includes("paid_activity_feed_partition_required"))) errors.push(error("paid_activity_partition_review_missing", "review", "paid activity requires feed partition review"));
  return { valid: errors.length === 0, errors };
}

export function diagnoseCurrentExtractor({ p0Report, productionSourceReview, currentRecords, canonicalSchema, adminReviewPageSource }) {
  const invalidLifecycle = p0Report.critical_errors.filter((item) => item.error === "document_kind_used_as_lifecycle_status");
  const suppressed = p0Report.critical_errors.filter((item) => item.error === "recruitment_suppressed" && item.verified_against_gold);
  const unsupported = p0Report.critical_errors.filter((item) => item.error === "unsupported_present_claim");
  const terminalIds = [...new Set([
    ...productionSourceReview.cases.filter((item) => item.terminal_non_opportunity).map((item) => item.case_id),
    ...[...currentRecords.entries()].filter(([, record]) => record.classification?.document_kind === "result_announcement").map(([caseId]) => caseId),
  ])];
  const terminalExposed = terminalIds.filter((caseId) => currentRecords.get(caseId)?.classification?.is_recruitment === true);
  const sourceUrlCopied = [...currentRecords.entries()].filter(([caseId, record]) => {
    const source = record.source_notice_identity?.canonical_url;
    return record.fields?.application_url?.value_status === "present" && record.fields.application_url.normalized_value === source && caseId;
  }).map(([caseId]) => caseId);
  const reviewMissing = [...currentRecords.entries()].filter(([, record]) => record.review?.required !== true).map(([caseId]) => caseId);
  const amountGapIds = productionSourceReview.cases.filter((item) => item.fields.support_amount.status === "schema_expressiveness_gap").map((item) => item.case_id);
  const relationIds = [...new Set([
    ...productionSourceReview.cases.filter((item) => ["correction_notice", "result_announcement"].includes(item.document_kind)).map((item) => item.case_id),
    ...[...currentRecords.entries()].filter(([, record]) => record.classification?.document_kind === "result_announcement").map(([caseId]) => caseId),
  ])];
  const canonicalFields = canonicalSchema.properties?.fields?.properties ?? {};
  return [
    { type: "document_kind_lifecycle_overlap", count: invalidLifecycle.length, case_ids: invalidLifecycle.map((item) => item.case_id), severity: "P0" },
    { type: "verified_recruitment_suppressed", count: suppressed.length, case_ids: suppressed.map((item) => item.case_id), severity: "P0" },
    { type: "terminal_non_opportunity_exposed", count: terminalExposed.length, case_ids: terminalExposed, severity: "P0" },
    { type: "source_url_used_as_application_url_by_extractor", count: sourceUrlCopied.length, case_ids: sourceUrlCopied, severity: "P0" },
    { type: "admin_default_source_url_as_application_url", count: /apply_url:\s*notice\.notice_url/u.test(adminReviewPageSource) ? 1 : 0, case_ids: [], severity: "compatibility_risk" },
    { type: "posting_organization_unrepresented", count: Object.hasOwn(canonicalFields, "posting_organization") ? 0 : currentRecords.size, case_ids: Object.hasOwn(canonicalFields, "posting_organization") ? [] : [...currentRecords.keys()], severity: "schema" },
    { type: "amount_schema_expressiveness_gap", count: amountGapIds.length, case_ids: amountGapIds, severity: "schema" },
    { type: "paid_activity_opportunity_kind_missing", count: Object.hasOwn(canonicalSchema.properties ?? {}, "opportunity_kind") ? 0 : 1, case_ids: ["p4c_020_uic_supporters_table"], severity: "schema" },
    { type: "relation_resolution_unimplemented", count: relationIds.length, case_ids: relationIds, severity: "relation" },
    { type: "unsupported_present_claim", count: unsupported.length, case_ids: unsupported.map((item) => item.case_id), severity: "evidence" },
    { type: "review_required_missing", count: reviewMissing.length, case_ids: reviewMissing, severity: "safety" },
  ];
}
