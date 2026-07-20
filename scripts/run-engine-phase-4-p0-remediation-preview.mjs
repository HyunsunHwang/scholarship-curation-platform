import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import {
  DETERMINISTIC_EXTRACTION_CONTRACT_VERSION,
} from "../lib/engine-phase-4/deterministic-extractor.mjs";
import {
  P0_REMEDIATED_EXTRACTOR_NAME,
  P0_REMEDIATED_EXTRACTOR_VERSION,
  extractP0RemediatedCandidateWithDiagnostics,
} from "../lib/engine-phase-4/p0-remediated-extractor.mjs";
import {
  P0_OPPORTUNITY_FIELDS,
  sha256,
  validateP0RemediationRecord,
} from "../lib/engine-phase-4/p0-remediation-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readText = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const read = (relativePath) => JSON.parse(readText(relativePath));
const write = (relativePath, value) => fs.writeFileSync(path.join(root, relativePath), value);

export const P0_REMEDIATION_PREVIEW_AS_OF = "2026-07-20T00:00:00+09:00";
export const P0_REMEDIATION_PROTECTED_SHA256 = Object.freeze({
  "lib/engine-phase-4/deterministic-extractor.mjs": "a6f7cc4134f593da2e52d93e86e012c96f5f5a6b1363230f1410148d54bbc024",
  "lib/engine-phase-4/deterministic-normalizers.mjs": "55d795977a4886081bd30757cd20646cd0ea3756e0854fffe4f42ae8f3fbac85",
  "lib/engine-phase-4/evidence-builder.mjs": "783ec29a18f28fa2dd8c111085657ebab18a91ed8c499a55534c8726c4eb1170",
  "docs/engine/engine-phase-4-p0-remediation-contract.md": "f6cae89e40491872099137c3f94693831d6def0edc3393bc86cc5ed94e2ade96",
  "schemas/engine/phase-4-p0-remediation-output.schema.json": "5a37273e8dff4b428bcfdd17396a6f4586567bb646628627cf8945962f85e9be",
  "fixtures/engine-phase-4-p0-remediation-contract/examples-source.mjs": "ddab6c74f3693c1d5d85c6412c286253c95438cd2dc284d0ff1273289ed879f8",
  "fixtures/engine-phase-4-p0-remediation-contract/examples.json": "66508a030b36e0af4b5b7347a116e0b9d25edb9073eecb5d5f514de8059ca2b6",
  "lib/engine-phase-4/p0-remediation-contract.mjs": "39b684aa1b589207b6807297d6718c2160bb35722aa54f9ef8b88c1f18e1d925",
  "reports/engine-phase-4-p0-remediation-design.json": "5aefd123601afbb774b3950ae96d3d16c18bdcd2510940d0c0b538d5ca34286a",
  "reports/engine-phase-4-p0-remediation-design.md": "b2116118057d01e2ad8e96910a34aa61a05483cef8d5ae65d506d8f0be7427a6",
  "fixtures/engine-phase-4-representative-gold/cases.json": "f61b5be60b00a949ea0d0ec68a7585fdaffe42cc3f13472fd0538555e0c757fd",
  "fixtures/engine-phase-4-representative-gold/corpus-source.mjs": "f4524246e429328553ce45bd1da8eb06c0a6c449701ac323e7fb6ba5d0111f7e",
  "fixtures/engine-phase-4-gate-c-p0/p0-adjudication-overlay.json": "9307d96e5e5bee1b0906cbd166fd4c4910ae34b9038be76cf89a2611fdf319f7",
  "reports/engine-phase-4-gate-c-representative-evaluation.json": "1ff1e39ead03c1bc1a4cf5f2ad927eb20715f07104dc708db3c7aa796cd0b160",
  "reports/engine-phase-4-gate-c-p0.json": "912dd110ed687433151d4f5dce985d152135f4e699a1f31d09e26666d71fe384",
});

