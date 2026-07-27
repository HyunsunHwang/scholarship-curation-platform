import crypto from "node:crypto";
import { canonicalizeNoticeUrl } from "../../post-phase-l/normalized-graph.mjs";

export const PHASE2_CANDIDATE_CLASSIFICATIONS = Object.freeze([
  "real_notice", "navigation", "pagination", "board_tab", "search_or_filter",
  "attachment", "application_form", "supporting_reference", "same_page",
  "duplicate", "unresolved", "unknown",
]);

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function canonicalUrl(value) {
  return canonicalizeNoticeUrl(clean(value)) ?? "";
}

function candidateKey(candidate = {}) {
  const explicit = clean(candidate.candidateKey ?? candidate.candidate_key);
  if (explicit) return `key:${explicit}`;
  const url = canonicalUrl(candidate.canonicalUrl ?? candidate.canonical_url ?? candidate.noticeUrl ?? candidate.notice_url ?? candidate.url);
  if (url) return `url:${url}`;
  throw new Error("Candidate comparison requires a stable explicit candidate key or canonical notice URL.");
}

function classification(candidate = {}) {
  const value = clean(candidate.classification ?? candidate.candidate_classification ?? candidate.disposition ?? candidate.candidate_disposition);
  if (PHASE2_CANDIDATE_CLASSIFICATIONS.includes(value)) return value;
  const provenance = candidate?.__crawlerCandidateProvenance ?? candidate?.provenance ?? {};
  if (provenance.inside_navigation_container === true
    || candidate?.inside_navigation_container === true) return "navigation";
  if (provenance.inside_pagination_container === true
    || candidate?.inside_pagination_container === true) return "pagination";
  return "unknown";
}

function candidateEvidence(candidate, key, sourceCaptureHash) {
  const provenance = candidate?.__crawlerCandidateProvenance ?? candidate?.provenance ?? {};
  const rawUrl = clean(candidate.noticeUrl ?? candidate.notice_url ?? candidate.url ?? candidate.raw_url) || null;
  const canonical = canonicalUrl(candidate.canonicalUrl ?? candidate.canonical_url ?? rawUrl) || null;
  return {
    candidate_key: key,
    raw_url: rawUrl,
    canonical_url: canonical,
    title: clean(candidate.title ?? candidate.anchor_text) || null,
    parser_strategy: clean(candidate.parser_strategy ?? provenance.candidate_origin) || null,
    matched_selector: clean(candidate.matched_selector ?? provenance.matched_list_selector) || null,
    dom_locator: clean(candidate.dom_locator ?? provenance.candidate_node_fingerprint) || null,
    inside_navigation_container: provenance.inside_navigation_container === true || candidate.inside_navigation_container === true,
    inside_pagination_container: provenance.inside_pagination_container === true || candidate.inside_pagination_container === true,
    classification: classification(candidate),
    classification_evidence: clean(candidate.classification_evidence ?? provenance.link_role) || null,
    source_capture_hash: clean(candidate.source_capture_hash ?? sourceCaptureHash) || null,
  };
}

function indexCandidates(candidates, label, sourceCaptureHash) {
  if (!Array.isArray(candidates)) throw new Error(`${label} candidates must be an array.`);
  const indexed = new Map();
  for (const candidate of candidates) {
    const key = candidateKey(candidate);
    if (indexed.has(key)) throw new Error(`${label} candidates contain duplicate identity ${key}.`);
    indexed.set(key, candidateEvidence(candidate, key, sourceCaptureHash));
  }
  return indexed;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sortedValues(index, predicate) {
  return [...index.values()].filter(predicate).sort((left, right) => left.candidate_key.localeCompare(right.candidate_key));
}

function isUnknownRemoval(candidate) {
  return ["unresolved", "unknown"].includes(candidate.classification);
}

export function buildPhase2CandidateComparison({ sourceId, control, treatment }) {
  const normalizedSourceId = clean(sourceId);
  if (!normalizedSourceId) throw new Error("Candidate comparison requires sourceId.");
  const controlHtmlSha256 = clean(control?.html_sha256 ?? control?.htmlSha256);
  const treatmentHtmlSha256 = clean(treatment?.html_sha256 ?? treatment?.htmlSha256);
  if (!/^[a-f0-9]{64}$/i.test(controlHtmlSha256) || controlHtmlSha256 !== treatmentHtmlSha256) {
    throw new Error("Candidate comparison requires identical SHA-256 evidence for control and treatment HTML.");
  }
  const controlCandidates = indexCandidates(control?.candidates, "control", controlHtmlSha256);
  const treatmentCandidates = indexCandidates(treatment?.candidates, "treatment", treatmentHtmlSha256);
  const common = [...controlCandidates.keys()].filter((key) => treatmentCandidates.has(key)).sort();
  const removed = sortedValues(controlCandidates, (candidate) => !treatmentCandidates.has(candidate.candidate_key));
  const added = sortedValues(treatmentCandidates, (candidate) => !controlCandidates.has(candidate.candidate_key));
  const classificationCounts = (items) => Object.fromEntries(PHASE2_CANDIDATE_CLASSIFICATIONS
    .map((value) => [value, items.filter((candidate) => candidate.classification === value).length])
    .filter(([, count]) => count > 0));
  const comparison = {
    schema_version: "phase2-candidate-comparison-v2",
    source_id: normalizedSourceId,
    same_html_sha256: controlHtmlSha256.toLowerCase(),
    control_candidate_count: controlCandidates.size,
    treatment_candidate_count: treatmentCandidates.size,
    common_candidate_count: common.length,
    removed_candidate_count: removed.length,
    added_candidate_count: added.length,
    removed_real_notice_count: removed.filter((candidate) => candidate.classification === "real_notice").length,
    removed_navigation_count: removed.filter((candidate) => candidate.classification === "navigation").length,
    removed_pagination_count: removed.filter((candidate) => candidate.classification === "pagination").length,
    removed_unknown_count: removed.filter((candidate) => candidate.classification === "unknown").length,
    removed_unresolved_count: removed.filter(isUnknownRemoval).length,
    added_real_notice_count: added.filter((candidate) => candidate.classification === "real_notice").length,
    added_false_positive_count: added.filter((candidate) => candidate.classification !== "real_notice").length,
    common_candidate_keys: common,
    removed_candidates: removed,
    added_candidates: added,
    removed_candidate_urls: removed.map((candidate) => candidate.canonical_url ?? candidate.raw_url ?? candidate.candidate_key),
    added_candidate_urls: added.map((candidate) => candidate.canonical_url ?? candidate.raw_url ?? candidate.candidate_key),
    removed_candidate_classifications: classificationCounts(removed),
    added_candidate_classifications: classificationCounts(added),
    candidate_recall_verified: removed.every((candidate) => candidate.classification !== "real_notice" && !isUnknownRemoval(candidate))
      && added.every((candidate) => candidate.classification === "real_notice"),
    comparison_sha256: "",
  };
  comparison.comparison_sha256 = sha256(JSON.stringify({ ...comparison, comparison_sha256: undefined }));
  return comparison;
}
