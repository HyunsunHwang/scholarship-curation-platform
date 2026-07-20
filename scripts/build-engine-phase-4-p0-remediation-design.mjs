import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { exampleManifest } from "../fixtures/engine-phase-4-p0-remediation-contract/examples-source.mjs";
import { extractDeterministicScholarshipCandidate } from "../lib/engine-phase-4/deterministic-extractor.mjs";
import { P0_AS_OF } from "../lib/engine-phase-4/gate-c-p0-audit.mjs";
import {
  AMOUNT_KINDS,
  COMPATIBILITY_PLAN,
  COMPLEX_AMOUNT_KINDS,
  CURRENT_CODE_FINDINGS,
  DOCUMENT_KINDS,
  FIRST_REMEDIATION_AMOUNT_KINDS,
  FIELD_REVIEW_POLICY,
  LIFECYCLE_STATUSES,
  NEXT_EXTRACTOR_SCOPE,
  OPPORTUNITY_KINDS,
  P0_OPPORTUNITY_FIELDS,
  P0_REMEDIATION_DESIGN_VERSION,
  PROTECTED_BASELINE_SHA256,
  RESPONSIBILITY_CLASSIFICATION,
  diagnoseCurrentExtractor,
  sha256,
  validateP0RemediationRecord,
} from "../lib/engine-phase-4/p0-remediation-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readText = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const read = (relativePath) => JSON.parse(readText(relativePath));
const write = (relativePath, value) => fs.writeFileSync(path.join(root, relativePath), value);

const schema = read("schemas/engine/phase-4-p0-remediation-output.schema.json");
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });
const schemaValidator = ajv.compile(schema);
for (const example of exampleManifest.examples) {
  const result = validateP0RemediationRecord(example.output, schemaValidator);
  if (!result.valid) throw new Error(`${example.scenario}: ${JSON.stringify(result.errors)}`);
}

const protectedBaselines = Object.fromEntries(Object.entries(PROTECTED_BASELINE_SHA256).map(([relativePath, expected]) => {
  const actual = sha256(readText(relativePath));
  if (actual !== expected) throw new Error(`Protected baseline changed: ${relativePath}`);
  return [relativePath, { sha256: actual, unchanged: true }];
}));

const corpus = read("fixtures/engine-phase-4-representative-gold/cases.json");
const p0Report = read("reports/engine-phase-4-gate-c-p0.json");
const fullGateCReport = read("reports/engine-phase-4-gate-c-representative-evaluation.json");
const productionSourceReview = read("fixtures/engine-phase-4-gate-c-p0/production-source-review.json");
const currentRecords = new Map(corpus.cases.map((fixture) => [fixture.case_id, extractDeterministicScholarshipCandidate({
  ...fixture.evaluation_input,
  extractionContext: {
    extractorVersion: "1.0.0",
    parserContractVersion: "engine-phase-3-document-result/v1",
    evaluationFixtureVersion: corpus.fixture_version,
    extractedAt: P0_AS_OF,
  },
})]));

