import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateCandidateHandoffGate } from "../lib/engine-phase-4/candidate-handoff-gate.mjs";
import { buildCandidateHandoffReadModel } from "../lib/engine-phase-4/candidate-handoff-read-model-adapter.mjs";
import { createSchemaValidators, validateCanonicalRecord } from "../lib/engine-phase-4/contracts.mjs";
import { buildSourceIdentityIndex, resolveSourceKey } from "./resolve-crawler-source-identities.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readText = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const read = (relativePath) => JSON.parse(readText(relativePath));
const write = (relativePath, value) => fs.writeFileSync(path.join(root, relativePath), value);
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const deepEqual = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export const HANDOFF_DRY_RUN_VERSION = "engine-phase-4-candidate-handoff-dry-run/v1";
export const HANDOFF_FIXED_TIMESTAMP = "2026-07-20T00:00:00+09:00";
export const HANDOFF_PROTECTED_SHA256 = Object.freeze({
  "reports/engine-phase-4-gate-c-remediated.json": "3f7bd0fe219280fac0addb7666b547c4e75822615807478aaaab8150696034e7",
  "lib/engine-phase-4/deterministic-extractor.mjs": "a6f7cc4134f593da2e52d93e86e012c96f5f5a6b1363230f1410148d54bbc024",
  "lib/engine-phase-4/p0-remediated-extractor.mjs": "94b915f735d4282ac31476b566c419812a84186ff8184bc9d1db67c26efd18ae",
  "lib/engine-phase-4/contracts.mjs": "93baa60ccf0f6f5b0986283276ffdfb157435ed4a89ca64d6582a483da28c91d",
  "schemas/engine/phase-4-canonical-scholarship.schema.json": "c21c94924a376c047c67748b0ece28dac780cc4d79e7eac19b566a385ab48d84",
  "reports/engine-phase-4-gate-c-representative-evaluation.json": "1ff1e39ead03c1bc1a4cf5f2ad927eb20715f07104dc708db3c7aa796cd0b160",
  "reports/engine-phase-4-gate-c-p0.json": "912dd110ed687433151d4f5dce985d152135f4e699a1f31d09e26666d71fe384",
  "fixtures/engine-phase-4-representative-gold/cases.json": "f61b5be60b00a949ea0d0ec68a7585fdaffe42cc3f13472fd0538555e0c757fd",
  "fixtures/engine-phase-4-representative-gold/adjudication/adjudication-decisions.json": "1c6be4798a279639bf5e44ca5ab34ab597e61a5272d854fcbaab020b726b62f4",
  "fixtures/engine-phase-4-gate-c-p0/p0-adjudication-overlay.json": "9307d96e5e5bee1b0906cbd166fd4c4910ae34b9038be76cf89a2611fdf319f7",
  "fixtures/engine-phase-4-gate-c-p0/production-source-review.json": "e92c8869f2779e6647cd8d06425a25d7c98466e428fbc0bd8a79cac8bad42738",
  "docs/crawler-normalized-graph-adapter-contract.md": "ddd490866ac0fe0a5f482d401cee2f3aae190be95e9c4e755f85cf7c8dd6266b",
  "scripts/resolve-crawler-source-identities.mjs": "c0f205e19eba979ff7fc8b8fd08900de6f14893193a32adc6b4d811579d1fe89",
  "scripts/build-scholarship-review-read-model.mjs": "e5d765d959bbebc61b15dac00c42eb6b5ad02ab548bfe60bd4cef1fda9933d8f",
  "scripts/validate-integration-foundation.mjs": "c41eb7bb3fb10623ac4b85fea2968545e6249fea00bf9f723c9f7a2e2b56d68a",
  "data/notice-sources.csv": "24fda6904e47fffae42ca2936177b2b4d351faac4d5cf13aac6f03efc1172f07",
  "fixtures/integration-foundation/source-identity-mapping-snapshot.json": "32abc2a70c3ae2d4207e936e734f8ed2e42813077f2a7c3f555def7b38876f8c",
});

