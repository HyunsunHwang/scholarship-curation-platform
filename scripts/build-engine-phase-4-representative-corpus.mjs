import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CAPTURED_AT, FIXTURE_VERSION, POLICY_VERSION, caseSeeds, relationGroups } from "../fixtures/engine-phase-4-representative-gold/corpus-source.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, "fixtures/engine-phase-4-representative-gold");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const field = (status, raw = null, normalized = null, evidence = []) => ({
  value_status: status, raw_value: raw, normalized_value: normalized, evidence_refs: evidence,
  annotation_reason: status === "present" ? "Directly stated in the cited public evidence excerpt." : "Not established by the retained minimal evidence.",
  partial_match_policy: null,
});

function amountValue(raw) {
  if (!raw) return null;
  if (/100만원/u.test(raw)) return { kind: "exact", currency: "KRW", amount: 1_000_000, period: null, description: raw };
  if (/3백만원/u.test(raw)) return { kind: "exact", currency: "KRW", amount: 3_000_000, period: null, description: raw };
  if (/2,000,000/u.test(raw)) return { kind: "exact", currency: "KRW", amount: 2_000_000, period: null, description: raw };
  if (/4,800,000/u.test(raw)) return { kind: "exact", currency: "KRW", amount: 4_800_000, period: "semester", description: raw };
  if (/1,000,000/u.test(raw)) return { kind: "exact", currency: "KRW", amount: 1_000_000, period: null, description: raw };
  if (/30만원/u.test(raw)) return { kind: "exact", currency: "KRW", amount: 300_000, period: null, description: raw };
  return raw.includes("or") || raw.includes(",") || raw.includes("·") ? null : { kind: "unparsed", currency: "KRW", description: raw };
}

function buildCase(seed) {
  const evidenceId = `${seed.case_id}_e1`;
  const captureHash = sha256(JSON.stringify({ url: seed.url, title: seed.title, published: seed.published, excerpt: seed.excerpt }));
  const isResult = seed.kind === "result_announcement";
  const deadlineStatus = seed.deadline === "conflicting_multiple_deadlines" ? "conflicting" : seed.deadline ? "present" : isResult ? "not_applicable" : "not_found";
  const amountStatus = seed.amount && amountValue(seed.amount) ? "present" : seed.amount ? "ambiguous" : "not_found";
  const goldFields = {
    title: field("present", seed.title, seed.title, [evidenceId]),
    provider: field("present", seed.provider ?? seed.source_name, seed.provider ?? seed.source_name, [evidenceId]),
    scholarship_program_name: field(seed.program ? "present" : "unknown", seed.program ?? null, seed.program ?? null, seed.program ? [evidenceId] : []),
    recruitment_cycle_label: field(seed.cycle ? "present" : "unknown", seed.cycle ?? null, seed.cycle ?? null, seed.cycle ? [evidenceId] : []),
    application_start: field(isResult ? "not_applicable" : "not_found"),
    application_deadline: field(deadlineStatus, seed.deadline ?? null, deadlineStatus === "present" ? seed.deadline : null, deadlineStatus === "present" || deadlineStatus === "conflicting" ? [evidenceId] : []),
    amount: field(amountStatus, seed.amount ?? null, amountStatus === "present" ? amountValue(seed.amount) : null, seed.amount ? [evidenceId] : []),
    eligibility: field(seed.partial?.includes("eligibility") ? "present" : "not_found", seed.partial?.includes("eligibility") ? seed.excerpt : null, seed.partial?.includes("eligibility") ? { operator: "review_required", conditions: [] } : null, seed.partial?.includes("eligibility") ? [evidenceId] : []),
    required_documents: field(seed.partial?.includes("required_documents") ? "present" : "not_found", seed.partial?.includes("required_documents") ? seed.excerpt : null, seed.partial?.includes("required_documents") ? ["predeclared_evidence_bounded_set"] : null, seed.partial?.includes("required_documents") ? [evidenceId] : []),
    application_method: field(seed.partial?.includes("application_method") ? "present" : "not_found", seed.partial?.includes("application_method") ? seed.excerpt : null, seed.partial?.includes("application_method") ? ["predeclared_evidence_bounded_set"] : null, seed.partial?.includes("application_method") ? [evidenceId] : []),
    application_url: field("not_found"), source_language: field("present", seed.language === "en" ? "English" : "한국어", seed.language ?? "ko", [evidenceId]),
    status: field("present", seed.kind, seed.kind, [evidenceId]), notes: field("not_found"),
  };
  for (const name of seed.partial ?? []) {
    if (goldFields[name]) goldFields[name].partial_match_policy = name === "application_deadline" || name === "amount"
      ? { policy: "range_boundary_and_bounded_overlap/v1", threshold: null }
      : name === "eligibility"
        ? { policy: "condition_set_and_boolean_structure/v1", threshold: null }
        : { policy: "set_precision_recall/v1", threshold: null };
  }
  const sourceDocument = seed.format === "html" ? [] : [{
    document_id: `${seed.case_id}_document`, document_revision_id: `${seed.case_id}_document_revision_1`,
    document_hash: sha256(`${seed.url}|${seed.format}|${seed.excerpt}`), media_type: seed.format === "table" ? "pdf" : seed.format,
    parser_version: "representative-minimal-evidence-capture/v1", extraction_status: seed.parser,
    quality_status: seed.parser, manual_review_required: !["text_sufficient", "partial_text"].includes(seed.parser),
    manual_review_reasons: !["text_sufficient", "partial_text"].includes(seed.parser) ? [seed.parser] : [], ocr_used: false,
    normalized_text: ["hwp", "hwpx", "image"].includes(seed.format) ? "" : seed.excerpt,
    content_blocks: seed.format === "table" ? [{ type: "table", page_number: 1, caption: "public evidence excerpt", rows: [[seed.excerpt]], source_order: 0 }]
      : seed.format === "pdf" ? [{ type: "pdf_page", page_number: 1, text: seed.excerpt, source_order: 0 }] : [],
  }];
  return {
    case_id: seed.case_id, source_key: seed.source_key, source_level: seed.source_level, source_type: seed.source_type,
    public_url: seed.url, notice_identity: sha256(`${seed.source_key}|${seed.url}`).slice(0, 24), public_title: seed.title,
    public_posted_date: seed.published, document_kind_gold: seed.kind, input_format: seed.format, parser_quality: seed.parser,
    selection_stratum: `${seed.source_level}/${seed.format}/${seed.kind}`, selection_reason: "Pre-extractor representative selection for source, format, notice-kind, or known difficulty coverage.",
    source_status: seed.source_status ?? "available_at_selection", source_capture_hash: captureHash, source_capture_scope: "minimal_public_evidence_snapshot",
    annotator_policy_version: POLICY_VERSION, annotation_status: "candidate_gold", adjudication_status: "pending_independent_review",
    gold_fields: goldFields, gold_review_required: (seed.ambiguity?.length ?? 0) > 0,
    gold_review_reason_codes: seed.ambiguity ?? [],
    gold_evidence: [{ evidence_id: evidenceId, source_type: seed.format === "html" ? "html_text" : seed.format === "table" ? "pdf_table_cell" : ["hwp", "hwpx", "image"].includes(seed.format) ? "attachment_metadata" : "pdf_text", excerpt: seed.excerpt, content_hash: sha256(seed.excerpt), document_revision_hash: sourceDocument[0]?.document_hash ?? captureHash, locator: seed.format === "html" ? { html_selector: "public notice body", section: "minimal evidence snapshot" } : seed.format === "table" ? { page_number: 1, table_coordinates: { row: 0, column: 0 }, section: "table excerpt" } : { page_number: seed.format === "pdf" ? 1 : null, section: "attachment or document excerpt" }, annotation_reason: "Minimal excerpt transcribed from the public source; full raw content is intentionally not tracked." }],
    partial_gold: (seed.partial ?? []).map((fieldName) => ({ field: fieldName, ...goldFields[fieldName].partial_match_policy })),
    relation_group_ids: seed.relation_groups ?? [],
    evaluation_input: { sourceNotice: { source_id: seed.source_key, source_key_snapshot: seed.source_key, notice_id: `notice_${seed.case_id}`, identity_kind: "canonical_detail_url", identity_key: `url:${sha256(seed.url)}`, canonical_url: seed.url, revision_id: `revision_${seed.case_id}`, revision_ordinal: 1, parser_version: "representative-minimal-evidence-capture/v1", title: seed.title, body: seed.format === "html" || seed.format === "table" ? seed.excerpt : "", published_at: seed.published, body_quality_status: seed.parser, relationship_hints: seed.relation_groups?.length ? { cross_source_required: true } : {} }, sourceDocuments: sourceDocument },
  };
}

