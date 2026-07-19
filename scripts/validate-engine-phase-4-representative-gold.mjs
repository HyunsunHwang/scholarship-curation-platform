import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { validateGateCProvenance } from "../lib/engine-phase-4/gate-c-provenance.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
const manifest = read("fixtures/engine-phase-4-representative-gold/manifest.json");
const corpus = read("fixtures/engine-phase-4-representative-gold/cases.json");
const relations = read("fixtures/engine-phase-4-representative-gold/relations.json");
const schema = read("schemas/engine/phase-4-representative-gold-case.schema.json");
const ajv = new Ajv2020({ allErrors: true, strict: true }); addFormats(ajv);
const validate = ajv.compile(schema);
const checks = [];
const check = (name, pass, detail = null) => { checks.push({ name, pass: Boolean(pass), detail }); console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); };
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const cases = corpus.cases;
const allText = [JSON.stringify(manifest), JSON.stringify(corpus), JSON.stringify(relations)].join("\n");
const ids = cases.map((item) => item.case_id);
const sourceCounts = Object.groupBy(cases, (item) => item.source_key);
const provenance = validateGateCProvenance({
  repoRoot: root,
  corpusFreezeSha: manifest.corpus_freeze_sha,
  relationCorrectionSha: manifest.relation_correction_sha,
});

check("case count is 20-30", cases.length >= 20 && cases.length <= 30, String(cases.length));
check("target case count is 24", cases.length === manifest.target_case_count && manifest.target_case_count === 24);
check("at least eight unique source keys", Object.keys(sourceCounts).length >= 8, String(Object.keys(sourceCounts).length));
check("no source contributes more than four cases", Object.values(sourceCounts).every((items) => items.length <= 4));
check("case IDs are unique", new Set(ids).size === ids.length);
check("all cases satisfy candidate-gold schema", cases.every((item) => validate(item)), validate.errors ? JSON.stringify(validate.errors) : null);
check("all URLs are public HTTP(S)", cases.every((item) => /^https?:\/\//u.test(item.public_url)));
const manifestBasis = { fixture_version: manifest.fixture_version, policy_version: manifest.policy_version, selected_case_ids: manifest.selected_case_ids, selected_public_urls: manifest.selected_public_urls, selection_completed_at: manifest.selection_completed_at };
check("selection manifest hash matches frozen basis", manifest.selection_manifest_hash === sha256(JSON.stringify(manifestBasis)));
check("separate corpus and relation provenance model is explicit", manifest.provenance_model === "separate_corpus_and_relation_provenance" && typeof manifest.corpus_freeze_ref === "string" && manifest.corpus_freeze_ref.length > 0);
check("corpus freeze SHA has full commit shape", provenance.corpus_freeze_sha_format_valid);
check("relation correction SHA has full commit shape", provenance.relation_provenance_sha_format_valid);
check("corpus freeze Git object exists", provenance.corpus_freeze_commit_exists);
check("relation correction Git object exists", provenance.relation_provenance_commit_exists);
check("corpus freeze is an ancestor of the target branch", provenance.corpus_freeze_is_branch_ancestor);
check("relation correction is an ancestor of the target branch", provenance.relation_provenance_is_branch_ancestor);
check("corpus freeze is at or after the Gate C base", provenance.corpus_freeze_is_after_or_equal_to_gate_c_base);
check("relation correction is at or after the Gate C base", provenance.relation_provenance_is_after_or_equal_to_gate_c_base);
check("relation correction is not earlier than corpus freeze", provenance.relation_provenance_order_valid);
check("Git-aware provenance validation passes", provenance.provenance_validation_status === "PASS", provenance.errors.join(", ") || null);
check("manifest and corpus case identities match", JSON.stringify(manifest.selected_case_ids) === JSON.stringify(ids));
check("manifest and corpus public URLs match", JSON.stringify(manifest.selected_public_urls) === JSON.stringify(cases.map((item) => item.public_url)));
check("policy and adjudication are fixed", manifest.independent_adjudication_status === "pending_independent_review" && cases.every((item) => item.annotator_policy_version === manifest.policy_version && item.adjudication_status === "pending_independent_review"));
check("source capture hashes are present", cases.every((item) => /^[a-f0-9]{64}$/u.test(item.source_capture_hash)));
check("evidence excerpts are at most 500 characters", cases.every((item) => item.gold_evidence.every((evidence) => [...evidence.excerpt].length <= 500)));
check("evidence IDs are unique per case", cases.every((item) => { const refs = item.gold_evidence.map((entry) => entry.evidence_id); return new Set(refs).size === refs.length; }));
check("present or conflict annotations have evidence", cases.every((item) => Object.values(item.gold_fields).every((field) => !["present", "ambiguous", "conflicting"].includes(field.value_status) || field.evidence_refs.length > 0)));
check("field evidence references resolve", cases.every((item) => { const refs = new Set(item.gold_evidence.map((entry) => entry.evidence_id)); return Object.values(item.gold_fields).every((field) => field.evidence_refs.every((ref) => refs.has(ref))); }));
check("evidence locators and hashes are present", cases.every((item) => item.gold_evidence.every((entry) => Object.keys(entry.locator).length > 0 && /^[a-f0-9]{64}$/u.test(entry.document_revision_hash))));
check("partial gold exists for at least five cases", cases.filter((item) => item.partial_gold.length > 0).length >= 5, String(cases.filter((item) => item.partial_gold.length > 0).length));
check("partial policies are predeclared and linked", cases.every((item) => item.partial_gold.every((entry) => item.gold_fields[entry.field]?.partial_match_policy?.policy === entry.policy)));
const relationPairs = relations.groups.flatMap((group) => group.pairs);
check("at least five relation groups", relations.groups.length >= 5, String(relations.groups.length));
check("at least eight relation pairs", relationPairs.length >= 8, String(relationPairs.length));
check("relation case references resolve", relations.groups.every((group) => group.case_ids.every((id) => ids.includes(id)) && group.pairs.every((pair) => ids.includes(pair.left) && ids.includes(pair.right))));
check("case relation group references resolve", cases.every((item) => item.relation_group_ids.every((id) => relations.groups.some((group) => group.group_id === id))));
check("no absolute local paths", !/(?:[A-Za-z]:\\\\|\/Users\/|\/home\/)/u.test(allText));
check("no obvious secret-like values", !/(?:gho_|sk-[A-Za-z0-9]{12,}|service_role|DATABASE_URL|SUPABASE_URL|authorization\s*:|bearer\s+[A-Za-z0-9._-]+)/iu.test(allText));
check("no raw binary or full HTML payload", !/(?:base64,|<!doctype\s+html|<html[\s>])/iu.test(allText));
check("failed and unsupported cases are retained", manifest.failed_cases_retained === true && cases.some((item) => ["tool_unavailable", "ocr_not_evaluated"].includes(item.parser_quality)));
check("HWP/HWPX limitations are honest", cases.filter((item) => ["hwp", "hwpx"].includes(item.input_format)).every((item) => item.parser_quality === "tool_unavailable"));
check("image/OCR limitation is honest", cases.filter((item) => item.input_format === "image").every((item) => item.parser_quality === "ocr_not_evaluated"));

const passed = checks.filter((item) => item.pass).length;
console.log(`ENGINE PHASE 4 GATE C GOLD VALIDATOR: ${passed === checks.length ? "PASS" : "FAIL"}`);
console.log(`checks=${passed}/${checks.length}`);
console.log(`provenance_status=${provenance.provenance_validation_status}`);
if (passed !== checks.length) process.exitCode = 1;