function protectedFiles() {
  return Object.fromEntries(Object.entries(HANDOFF_PROTECTED_SHA256).map(([relativePath, expected]) => {
    const actual = sha256(readText(relativePath));
    if (actual !== expected) throw new Error(`Protected file changed: ${relativePath} expected=${expected} actual=${actual}`);
    return [relativePath, { sha256: actual, unchanged: true }];
  }));
}

function opportunityKind(record) {
  const benefits = record.fields.benefit_type.normalized_value ?? [];
  return benefits.some((value) => ["activity_scholarship", "work_scholarship"].includes(value)) ? "paid_student_activity" : "scholarship";
}

function unsupportedPresentCount(record) {
  return Object.values(record.fields).filter((field) => field.value_status === "present"
    && (!field.evidence_refs?.length || field.inference?.is_inferred === true)).length;
}

function evidenceIntegrity(validation) {
  return !validation.errors.some((error) => ["missing_evidence_ref", "duplicate_evidence_id"].includes(error.code) || error.code.startsWith("evidence_"));
}

function evaluateOne({ record, caseResult, sourceResolution, validators }) {
  const validation = validateCanonicalRecord(record, validators);
  const terminal = ["result_announcement", "general_guidance", "information_session"].includes(record.classification.document_kind);
  const relationRequired = record.classification.document_kind === "correction_notice";
  const representationLossCount = caseResult.conversion_diagnostics.length;
  const handoff = evaluateCandidateHandoffGate({
    record,
    sourceResolution,
    terminalNonOpportunity: terminal,
    relationResolutionRequired: relationRequired,
    opportunityKind: opportunityKind(record),
    canonicalSchemaValid: validation.valid,
    evidenceIntegrityValid: evidenceIntegrity(validation),
    unsupportedPresentCount: unsupportedPresentCount(record),
    representationLossRiskCount: representationLossCount,
  });
  return { validation, terminal, relationRequired, representationLossCount, handoff };
}

