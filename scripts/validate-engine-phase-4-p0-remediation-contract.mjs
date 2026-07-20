import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { exampleManifest } from "../fixtures/engine-phase-4-p0-remediation-contract/examples-source.mjs";
import {
  AMOUNT_KINDS,
  DOCUMENT_KINDS,
  LIFECYCLE_STATUSES,
  P0_OPPORTUNITY_FIELDS,
  PROTECTED_BASELINE_SHA256,
  sha256,
  validateP0RemediationRecord,
} from "../lib/engine-phase-4/p0-remediation-contract.mjs";
import { report as freshReport } from "./build-engine-phase-4-p0-remediation-design.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readText = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const read = (relativePath) => JSON.parse(readText(relativePath));
const checks = [];
const check = (name, pass, detail = null) => {
  checks.push({ name, pass: Boolean(pass) });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const schema = read("schemas/engine/phase-4-p0-remediation-output.schema.json");
const examples = read("fixtures/engine-phase-4-p0-remediation-contract/examples.json");
const report = read("reports/engine-phase-4-p0-remediation-design.json");
const markdown = readText("reports/engine-phase-4-p0-remediation-design.md");
const contractDoc = readText("docs/engine/engine-phase-4-p0-remediation-contract.md");
const packageJson = read("package.json");
const canonicalSchema = read("schemas/engine/phase-4-canonical-scholarship.schema.json");
const p0Report = read("reports/engine-phase-4-gate-c-p0.json");
const fullGateC = read("reports/engine-phase-4-gate-c-representative-evaluation.json");

let schemaValidator;
try {
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true });
  schemaValidator = ajv.compile(schema);
  check("P0 remediation JSON Schema compiles under strict Ajv 2020", true);
} catch (error) {
  check("P0 remediation JSON Schema compiles under strict Ajv 2020", false, error instanceof Error ? error.message : String(error));
}

const exampleResults = schemaValidator
  ? examples.examples.map((item) => ({ scenario: item.scenario, result: validateP0RemediationRecord(item.output, schemaValidator) }))
  : [];
check("all example fixtures pass schema and semantic validation", exampleResults.length === 16 && exampleResults.every((item) => item.result.valid), JSON.stringify(exampleResults.filter((item) => !item.result.valid)));
check("generated example fixture matches its source deterministically", readText("fixtures/engine-phase-4-p0-remediation-contract/examples.json") === `${JSON.stringify(exampleManifest, null, 2)}\n`);
check("generated design JSON matches a fresh deterministic build", JSON.stringify(report) === JSON.stringify(freshReport));

const requiredScenarios = [
  "normal_recruitment_notice", "closed_recruitment_notice", "result_announcement", "application_support_guidance",
  "standalone_correction_notice", "updated_existing_recruitment_page", "maximum_cap_amount", "full_tuition_amount",
  "tiered_by_target_amount", "paid_student_activity", "application_url_not_found", "ambiguous_application_date_role",
  "range_amount", "percentage_of_tuition_amount", "applicant_requested_amount", "not_predefined_amount",
];
check("all required representative scenarios exist", requiredScenarios.every((scenario) => examples.examples.some((item) => item.scenario === scenario)));
check("example case IDs are unique", new Set(examples.examples.map((item) => item.output.case_id)).size === examples.examples.length);
check("nine P0 opportunity fields and 216-slot policy are fixed", P0_OPPORTUNITY_FIELDS.length === 9 && report.contract.corpus_concept_slots === 216 && JSON.stringify(report.contract.opportunity_fields) === JSON.stringify(P0_OPPORTUNITY_FIELDS));
check("standalone timezone field is absent", !Object.hasOwn(schema.properties, "timezone") && !Object.hasOwn(schema.properties.fields.properties, "timezone") && !/"timezone"\s*:/u.test(readText("schemas/engine/phase-4-p0-remediation-output.schema.json")));
check("document kind and lifecycle enums are disjoint", DOCUMENT_KINDS.every((value) => !LIFECYCLE_STATUSES.includes(value)) && report.contract.lifecycle_statuses.length === 4);
check("document and lifecycle enums match schema/report", JSON.stringify(schema.properties.classification.properties.document_kind.enum) === JSON.stringify(DOCUMENT_KINDS) && JSON.stringify(report.contract.lifecycle_statuses) === JSON.stringify(LIFECYCLE_STATUSES));
check("provider and posting organization are independent required fields", schema.properties.fields.required.includes("provider") && schema.properties.fields.required.includes("posting_organization") && canonicalSchema.properties.fields.properties.posting_organization === undefined);