const fieldContract = [
  ["document_kind", "Document role, not opportunity lifecycle.", "enum", true, DOCUMENT_KINDS, false, "Clear bounded classification signals", "Conflicting recruitment/result/correction signals", "classification.evidence_references", "classification.document_kind", "Phase 4 and Phase 5"],
  ["publishable_opportunity", "Whether this document represents a standalone opportunity eligible for admin consideration.", "boolean", true, [true, false], false, "Confirmed recruitment notice with sufficient opportunity identity", "Unknown, result, guidance, correction, or insufficient evidence", "classification.evidence_references", "New; classification.is_recruitment is not authoritative", "Phase 4; Phase 5 candidate"],
  ["opportunity_kind", "Feed partition for scholarship versus paid student activity.", "enum", true, OPPORTUNITY_KINDS, true, "Explicit scholarship or paid-activity meaning", "Mixed/unclear benefit purpose", "classification.evidence_references", "New", "Phase 4; Phase 5 candidate"],
  ["program_name", "Actual scholarship, support, work, or activity program name.", "status/value/evidence field", true, ["present", "not_found", "unknown", "not_applicable", "ambiguous", "conflicting"], true, "Explicit program label", "Composite or contextual identity", "field evidence IDs", "Adapter from fields.scholarship_program_name", "Phase 4 and Phase 5"],
  ["provider", "Entity that supplies or owns the benefit.", "status/value/evidence field", true, ["present", "not_found", "unknown", "not_applicable", "ambiguous", "conflicting"], true, "Explicit provider/funder label", "Posting, operator, administrator, and funder roles overlap", "field evidence IDs", "Semantics correction for fields.provider", "Phase 4 and Phase 5"],
  ["posting_organization", "School, department, or organization that posted the notice.", "status/value/evidence field", true, ["present", "not_found", "unknown"], true, "Source metadata or explicit posting identity", "Source identity is incomplete", "source metadata evidence", "New Phase 4 field", "Phase 4; Phase 5 provenance"],
  ["institution_or_campus", "Institution/campus eligibility or applicability scope.", "status/value/evidence field", true, ["present", "not_found", "unknown", "not_applicable", "ambiguous", "conflicting"], true, "Explicit institutional scope", "Only posting/provider identity is available", "field evidence IDs", "Adapter from optional fields.host_institution", "Phase 4 and Phase 5"],
  ["application_start", "Start of the primary application intake window.", "date or offset datetime field", true, ["present", "not_found", "unknown", "not_applicable", "ambiguous", "conflicting"], true, "Explicit application-range role", "Recommendation/follow-up/result roles mix or conflict", "field evidence IDs", "Semantics correction for fields.application_start", "Phase 4 and Phase 5"],
  ["application_deadline", "End of the primary application intake window.", "date or offset datetime field", true, ["present", "not_found", "unknown", "not_applicable", "ambiguous", "conflicting"], true, "Explicit application-range role", "Multiple cycles or date-role conflict", "field evidence IDs", "Semantics correction for fields.application_deadline", "Phase 4 and Phase 5"],
  ["lifecycle_status", "Current opportunity availability at a fixed as_of.", "enum field", true, LIFECYCLE_STATUSES, true, "Confirmed recruitment plus unambiguous start/deadline and offset", "Missing/ambiguous/conflicting dates or relation dependency", "application-date and classification evidence IDs", "Replaces document-kind-like fields.status semantics", "Phase 4 and Phase 5"],
  ["application_url", "URL that starts or submits the application process.", "HTTP(S) URL field", true, ["present", "not_found", "unknown", "not_applicable", "ambiguous", "conflicting"], true, "Explicit application-context URL distinct from source detail URL", "Only source/detail URL is available", "field evidence IDs", "Semantics correction; never default from source URL", "Phase 4 and Phase 5"],
  ["support_type", "Benefit category without collapsing distinct components.", "string-array field", true, ["present", "not_found", "unknown", "not_applicable", "ambiguous", "conflicting"], true, "Explicit benefit labels", "Mixed/unclear benefit categories", "field evidence IDs", "Adapter from fields.benefit_type and NoticeDraft.support_types", "Phase 4 and Phase 5"],
  ["support_amount", "Lossless normalized amount meaning plus original display.", "tagged amount field", true, AMOUNT_KINDS, true, "First-remediation simple kind with explicit role/unit", "Complex components, tiers, program alignment, conflict, or missing evidence", "field and amount evidence IDs", "Rich Phase 4 value; legacy projection uses display only", "Phase 4; future Phase 5 structured field"],
  ["review_required", "Whether a human must confirm the candidate.", "boolean", true, [true, false], false, "Derived from fail-closed safety rules", "Always true for listed risk reasons", "review reasons reference field/classification evidence", "Reuse record.review.required", "Phase 4 and Phase 5"],
  ["review_reasons", "Machine-readable reasons that block safe automatic resolution.", "enum array", true, schema.properties.review.properties.reasons.items.enum, true, "Deterministic rule emits a known reason", "No free-form-only safety reason", "corresponding evidence-linked field", "Reuse and narrow record.review.reason_codes", "Phase 4 and Phase 5"],
  ["evidence_references", "Source-located evidence objects resolved by every present value.", "array", true, schema.$defs.evidenceReference.properties.source_type.enum, false, "Evidence has source identity, text, and locator", "Unsupported/invented value", "direct ID resolution", "Compatible adapter from canonical evidence", "Phase 4 and Phase 5"],
].map(([field, meaning, type, required, allowed, nullable, automatic, review, evidence, existing, handoff]) => ({ field, meaning, type, required, allowed, null_or_unknown_allowed: nullable, automatic_generation_condition: automatic, review_required_condition: review, evidence_link: evidence, existing_relationship: existing, handoff_scope: handoff }));