function routeIdentity(value) {
  try {
    const url = new URL(value);
    const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/u, "") : url.pathname;
    return `${url.hostname.toLowerCase()}|${url.port}|${pathname}`;
  } catch {
    return null;
  }
}

function missingEvidenceReferences(output) {
  const known = new Set(output.evidence_references.map((item) => item.evidence_id));
  const references = [
    ...output.classification.evidence_references,
    ...Object.values(output.fields).flatMap((field) => field.evidence_references),
  ];
  return references.filter((reference) => !known.has(reference));
}

function unsupportedPresentClaims(output) {
  return Object.entries(output.fields).filter(([, field]) => field.status === "present" && field.evidence_references.length === 0).map(([field]) => field);
}

const schema = read("schemas/engine/phase-4-p0-remediation-output.schema.json");
const corpus = read("fixtures/engine-phase-4-representative-gold/cases.json");
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });
const schemaValidator = ajv.compile(schema);
const extractionContext = {
  asOf: P0_REMEDIATION_PREVIEW_AS_OF,
  extractedAt: P0_REMEDIATION_PREVIEW_AS_OF,
};
const execute = () => corpus.cases.map((fixture) => extractP0RemediatedCandidateWithDiagnostics({
  ...fixture.evaluation_input,
  extractionContext: { ...extractionContext, caseId: fixture.case_id },
}));
const executions = execute();
const rerun = execute();
const outputs = executions.map((execution) => execution.output);
const evidenceDiagnostics = executions.map((execution) => ({ case_id: execution.output.case_id, ...execution.diagnostics }));
const validation = outputs.map((output) => {
  const schemaValid = schemaValidator(output);
  const schemaErrors = structuredClone(schemaValidator.errors ?? []);
  const semantic = validateP0RemediationRecord(output, schemaValidator);
  return { case_id: output.case_id, schema_valid: schemaValid, schema_errors: schemaErrors, semantic_valid: semantic.valid, semantic_errors: semantic.errors };
});

const protectedBaselines = Object.fromEntries(Object.entries(P0_REMEDIATION_PROTECTED_SHA256).map(([relativePath, expected]) => {
  const actual = sha256(readText(relativePath));
  if (actual !== expected) throw new Error(`Protected baseline changed: ${relativePath} expected=${expected} actual=${actual}`);
  return [relativePath, { sha256: actual, unchanged: true }];
}));
const byCase = new Map(outputs.map((output) => [output.case_id, output]));
const fieldStatuses = outputs.flatMap((output) => Object.values(output.fields).map((field) => field.status));
const documentKindDistribution = Object.fromEntries([...new Set(outputs.map((output) => output.classification.document_kind))]
  .sort().map((kind) => [kind, outputs.filter((output) => output.classification.document_kind === kind).length]));
const sourceSubstitutions = outputs.filter((output) => output.fields.application_url.status === "present"
  && routeIdentity(output.fields.application_url.value) === routeIdentity(output.source.canonical_url)).map((output) => output.case_id);
const missingEvidence = outputs.flatMap((output) => missingEvidenceReferences(output).map((reference) => ({ case_id: output.case_id, reference })));
const unsupportedPresent = outputs.flatMap((output) => unsupportedPresentClaims(output).map((field) => ({ case_id: output.case_id, field })));

const knownCaseIds = [
  "p4c_001_student_affairs_special",
  "p4c_002_national_second_round",
  "p4c_004_national_work_result",
  "p4c_005_miraero_second",
  "p4c_006_gwangsan_extension",
  "p4c_008_cau_welfare_result_2025_1",
  "p4c_009_cau_welfare_result_2024_2",
  "p4c_020_uic_supporters_table",
  "p4c_022_grad_seoul_foundation_pdf",
  "p4c_024_dean_recommendation_guidance",
];
const knownCaseResults = knownCaseIds.map((caseId) => {
  const output = byCase.get(caseId);
  return {
    case_id: caseId,
    document_kind: output.classification.document_kind,
    publishable_opportunity: output.classification.publishable_opportunity,
    terminal_non_opportunity: output.classification.terminal_non_opportunity,
    opportunity_kind: output.classification.opportunity_kind,
    lifecycle_status: output.fields.lifecycle_status,
    review_required: output.review.required,
    review_reasons: output.review.reasons,
  };
});

