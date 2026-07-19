import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FIXED_EXTRACTION_CONTEXT,
  deterministicBaselineCases,
} from "../fixtures/engine-phase-4-deterministic-baseline/cases.mjs";
import {
  DETERMINISTIC_EXTRACTION_CONTRACT_VERSION,
  extractDeterministicScholarshipCandidate,
} from "../lib/engine-phase-4/deterministic-extractor.mjs";
import {
  REQUIRED_SCENARIOS,
  createSchemaValidators,
  validateCanonicalRecord,
} from "../lib/engine-phase-4/contracts.mjs";
import {
  evaluatedRatio,
  evaluateDeterministicBaseline,
} from "./evaluate-engine-phase-4-deterministic-baseline.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];
function check(name, pass, detail = null) {
  checks.push({ name, pass: Boolean(pass), detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const requiredFiles = [
  "lib/engine-phase-4/deterministic-extractor.mjs",
  "lib/engine-phase-4/deterministic-normalizers.mjs",
  "lib/engine-phase-4/evidence-builder.mjs",
  "fixtures/engine-phase-4-deterministic-baseline/cases.mjs",
  "scripts/test-engine-phase-4-deterministic-baseline.mjs",
  "scripts/evaluate-engine-phase-4-deterministic-baseline.mjs",
  "scripts/run-engine-phase-4-gate-b-live.mjs",
  "docs/engine/engine-phase-4-gate-b-deterministic-baseline.md",
  "reports/engine-phase-4-gate-b-baseline.json",
];
check("required Gate B files exist", requiredFiles.every((entry) => fs.existsSync(path.join(root, entry))));
check("extractor contract version is explicit", DETERMINISTIC_EXTRACTION_CONTRACT_VERSION === "engine-phase-4-deterministic-baseline/v1");
check("fixture case count is exactly 15", deterministicBaselineCases.length === 15);
check("fixture IDs are unique", new Set(deterministicBaselineCases.map((entry) => entry.case_id)).size === deterministicBaselineCases.length);
check("all Gate A scenarios are retained", REQUIRED_SCENARIOS.every((scenario) => deterministicBaselineCases.some((entry) => entry.scenario === scenario)));
check("fixtures are synthetic and private-data independent", deterministicBaselineCases.every((entry) => entry.input.sourceNotice.canonical_url.startsWith("https://example.invalid/")));

const validators = createSchemaValidators();
const records = deterministicBaselineCases.map((entry) => extractDeterministicScholarshipCandidate({
  ...entry.input,
  extractionContext: FIXED_EXTRACTION_CONTEXT,
}));
const semanticResults = records.map((record) => validateCanonicalRecord(record, validators));
check("all fixture records satisfy canonical schema and semantics", semanticResults.every((result) => result.valid));
check("all evidence satisfies Gate A schema", records.every((record) => record.evidence.every((item) => validators.evidence(item))));
check("all evidence references resolve", semanticResults.every((result) => !result.errors.some((error) => error.code === "missing_evidence_ref")));
check("evidence IDs are unique", records.every((record) => new Set(record.evidence.map((item) => item.evidence_id)).size === record.evidence.length));
check("all present values have evidence", records.every((record) => Object.values(record.fields).filter((field) => field.value_status === "present").every((field) => field.evidence_refs.length > 0)));
check("no present value is marked inferred", records.every((record) => Object.values(record.fields).filter((field) => field.value_status === "present").every((field) => field.inference?.is_inferred === false)));
check("all proposed program candidates have evidence", records.every((record) => record.program_identity_candidate.resolution_status !== "proposed" || record.program_identity_candidate.evidence_refs.length > 0));
check("all proposed cycle candidates have evidence", records.every((record) => record.recruitment_cycle_identity_candidate.resolution_status !== "proposed" || record.recruitment_cycle_identity_candidate.evidence_refs.length > 0));
check("material changes are never invented", records.every((record) => record.material_changes.length === 0));
check("automatic publication remains disabled", records.every((record) => record.review.automatic_publish_allowed === false));
check("notifications remain disabled", records.every((record) => record.review.notification_allowed === false));

const reruns = deterministicBaselineCases.map((entry) => extractDeterministicScholarshipCandidate({
  ...entry.input,
  extractionContext: FIXED_EXTRACTION_CONTEXT,
}));
check("fixture reruns are deep-equal", records.every((record, index) => JSON.stringify(record) === JSON.stringify(reruns[index])));
check("evidence IDs are deterministic", records.every((record, index) => JSON.stringify(record.evidence.map((item) => item.evidence_id)) === JSON.stringify(reruns[index].evidence.map((item) => item.evidence_id))));
check("candidate keys are deterministic", records.every((record, index) => record.program_identity_candidate.candidate_key === reruns[index].program_identity_candidate.candidate_key && record.recruitment_cycle_identity_candidate.candidate_key === reruns[index].recruitment_cycle_identity_candidate.candidate_key));
check("content fingerprints are deterministic", records.every((record, index) => record.opportunity_revision.content_fingerprint === reruns[index].opportunity_revision.content_fingerprint));
check("extracted timestamp is injected", records.every((record) => record.extraction_metadata.extracted_at === FIXED_EXTRACTION_CONTEXT.extractedAt));

const evaluation = evaluateDeterministicBaseline();
check("Gate B evaluator passes", evaluation.pass);
check("schema-valid record rate is 100%", evaluation.acceptance.schema_valid_record_rate === 1);
check("evidence reference integrity is 100%", evaluation.acceptance.evidence_reference_integrity === 1);
check("unsupported value rate is zero", evaluation.acceptance.unsupported_value_rate === 0);
check("risky review recall is 100%", evaluation.acceptance.risky_review_required_recall === 1);
check("deterministic rerun matches", evaluation.acceptance.deterministic_rerun_match === true);
check("identity pair metrics are not falsely scored", evaluation.metrics.identity_candidate_pair_precision.status === "not_evaluated" && evaluation.metrics.identity_candidate_pair_recall.status === "not_evaluated");
check("material change metric is not falsely scored", evaluation.metrics.material_change_classification_accuracy.status === "not_evaluated");
const emptyRatio = evaluatedRatio(0, 0, "Validator empty-denominator probe.");
check("empty denominator is not scored as 100 percent", emptyRatio.value === null && emptyRatio.value !== 1);
check("empty denominator is explicitly not evaluated", emptyRatio.status === "not_evaluated" && emptyRatio.sample_count === 0 && emptyRatio.reason.length > 0);
check("normalized exact match has real samples", evaluation.metrics.normalized_exact_match.status === "evaluated" && evaluation.metrics.normalized_exact_match.sample_count === 2);
check("normalized partial match is not an exact scalar copy", typeof evaluation.metrics.normalized_partial_match === "object"
  && JSON.stringify(evaluation.metrics.normalized_partial_match) !== JSON.stringify(evaluation.metrics.normalized_exact_match));
check("normalized partial match is honestly not evaluated", evaluation.metrics.normalized_partial_match.status === "not_evaluated"
  && evaluation.metrics.normalized_partial_match.value === null
  && evaluation.metrics.normalized_partial_match.sample_count === 0
  && evaluation.metrics.normalized_partial_match.reason === "No predeclared partial-overlap gold annotations exist in Gate B fixtures.");
const requiredSliceNames = ["by_field", "by_source_type", "by_document_kind", "by_value_status", "by_extractor_kind", "by_fixture_version"];
check("all required evaluation slices exist", requiredSliceNames.every((name) => evaluation.slices?.[name] && typeof evaluation.slices[name] === "object"));
check("evaluated slices have positive samples", requiredSliceNames.every((name) =>
  Object.values(evaluation.slices[name]).every((slice) => slice.status !== "evaluated" || slice.sample_count > 0)));
check("empty slices have no fake 100 percent", requiredSliceNames.every((name) =>
  Object.values(evaluation.slices[name]).every((slice) => slice.status !== "not_evaluated"
    || (slice.sample_count === 0 && slice.value !== 1 && typeof slice.reason === "string" && slice.reason.length > 0))));
check("deterministic and model extractor slices are distinct", evaluation.slices.by_extractor_kind.deterministic.status === "evaluated"
  && evaluation.slices.by_extractor_kind.deterministic.sample_count === deterministicBaselineCases.length
  && evaluation.slices.by_extractor_kind.model.status === "not_evaluated"
  && evaluation.slices.by_extractor_kind.model.sample_count === 0);
check("fixture version slice is explicit", Object.keys(evaluation.slices.by_fixture_version).length === 1
  && evaluation.slices.by_fixture_version[FIXED_EXTRACTION_CONTEXT.evaluationFixtureVersion]?.sample_count === deterministicBaselineCases.length);
check("source type coverage distinguishes empty gold slices", evaluation.slices.by_source_type.hwp_text.status === "not_evaluated"
  && evaluation.slices.by_source_type.ocr_text.status === "not_evaluated"
  && evaluation.slices.by_source_type.html_text.status === "evaluated");
check("document kind coverage distinguishes absent fixtures", evaluation.slices.by_document_kind.information_session.status === "not_evaluated"
  && evaluation.slices.by_document_kind.general_guidance.status === "not_evaluated"
  && evaluation.slices.by_document_kind.correction_notice.status === "not_evaluated");

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const scripts = packageJson.scripts ?? {};
check("Gate B package scripts exist", ["test:engine-phase-4-gate-b", "evaluate:engine-phase-4-gate-b", "live:engine-phase-4-gate-b", "validate:engine-phase-4-gate-b"].every((name) => Boolean(scripts[name])));
const extractorSource = fs.readFileSync(path.join(root, "lib/engine-phase-4/deterministic-extractor.mjs"), "utf8");
check("extractor does not import provider path", !/notice-extraction|openai|anthropic|generateText|chat\.completions/iu.test(extractorSource));
check("extractor does not access database or environment", !/supabase|DATABASE_URL|process\.env|\.from\(/u.test(extractorSource));
const liveSource = fs.readFileSync(path.join(root, "scripts/run-engine-phase-4-gate-b-live.mjs"), "utf8");
check("live runner is bounded to at most two sources", /const SOURCE_KEYS = \[[^\]]+\]/u.test(liveSource) && !/full_613/u.test(liveSource));
check("live runner enables Phase 3 document parsing", /processNoticeDocuments: runtime\.processNoticeDocuments/u.test(liveSource));
check("live runner reuses normalized graph", /buildNormalizedGraphPlan/u.test(liveSource));

const docsText = fs.readFileSync(path.join(root, "docs/engine/engine-phase-4-gate-b-deterministic-baseline.md"), "utf8");
check("capability matrix documents supported and unsupported patterns", /Capability matrix/u.test(docsText) && /Unsupported patterns/u.test(docsText));
check("Phase 4C candidate areas are documented", /Candidate areas for Phase 4C/u.test(docsText));
check("Phase 5 boundary is documented", /Phase 5/u.test(docsText) && /material-change/u.test(docsText));
check("documentation separates exact and partial metrics", /Exact match and partial match are separate metrics/u.test(docsText));
check("documentation rejects empty-denominator 100 percent", /empty denominator is not 100%/iu.test(docsText));
check("documentation disclaims synthetic production accuracy", /not production accuracy/iu.test(docsText) && /representative public gold evaluation/iu.test(docsText));

const reportPath = path.join(root, "reports/engine-phase-4-gate-b-baseline.json");
const reportText = fs.readFileSync(reportPath, "utf8");
const report = JSON.parse(reportText);
check("report identifies official Gate B", report.official_phase === "ENGINE_PHASE_4" && report.official_gate === "GATE_B");
check("report records exact Gate A base", report.base_gate_a_sha === "700b9a3bfcff707509651189784dd2e9040ab317");
check("report implementation SHA is immutable", /^[a-f0-9]{40}$/u.test(report.implementation_sha));
check("report live proof has public records", report.live_dry_run_summary?.result === "PASS" && report.live_dry_run_summary?.canonical_record_count >= 1);
check("report live bounds are enforced", report.live_dry_run_summary?.source_count <= 2 && report.live_dry_run_summary?.notice_limit_per_source === 1);
check("report identifies live proof as historical", /historical Gate B bounded live proof/u.test(report.live_dry_run_summary?.evidence_scope ?? ""));
check("report exact metric matches evaluator", JSON.stringify(report.evaluation_summary?.normalized_exact_match) === JSON.stringify(evaluation.metrics.normalized_exact_match));
check("report partial metric matches evaluator", JSON.stringify(report.evaluation_summary?.normalized_partial_match) === JSON.stringify(evaluation.metrics.normalized_partial_match));
check("all report metric states match evaluator", Object.entries(evaluation.metrics).every(([name, metric]) =>
  JSON.stringify(report.evaluation_summary?.[name]) === JSON.stringify(metric)));
check("report does not claim partial 100 percent", report.evaluation_summary?.normalized_partial_match?.status === "not_evaluated"
  && report.evaluation_summary?.normalized_partial_match?.value === null
  && report.evaluation_summary?.normalized_partial_match?.sample_count === 0);
check("report field slice matches evaluator coverage", report.evaluation_slices?.by_field?.sample_count === Object.values(evaluation.slices.by_field).reduce((sum, slice) => sum + slice.sample_count, 0));
check("report source-type slice matches evaluator coverage", report.evaluation_slices?.by_source_type?.sample_count === Object.values(evaluation.slices.by_source_type).reduce((sum, slice) => sum + slice.sample_count, 0));
check("report document-kind slice matches evaluator coverage", report.evaluation_slices?.by_document_kind?.sample_count === Object.values(evaluation.slices.by_document_kind).reduce((sum, slice) => sum + slice.sample_count, 0));
check("report value-status slice matches evaluator coverage", report.evaluation_slices?.by_value_status?.sample_count === Object.values(evaluation.slices.by_value_status).reduce((sum, slice) => sum + slice.sample_count, 0));
check("report extractor-kind slice matches evaluator coverage", report.evaluation_slices?.by_extractor_kind?.deterministic_sample_count === evaluation.slices.by_extractor_kind.deterministic.sample_count
  && report.evaluation_slices?.by_extractor_kind?.model?.status === evaluation.slices.by_extractor_kind.model.status);
check("report fixture-version slice matches evaluator coverage", report.evaluation_slices?.by_fixture_version?.key === FIXED_EXTRACTION_CONTEXT.evaluationFixtureVersion
  && report.evaluation_slices?.by_fixture_version?.sample_count === evaluation.slices.by_fixture_version[FIXED_EXTRACTION_CONTEXT.evaluationFixtureVersion].sample_count);
check("report contains no absolute local path", !/(?:[A-Za-z]:\\\\|\/Users\/|\/home\/)/u.test(reportText));
check("report contains no secret-like value", !/(?:gho_|sk-[A-Za-z0-9]|service_role|DATABASE_URL|SUPABASE_URL)/u.test(reportText));
const safetyKeys = [
  "database_accessed", "production_accessed", "production_credentials_requested", "external_llm_called",
  "migration_created_or_executed", "canary_write_performed", "production_scheduler_added", "queue_or_worker_added",
  "full_613_source_run", "parser_cache_contract_modified", "crawler_checkpoint_contract_modified",
  "gate_a_contract_semantics_modified", "deterministic_extractor_behavior_modified",
  "automatic_publish_performed", "notification_performed",
];
check("report safety remains fail-closed", safetyKeys.every((key) => report.safety?.[key] === false));
check("combined PR targets main", report.combined_pr_scope?.base === "main" && report.combined_pr_scope?.head === "feat/engine-phase-4-deterministic-extraction-baseline");
check("PR remains uncreated", report.combined_pr_scope?.pr_created === false);

const passed = checks.filter((entry) => entry.pass).length;
console.log(`ENGINE PHASE 4 GATE B VALIDATOR: ${passed === checks.length ? "PASS" : "FAIL"}`);
console.log(`checks=${passed}/${checks.length}`);
if (passed !== checks.length) process.exitCode = 1;
