import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { caseSeeds } from "../fixtures/engine-phase-4-representative-gold/corpus-source.mjs";
import { extractDeterministicScholarshipCandidate } from "../lib/engine-phase-4/deterministic-extractor.mjs";
import {
  ADJUDICATION_CREATED_AT,
  ADJUDICATION_SCHEMA_VERSION,
  buildInitialAdjudicationDecisions,
  buildRemediationCandidates,
  summarizeAdjudication,
  validateAdjudicationPacket,
} from "../lib/engine-phase-4/gate-c-adjudication.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
const writeJson = (name, value) => {
  const output = path.join(root, name);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(value, null, 2)}\n`);
};
const corpus = read("fixtures/engine-phase-4-representative-gold/cases.json");
const sourceManifest = read("fixtures/engine-phase-4-representative-gold/manifest.json");
const relations = read("fixtures/engine-phase-4-representative-gold/relations.json");
const schema = read("schemas/engine/phase-4-gate-c-adjudication.schema.json");
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

const decisionsPath = "fixtures/engine-phase-4-representative-gold/adjudication/adjudication-decisions.json";
const decisionsExist = fs.existsSync(path.join(root, decisionsPath));
const forceInitialize = process.argv.includes("--force-initialize");
const decisions = decisionsExist && !forceInitialize
  ? read(decisionsPath)
  : buildInitialAdjudicationDecisions(corpus, relations, sourceManifest.selection_manifest_hash);
const extractionContext = {
  extractorVersion: "1.0.0",
  parserContractVersion: "engine-phase-3-document-result/v1",
  evaluationFixtureVersion: corpus.fixture_version,
  extractedAt: ADJUDICATION_CREATED_AT,
};
const extractorByCase = new Map(corpus.cases.map((fixture) => [
  fixture.case_id,
  extractDeterministicScholarshipCandidate({ ...fixture.evaluation_input, extractionContext }),
]));
const validation = validateAdjudicationPacket({ corpus, relations, manifest: sourceManifest, decisions, validateSchema });
if (!validation.schema_valid || !validation.packet_complete) throw new Error(`Generated adjudication packet is invalid: ${JSON.stringify(validation)}`);
const remediation = buildRemediationCandidates(corpus, extractorByCase);
const status = summarizeAdjudication(decisions, remediation, validation);

const adjudicationManifest = {
  phase: "ENGINE_PHASE_4",
  gate: "GATE_C",
  task: "independent-gold-adjudication-preparation",
  source_fixture_version: corpus.fixture_version,
  candidate_gold_policy_version: corpus.policy_version,
  case_count: corpus.cases.length,
  case_ids: corpus.cases.map((item) => item.case_id),
  source_case_manifest_hash: sourceManifest.selection_manifest_hash,
  corpus_freeze_sha: sourceManifest.corpus_freeze_sha,
  relation_correction_sha: sourceManifest.relation_correction_sha,
  adjudication_schema_version: ADJUDICATION_SCHEMA_VERSION,
  adjudication_status: decisions.adjudication_status,
  independent_reviewer_required: true,
  created_at: ADJUDICATION_CREATED_AT,
  reviewed_case_count: status.reviewed_case_count,
  approved_case_count: status.approved_cases,
  corrected_case_count: status.corrected_cases,
  unresolved_case_count: status.unresolved_cases,
};

const unresolvedItems = [];
const addUnresolved = (item) => unresolvedItems.push({
  item_id: `review_risk_${String(unresolvedItems.length + 1).padStart(3, "0")}`,
  ...item,
});
for (const item of remediation.phase3) {
  const currentStatus = item.reason === "authoritative_ocr_missing"
    ? "ocr_required"
    : item.reason === "authoritative_source_text_missing"
      ? "authoritative_document_missing"
      : "phase_3_parse_required";
  addUnresolved({ ...item, category: "phase_3_input_provenance", current_status: currentStatus });
}
for (const fixture of corpus.cases) {
  if (fixture.source_status !== "available_at_selection") addUnresolved({ case_id: fixture.case_id, field_name: "source_provenance", category: "source_access", reason: fixture.source_status, current_status: "authoritative_document_missing" });
  for (const reason of fixture.gold_review_reason_codes) addUnresolved({ case_id: fixture.case_id, field_name: "candidate_gold", category: "suspected_candidate_gold_problem", reason, current_status: "requires_independent_decision" });
  for (const partial of fixture.partial_gold) addUnresolved({ case_id: fixture.case_id, field_name: partial.field, category: "partial_gold", reason: `element_level_${partial.policy}_not_adjudicated`, current_status: "pending_independent_review" });
}
for (const group of relations.groups.filter((item) => item.coverage_limitation)) addUnresolved({ case_id: group.case_ids[0], field_name: "relation_meaning", category: "relation_coverage", reason: group.coverage_limitation, current_status: "requires_independent_decision" });
const unresolvedTracker = {
  schema_version: "engine-phase-4-gate-c-adjudication-unresolved-items/v1",
  source_fixture_version: corpus.fixture_version,
  adjudication_unresolved_count: status.unresolved_fields,
  note: "These are preparation-time risks, not human unresolved decisions. A reviewer must decide their disposition.",
  items: unresolvedItems,
};

const sourceNameByCase = new Map(caseSeeds.map((seed) => [seed.case_id, seed.source_name]));
const formatValue = (value) => JSON.stringify(value).replaceAll("|", "\\|").replaceAll("\n", " ");
const markdown = [
  "# Engine Phase 4 Gate C — independent gold adjudication review packet",
  "",
  "> **Independence warning:** Do not approve or correct gold solely to match the extractor output. Adjudication must be based on the retained public evidence and the canonical policy.",
  "",
  "This Markdown file is a review aid only. Record all decisions in `fixtures/engine-phase-4-representative-gold/adjudication/adjudication-decisions.json`.",
  "",
  `- Frozen corpus: \`${sourceManifest.corpus_freeze_sha}\``,
  `- Relation correction: \`${sourceManifest.relation_correction_sha}\``,
  `- Cases: ${corpus.cases.length}`,
  "- Initial status: `pending_independent_review`",
  "- P0: identity, classification, ambiguity/conflict, and relation meaning",
  "- P1: complex dates, eligibility, documents, methods, amounts, and partial overlap",
  "- P2: simpler explicit fields; never auto-approved",
  "",
];