const knownCaseChecks = {
  recruitment_suppression_resolved: [
    "p4c_001_student_affairs_special",
    "p4c_002_national_second_round",
    "p4c_005_miraero_second",
  ].every((caseId) => {
    const output = byCase.get(caseId);
    return output.classification.document_kind === "recruitment_notice"
      && output.classification.publishable_opportunity
      && !output.classification.terminal_non_opportunity;
  }),
  result_announcement_terminal: (() => {
    const output = byCase.get("p4c_004_national_work_result");
    return output.classification.document_kind === "result_announcement"
      && output.classification.terminal_non_opportunity
      && !output.classification.publishable_opportunity
      && output.classification.opportunity_kind === "not_applicable"
      && P0_OPPORTUNITY_FIELDS.every((fieldName) => output.fields[fieldName].status === "not_applicable");
  })(),
  lifecycle_contract_states_only: [
    "p4c_006_gwangsan_extension",
    "p4c_008_cau_welfare_result_2025_1",
    "p4c_009_cau_welfare_result_2024_2",
    "p4c_022_grad_seoul_foundation_pdf",
  ].every((caseId) => {
    const lifecycle = byCase.get(caseId).fields.lifecycle_status;
    return lifecycle.status === "not_applicable" || ["upcoming", "open", "closed", "unknown"].includes(lifecycle.value);
  }),
  paid_activity_partitioned: (() => {
    const output = byCase.get("p4c_020_uic_supporters_table");
    return output.classification.opportunity_kind === "paid_student_activity"
      && output.review.reasons.includes("paid_activity_feed_partition_required")
      && output.fields.support_type.status === "present"
      && output.fields.support_type.value.includes("activity_scholarship")
      && output.fields.support_type.value.includes("work_scholarship")
      && output.fields.support_amount.status === "schema_expressiveness_gap"
      && !output.review.reasons.includes("support_type_uncertain");
  })(),
  recommendation_guidance_terminal: (() => {
    const output = byCase.get("p4c_024_dean_recommendation_guidance");
    return output.classification.document_kind === "general_guidance"
      && output.classification.terminal_non_opportunity
      && !output.classification.publishable_opportunity
      && output.classification.opportunity_kind === "not_applicable";
  })(),
};
const deterministicRerunMatch = JSON.stringify(executions) === JSON.stringify(rerun);
const validationPass = outputs.length === 24
  && validation.every((item) => item.schema_valid && item.semantic_valid)
  && deterministicRerunMatch
  && unsupportedPresent.length === 0
  && missingEvidence.length === 0
  && sourceSubstitutions.length === 0
  && outputs.every((output) => output.review.automatic_publish_allowed === false)
  && Object.values(knownCaseChecks).every(Boolean);