const cases = caseSeeds.map(buildCase);
const manifestBasis = { fixture_version: FIXTURE_VERSION, policy_version: POLICY_VERSION, selected_case_ids: cases.map((item) => item.case_id), selected_public_urls: cases.map((item) => item.public_url), selection_completed_at: CAPTURED_AT };
const manifest = {
  ...manifestBasis,
  selection_manifest_hash: sha256(JSON.stringify(manifestBasis)),
  provenance_model: "separate_corpus_and_relation_provenance",
  corpus_freeze_sha: "f410929e93f7f003ad39a03a2376b4a24ef755dc",
  corpus_freeze_ref: "first_gate_c_corpus_introduction_commit",
  corpus_freeze_scope: "Representative case selection, case payloads, field annotations and evidence, schema, and manifest membership as introduced by the first Gate C commit.",
  relation_correction_sha: "3f5d26cd0128083b240f9ae5d8a7fa513ee63a3c",
  relation_correction_scope: "Removal of invalid relation self-pairs and replacement with distinct-case relation comparisons in the Gate C evaluation commit.",
  deprecated_provenance: [{
    field: "corpus_freeze_sha",
    value: "f4109294e86df35f2b9508b20edc665a18c50334",
    status: "invalid_git_object",
    replacement: "f410929e93f7f003ad39a03a2376b4a24ef755dc",
  }],
  target_case_count: 24, minimum_case_count: 20, maximum_case_count: 30, source_count_limit: 12,
  selection_method: "Purposeful stratified public-source sampling fixed before extractor execution.",
  failed_cases_retained: true, replacement_cases: [], raw_documents_tracked: false, independent_adjudication_status: "pending_independent_review",
};
const relations = { fixture_version: FIXTURE_VERSION, policy_version: POLICY_VERSION, groups: relationGroups };
fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(path.join(outputDir, "cases.json"), `${JSON.stringify({ fixture_version: FIXTURE_VERSION, policy_version: POLICY_VERSION, cases }, null, 2)}\n`);
fs.writeFileSync(path.join(outputDir, "relations.json"), `${JSON.stringify(relations, null, 2)}\n`);
console.log(`cases=${cases.length}`);
console.log(`sources=${new Set(cases.map((item) => item.source_key)).size}`);
console.log(`manifest_hash=${manifest.selection_manifest_hash}`);