for (const fixture of corpus.cases) {
  const caseDecision = decisions.cases.find((item) => item.case_id === fixture.case_id);
  const extracted = extractorByCase.get(fixture.case_id);
  markdown.push(
    `## ${fixture.case_id} — ${fixture.public_title}`,
    "",
    `- **Case priority / decision:** \`${caseDecision.case_priority}\` / \`${caseDecision.decision}\``,
    `- **Source:** ${sourceNameByCase.get(fixture.case_id) ?? fixture.source_key} (\`${fixture.source_key}\`)`,
    `- **Public URL:** ${fixture.public_url}`,
    `- **Posted / kind / format:** ${fixture.public_posted_date} / \`${fixture.document_kind_gold}\` / \`${fixture.input_format}\``,
    `- **Parser / source status:** \`${fixture.parser_quality}\` / \`${fixture.source_status}\``,
    `- **Review reasons:** ${fixture.gold_review_reason_codes.length ? fixture.gold_review_reason_codes.map((item) => `\`${item}\``).join(", ") : "none recorded"}`,
    `- **Relation groups:** ${fixture.relation_group_ids.length ? fixture.relation_group_ids.map((item) => `\`${item}\``).join(", ") : "none"}`,
    "",
    "### A. Source evidence",
    "",
  );
  for (const evidence of fixture.gold_evidence) markdown.push(`- **${evidence.evidence_id}** (${evidence.source_type}): ${evidence.excerpt}`);
  markdown.push("", "### B. Candidate gold and human decisions", "");
  for (const priority of ["P0", "P1", "P2"]) {
    const fields = caseDecision.fields.filter((item) => item.priority === priority);
    if (!fields.length) continue;
    markdown.push(`#### ${priority}`, "", "| Field | Candidate status | Candidate normalized value | Evidence | Current decision | Human choice |", "| --- | --- | --- | --- | --- | --- |");
    for (const item of fields) markdown.push(`| ${item.field_name} | ${item.candidate_gold.status} | ${formatValue(item.candidate_gold.normalized_value)} | ${item.candidate_gold.evidence_ids.join(", ") || "none"} | ${item.decision} | [ ] approve · [ ] correct · [ ] unresolved |`);
    markdown.push("");
  }
  if (caseDecision.partial_decisions.length) {
    markdown.push("#### P1 partial-overlap decisions", "");
    for (const item of caseDecision.partial_decisions) markdown.push(`- **${item.field_name}** — \`${item.candidate_partial_policy.policy}\` — \`${item.decision}\` — [ ] approve policy/targets · [ ] correct · [ ] unresolved/not adjudicable`);
    markdown.push("");
  }
  if (caseDecision.relation_decisions.length) {
    markdown.push("#### P0 relation decisions", "");
    for (const item of caseDecision.relation_decisions) markdown.push(`- **${item.group_id}** — ${formatValue(item.candidate_relation)} — \`${item.decision}\` — [ ] approve · [ ] correct · [ ] unresolved`);
    markdown.push("");
  }
  markdown.push(
    "### C. Deterministic extractor comparison — not gold evidence",
    "",
    `- Classification: \`${extracted.classification.document_kind}\` (candidate: \`${fixture.document_kind_gold}\`)`,
    `- Review required: \`${extracted.review.required}\`; reasons: ${extracted.review.reason_codes.map((item) => `\`${item}\``).join(", ") || "none"}`,
    "",
    "| Field | Extractor status | Extractor normalized value |",
    "| --- | --- | --- |",
  );
  for (const item of caseDecision.fields.filter((field) => field.field_name !== "document_kind")) {
    const predicted = extracted.fields[item.field_name];
    markdown.push(`| ${item.field_name} | ${predicted?.value_status ?? "missing"} | ${formatValue(predicted?.normalized_value ?? null)} |`);
  }
  markdown.push("", "---", "");
}

writeJson("fixtures/engine-phase-4-representative-gold/adjudication/adjudication-manifest.json", adjudicationManifest);
if (!decisionsExist || forceInitialize) writeJson(decisionsPath, decisions);
writeJson("fixtures/engine-phase-4-representative-gold/adjudication/unresolved-items.json", unresolvedTracker);
writeJson("reports/engine-phase-4-gate-c-adjudication-status.json", status);
fs.writeFileSync(path.join(root, "reports/engine-phase-4-gate-c-adjudication-review.md"), `${markdown.join("\n")}\n`);

console.log(`cases=${status.total_cases}`);
console.log(`fields=${status.total_fields}`);
console.log(`p0_pending=${status.p0_pending}`);
console.log(`p1_pending=${status.p1_pending}`);
console.log(`p2_pending=${status.p2_pending}`);
console.log(`schema_valid=${status.schema_valid}`);
console.log(`packet_complete=${status.packet_complete}`);
console.log(`independent_review_complete=${status.independent_review_complete}`);
console.log("ENGINE PHASE 4 GATE C ADJUDICATION PACKET BUILDER: PASS");