export function buildCandidateHandoffDryRun() {
  const fullGateC = read("reports/engine-phase-4-gate-c-remediated.json");
  const validators = createSchemaValidators();
  const sourceIndex = buildSourceIdentityIndex();
  const results = fullGateC.records.map((record, index) => {
    const caseResult = fullGateC.case_results[index];
    const sourceKey = record.source_notice_identity.source_key_snapshot;
    const sourceResolution = resolveSourceKey(sourceKey, sourceIndex);
    const evaluated = evaluateOne({ record, caseResult, sourceResolution, validators });
    const readModel = buildCandidateHandoffReadModel({
      record,
      sourceResolution,
      handoffResult: evaluated.handoff,
      p0Extensions: caseResult.p0_extensions,
      conversionDiagnostics: caseResult.conversion_diagnostics,
      fullGateCIdentity: {
        report_version: fullGateC.report_version,
        report_sha256: HANDOFF_PROTECTED_SHA256["reports/engine-phase-4-gate-c-remediated.json"],
        evaluation_record_kind: fullGateC.evaluation_record_kind,
      },
      fixedTimestamp: HANDOFF_FIXED_TIMESTAMP,
    });
    return {
      case_id: caseResult.case_id,
      source_key: sourceKey,
      document_kind: record.classification.document_kind,
      publishable: record.classification.is_recruitment,
      terminal: evaluated.terminal,
      relation_resolution_required: evaluated.relationRequired,
      opportunity_kind: opportunityKind(record),
      source_resolution: sourceResolution.resolution_status,
      source_id: sourceResolution.source_id,
      program_identity_status: record.program_identity_candidate.resolution_status,
      cycle_identity_status: record.recruitment_cycle_identity_candidate.resolution_status,
      handoff_status: evaluated.handoff.handoff_status,
      candidate_output_created: evaluated.handoff.candidate_output_created,
      clean_apply_allowed: evaluated.handoff.clean_apply_allowed,
      reason_codes: evaluated.handoff.reason_codes,
      canonical_key: readModel?.canonical_key ?? null,
      evidence_count: record.evidence.length,
      canonical_schema_valid: evaluated.validation.valid,
      evidence_integrity_valid: evidenceIntegrity(evaluated.validation),
      unsupported_present_count: unsupportedPresentCount(record),
      representation_loss_diagnostic_count: evaluated.representationLossCount,
      read_model: readModel,
    };
  });

  const resultById = new Map(results.map((item) => [item.case_id, item]));
  const positiveBase = structuredClone(fullGateC.records.find((record) => record.source_notice_identity.notice_id === "notice_p4c_019_uic_legacy"));
  const positiveSource = resolveSourceKey(positiveBase.source_notice_identity.source_key_snapshot, sourceIndex);
  const refs = positiveBase.evidence.slice(0, 2).map((item) => item.evidence_id);
  positiveBase.program_identity_candidate = {
    ...positiveBase.program_identity_candidate,
    resolution_status: "proposed",
    provider_normalized: "Positive Path Provider",
    name_normalized: "Positive Path Scholarship",
    evidence_refs: [refs[0]],
  };
  positiveBase.recruitment_cycle_identity_candidate = {
    ...positiveBase.recruitment_cycle_identity_candidate,
    resolution_status: "proposed",
    cycle_label: "2025-fall-positive-path",
    evidence_refs: [refs[1] ?? refs[0]],
  };
  positiveBase.classification.is_recruitment = true;
  positiveBase.review = { required: false, reason_codes: [], automatic_publish_allowed: false, notification_allowed: false };
  positiveBase.validation = { status: "valid", errors: [], warnings: [] };
  const positiveValidation = validateCanonicalRecord(positiveBase, validators);
  const positiveResult = evaluateCandidateHandoffGate({
    record: positiveBase,
    sourceResolution: positiveSource,
    terminalNonOpportunity: false,
    relationResolutionRequired: false,
    opportunityKind: "scholarship",
    canonicalSchemaValid: positiveValidation.valid,
    evidenceIntegrityValid: evidenceIntegrity(positiveValidation),
    unsupportedPresentCount: unsupportedPresentCount(positiveBase),
    representationLossRiskCount: 0,
  });

  const automaticMutation = structuredClone(positiveBase);
  automaticMutation.review.automatic_publish_allowed = true;
  const automaticPublishMutationResult = evaluateCandidateHandoffGate({
    record: automaticMutation,
    sourceResolution: positiveSource,
    terminalNonOpportunity: false,
    relationResolutionRequired: false,
    opportunityKind: "scholarship",
    canonicalSchemaValid: positiveValidation.valid,
    evidenceIntegrityValid: evidenceIntegrity(positiveValidation),
    unsupportedPresentCount: 0,
    representationLossRiskCount: 0,
  });
  const negativePaths = {
    terminal_result_excluded: resultById.get("p4c_004_national_work_result").handoff_status === "excluded_non_opportunity",
    correction_deferred: resultById.get("p4c_003_hope_ladder_extension").handoff_status === "deferred_relation_resolution",
    unknown_document_blocked: resultById.get("p4c_013_history_growth_table").handoff_status === "blocked",
    missing_source_blocked: resultById.get("p4c_001_student_affairs_special").handoff_status === "blocked",
    unresolved_identity_needs_review: resultById.get("p4c_011_cau_innovation_hwp").handoff_status === "needs_review",
    representation_loss_needs_review: resultById.get("p4c_012_history_central_love").handoff_status === "needs_review"
      && resultById.get("p4c_012_history_central_love").reason_codes.includes("representation_loss_risk"),
    automatic_publish_mutation_blocked: automaticPublishMutationResult.handoff_status === "blocked"
      && automaticPublishMutationResult.reason_codes.includes("automatic_publication_enabled"),
  };

  const statusCount = (status) => results.filter((item) => item.handoff_status === status).length;
  const standaloneScope = results.filter((item) => item.document_kind === "recruitment_notice" && !item.terminal && !item.relation_resolution_required
    && ["scholarship", "paid_student_activity"].includes(item.opportunity_kind)).length;
  const metrics = {
    input_case_count: results.length,
    standalone_opportunity_scope_count: standaloneScope,
    excluded_non_opportunity_count: statusCount("excluded_non_opportunity"),
    deferred_relation_resolution_count: statusCount("deferred_relation_resolution"),
    blocked_count: statusCount("blocked"),
    needs_review_count: statusCount("needs_review"),
    clean_count: statusCount("clean"),
    candidate_output_count: results.filter((item) => item.candidate_output_created).length,
    phase5_auto_eligible_count: results.filter((item) => item.clean_apply_allowed).length,
    source_resolved_count: results.filter((item) => item.source_resolution === "resolved").length,
    source_missing_count: results.filter((item) => item.source_resolution === "missing").length,
    source_ambiguous_count: results.filter((item) => item.source_resolution === "ambiguous").length,
    program_identity_unresolved_count: results.filter((item) => item.program_identity_status === "unresolved").length,
    cycle_identity_unresolved_count: results.filter((item) => item.cycle_identity_status === "unresolved").length,
    schema_invalid_count: results.filter((item) => !item.canonical_schema_valid).length,
    evidence_invalid_count: results.filter((item) => !item.evidence_integrity_valid).length,
    unsupported_present_count: results.reduce((sum, item) => sum + item.unsupported_present_count, 0),
    representation_loss_risk_count: fullGateC.production_shadow_risks.representation_loss_risk_count,
    canonical_conversion_representation_gap_count: results.reduce((sum, item) => sum + item.representation_loss_diagnostic_count, 0),
    candidate_write_plan_count: 0,
    database_write_count: 0,
    automatic_publish_count: 0,
    notification_count: 0,
  };
  const reconciliationCount = metrics.excluded_non_opportunity_count + metrics.deferred_relation_resolution_count
    + metrics.blocked_count + metrics.needs_review_count + metrics.clean_count;
  const positiveCleanPathPassed = positiveValidation.valid
    && positiveResult.handoff_status === "clean"
    && positiveResult.candidate_output_created
    && positiveResult.clean_apply_allowed
    && !positiveResult.automatic_publish_allowed
    && !positiveResult.notification_allowed;
  const limitedEntryPass = reconciliationCount === 24
    && results.filter((item) => ["excluded_non_opportunity", "deferred_relation_resolution", "blocked"].includes(item.handoff_status)).every((item) => !item.candidate_output_created)
    && results.filter((item) => item.handoff_status === "needs_review").every((item) => item.candidate_output_created && !item.clean_apply_allowed)
    && positiveCleanPathPassed
    && Object.values(negativePaths).every(Boolean)
    && metrics.database_write_count === 0 && metrics.automatic_publish_count === 0 && metrics.notification_count === 0;

  return {
    report_version: HANDOFF_DRY_RUN_VERSION,
    status: limitedEntryPass ? "LIMITED ENTRY PASS" : "HOLD",
    generated_at: HANDOFF_FIXED_TIMESTAMP,
    wall_clock_used: false,
    input: {
      path: "reports/engine-phase-4-gate-c-remediated.json",
      sha256: HANDOFF_PROTECTED_SHA256["reports/engine-phase-4-gate-c-remediated.json"],
      report_version: fullGateC.report_version,
      evaluation_record_kind: fullGateC.evaluation_record_kind,
    },
    denominator_policy: { total_case_count: 24, standalone_opportunity_scope_count: standaloneScope, non_opportunity_and_relation_cases_retained: true },
    metrics,
    reconciliation: { reconciled_count: reconciliationCount, expected_count: 24, valid: reconciliationCount === 24 },
    positive_clean_path: { included_in_actual_metrics: false, schema_valid: positiveValidation.valid, result: positiveResult, passed: positiveCleanPathPassed },
    required_negative_paths: negativePaths,
    deterministic_rerun_match: null,
    results,
    review_candidates: results.filter((item) => item.read_model).map((item) => item.read_model),
    role_boundary: {
      deterministic: ["strong document-kind signals", "explicit application window", "simple amount", "explicit organization role", "URL and provenance", "schema/evidence validation", "fail-close and handoff gate"],
      llm_assisted_draft_candidates: ["provider versus posting organization", "institution/campus interpretation", "complex amount structure", "multi-program separation", "correction relationship interpretation", "complex eligibility and table meaning"],
      admin_review: ["identity approval", "relation linking", "representation-loss confirmation", "complex amount and institution role confirmation", "final publication approval"],
      llm_output_policy: "review draft only; never automatic publication evidence",
    },
    decisions: {
      deterministic_p0_safety: "PASS",
      deterministic_p0_completeness: "CONDITIONAL PASS",
      full_gate_c_safety: "PASS",
      full_field_automation_completeness: "CONDITIONAL PASS",
      candidate_handoff_safety: limitedEntryPass ? "PASS" : "HOLD",
      limited_phase5_entry: limitedEntryPass ? "PASS" : "HOLD",
    },
    gate_status: {
      official_p0_reevaluation: fullGateC.gate_status.official_p0_reevaluation,
      full_gate_c_remediated_reevaluation: fullGateC.decision,
      candidate_handoff: limitedEntryPass ? "PASS" : "HOLD",
      phase4_closeout: limitedEntryPass ? "PASS" : "HOLD",
      limited_phase5_entry: limitedEntryPass ? "PASS" : "HOLD",
      phase5_scope: limitedEntryPass ? "read-only, local/non-production, review-assisted, no automatic publication, no production write" : "HOLD",
    },
    recommended_next_step: limitedEntryPass
      ? "Begin limited Phase 5 implementation within the declared read-only, local/non-production, review-assisted boundary."
      : "Correct the single reported closeout blocker before Phase 5 entry.",
    protected_files: protectedFiles(),
    safety: {
      database_accessed: false,
      database_write_count: 0,
      candidate_persisted: false,
      review_event_created: false,
      migration_modified: false,
      generated_types_modified: false,
      admin_ui_modified: false,
      external_llm_called: false,
      automatic_publish_enabled: false,
      notification_sent: false,
      pr_created: false,
      main_merged: false,
    },
  };
}