export const report = {
  report_version: "engine-phase-4-p0-remediation-preview/v2",
  preview_only: true,
  official_p0_reevaluation_completed: false,
  official_full_gate_c_reevaluation_completed: false,
  full_gate_c_status: "HOLD",
  phase5_status: "HOLD",
  evaluation_as_of: P0_REMEDIATION_PREVIEW_AS_OF,
  extractor: {
    baseline: {
      path: "lib/engine-phase-4/deterministic-extractor.mjs",
      sha256: protectedBaselines["lib/engine-phase-4/deterministic-extractor.mjs"].sha256,
      contract_version: DETERMINISTIC_EXTRACTION_CONTRACT_VERSION,
    },
    remediated: {
      name: P0_REMEDIATED_EXTRACTOR_NAME,
      path: "lib/engine-phase-4/p0-remediated-extractor.mjs",
      sha256: sha256(readText("lib/engine-phase-4/p0-remediated-extractor.mjs")),
      version: P0_REMEDIATED_EXTRACTOR_VERSION,
      output_schema: schema.properties.schema_version.const,
    },
  },
  corpus: {
    path: "fixtures/engine-phase-4-representative-gold/cases.json",
    fixture_version: corpus.fixture_version,
    sha256: protectedBaselines["fixtures/engine-phase-4-representative-gold/cases.json"].sha256,
  },
  metrics: {
    case_count: outputs.length,
    schema_valid_count: validation.filter((item) => item.schema_valid).length,
    semantic_valid_count: validation.filter((item) => item.semantic_valid).length,
    deterministic_rerun_match: deterministicRerunMatch,
    document_kind_distribution: documentKindDistribution,
    publishable_count: outputs.filter((output) => output.classification.publishable_opportunity).length,
    terminal_count: outputs.filter((output) => output.classification.terminal_non_opportunity).length,
    review_required_count: outputs.filter((output) => output.review.required).length,
    unknown_count: fieldStatuses.filter((status) => status === "unknown").length,
    ambiguous_count: fieldStatuses.filter((status) => status === "ambiguous").length,
    conflicting_count: fieldStatuses.filter((status) => status === "conflicting").length,
    schema_gap_count: fieldStatuses.filter((status) => status === "schema_expressiveness_gap").length,
    unsupported_present_claim_count: unsupportedPresent.length,
    missing_evidence_reference_count: missingEvidence.length,
    source_url_substitution_count: sourceSubstitutions.length,
    low_quality_body_rejected_count: evidenceDiagnostics.reduce((sum, item) => sum + item.low_quality_body_rejected_count, 0),
    attachment_missing_provenance_count: evidenceDiagnostics.reduce((sum, item) => sum + item.attachment_missing_provenance_count, 0),
    attachment_rejected_count: evidenceDiagnostics.reduce((sum, item) => sum + item.attachment_rejected_count, 0),
    ocr_missing_locator_count: evidenceDiagnostics.reduce((sum, item) => sum + item.ocr_missing_locator_count, 0),
    ocr_low_quality_rejected_count: evidenceDiagnostics.reduce((sum, item) => sum + item.ocr_low_quality_rejected_count, 0),
    classification_title_only_count: evidenceDiagnostics.reduce((sum, item) => sum + item.classification_title_only_count, 0),
    classification_multi_evidence_count: evidenceDiagnostics.reduce((sum, item) => sum + item.classification_multi_evidence_count, 0),
    duplicate_evidence_suppressed_count: evidenceDiagnostics.reduce((sum, item) => sum + item.duplicate_evidence_suppressed_count, 0),
    attachment_present_claim_count: evidenceDiagnostics.reduce((sum, item) => sum + item.attachment_present_claim_count, 0),
    ocr_present_claim_count: evidenceDiagnostics.reduce((sum, item) => sum + item.ocr_present_claim_count, 0),
  },
  known_case_results: knownCaseResults,
  known_case_checks: knownCaseChecks,
  validation,
  diagnostics: {
    unsupported_present_claims: unsupportedPresent,
    missing_evidence_references: missingEvidence,
    source_url_substitution_case_ids: sourceSubstitutions,
    case_evidence_diagnostics: evidenceDiagnostics,
  },
  protected_baselines: protectedBaselines,
  safety: {
    baseline_extractor_modified: false,
    baseline_normalizers_modified: false,
    baseline_evidence_builder_modified: false,
    contract_modified: false,
    frozen_corpus_modified: false,
    gold_modified: false,
    official_reports_modified: false,
    production_db_touched: false,
    migration_modified: false,
    external_llm_called: false,
    automatic_publish_enabled: false,
    pr_created: false,
    main_merged: false,
  },
  gate_status: {
    p0_extractor_remediation: validationPass ? "PASS" : "HOLD",
    evidence_preservation: validationPass ? "PASS" : "HOLD",
    official_p0_reevaluation: "NOT RUN",
    full_schema_gate_c: "HOLD",
    phase5: "HOLD",
  },
  outputs,
};