const byScenario = Object.fromEntries(examples.examples.map((item) => [item.scenario, item.output]));
check("result announcement is terminal and non-publishable", byScenario.result_announcement.classification.terminal_non_opportunity && !byScenario.result_announcement.classification.publishable_opportunity && Object.entries(byScenario.result_announcement.fields).filter(([name]) => P0_OPPORTUNITY_FIELDS.includes(name)).every(([, field]) => field.status === "not_applicable"));
check("application support guidance is terminal and non-publishable", byScenario.application_support_guidance.classification.document_kind === "general_guidance" && !byScenario.application_support_guidance.classification.publishable_opportunity);
check("standalone correction is non-publishable and relation-dependent", byScenario.standalone_correction_notice.classification.document_kind === "correction_notice" && !byScenario.standalone_correction_notice.classification.publishable_opportunity && byScenario.standalone_correction_notice.classification.relation_resolution_required);
check("updated existing page remains a recruitment notice with revision metadata", byScenario.updated_existing_recruitment_page.classification.document_kind === "recruitment_notice" && byScenario.updated_existing_recruitment_page.classification.source_revision_mode === "updated_existing_page" && Boolean(byScenario.updated_existing_recruitment_page.classification.revision_note));
check("normal recruitment may be publishable but never automatically published", byScenario.normal_recruitment_notice.classification.publishable_opportunity && byScenario.normal_recruitment_notice.review.automatic_publish_allowed === false);
check("ambiguous date roles force unknown lifecycle and review", byScenario.ambiguous_application_date_role.fields.application_start.status === "ambiguous" && byScenario.ambiguous_application_date_role.fields.lifecycle_status.value === "unknown" && byScenario.ambiguous_application_date_role.review.required);
check("source and application URLs remain distinct", byScenario.normal_recruitment_notice.fields.application_url.value !== byScenario.normal_recruitment_notice.source.canonical_url && byScenario.application_url_not_found.fields.application_url.status === "not_found");
check("paid student activity is feed-partitioned", byScenario.paid_student_activity.classification.opportunity_kind === "paid_student_activity" && byScenario.paid_student_activity.fields.support_type.value.includes("activity_scholarship") && byScenario.paid_student_activity.review.reasons.includes("paid_activity_feed_partition_required"));

check("amount enum covers the approved taxonomy", JSON.stringify(schema.$defs.amountKind.enum) === JSON.stringify(AMOUNT_KINDS));
check("exact and maximum-cap semantics are distinct", byScenario.normal_recruitment_notice.fields.support_amount.value.kind === "exact" && byScenario.maximum_cap_amount.fields.support_amount.value.kind === "maximum_cap" && byScenario.maximum_cap_amount.fields.support_amount.value.maximum_amount === 1000000);
check("range boundaries remain ordered", byScenario.range_amount.fields.support_amount.value.minimum_amount === 500000 && byScenario.range_amount.fields.support_amount.value.maximum_amount === 1000000);
check("full tuition does not invent a currency amount", byScenario.full_tuition_amount.fields.support_amount.value.kind === "full_tuition" && byScenario.full_tuition_amount.fields.support_amount.value.exact_amount === undefined);
check("target tiers retain labels and no representative scalar", byScenario.tiered_by_target_amount.fields.support_amount.status === "schema_expressiveness_gap" && byScenario.tiered_by_target_amount.fields.support_amount.value.components.every((item) => item.target_label) && byScenario.tiered_by_target_amount.fields.support_amount.value.exact_amount === undefined);
check("paid activity components preserve monthly and hourly units", byScenario.paid_student_activity.fields.support_amount.value.components.map((item) => item.period).join() === "month,hour");
check("applicant-requested and not-predefined are semantic values", byScenario.applicant_requested_amount.fields.support_amount.value.kind === "applicant_requested" && byScenario.applicant_requested_amount.fields.support_amount.status === "present" && byScenario.not_predefined_amount.fields.support_amount.value.kind === "not_predefined" && byScenario.not_predefined_amount.fields.support_amount.status === "present");
check("schema gap is not converted to ambiguity", byScenario.tiered_by_target_amount.fields.support_amount.status === "schema_expressiveness_gap" && byScenario.paid_student_activity.fields.support_amount.status === "schema_expressiveness_gap");

check("responsibility categories are complete", ["deterministic_extractor", "output_contract_or_schema", "upstream_collection", "llm_assisted_draft", "mandatory_admin_review", "relation_resolution", "deferred_out_of_scope"].every((key) => report.responsibility_classification[key]?.length > 0));
check("every problem has primary and secondary responsibility", report.responsibility_matrix.length >= 10 && report.responsibility_matrix.every((item) => item.primary && item.secondary.length > 0));
check("next remediation items are mechanically complete", report.next_extractor_remediation.items.length >= 7 && report.next_extractor_remediation.items.every((item) => ["problem", "current_behavior", "desired_behavior", "code_targets", "required_fields", "auto_allowed_when", "stop_when", "validation_scenarios", "completion_condition"].every((key) => item[key] && (!Array.isArray(item[key]) || item[key].length > 0))));
check("first remediation exclusions have future stages", report.next_extractor_remediation.deferred_roadmap.length >= 7 && report.next_extractor_remediation.deferred_roadmap.every((item) => item.item && item.stage));
check("compatibility plan uses every requested classification", ["existing_reuse", "existing_semantics_correction", "new_phase4_internal_field", "derived_field", "future_phase5_field", "future_db_migration_required", "deprecated_or_replaced"].every((kind) => report.compatibility_plan.some((item) => item.classification === kind)));
check("field contracts define type/null/auto/review/evidence/handoff", report.contract.field_contract.length >= 16 && report.contract.field_contract.every((item) => item.type && typeof item.required === "boolean" && typeof item.null_or_unknown_allowed === "boolean" && item.automatic_generation_condition && item.review_required_condition && item.evidence_link && item.existing_relationship && item.handoff_scope));