const remediationItems = [
  {
    problem: "Document kind, publishability, and lifecycle are conflated.",
    current_behavior: "classification.is_recruitment doubles as publishability and fields.status stores document-kind-like strings.",
    desired_behavior: "Three disjoint fields with cross-field invariants and unknown lifecycle fail-close.",
    code_targets: ["lib/engine-phase-4/deterministic-extractor.mjs", "lib/engine-phase-4/gate-c-p0-audit.mjs"],
    required_fields: ["document_kind", "publishable_opportunity", "lifecycle_status"],
    auto_allowed_when: "Classification is unambiguous; lifecycle additionally requires a confirmed primary window.",
    stop_when: "Signals conflict, document is terminal/correction, or dates are unsafe.",
    validation_scenarios: ["normal_recruitment_notice", "result_announcement", "application_support_guidance", "standalone_correction_notice"],
    completion_condition: "No document-kind enum appears in lifecycle; verified Cases 1, 2, and 5 are not suppressed; terminal fixtures remain blocked.",
  },
  {
    problem: "Provider, posting organization, and institution/campus roles can collapse.",
    current_behavior: "Provider labels include administrative/organizer terms and posting_organization is absent.",
    desired_behavior: "Independent evidence-linked role fields with no equality inference.",
    code_targets: ["lib/engine-phase-4/deterministic-extractor.mjs", "new Phase 4 output adapter"],
    required_fields: ["program_name", "provider", "posting_organization", "institution_or_campus"],
    auto_allowed_when: "The source explicitly labels the role or source metadata directly supplies posting identity.",
    stop_when: "Funder/operator/poster/host roles require contextual interpretation.",
    validation_scenarios: ["normal_recruitment_notice", "paid_student_activity"],
    completion_condition: "Each present role resolves its own evidence and absence never triggers inference from another role.",
  },
  {
    problem: "Application dates can absorb recommendation or follow-up schedules.",
    current_behavior: "A small regex role set recognizes generic 신청/접수 ranges without a full process-role boundary.",
    desired_behavior: "Only the primary intake window enters P0; other dates are deferred.",
    code_targets: ["lib/engine-phase-4/deterministic-normalizers.mjs", "lib/engine-phase-4/deterministic-extractor.mjs"],
    required_fields: ["application_start", "application_deadline", "lifecycle_status"],
    auto_allowed_when: "One explicit application range with a year and safe offset exists.",
    stop_when: "Roles are ambiguous, conflict, apply to only one subprogram, or describe follow-up steps.",
    validation_scenarios: ["normal_recruitment_notice", "ambiguous_application_date_role"],
    completion_condition: "Real date-only values compare by calendar day, offset datetimes compare by instant, and mixed precision forces unknown lifecycle plus review.",
  },
  {
    problem: "Source/detail URL can be confused with application URL downstream.",
    current_behavior: "Extractor is conservative, but legacy admin defaults apply_url to notice_url.",
    desired_behavior: "Phase 4 application_url is present only with explicit application-path evidence; legacy default is a documented adapter risk.",
    code_targets: ["lib/engine-phase-4/deterministic-normalizers.mjs", "future compatibility adapter"],
    required_fields: ["application_url", "source.canonical_url"],
    auto_allowed_when: "An application-context line contains a distinct HTTP(S) URL.",
    stop_when: "Only the notice URL, email, QR without resolved URL, or unclear link purpose exists.",
    validation_scenarios: ["normal_recruitment_notice", "application_url_not_found"],
    completion_condition: "Semantic validator rejects application_url equal to source canonical URL.",
  },
  {
    problem: "Simple amount kinds are incomplete and complex values are called ambiguous.",
    current_behavior: "Canonical v1 has six kinds; multiple candidates become ambiguity.",
    desired_behavior: "Normalize eight bounded simple kinds and preserve complex clear meaning as schema_expressiveness_gap.",
    code_targets: ["lib/engine-phase-4/deterministic-normalizers.mjs", "new Phase 4 output adapter"],
    required_fields: ["support_type", "support_amount"],
    auto_allowed_when: "A single explicit kind, amount/cap/range/percentage, unit, period, and recipient role are clear.",
    stop_when: "Tiers, components, installments, program alignment, or total/per-person meaning require interpretation.",
    validation_scenarios: ["maximum_cap_amount", "range_amount", "percentage_of_tuition_amount", "tiered_by_target_amount"],
    completion_condition: "Cap is not exact, complex values have no representative scalar, and every amount retains display/source evidence.",
  },
  {
    problem: "Paid student activity lacks a feed-safe kind.",
    current_behavior: "The canonical candidate is scholarship-only and has no opportunity_kind.",
    desired_behavior: "Emit paid_student_activity with activity/work benefit types and mandatory partition review.",
    code_targets: ["new Phase 4 output adapter"],
    required_fields: ["opportunity_kind", "support_type", "support_amount"],
    auto_allowed_when: "The source explicitly describes compensated student work/activity.",
    stop_when: "Scholarship and employment meaning are mixed or feed partition is unavailable.",
    validation_scenarios: ["paid_student_activity"],
    completion_condition: "Paid activity never silently enters the general scholarship feed.",
  },
  {
    problem: "Evidence and review outcomes must remain fail-closed.",
    current_behavior: "Canonical evidence and review mechanisms exist and currently flag all 24 Gate C cases.",
    desired_behavior: "Reuse evidence identities, require every present value to resolve evidence, and preserve automatic_publish_allowed=false.",
    code_targets: ["new Phase 4 output adapter", "lib/engine-phase-4/contracts.mjs"],
    required_fields: ["review_required", "review_reasons", "evidence_references"],
    auto_allowed_when: "Every present value has source-located evidence and no stop condition fires.",
    stop_when: "Evidence is missing/low-quality or any semantic safety rule fails.",
    validation_scenarios: ["all contract examples"],
    completion_condition: "Invalid evidence references fail validation and no candidate allows automatic publication.",
  },
];

