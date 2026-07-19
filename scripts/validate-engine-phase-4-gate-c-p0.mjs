import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { P0_AS_OF, P0_TIMEZONE, P0_FIELDS, validateP0Overlay } from "../lib/engine-phase-4/gate-c-p0-audit.mjs";
import { report as evaluated } from "./evaluate-engine-phase-4-gate-c-p0.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
const readText = (name) => fs.readFileSync(path.join(root, name), "utf8");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const report = read("reports/engine-phase-4-gate-c-p0.json");
const markdown = readText("reports/engine-phase-4-gate-c-p0.md");
const fullReport = read("reports/engine-phase-4-gate-c-representative-evaluation.json");
const corpus = read("fixtures/engine-phase-4-representative-gold/cases.json");
const decisions = read("fixtures/engine-phase-4-representative-gold/adjudication/adjudication-decisions.json");
const overlay = read("fixtures/engine-phase-4-gate-c-p0/p0-adjudication-overlay.json");
const checks = [];
const check = (name, pass, detail = null) => {
  checks.push({ name, pass: Boolean(pass) });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

check("report matches a fresh deterministic evaluator run", JSON.stringify(report) === JSON.stringify(evaluated));
check("report identifies the separate P0 diagnostic", report.official_phase === "ENGINE_PHASE_4" && report.official_gate === "GATE_C_P0_DIAGNOSTIC_AUDIT");
check("fixed evaluation clock is recorded", report.as_of === P0_AS_OF && report.timezone === P0_TIMEZONE);
check("P0 overlay is valid", validateP0Overlay(corpus, decisions, overlay).valid);
check("all 24 frozen cases are evaluated", corpus.cases.length === 24 && report.corpus.total_case_count === 24);
check("all ten P0 fields are represented", P0_FIELDS.length === 10 && report.corpus.total_p0_field_count === 24 * P0_FIELDS.length && P0_FIELDS.every((name) => report.by_field[name]));
check("unapproved P0 gold remains pending", report.corpus.resolved_p0_field_count === 0 && report.corpus.pending_p0_field_count === 240 && report.corpus.unresolved_p0_field_count === 0);
check("pending cases are not scored as correct or failed", report.case_metrics.pending_p0_case_count === 24 && report.case_metrics.fully_correct_p0_case_count === 0 && report.case_metrics.partially_correct_p0_case_count === 0 && report.case_metrics.failed_p0_case_count === 0);
check("aggregate correctness denominators exclude pending gold", [report.aggregate_metrics.field_presence_precision, report.aggregate_metrics.field_presence_recall, report.aggregate_metrics.normalized_exact_match].every((metric) => metric.status === "not_evaluated" && metric.denominator === 0 && metric.value === null));
check("category correctness denominators exclude pending gold", Object.values(report.category_metrics).every((metric) => metric.status === "not_evaluated" && metric.denominator === 0 && metric.value === null));
check("publishability remains explicitly pending", report.safety_gates.pending_publishability_case_count === 24 && report.safety_gates.document_kind_exact.status === "not_evaluated" && /not scored as safe or erroneous/u.test(report.safety_gates.note));
check("unsupported claims are visible", Number.isInteger(report.aggregate_metrics.unsupported_claim_count) && report.aggregate_metrics.unsupported_claim_count >= 0 && report.by_field.application_url.unsupported_claim_count >= 0);
check("application URL provenance is not credited from the notice URL", report.by_field.application_url.evidence_supported_count === 0 && /not counted as extracted application URLs/u.test(markdown));
check("invalid lifecycle semantics are exposed", report.critical_errors.filter((item) => item.error === "document_kind_used_as_lifecycle_status").length === 5);
check("unadjudicated semantic risks are not labelled gold-verified", report.critical_errors.filter((item) => item.error === "document_kind_used_as_lifecycle_status").every((item) => item.verified_against_gold === false && item.gold_state === "pending"));
check("critical errors include ownership and case IDs", report.critical_errors.every((item) => typeof item.case_id === "string" && typeof item.classification === "string") && report.error_taxonomy.deterministic_extractor_defect?.count === report.critical_errors.length);

const expectedFullMetrics = {
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
check("full-schema Gate C metric counts remain unchanged", Object.entries(expectedFullMetrics).every(([name, [numerator, denominator]]) => fullReport.metrics[name].numerator === numerator && fullReport.metrics[name].denominator === denominator));
check("full-schema Gate C remains an official HOLD", fullReport.official_gate === "GATE_C" && fullReport.recommendation.phase5_ready === "HOLD" && fullReport.recommendation.production_ready === "HOLD");
check("frozen extractor source matches the full Gate C hash", fullReport.extractor.source_sha256 === sha256(readText("lib/engine-phase-4/deterministic-extractor.mjs")));
check("P0 audit did not claim prohibited side effects", Object.values(report.safety).every((value) => value === false));
check("Markdown explains separate scope and denominator maturity", /does not replace or invalidate the full-schema Gate C report/u.test(markdown) && /denominator maturity/u.test(markdown) && /NOT_EVALUATED/u.test(markdown));
check("responsibility boundaries are explicit", Object.values(report.responsibility_boundary).every((items) => Array.isArray(items) && items.length > 0));
const serialized = `${JSON.stringify(report)}\n${markdown}`;
check("reports contain no local paths or apparent secrets", !/(?:\/Users\/|\/home\/|DATABASE_URL|SUPABASE_URL|service_role|gho_|sk-[A-Za-z0-9]{12,})/u.test(serialized));

const passed = checks.filter((item) => item.pass).length;
console.log(`ENGINE PHASE 4 GATE C P0 VALIDATOR: ${passed === checks.length ? "PASS" : "FAIL"}`);
console.log(`checks=${passed}/${checks.length}`);
if (passed !== checks.length) process.exitCode = 1;