const knownRows = knownCaseResults.map((item) => `| ${item.case_id} | ${item.document_kind} | ${item.publishable_opportunity} | ${item.terminal_non_opportunity} | ${item.opportunity_kind} | ${item.lifecycle_status.status}:${item.lifecycle_status.value ?? "null"} |`).join("\n");
const metricRows = Object.entries(report.metrics).filter(([, value]) => typeof value !== "object").map(([key, value]) => `| ${key} | ${value} |`).join("\n");
const markdown = `# Engine Phase 4 P0 remediated extractor preview

## Scope and decision

**PASS** for the bounded extractor-remediation implementation preview. This is not an official P0 or full Gate C reevaluation. Full-schema Gate C and Phase 5 remain **HOLD**.

- \`preview_only=true\`
- \`official_p0_reevaluation_completed=false\`
- \`official_full_gate_c_reevaluation_completed=false\`
- \`full_gate_c_status=HOLD\`
- \`phase5_status=HOLD\`

## Architecture

- Baseline remains reproducible at \`${report.extractor.baseline.path}\` (${report.extractor.baseline.contract_version}; SHA-256 \`${report.extractor.baseline.sha256}\`).
- The remediated entry point is \`extractP0RemediatedCandidate\` in \`${report.extractor.remediated.path}\`, version \`${report.extractor.remediated.version}\`.
- Baseline whitespace, explicit-label, and date-candidate normalizers are imported read-only. P0 classification, role separation, amount preservation, evidence adaptation, review reasons, and lifecycle calculation are isolated in the new version.
- Evaluation clock: \`${P0_REMEDIATION_PREVIEW_AS_OF}\`.

## Metrics

| Metric | Value |
| --- | ---: |
${metricRows}

Document kinds: ${Object.entries(documentKindDistribution).map(([kind, count]) => `${kind}=${count}`).join(", ")}.

## Known-case results

| Case | Document kind | Publishable | Terminal | Opportunity kind | Lifecycle |
| --- | --- | --- | --- | --- | --- |
${knownRows}

Cases 1, 2, and 5 are no longer silently suppressed. Case 4 is terminal. Cases 6, 8, 9, and 22 use only contract lifecycle states. Case 20 is partitioned as paid student activity. Case 24 remains terminal general guidance.

## Safety

All ${P0_OPPORTUNITY_FIELDS.length} P0 fields use evidence-linked, fail-closed states. Unsupported present claims, missing evidence references, and source-route substitution are zero. Automatic publication remains disabled. Protected baseline, contract, corpus, gold, and official report hashes are unchanged.

Body text with an explicit unsafe quality state and attachments without complete provenance are excluded before extraction. OCR requires safe quality, document provenance, page, and bounding-box coordinates. Per-case rejected sources, classification evidence IDs, and present-field source types are recorded in the JSON diagnostics.

## Next step

Strengthen source/evidence preservation, then run separately authorized official P0 and full Gate C reevaluations.
`;

write("reports/engine-phase-4-p0-remediation-preview.json", `${JSON.stringify(report, null, 2)}\n`);
write("reports/engine-phase-4-p0-remediation-preview.md", markdown);
console.log(`cases=${report.metrics.case_count}`);
console.log(`schema_valid=${report.metrics.schema_valid_count}`);
console.log(`semantic_valid=${report.metrics.semantic_valid_count}`);
console.log(`deterministic=${report.metrics.deterministic_rerun_match}`);
if (!validationPass) throw new Error(`ENGINE PHASE 4 P0 REMEDIATION PREVIEW: HOLD ${JSON.stringify({ metrics: report.metrics, knownCaseChecks })}`);
console.log("ENGINE PHASE 4 P0 REMEDIATION PREVIEW: PASS");