const violations = Object.fromEntries(report.current_extractor_contract_violations.map((item) => [item.type, item]));
check("current lifecycle violations are exact", violations.document_kind_lifecycle_overlap.count === 5 && violations.document_kind_lifecycle_overlap.case_ids.join() === "p4c_004_national_work_result,p4c_006_gwangsan_extension,p4c_008_cau_welfare_result_2025_1,p4c_009_cau_welfare_result_2024_2,p4c_022_grad_seoul_foundation_pdf");
check("verified recruitment suppressions are exact", violations.verified_recruitment_suppressed.count === 3 && violations.verified_recruitment_suppressed.case_ids.join() === "p4c_001_student_affairs_special,p4c_002_national_second_round,p4c_005_miraero_second");
check("working extractor safety baselines are preserved", violations.terminal_non_opportunity_exposed.count === 0 && violations.source_url_used_as_application_url_by_extractor.count === 0 && violations.unsupported_present_claim.count === 0 && violations.review_required_missing.count === 0);
check("schema/compatibility gaps are visible", violations.admin_default_source_url_as_application_url.count === 1 && violations.posting_organization_unrepresented.count === 24 && violations.amount_schema_expressiveness_gap.count === 9 && violations.paid_activity_opportunity_kind_missing.count === 1 && violations.relation_resolution_unimplemented.count === 4);

check("existing P0 diagnostic counts are unchanged", p0Report.p0_contract.total_concept_slots === 216 && p0Report.corpus.resolved_p0_field_count === 14 && p0Report.corpus.pending_p0_field_count === 198 && p0Report.corpus.unresolved_p0_field_count === 4 && p0Report.critical_errors.length === 8);
check("existing full Gate C counts and HOLD remain unchanged", fullGateC.metrics.document_classification_accuracy.numerator === 4 && fullGateC.metrics.document_classification_accuracy.denominator === 24 && fullGateC.metrics.normalized_exact_match.numerator === 50 && fullGateC.metrics.normalized_exact_match.denominator === 64 && fullGateC.recommendation.phase5_ready === "HOLD" && fullGateC.recommendation.production_ready === "HOLD");
check("protected extractor/corpus/reports retain base hashes", Object.entries(PROTECTED_BASELINE_SHA256).every(([relativePath, expected]) => sha256(readText(relativePath)) === expected && report.protected_baselines[relativePath]?.unchanged));
check("design safety flags are all false", Object.values(report.safety).every((value) => value === false));
check("contract decision is PASS while Gate C and Phase 5 remain HOLD", report.decision === "PASS" && report.gate_status.p0_remediation_contract === "PASS" && report.gate_status.full_schema_gate_c === "HOLD" && report.gate_status.phase5 === "HOLD");
check("package scripts expose report/test/validate commands", Boolean(packageJson.scripts?.["engine:phase4:p0-remediation:report"] && packageJson.scripts?.["engine:phase4:p0-remediation:test"] && packageJson.scripts?.["engine:phase4:p0-remediation:validate"]));
check("documentation and report describe the full safety boundary", /Current-code findings/u.test(contractDoc) && /Responsibility matrix/u.test(contractDoc) && /Explicitly excluded/u.test(contractDoc) && /Amount result structure/u.test(contractDoc) && /Compatibility plan/u.test(contractDoc) && /Full-schema Gate C: HOLD/u.test(markdown));

const serialized = `${readText("schemas/engine/phase-4-p0-remediation-output.schema.json")}\n${readText("fixtures/engine-phase-4-p0-remediation-contract/examples.json")}\n${readText("reports/engine-phase-4-p0-remediation-design.json")}\n${markdown}\n${contractDoc}`;
check("artifacts contain no local absolute paths or apparent secrets", !/(?:\/Users\/|\/home\/|DATABASE_URL|SUPABASE_URL|service_role|gho_|sk-[A-Za-z0-9]{12,})/u.test(serialized));

const passed = checks.filter((item) => item.pass).length;
console.log(`ENGINE PHASE 4 P0 REMEDIATION CONTRACT VALIDATOR: ${passed === checks.length ? "PASS" : "FAIL"}`);
console.log(`checks=${passed}/${checks.length}`);
if (passed !== checks.length) process.exitCode = 1;
