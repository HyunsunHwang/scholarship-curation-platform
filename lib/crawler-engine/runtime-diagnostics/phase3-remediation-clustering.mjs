import crypto from "node:crypto";

export const PHASE3_CLUSTER_EVIDENCE_STATUSES = Object.freeze([
  "ready_for_fixture",
  "capture_required",
  "evidence_reconciliation_required",
]);

function clean(value) {
  return String(value ?? "").trim();
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

function urlShape(value) {
  try {
    const url = new URL(value);
    const keys = [...new Set([...url.searchParams.keys()])].sort();
    const pathname = url.pathname
      .replace(/\b\d{2,}\b/g, "{number}")
      .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "{uuid}");
    return `${url.origin}${pathname}${keys.length ? `?${keys.join("&")}` : ""}`;
  } catch {
    return null;
  }
}

function requiredSameCaptureEvidence(evidence, sourceId) {
  if (!evidence || evidence.schema_version !== "phase2-same-html-comparison-v1") {
    throw new Error(`${sourceId}: phase 3 requires phase2-same-html-comparison-v1 evidence.`);
  }
  if (clean(evidence.source_id) !== sourceId || clean(evidence.capture?.source_id) !== sourceId) {
    throw new Error(`${sourceId}: same-capture evidence source ID mismatch.`);
  }
  if (clean(evidence.control?.capture_id) !== clean(evidence.capture_id)
    || clean(evidence.treatment?.capture_id) !== clean(evidence.capture_id)) {
    throw new Error(`${sourceId}: control/treatment capture IDs must match the capture.`);
  }
  const hash = clean(evidence.capture?.html_sha256);
  if (!/^[a-f0-9]{64}$/i.test(hash) || evidence.control?.html_sha256 !== hash || evidence.treatment?.html_sha256 !== hash) {
    throw new Error(`${sourceId}: same-capture hash provenance is invalid.`);
  }
  return evidence;
}

function signatureFromEvidence(evidence) {
  const treatment = evidence.treatment ?? {};
  const parser = treatment.parser_evidence ?? {};
  const candidates = Array.isArray(treatment.candidates) ? treatment.candidates : [];
  const comparison = evidence.candidate_comparison ?? {};
  return stable({
    parser_strategy: clean(parser.parser_strategy) || null,
    matched_list_selector: clean(parser.matched_list_selector) || null,
    list_parser_profile: clean(parser.list_parser_profile) || null,
    profile_applied: parser.profile_applied === true,
    url_identity_shapes: [...new Set(candidates.map((candidate) => urlShape(candidate.canonical_url ?? candidate.raw_url ?? candidate.noticeUrl)).filter(Boolean))].sort(),
    candidate_classifications: stable(comparison.added_candidate_classifications ?? {}),
    candidate_recall_verified: comparison.candidate_recall_verified === true,
  });
}

function clusterDecision(evidence) {
  const comparison = evidence.candidate_comparison ?? {};
  if (comparison.candidate_recall_verified !== true) {
    return {
      evidence_status: "evidence_reconciliation_required",
      next_action: "reconcile_candidate_comparison",
      next_phase_queue: "evidence_reconciliation",
    };
  }
  return {
    evidence_status: "ready_for_fixture",
    next_action: "collect_authoritative_fixture",
    next_phase_queue: "fixture_first_parser_remediation",
  };
}

function evidenceIndex(evidenceRows) {
  const indexed = new Map();
  for (const evidence of evidenceRows ?? []) {
    const sourceId = clean(evidence?.source_id);
    if (!sourceId) throw new Error("Phase 3 evidence omitted source_id.");
    if (indexed.has(sourceId)) throw new Error(`Duplicate phase 3 same-capture evidence for ${sourceId}.`);
    indexed.set(sourceId, evidence);
  }
  return indexed;
}

/**
 * Groups only audited same-capture evidence. Sources without a capture remain
 * explicitly unclustered; this planner never treats absent DOM evidence as a
 * safe parser contract.
 */
export function buildPhase3RemediationClusters({ baseline, sameCaptureEvidence = [] } = {}) {
  const targets = Array.isArray(baseline?.targets) ? baseline.targets : [];
  if (!Number.isInteger(baseline?.target_count) || baseline.target_count !== targets.length) {
    throw new Error("Phase 3 clustering requires a complete baseline target set.");
  }
  const sourceIds = targets.map((target) => clean(target.source_id));
  if (sourceIds.some((sourceId) => !sourceId) || new Set(sourceIds).size !== sourceIds.length) {
    throw new Error("Phase 3 baseline targets must have unique source IDs.");
  }
  const captures = evidenceIndex(sameCaptureEvidence);
  for (const sourceId of captures.keys()) {
    if (!sourceIds.includes(sourceId)) throw new Error(`Phase 3 evidence references non-target ${sourceId}.`);
  }
  const clusterMembers = new Map();
  const unclustered = [];
  for (const sourceId of [...sourceIds].sort()) {
    const rawEvidence = captures.get(sourceId);
    if (!rawEvidence) {
      unclustered.push({
        source_id: sourceId,
        evidence_status: "capture_required",
        next_action: "capture_same_html_evidence",
        next_phase_queue: "same_html_capture",
        blocking_reason: "same_html_capture_absent",
      });
      continue;
    }
    const evidence = requiredSameCaptureEvidence(rawEvidence, sourceId);
    const signature = signatureFromEvidence(evidence);
    const signatureJson = JSON.stringify(signature);
    const clusterId = `phase3_${sha256(signatureJson).slice(0, 16)}`;
    const decision = clusterDecision(evidence);
    if (!clusterMembers.has(clusterId)) clusterMembers.set(clusterId, { cluster_id: clusterId, signature, ...decision, source_ids: [] });
    const cluster = clusterMembers.get(clusterId);
    if (JSON.stringify(cluster.signature) !== signatureJson) throw new Error(`${sourceId}: phase 3 cluster hash collision.`);
    if (cluster.evidence_status !== decision.evidence_status) throw new Error(`${sourceId}: cluster evidence status conflict.`);
    cluster.source_ids.push(sourceId);
  }
  const clusters = [...clusterMembers.values()]
    .map((cluster) => ({ ...cluster, source_ids: cluster.source_ids.sort() }))
    .sort((left, right) => left.cluster_id.localeCompare(right.cluster_id));
  const result = {
    schema_version: "phase3-parser-remediation-clusters-v1",
    target_count: targets.length,
    capture_evidence_count: captures.size,
    clusters,
    unclustered,
    summary: {
      clustered_source_count: clusters.reduce((total, cluster) => total + cluster.source_ids.length, 0),
      capture_required_source_count: unclustered.length,
      ready_for_fixture_cluster_count: clusters.filter((cluster) => cluster.evidence_status === "ready_for_fixture").length,
      evidence_reconciliation_cluster_count: clusters.filter((cluster) => cluster.evidence_status === "evidence_reconciliation_required").length,
    },
  };
  if (result.summary.clustered_source_count + result.summary.capture_required_source_count !== result.target_count) {
    throw new Error("Phase 3 cluster coverage invariant failed.");
  }
  return result;
}