const responsibilityMatrix = [
  { problem: "verified recruitment suppression", primary: "deterministic_extractor", secondary: ["mandatory_admin_review"] },
  { problem: "document kind and lifecycle mixing", primary: "output_contract_or_schema", secondary: ["deterministic_extractor", "mandatory_admin_review"] },
  { problem: "provider/poster/campus role separation", primary: "output_contract_or_schema", secondary: ["deterministic_extractor", "llm_assisted_draft", "mandatory_admin_review"] },
  { problem: "primary versus follow-up date roles", primary: "deterministic_extractor", secondary: ["upstream_collection", "llm_assisted_draft", "mandatory_admin_review"] },
  { problem: "source versus application URL", primary: "deterministic_extractor", secondary: ["mandatory_admin_review"] },
  { problem: "simple amount normalization", primary: "deterministic_extractor", secondary: ["output_contract_or_schema"] },
  { problem: "complex amount preservation", primary: "output_contract_or_schema", secondary: ["llm_assisted_draft", "mandatory_admin_review"] },
  { problem: "missing HTML/attachment/image evidence", primary: "upstream_collection", secondary: ["mandatory_admin_review", "deferred_out_of_scope"] },
  { problem: "correction/extension/result linkage", primary: "relation_resolution", secondary: ["mandatory_admin_review", "deferred_out_of_scope"] },
  { problem: "complex eligibility and exceptions", primary: "deferred_out_of_scope", secondary: ["llm_assisted_draft", "mandatory_admin_review"] },
  { problem: "paid student activity partition", primary: "output_contract_or_schema", secondary: ["deterministic_extractor", "mandatory_admin_review"] },
];

