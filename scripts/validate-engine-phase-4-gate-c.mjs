import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { report as evaluated } from "./evaluate-engine-phase-4-representative-gold.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
const report = read("reports/engine-phase-4-gate-c-representative-evaluation.json");
const manifest = read("fixtures/engine-phase-4-representative-gold/manifest.json");
const corpus = read("fixtures/engine-phase-4-representative-gold/cases.json");
const checks = []; const check = (name, pass, detail = null) => { checks.push({ name, pass: Boolean(pass) }); console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); };
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const requiredSlices = ["by_field", "by_source_key", "by_source_level", "by_source_type", "by_document_format", "by_document_kind", "by_value_status", "by_parser_quality", "by_review_reason", "by_relation_type", "by_fixture_version", "by_extractor_kind"];
check("report matches a fresh evaluator run", JSON.stringify(report) === JSON.stringify(evaluated));
check("report identifies official Gate C", report.official_phase === "ENGINE_PHASE_4" && report.official_gate === "GATE_C");
check("corpus freeze and manifest hashes match", report.corpus_freeze_sha === manifest.corpus_freeze_sha && report.selection_manifest_hash === manifest.selection_manifest_hash);
check("relation correction provenance matches manifest", report.relation_correction_sha === manifest.relation_correction_sha && report.provenance_model === manifest.provenance_model);
check("provenance descriptions match manifest", report.corpus_freeze_ref === manifest.corpus_freeze_ref && report.corpus_freeze_scope === manifest.corpus_freeze_scope && report.relation_correction_scope === manifest.relation_correction_scope);
check("Git-aware provenance validation passes", report.provenance_validation.provenance_validation_status === "PASS", report.provenance_validation.errors.join(", ") || null);
check("both provenance commits exist", report.provenance_validation.corpus_freeze_commit_exists && report.provenance_validation.relation_provenance_commit_exists);
check("both provenance commits belong to target history", report.provenance_validation.corpus_freeze_is_branch_ancestor && report.provenance_validation.relation_provenance_is_branch_ancestor);
check("both provenance commits follow the Gate C base", report.provenance_validation.corpus_freeze_is_after_or_equal_to_gate_c_base && report.provenance_validation.relation_provenance_is_after_or_equal_to_gate_c_base);
check("relation correction follows corpus freeze", report.provenance_validation.relation_provenance_order_valid);
check("frozen extractor source hash matches", report.extractor.source_sha256 === sha256(fs.readFileSync(path.join(root, "lib/engine-phase-4/deterministic-extractor.mjs"))));
check("extractor behavior is unmodified", report.extractor.behavior_modified === false && report.safety.deterministic_extractor_behavior_modified === false);
check("all 24 cases were evaluated", report.corpus_summary.case_count === corpus.cases.length && corpus.cases.length === 24);
check("canonical validation metric matches count", report.metrics.canonical_schema_valid.numerator === report.counts.canonical_schema_valid_count);
check("unsupported rate matches count", report.metrics.unsupported_value_rate.numerator === report.counts.unsupported_present_value_count);
check("all required slices exist", requiredSlices.every((name) => report.slices[name] && typeof report.slices[name] === "object"));
check("empty slices never claim 100 percent", requiredSlices.every((name) => Object.values(report.slices[name]).every((slice) => slice.status !== "not_evaluated" || (slice.value !== 1 && typeof slice.reason === "string"))));
check("program/cycle/handoff usability is measured", ["program_candidate_usable_rate", "cycle_candidate_usable_rate", "phase5_handoff_usable_rate"].every((name) => report.metrics[name].status === "evaluated" && report.metrics[name].sample_count === 24));
const expectedMetricCounts = {
  canonical_schema_valid: [24, 24],
  evidence_integrity: [24, 24],
  document_classification_accuracy: [4, 24],
  field_presence_precision: [64, 70],
  field_presence_recall: [64, 189],
  field_status_exact_accuracy: [187, 336],
  normalized_exact_match: [50, 64],
  evidence_attribution_accuracy: [64, 64],
  unsupported_value_rate: [0, 84],
  review_required_recall: [19, 19],
  review_required_precision: [19, 24],
  program_candidate_usable_rate: [0, 24],
  cycle_candidate_usable_rate: [0, 24],
  phase5_handoff_usable_rate: [0, 24],
};
check("provenance remediation leaves evaluation counts unchanged", Object.entries(expectedMetricCounts).every(([name, [numerator, denominator]]) => report.metrics[name].numerator === numerator && report.metrics[name].denominator === denominator));
check("partial metric is honest", report.metrics.normalized_partial_match.status === "not_evaluated" && report.metrics.normalized_partial_match.value === null && /independent element-level/u.test(report.metrics.normalized_partial_match.reason));
check("error taxonomy totals expose case IDs and owner", Object.values(report.error_taxonomy).every((bucket) => bucket.case_count === bucket.case_ids.length && typeof bucket.recommended_owner === "string"));
check("Phase 3 and Phase 4C ownership are distinguished", Object.values(report.error_taxonomy).some((bucket) => bucket.recommended_owner === "PHASE_3") && Object.values(report.error_taxonomy).some((bucket) => bucket.recommended_owner === "PHASE_4C_SELECTIVE_LLM"));
check("HWP and OCR are not falsely evaluated", report.coverage.hwp_hwpx.status === "not_evaluated" && report.coverage.ocr_image.status === "not_evaluated");
check("independent adjudication keeps Phase 5 on hold", report.corpus_summary.adjudication_status === "pending_independent_review" && report.recommendation.phase5_ready === "HOLD");
check("production remains on hold", report.recommendation.production_ready === "HOLD" && report.recommendation.production_threshold_asserted === false);
check("safety flags remain false", Object.values(report.safety).every((value) => value === false));
const reportText = JSON.stringify(report); check("report has no local paths or secrets", !/(?:\/Users\/|\/home\/|DATABASE_URL|SUPABASE_URL|service_role|gho_|sk-[A-Za-z0-9]{12,})/u.test(reportText));
const passed = checks.filter((item) => item.pass).length; console.log(`ENGINE PHASE 4 GATE C VALIDATOR: ${passed === checks.length ? "PASS" : "FAIL"}`); console.log(`checks=${passed}/${checks.length}`); if (passed !== checks.length) process.exitCode = 1;
