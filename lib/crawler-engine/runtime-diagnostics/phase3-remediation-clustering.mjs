import crypto from "node:crypto";
import { canonicalizeNoticeUrl } from "../../post-phase-l/normalized-graph.mjs";
import { buildPhase2CandidateComparison } from "./phase2-candidate-comparison.mjs";

export const PHASE3_CLUSTER_VERSION = "phase3-structural-cluster-v1";
export const PHASE3_CLUSTER_EVIDENCE_STATUSES = Object.freeze([
  "ready_for_fixture",
  "capture_required",
  "evidence_reconciliation_required",
]);

function clean(value) { return String(value ?? "").trim(); }
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}
function canonicalJson(value) { return JSON.stringify(stable(value)); }
function uniqueSorted(values) { return [...new Set(values.filter(Boolean))].sort(); }

function isHttpUrl(value) {
  try { return ["http:", "https:"].includes(new URL(clean(value)).protocol); } catch { return false; }
}

function looksUrlLike(value) {
  const text = clean(value);
  if (!text) return false;
  if (/^(?:https?:)?\/\//i.test(text) || /^(?:\/|\.\/|\.\.\/)/.test(text)) return true;
  if (/\bhttps?:\/\//i.test(text)) return true;
  return /(?:[/?&](?:articleNo|boardNo|nttNo|idx|id|no|wr_id|uid|seq)=|\/[^\s:]+\?[^\s]+)/i.test(text);
}

/** Separates legacy diagnostic fingerprints from actual DOM locators. */
export function classifyCandidateFingerprint(value) {
  const fingerprint = clean(value);
  if (!fingerprint) return { kind: "absent", candidate_origin: null, dom_locator: null };
  const match = fingerprint.match(/^([a-z][a-z0-9_-]*):(.*)$/i);
  const candidateOrigin = match ? clean(match[1]) || null : null;
  const payload = match ? clean(match[2]) : fingerprint;
  if (looksUrlLike(payload) || Boolean(canonicalizeNoticeUrl(payload))) {
    return { kind: "url_based", candidate_origin: candidateOrigin, dom_locator: null };
  }
  return { kind: "dom_locator", candidate_origin: candidateOrigin, dom_locator: payload || null };
}

export function extractCandidateOrigin(candidate = {}) {
  const provenance = candidate.provenance ?? candidate.__crawlerCandidateProvenance ?? {};
  const explicit = clean(provenance.candidate_origin ?? candidate.candidate_origin);
  if (explicit) return explicit;
  return classifyCandidateFingerprint(provenance.candidate_node_fingerprint ?? candidate.candidate_node_fingerprint).candidate_origin;
}

export function normalizeCandidateLocator(candidate = {}) {
  const provenance = candidate.provenance ?? candidate.__crawlerCandidateProvenance ?? {};
  const explicit = clean(provenance.dom_locator ?? candidate.dom_locator);
  const fingerprint = classifyCandidateFingerprint(provenance.candidate_node_fingerprint ?? candidate.candidate_node_fingerprint);
  const locator = explicit || fingerprint.dom_locator;
  if (!locator) return null;
  return locator
    .replace(/:nth-(?:child|of-type)\(\d+\)/g, (match) => match.replace(/\d+/, "*"))
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "{uuid}")
    .replace(/\b\d{2,}\b/g, "{number}") || null;
}

function candidateIdentity(candidate) {
  const explicit = clean(candidate?.candidateKey ?? candidate?.candidate_key);
  if (explicit) return `key:${explicit}`;
  const url = canonicalizeNoticeUrl(candidate?.canonical_url ?? candidate?.canonicalUrl ?? candidate?.raw_url ?? candidate?.noticeUrl ?? candidate?.notice_url ?? candidate?.url);
  if (!url) throw new Error("Candidate lacks a stable explicit key and canonical URL.");
  return `url:${url}`;
}

function domFamily({ selector = "", locator = "", parser = {} } = {}) {
  const text = `${selector} ${locator} ${parser.content_topology_profile ?? ""}`.toLowerCase();
  if (/inline|section/.test(text) || parser.inline_notice_section_count > 0) return "inline_section";
  if (/\btable\b|\btr\b|\btd\b/.test(text)) return "table_row";
  if (/\b(?:ul|ol)\b|\bli\b/.test(text)) return "list_item";
  if (/card|tile|article/.test(text)) return "card";
  if (/\bh[1-6]\b|heading/.test(text)) return "heading";
  return "generic_anchor";
}

function urlIdentityShape(candidate = {}) {
  const raw = clean(candidate.raw_url ?? candidate.noticeUrl ?? candidate.notice_url ?? candidate.url);
  const canonical = canonicalizeNoticeUrl(candidate.canonical_url ?? candidate.canonicalUrl ?? raw);
  const extraction = /^javascript:/i.test(raw) ? "javascript_handler"
    : /^(?:#|javascript:)/i.test(raw) ? "event_handler"
      : /^https?:\/\//i.test(raw) ? "absolute_url" : "relative_url";
  if (!canonical) return { extraction_method: extraction, unresolved_url: true };
  const url = new URL(canonical);
  const keys = uniqueSorted([...url.searchParams.keys()]);
  const identityKeys = keys.filter((key) => /(?:^|_)(?:id|idx|seq|no|uid)|article|board|ntt|wr_id/i.test(key));
  const pathSegments = url.pathname.split("/").filter(Boolean);
  const pathnameTemplate = `/${pathSegments.map((segment) => {
    if (/^[0-9]+$/.test(segment)) return "{number}";
    if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)) return "{uuid}";
    return segment;
  }).join("/")}`;
  return {
    extraction_method: extraction,
    absolute_or_relative: extraction,
    pathname_template: pathnameTemplate,
    query_parameter_keys: keys,
    identity_parameter_hints: identityKeys,
    path_parameter_shape: pathSegments.some((segment) => /^\d+$/.test(segment)) ? "numeric_path_segment"
      : pathSegments.some((segment) => /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)) ? "uuid_path_segment" : "none",
    fragment_removed: Boolean(raw && new URL(canonical).hash === "" && /#/.test(raw)),
    detail_url_pattern_family: `${pathnameTemplate}${keys.length ? `?${keys.join("&")}` : ""}`,
  };
}

function countObject(values) {
  return Object.fromEntries([...values].sort().map((value) => [value, values.filter((item) => item === value).length]));
}

function memberDecision(evidence) {
  return evidence.candidate_comparison.candidate_recall_verified === true
    ? { evidence_status: "ready_for_fixture", next_action: "collect_authoritative_fixture", next_phase_queue: "fixture_first_parser_remediation", blocking_reason: null }
    : { evidence_status: "evidence_reconciliation_required", next_action: "reconcile_candidate_comparison", next_phase_queue: "evidence_reconciliation", blocking_reason: "candidate_recall_not_verified" };
}

function assertCounts(comparison) {
  const countFields = ["control_candidate_count", "treatment_candidate_count", "common_candidate_count", "removed_candidate_count", "added_candidate_count", "removed_real_notice_count", "removed_unresolved_count", "added_false_positive_count"];
  for (const field of countFields) if (!Number.isSafeInteger(comparison[field]) || comparison[field] < 0) throw new Error(`Candidate comparison has invalid ${field}.`);
  if (comparison.control_candidate_count !== comparison.common_candidate_count + comparison.removed_candidate_count
    || comparison.treatment_candidate_count !== comparison.common_candidate_count + comparison.added_candidate_count
    || comparison.removed_real_notice_count + comparison.removed_unresolved_count > comparison.removed_candidate_count
    || comparison.added_false_positive_count > comparison.added_candidate_count) throw new Error("Candidate comparison arithmetic invariant failed.");
}

function assertComparison(evidence) {
  const comparison = evidence.candidate_comparison;
  if (!comparison || clean(comparison.source_id) !== clean(evidence.source_id)) throw new Error("Candidate comparison source ID mismatch.");
  const captureHash = clean(evidence.capture.html_sha256);
  if (clean(comparison.same_html_sha256) !== captureHash) throw new Error("Candidate comparison same HTML hash mismatch.");
  assertCounts(comparison);
  const control = evidence.control.candidates ?? [];
  const treatment = evidence.treatment.candidates ?? [];
  const sideIdentities = (items, label) => {
    const values = items.map(candidateIdentity);
    if (new Set(values).size !== values.length) throw new Error(`${label} candidates contain duplicate normalized identity.`);
  };
  sideIdentities(control, "control"); sideIdentities(treatment, "treatment");
  for (const candidate of [...control, ...treatment]) if (clean(candidate.source_capture_hash) !== captureHash) throw new Error("Candidate source capture hash mismatch.");
  const rebuilt = buildPhase2CandidateComparison({ sourceId: evidence.source_id, control: evidence.control, treatment: evidence.treatment });
  if (canonicalJson(rebuilt) !== canonicalJson(comparison)) throw new Error("Candidate comparison content or SHA-256 invariant failed.");
  const arrays = [["common_candidate_keys", comparison.common_candidate_count], ["removed_candidates", comparison.removed_candidate_count], ["added_candidates", comparison.added_candidate_count]];
  for (const [field, expected] of arrays) if (!Array.isArray(comparison[field]) || comparison[field].length !== expected) throw new Error(`Candidate comparison ${field} invariant failed.`);
  if (!Array.isArray(comparison.removed_candidate_urls) || comparison.removed_candidate_urls.length !== comparison.removed_candidate_count
    || !Array.isArray(comparison.added_candidate_urls) || comparison.added_candidate_urls.length !== comparison.added_candidate_count) throw new Error("Candidate comparison URL evidence invariant failed.");
  const classificationCounts = (items) => countObject(items.map((item) => item.classification));
  if (canonicalJson(classificationCounts(comparison.removed_candidates)) !== canonicalJson(comparison.removed_candidate_classifications)
    || canonicalJson(classificationCounts(comparison.added_candidates)) !== canonicalJson(comparison.added_candidate_classifications)) throw new Error("Candidate comparison classification evidence invariant failed.");
}

function assertSameCaptureEvidence(evidence, sourceId) {
  if (!evidence || evidence.schema_version !== "phase2-same-html-comparison-v1") throw new Error(`${sourceId}: phase 3 requires phase2-same-html-comparison-v1 evidence.`);
  const expectedSource = clean(sourceId);
  if (!expectedSource) throw new Error("Phase 3 baseline source ID is empty.");
  const sourceFields = [evidence.source_id, evidence.capture?.source_id, evidence.control?.source_id, evidence.treatment?.source_id, evidence.candidate_comparison?.source_id];
  if (sourceFields.some((value) => !clean(value) || clean(value) !== expectedSource)) throw new Error(`${sourceId}: same-capture source provenance mismatch.`);
  const captureIds = [evidence.capture_id, evidence.capture?.capture_id, evidence.control?.capture_id, evidence.treatment?.capture_id];
  if (!clean(evidence.capture_id) || captureIds.some((value) => !clean(value) || clean(value) !== clean(evidence.capture_id))) throw new Error(`${sourceId}: same-capture capture ID mismatch.`);
  const hash = clean(evidence.capture?.html_sha256);
  if (!/^[a-f0-9]{64}$/i.test(hash) || [evidence.control?.html_sha256, evidence.treatment?.html_sha256, evidence.candidate_comparison?.same_html_sha256].some((value) => !clean(value) || clean(value) !== hash)) throw new Error(`${sourceId}: same-capture hash provenance is invalid.`);
  for (const field of ["requested_url", "final_url"]) {
    const values = [evidence.capture?.[field], evidence.control?.[field], evidence.treatment?.[field]];
    if (values.some((value) => !clean(value) || !isHttpUrl(value) || clean(value) !== clean(evidence.capture?.[field]))) throw new Error(`${sourceId}: same-capture ${field} provenance mismatch.`);
  }
  assertComparison(evidence);
  return evidence;
}

function structuralEvidence(evidence) {
  const parser = evidence.treatment.parser_evidence ?? {};
  const config = evidence.treatment.parser_config ?? {};
  const candidates = evidence.treatment.candidates ?? [];
  const adapterId = clean(parser.adapter_family ?? parser.adapter_id ?? parser.adapter ?? config.adapter_family ?? config.adapter_id ?? config.adapter) || null;
  const fingerprints = candidates.map((candidate) => clean(candidate.provenance?.candidate_node_fingerprint ?? candidate.candidate_node_fingerprint));
  const rawDomEvidence = {
    parser_strategy: clean(parser.parser_strategy) || null,
    configured_list_selector: clean(parser.configured_list_selector) || null,
    matched_list_selector: clean(parser.matched_list_selector) || null,
    list_item_selector: clean(config.list_item_selector) || null,
    link_selector: clean(config.link_selector) || null,
    title_selector: clean(config.title_selector) || null,
    date_selector: clean(config.date_selector) || null,
    list_parser_profile: clean(parser.list_parser_profile ?? config.list_parser_profile) || null,
    adapter_id: adapterId,
    profile_applied: parser.profile_applied === true,
    content_topology_profile: clean(parser.content_topology_profile) || null,
    inline_notice_detected: Number(parser.inline_notice_section_count) > 0,
    independent_detail_url_present: Number(parser.independent_detail_url_count) > 0,
    candidate_node_fingerprints: uniqueSorted(fingerprints),
    candidate_dom_locators: uniqueSorted(candidates.map((candidate) => clean(candidate.provenance?.dom_locator ?? candidate.dom_locator))),
    candidate_origins: uniqueSorted(candidates.map(extractCandidateOrigin)),
    link_roles: uniqueSorted(candidates.map((candidate) => clean(candidate.provenance?.link_role ?? candidate.classification_evidence))),
  };
  const candidateLocators = candidates.map(normalizeCandidateLocator);
  const candidateFamilies = candidates.map((candidate, index) => domFamily({ selector: rawDomEvidence.matched_list_selector ?? rawDomEvidence.list_item_selector, locator: candidateLocators[index], parser }));
  const normalizedDomSignature = {
    parser_strategy: rawDomEvidence.parser_strategy,
    candidate_origins: rawDomEvidence.candidate_origins,
    list_selector_present: Boolean(rawDomEvidence.list_item_selector || rawDomEvidence.configured_list_selector),
    link_selector_present: Boolean(rawDomEvidence.link_selector),
    title_selector_present: Boolean(rawDomEvidence.title_selector),
    date_selector_present: Boolean(rawDomEvidence.date_selector),
    candidate_locator_templates: uniqueSorted(candidateLocators),
    dom_families: uniqueSorted(candidateFamilies),
    navigation_container_member_present: candidates.some((candidate) => candidate.provenance?.inside_navigation_container === true || candidate.inside_navigation_container === true),
    pagination_container_member_present: candidates.some((candidate) => candidate.provenance?.inside_pagination_container === true || candidate.inside_pagination_container === true),
    link_roles: rawDomEvidence.link_roles,
    configured_selector_applied: Boolean(rawDomEvidence.configured_list_selector),
    parser_profile_applied: rawDomEvidence.profile_applied,
    parser_profile_family: rawDomEvidence.list_parser_profile,
    adapter_family: adapterId,
    content_topology_profile: rawDomEvidence.content_topology_profile,
    inline_notice_detected: rawDomEvidence.inline_notice_detected,
    independent_detail_url_present: rawDomEvidence.independent_detail_url_present,
  };
  const urlIdentitySignatures = uniqueSorted(candidates.map((candidate) => canonicalJson(urlIdentityShape(candidate))));
  return {
    raw_dom_evidence: rawDomEvidence,
    normalized_dom_signature: normalizedDomSignature,
    dom_family: uniqueSorted(candidateFamilies),
    structural_signature: stable({ normalized_dom_signature: normalizedDomSignature, url_identity_signatures: urlIdentitySignatures }),
  };
}

function evidenceIndex(rows) {
  const indexed = new Map();
  for (const evidence of rows ?? []) {
    const sourceId = clean(evidence?.source_id);
    if (!sourceId) throw new Error("Phase 3 evidence omitted source_id.");
    if (indexed.has(sourceId)) throw new Error(`Duplicate phase 3 same-capture evidence for ${sourceId}.`);
    indexed.set(sourceId, evidence);
  }
  return indexed;
}

export function buildPhase3RemediationClusters({ baseline, sameCaptureEvidence = [] } = {}) {
  const targets = Array.isArray(baseline?.targets) ? baseline.targets : [];
  if (!Number.isInteger(baseline?.target_count) || baseline.target_count !== targets.length) throw new Error("Phase 3 clustering requires a complete baseline target set.");
  const sourceIds = targets.map((target) => clean(target.source_id));
  if (sourceIds.some((sourceId) => !sourceId) || new Set(sourceIds).size !== sourceIds.length) throw new Error("Phase 3 baseline targets must have unique source IDs.");
  const captures = evidenceIndex(sameCaptureEvidence);
  for (const sourceId of captures.keys()) if (!sourceIds.includes(sourceId)) throw new Error(`Phase 3 evidence references non-target ${sourceId}.`);
  const grouped = new Map(); const unclustered = [];
  for (const sourceId of [...sourceIds].sort()) {
    const raw = captures.get(sourceId);
    if (!raw) { unclustered.push({ source_id: sourceId, evidence_status: "capture_required", next_action: "capture_same_html_evidence", next_phase_queue: "same_html_capture", blocking_reason: "same_html_capture_absent" }); continue; }
    const evidence = assertSameCaptureEvidence(raw, sourceId);
    const structural = structuralEvidence(evidence);
    const signatureJson = canonicalJson(structural.structural_signature);
    const signatureHash = sha256(signatureJson);
    const clusterId = `phase3_${signatureHash.slice(0, 16)}`;
    const member = {
      source_id: sourceId,
      ...memberDecision(evidence),
      raw_dom_evidence: structural.raw_dom_evidence,
      capture_provenance: {
        requested_url: evidence.capture.requested_url,
        final_url: evidence.capture.final_url,
        capture_id: evidence.capture_id,
        html_sha256: evidence.capture.html_sha256,
      },
    };
    if (!grouped.has(clusterId)) grouped.set(clusterId, { cluster_id: clusterId, cluster_version: PHASE3_CLUSTER_VERSION, structural_signature_sha256: signatureHash, structural_signature: structural.structural_signature, normalized_dom_signature: structural.normalized_dom_signature, dom_family: structural.dom_family, members: [] });
    const cluster = grouped.get(clusterId);
    if (canonicalJson(cluster.structural_signature) !== signatureJson) throw new Error(`${sourceId}: phase 3 structural hash collision.`);
    cluster.members.push(member);
  }
  const clusters = [...grouped.values()].map((cluster) => {
    const members = cluster.members.sort((left, right) => left.source_id.localeCompare(right.source_id));
    return { ...cluster, source_count: members.length, source_ids: members.map((member) => member.source_id), members, evidence_status_counts: countObject(members.map((member) => member.evidence_status)) };
  }).sort((left, right) => left.cluster_id.localeCompare(right.cluster_id));
  const summary = { clustered_source_count: clusters.reduce((total, cluster) => total + cluster.source_count, 0), capture_required_source_count: unclustered.length, ready_for_fixture_source_count: clusters.reduce((total, cluster) => total + (cluster.evidence_status_counts.ready_for_fixture ?? 0), 0), evidence_reconciliation_required_source_count: clusters.reduce((total, cluster) => total + (cluster.evidence_status_counts.evidence_reconciliation_required ?? 0), 0) };
  if (summary.clustered_source_count + summary.capture_required_source_count !== targets.length) throw new Error("Phase 3 cluster coverage invariant failed.");
  return { schema_version: "phase3-parser-remediation-clusters-v2", cluster_version: PHASE3_CLUSTER_VERSION, target_count: targets.length, capture_evidence_count: captures.size, clusters, unclustered, summary };
}