const deferredRoadmap = [
  { item: "complex eligibility and exception completion", stage: "LLM-assisted P1/P2 draft plus admin review" },
  { item: "multi-program automatic splitting", stage: "post-remediation bounded experiment" },
  { item: "correction/result automatic relation linking", stage: "relation-resolution work before Phase 5" },
  { item: "unbounded attachment parsing and OCR", stage: "targeted upstream-collection remediation only when HTML lacks P0" },
  { item: "rich amount persistence", stage: "future Phase 5 schema and DB migration review" },
  { item: "admin UI adaptation", stage: "after contract integration is independently verified" },
  { item: "automatic publication", stage: "not authorized; requires a separate production-safety decision" },
];

const currentViolations = diagnoseCurrentExtractor({
  p0Report,
  productionSourceReview,
  currentRecords,
  canonicalSchema: read("schemas/engine/phase-4-canonical-scholarship.schema.json"),
  adminReviewPageSource: readText("app/admin/review/scholarships/[id]/page.tsx"),
});

const report = {
  design_version: P0_REMEDIATION_DESIGN_VERSION,
  status: "completed",
  decision: "PASS",
  base_branch: "main",
  base_sha: "f9559b28e1179c26262a19ea6cca165ba58c9dd0",
  contract: {
    schema_path: "schemas/engine/phase-4-p0-remediation-output.schema.json",
    fixture_path: "fixtures/engine-phase-4-p0-remediation-contract/examples.json",
    opportunity_fields: P0_OPPORTUNITY_FIELDS,
    standalone_timezone_field: false,
    corpus_concept_slots: 216,
    document_kinds: DOCUMENT_KINDS,
    lifecycle_statuses: LIFECYCLE_STATUSES,
    opportunity_kinds: OPPORTUNITY_KINDS,
    field_contract: fieldContract,
  },
  current_code_findings: CURRENT_CODE_FINDINGS,
  responsibility_classification: RESPONSIBILITY_CLASSIFICATION,
  responsibility_matrix: responsibilityMatrix,
  next_extractor_remediation: { ...NEXT_EXTRACTOR_SCOPE, items: remediationItems, deferred_roadmap: deferredRoadmap },
  cross_field_safety_rules: [
    "document_kind and lifecycle_status enums are disjoint",
    "recruitment_notice is non-terminal; result, information-session, and guidance documents are terminal, non-publishable, and not_applicable opportunities",
    "standalone correction is non-publishable, non-terminal, requires relation resolution, and requires review",
    "unknown_document is non-publishable, non-terminal, unknown opportunity kind, and requires classification_uncertain review",
    "an updated existing recruitment page may remain recruitment_notice only with a revision note",
    "publishable_opportunity=true requires a confirmed recruitment_notice and a partitioned opportunity_kind",
    "paid_student_activity never silently enters the general scholarship feed",
    "date-only values must be real calendar dates and offset datetimes compare as actual instants",
    "mixed date/datetime precision cannot produce an automatic lifecycle",
    "primary application start cannot be after deadline and no standalone timezone field exists",
    "unsafe or conflicting date roles force lifecycle unknown and review",
    "every unknown, ambiguous, conflicting, or schema-gap field requires review and a field-specific reason; terminal not_applicable is exempt",
    "source canonical/detail route, including query/fragment/trailing-slash variants, is never application_url in this contract version",
    "provider, posting_organization, and institution_or_campus are independent",
    "unlike benefits, target tiers, total budget, and per-person amounts are never collapsed",
    "maximum_cap is not exact and clear unsupported structures are schema gaps rather than ambiguity",
  ],
  amount_contract: {
    properties: ["display", "kind", "currency", "exact_amount", "minimum_amount", "maximum_amount", "percentage", "period", "cap_basis", "target_label", "degree_level", "components", "installments", "source_text", "evidence_references"],
    all_kinds: AMOUNT_KINDS,
    first_remediation_auto_kinds: FIRST_REMEDIATION_AMOUNT_KINDS,
    structure_only_complex_kinds: COMPLEX_AMOUNT_KINDS,
    llm_assisted_candidates: ["actual_tuition_paid_cap", "applicant_requested", "not_predefined", "variable_by_review", "non_cash_or_service", ...COMPLEX_AMOUNT_KINDS],
    mandatory_review_kinds: ["applicant_requested", "not_predefined", "variable_by_review", ...COMPLEX_AMOUNT_KINDS],
    simple_kind_invariants: {
      exact: "exact_amount required; min/max/percentage/components/installments absent or null",
      maximum_cap: "maximum_amount required; exact_amount absent or null",
      range: "ordered minimum_amount and maximum_amount required; exact_amount absent or null",
      percentage_of_tuition: "percentage required; numeric amount fields absent or null",
      full_tuition: "numeric amount fields absent or null",
      recurring_monthly: "exact_amount required; period=month",
      recurring_semester: "exact_amount required; period=semester",
      hourly_rate: "exact_amount required; period=hour",
    },
    legacy_projection: "After admin confirmation, project display to support_amount_text; do not persist the rich object in this phase.",
  },
  review_policy: FIELD_REVIEW_POLICY,
  compatibility_plan: COMPATIBILITY_PLAN,
  current_extractor_contract_violations: currentViolations,
  baseline_metrics: {
    p0: {
      total_concept_slots: p0Report.p0_contract.total_concept_slots,
      frozen_resolved: p0Report.corpus.resolved_p0_field_count,
      frozen_pending: p0Report.corpus.pending_p0_field_count,
      frozen_unresolved: p0Report.corpus.unresolved_p0_field_count,
      critical_errors: p0Report.critical_errors.length,
      production_reviewed_cases: p0Report.production_source_review.reviewed_case_count,
    },
    full_gate_c: {
      document_classification_accuracy: fullGateCReport.metrics.document_classification_accuracy,
      normalized_exact_match: fullGateCReport.metrics.normalized_exact_match,
      program_candidate_usable_rate: fullGateCReport.metrics.program_candidate_usable_rate,
      phase5_handoff_usable_rate: fullGateCReport.metrics.phase5_handoff_usable_rate,
    },
  },
  protected_baselines: protectedBaselines,
  validation: {
    schema_compiles: true,
    example_count: exampleManifest.examples.length,
    examples_valid: true,
    deterministic_report: true,
  },
  safety: {
    extractor_modified: false,
    accuracy_improvement_claimed: false,
    frozen_corpus_modified: false,
    full_gate_c_report_modified: false,
    p0_official_report_modified: false,
    production_db_touched: false,
    migration_modified: false,
    external_llm_called: false,
    automatic_publish_enabled: false,
    phase5_implemented: false,
    pr_created: false,
  },
  gate_status: { p0_remediation_contract: "PASS", full_schema_gate_c: "HOLD", phase5: "HOLD" },
};

