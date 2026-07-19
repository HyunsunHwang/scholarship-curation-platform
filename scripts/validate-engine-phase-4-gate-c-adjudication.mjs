import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { extractDeterministicScholarshipCandidate } from "../lib/engine-phase-4/deterministic-extractor.mjs";
import {
  ADJUDICATION_CREATED_AT,
  buildRemediationCandidates,
  summarizeAdjudication,
  validateAdjudicationPacket,
} from "../lib/engine-phase-4/gate-c-adjudication.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
const corpus = read("fixtures/engine-phase-4-representative-gold/cases.json");
const sourceManifest = read("fixtures/engine-phase-4-representative-gold/manifest.json");
const relations = read("fixtures/engine-phase-4-representative-gold/relations.json");
const adjudicationManifest = read("fixtures/engine-phase-4-representative-gold/adjudication/adjudication-manifest.json");
const decisions = read("fixtures/engine-phase-4-representative-gold/adjudication/adjudication-decisions.json");
const unresolved = read("fixtures/engine-phase-4-representative-gold/adjudication/unresolved-items.json");
const trackedStatus = read("reports/engine-phase-4-gate-c-adjudication-status.json");
const reviewPacket = fs.readFileSync(path.join(root, "reports/engine-phase-4-gate-c-adjudication-review.md"), "utf8");
const schema = read("schemas/engine/phase-4-gate-c-adjudication.schema.json");
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateSchema = ajv.compile(schema);
const validation = validateAdjudicationPacket({ corpus, relations, manifest: sourceManifest, decisions, validateSchema });
const extractionContext = { extractorVersion: "1.0.0", parserContractVersion: "engine-phase-3-document-result/v1", evaluationFixtureVersion: corpus.fixture_version, extractedAt: ADJUDICATION_CREATED_AT };
const extractorByCase = new Map(corpus.cases.map((fixture) => [fixture.case_id, extractDeterministicScholarshipCandidate({ ...fixture.evaluation_input, extractionContext })]));
const remediation = buildRemediationCandidates(corpus, extractorByCase);
const freshStatus = summarizeAdjudication(decisions, remediation, validation);
const checks = [];
const check = (name, pass, detail = null) => {
  checks.push({ name, pass: Boolean(pass) });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

check("adjudication decision schema is valid", validation.schema_valid, validation.schema_errors.join("; ") || null);
check("all frozen cases and review items are structurally complete", validation.packet_complete, validation.structural_errors.join("; ") || null);
check("decision semantics are fail-closed", validation.semantic_errors.length === 0, validation.semantic_errors.join("; ") || null);
check("tracked status matches a fresh summary", JSON.stringify(trackedStatus) === JSON.stringify(freshStatus));
check("manifest identifies the frozen corpus", adjudicationManifest.source_case_manifest_hash === sourceManifest.selection_manifest_hash && adjudicationManifest.corpus_freeze_sha === sourceManifest.corpus_freeze_sha && adjudicationManifest.relation_correction_sha === sourceManifest.relation_correction_sha);
check("manifest case membership is exact", adjudicationManifest.case_count === corpus.cases.length && JSON.stringify(adjudicationManifest.case_ids) === JSON.stringify(corpus.cases.map((item) => item.case_id)));
check("manifest counts match status", adjudicationManifest.reviewed_case_count === freshStatus.reviewed_case_count && adjudicationManifest.approved_case_count === freshStatus.approved_cases && adjudicationManifest.corrected_case_count === freshStatus.corrected_cases && adjudicationManifest.unresolved_case_count === freshStatus.unresolved_cases);
check("manifest requires an independent reviewer", adjudicationManifest.independent_reviewer_required === true && decisions.independent_reviewer_required === true);
check("adjudication status is consistent", decisions.adjudication_status === adjudicationManifest.adjudication_status && (validation.independent_review_complete ? decisions.adjudication_status === "completed" : decisions.adjudication_status !== "completed"));
check("pending preparation contains no automatic decisions", decisions.adjudication_status !== "pending_independent_review" || decisions.cases.every((item) => item.decision === "pending_independent_review" && item.fields.every((field) => field.decision === "pending") && item.partial_decisions.every((partial) => partial.decision === "pending_independent_review") && item.relation_decisions.every((relation) => relation.decision === "pending")));
check("unresolved tracker does not fabricate human decisions", unresolved.adjudication_unresolved_count === freshStatus.unresolved_fields && /not human unresolved decisions/u.test(unresolved.note));
const validCaseIds = new Set(corpus.cases.map((item) => item.case_id));
check("unresolved tracker references known cases", unresolved.items.every((item) => validCaseIds.has(item.case_id)));
check("Phase 3 candidates identify cases and fields", freshStatus.phase_3_remediation_candidates.every((item) => validCaseIds.has(item.case_id) && typeof item.field_name === "string" && typeof item.reason === "string"));
check("Phase 4C candidates identify cases and fields", freshStatus.phase_4c_semantic_candidates.every((item) => validCaseIds.has(item.case_id) && typeof item.field_name === "string" && typeof item.reason === "string"));
check("review packet contains every case", corpus.cases.every((item) => reviewPacket.includes(`## ${item.case_id} —`)));
check("review packet warns against extractor anchoring", /Do not approve or correct gold solely to match the extractor output/u.test(reviewPacket));
check("review packet separates evidence, candidate, and extractor sections in order", corpus.cases.every((item, index) => {
  const start = reviewPacket.indexOf(`## ${item.case_id} —`);
  const end = index + 1 < corpus.cases.length ? reviewPacket.indexOf(`## ${corpus.cases[index + 1].case_id} —`) : reviewPacket.length;
  const section = reviewPacket.slice(start, end);
  return section.indexOf("### A. Source evidence") < section.indexOf("### B. Candidate gold and human decisions") && section.indexOf("### B. Candidate gold and human decisions") < section.indexOf("### C. Deterministic extractor comparison");
}));
check("review packet presents P0 before P1 and P2", corpus.cases.every((item, index) => {
  const start = reviewPacket.indexOf(`## ${item.case_id} —`);
  const end = index + 1 < corpus.cases.length ? reviewPacket.indexOf(`## ${corpus.cases[index + 1].case_id} —`) : reviewPacket.length;
  const section = reviewPacket.slice(start, end);
  const p0 = section.indexOf("#### P0");
  const later = [section.indexOf("#### P1"), section.indexOf("#### P2")].filter((position) => position >= 0);
  return p0 >= 0 && later.every((position) => p0 < position);
}));
check("Markdown is not declared as decision source of truth", /review aid only/u.test(reviewPacket) && /adjudication-decisions\.json/u.test(reviewPacket));
check("pending preparation does not claim completed review", freshStatus.reviewed_case_count > 0 || (freshStatus.independent_review_complete === false && freshStatus.adjudicated_gold_ready === false));
check("Phase 5 and production remain false", freshStatus.phase5_ready === false && freshStatus.production_ready === false);
const allText = JSON.stringify({ adjudicationManifest, decisions, unresolved, trackedStatus });
check("adjudication assets have no local paths or secrets", !/(?:\/Users\/|\/home\/|DATABASE_URL|SUPABASE_URL|service_role|gho_|sk-[A-Za-z0-9]{12,})/u.test(allText));

console.log(`SCHEMA_VALID=${validation.schema_valid}`);
console.log(`PACKET_COMPLETE=${validation.packet_complete}`);
console.log(`INDEPENDENT_REVIEW_COMPLETE=${validation.independent_review_complete}`);
console.log(`ADJUDICATED_GOLD_READY=${validation.adjudicated_gold_ready}`);
const passed = checks.filter((item) => item.pass).length;
console.log(`ENGINE PHASE 4 GATE C ADJUDICATION VALIDATOR: ${passed === checks.length ? "PASS" : "FAIL"}`);
console.log(`checks=${passed}/${checks.length}`);
if (passed !== checks.length) process.exitCode = 1;