export const report = buildCandidateHandoffDryRun();
const rerun = buildCandidateHandoffDryRun();
report.deterministic_rerun_match = deepEqual(report, rerun);

if (!report.deterministic_rerun_match) {
  report.status = "HOLD";
  report.decisions.candidate_handoff_safety = "HOLD";
  report.decisions.limited_phase5_entry = "HOLD";
  report.gate_status.candidate_handoff = "HOLD";
  report.gate_status.phase4_closeout = "HOLD";
  report.gate_status.limited_phase5_entry = "HOLD";
  report.gate_status.phase5_scope = "HOLD";
}
const rows = report.results.map((item) => `| ${item.case_id} | ${item.document_kind} | ${item.source_resolution} | ${item.program_identity_status}/${item.cycle_identity_status} | ${item.handoff_status} | ${item.candidate_output_created} | ${item.clean_apply_allowed} |`).join("\n");
const markdown = `# Engine Phase 4 — Pre-Phase 5 closeout

## Status

**${report.status}**

This is one integrated closeout: the actual 24-case local candidate handoff dry-run and the final limited Phase 5 entry decision. It performs no database access, persistence, review event, publication, notification, migration, UI change, or external LLM call.

## Handoff denominator

- Total cases: ${report.metrics.input_case_count}
- Standalone opportunity scope: ${report.metrics.standalone_opportunity_scope_count}
- Excluded non-opportunities: ${report.metrics.excluded_non_opportunity_count}
- Deferred relations: ${report.metrics.deferred_relation_resolution_count}
- Blocked: ${report.metrics.blocked_count}
- Needs review: ${report.metrics.needs_review_count}
- Clean: ${report.metrics.clean_count}
- Reconciliation: ${report.reconciliation.reconciled_count}/${report.reconciliation.expected_count}

Actual clean count zero is expected because all historical hybrid identity candidates remain unresolved. The clean rule was not weakened.

## Source, identity, and output safety

- Source resolved/missing/ambiguous: ${report.metrics.source_resolved_count}/${report.metrics.source_missing_count}/${report.metrics.source_ambiguous_count}
- Program/cycle unresolved: ${report.metrics.program_identity_unresolved_count}/${report.metrics.cycle_identity_unresolved_count}
- Candidate outputs: ${report.metrics.candidate_output_count}
- Phase 5 auto-eligible: ${report.metrics.phase5_auto_eligible_count}
- Schema/evidence invalid: ${report.metrics.schema_invalid_count}/${report.metrics.evidence_invalid_count}
- Unsupported present: ${report.metrics.unsupported_present_count}
- Production representation-loss risk: ${report.metrics.representation_loss_risk_count}
- Canonical conversion representation gaps: ${report.metrics.canonical_conversion_representation_gap_count}
- Write plan/DB write/publish/notification: ${report.metrics.candidate_write_plan_count}/${report.metrics.database_write_count}/${report.metrics.automatic_publish_count}/${report.metrics.notification_count}

## Gate proof

- Positive in-memory clean path: ${report.positive_clean_path.passed ? "PASS" : "FAIL"}; excluded from actual metrics
- Required negative paths: ${Object.values(report.required_negative_paths).every(Boolean) ? "PASS" : "FAIL"}
- Deterministic rerun: ${report.deterministic_rerun_match ? "PASS" : "FAIL"}

| Case | Kind | Source | Program/cycle | Handoff | Candidate | Clean apply |
| --- | --- | --- | --- | --- | --- | --- |
${rows}

## Role boundary

- Deterministic: ${report.role_boundary.deterministic.join("; ")}.
- Optional LLM-assisted review draft: ${report.role_boundary.llm_assisted_draft_candidates.join("; ")}.
- Administrator review: ${report.role_boundary.admin_review.join("; ")}.

LLM output, if implemented later, is a review draft only and never evidence for automatic publication.

## Final decisions

- Deterministic P0 safety: ${report.decisions.deterministic_p0_safety}
- Deterministic P0 completeness: ${report.decisions.deterministic_p0_completeness}
- Full Gate C safety: ${report.decisions.full_gate_c_safety}
- Full-field automation completeness: ${report.decisions.full_field_automation_completeness}
- Candidate handoff safety: ${report.decisions.candidate_handoff_safety}
- Limited Phase 5 entry: ${report.decisions.limited_phase5_entry}

Limited Phase 5 is restricted to read-only, local/non-production, review-assisted behavior with no automatic publication or production write. No additional readiness stage is required.

## Recommended next step

${report.recommended_next_step}
`;
write("reports/engine-phase-4-candidate-handoff-dry-run.json", `${JSON.stringify(report, null, 2)}\n`);
write("reports/engine-phase-4-candidate-handoff-dry-run.md", `${markdown.trimEnd()}\n`);
console.log(`status=${report.status}`);
console.log(`cases=${report.metrics.input_case_count}`);
console.log(`standalone_scope=${report.metrics.standalone_opportunity_scope_count}`);
console.log(`excluded=${report.metrics.excluded_non_opportunity_count}`);
console.log(`deferred=${report.metrics.deferred_relation_resolution_count}`);
console.log(`blocked=${report.metrics.blocked_count}`);
console.log(`needs_review=${report.metrics.needs_review_count}`);
console.log(`clean=${report.metrics.clean_count}`);
console.log(`candidate_outputs=${report.metrics.candidate_output_count}`);
console.log(`LIMITED PHASE 5 ENTRY: ${report.decisions.limited_phase5_entry}`);