const violationRows = report.current_extractor_contract_violations.map((item) => `| ${item.type} | ${item.count} | ${item.case_ids.join(", ") || "none"} | ${item.severity} |`).join("\n");
const fieldRows = fieldContract.map((item) => `| ${item.field} | ${item.type} | ${item.required ? "yes" : "no"} | ${item.existing_relationship} | ${item.handoff_scope} |`).join("\n");
const compatibilityRows = COMPATIBILITY_PLAN.map((item) => `| ${item.field} | ${item.classification} | ${item.plan} |`).join("\n");
const markdown = `# Engine Phase 4 P0 remediation contract design

## Decision

**PASS** — the contract, responsibility boundary, compatibility path, fixtures, and baseline diagnostics are complete enough to direct a separate deterministic-extractor remediation task. This is a design decision only. Full-schema Gate C and Phase 5 remain **HOLD**.

No extractor rule, production flow, database, migration, UI, LLM call, or automatic-publication behavior changed. The current violations below are a baseline, not an accuracy improvement.

## Current-code findings

${CURRENT_CODE_FINDINGS.map((item) => `- **${item.id}:** ${item.finding} (${item.code_refs.join(", ")})`).join("\n")}

## Responsibility classification

${Object.entries(RESPONSIBILITY_CLASSIFICATION).map(([owner, items]) => `### ${owner}\n\n${items.map((item) => `- ${item}`).join("\n")}`).join("\n\n")}

## Next extractor remediation scope

### Included

${NEXT_EXTRACTOR_SCOPE.included.map((item) => `- ${item}`).join("\n")}

### Excluded

${NEXT_EXTRACTOR_SCOPE.excluded.map((item) => `- ${item}`).join("\n")}

Every included work item has machine-readable current/desired behavior, code targets, auto/stop conditions, fixtures, and completion criteria in the JSON design report.

## Output contract

The nine opportunity concepts remain ${P0_OPPORTUNITY_FIELDS.join(", ")}. There is no standalone timezone field. Posting organization, document kind, publishability, opportunity kind, review state, and evidence are safety/provenance fields outside the 9 × 24 denominator.

| Field | Type | Required | Existing relationship | Handoff |
| --- | --- | --- | --- | --- |
${fieldRows}

## Cross-field safety

${report.cross_field_safety_rules.map((item) => `- ${item}`).join("\n")}

## Review enforcement

- Unsafe statuses: ${FIELD_REVIEW_POLICY.unsafe_statuses.join(", ")}; each requires review and a field-specific reason.
- Terminal \`not_applicable\` is exempt.
- \`not_found\` requires review for: ${Object.keys(FIELD_REVIEW_POLICY.not_found_requires_review).join(", ")}.
- Clear \`not_found\` may remain no-review for: ${FIELD_REVIEW_POLICY.not_found_without_review_allowed.join(", ")}.

## Amount design

- First remediation auto-kinds: ${FIRST_REMEDIATION_AMOUNT_KINDS.join(", ")}.
- Structure-only complex kinds: ${COMPLEX_AMOUNT_KINDS.join(", ")}.
- Rich Phase 4 values preserve display/source text, currency, exact/min/max/percentage, period, cap basis, labels, components/installments, and evidence. Simple kinds reject incompatible scalar/component properties.
- Legacy compatibility projects only reviewed \`display\` into \`support_amount_text\`; rich persistence needs a future Phase 5 migration.

## Compatibility plan

| Field | Classification | Plan |
| --- | --- | --- |
${compatibilityRows}

The existing administrator workflow remains LLM-assisted draft followed by explicit form review. The Phase 4 contract can run as a sidecar/adapter without changing \`NoticeDraft\`, the admin UI, or the database. A later integration may prefill legacy fields only after contract validation while retaining admin confirmation.

## Current extractor contract violations

| Type | Count | Representative case IDs | Severity |
| --- | ---: | --- | --- |
${violationRows}

These counts are deterministic over the existing 24-case frozen input and current extractor. A zero count is preserved as evidence that a safety behavior is currently working; it is not omitted.

## Completion contract for the next remediation

The next implementation is complete only when all ${exampleManifest.examples.length} contract fixtures remain valid, mutation tests reject unsafe combinations, the diagnosed lifecycle and verified suppression defects are eliminated without exposing terminal documents, evidence references remain complete, existing Gate B/C/P0 regressions pass, and all production/Phase 5 safety flags remain false.

## Gate status

- P0 remediation contract: PASS
- Full-schema Gate C: HOLD
- Phase 5: HOLD
`;

write("fixtures/engine-phase-4-p0-remediation-contract/examples.json", `${JSON.stringify(exampleManifest, null, 2)}\n`);
write("reports/engine-phase-4-p0-remediation-design.json", `${JSON.stringify(report, null, 2)}\n`);
write("reports/engine-phase-4-p0-remediation-design.md", markdown);
console.log(`examples=${exampleManifest.examples.length}`);
console.log(`violations=${currentViolations.reduce((sum, item) => sum + item.count, 0)}`);
console.log("ENGINE PHASE 4 P0 REMEDIATION DESIGN BUILDER: PASS");

export { report };
