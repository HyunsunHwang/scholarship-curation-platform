import { createHash } from "node:crypto";
import { canonicalizeNoticeUrl, summarizeGraphPlan } from "./normalized-graph.mjs";
import { summarizeLegacyArtifact } from "./legacy-notice-artifact.mjs";
import { HANDOFF_STATUS_READY } from "../crawler-engine/crawler-handoff.mjs";

export const SHADOW_PARITY_SCHEMA_VERSION = "shadow-parity-report-v2";

export const GATE_CLASSIFICATIONS = Object.freeze([
  "exact_match",
  "explained_difference",
  "blocking_mismatch",
  "not_comparable",
]);

export const EXPLAINED_REASON_CODES = Object.freeze([
  "INLINE_SECTIONS_COLLAPSED_TO_PAGE_NOTICE",
  "LEGACY_GLOBAL_URL_DEDUPE_COLLAPSE",
  "GRAPH_ONLY_PROVENANCE",
  "GRAPH_SEPARATE_ASSET_ENTITY",
  "IDENTITY_MODEL_DIFFERENCE",
  "DATE_PRESENCE_ALIGNED_MISSING_OR_UNPARSED",
  "CANDIDATE_EXCLUDED_BOTH_PATHS",
]);

export const BLOCKING_REASON_CODES = Object.freeze([
  "LEGACY_NOTICE_MISSING",
  "NORMALIZED_NOTICE_MISSING",
  "TITLE_MISMATCH",
  "PUBLISHED_DATE_MISMATCH",
  "CANONICAL_URL_MISMATCH",
  "BODY_LOSS",
  "ATTACHMENT_LOSS",
  "APPLICATION_LINK_LOSS",
  "SOURCE_OWNERSHIP_MISMATCH",
  "DUPLICATE_NORMALIZED_NOTICE",
  "CANDIDATE_ELIGIBILITY_MISMATCH",
  "UNSUPPORTED_IDENTITY_KIND",
  "INLINE_SECTION_EVIDENCE_LOSS",
  "FABRICATED_DATE",
]);

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeTitle(value) {
  return clean(value).toLocaleLowerCase("ko-KR");
}

export function datePresence(value) {
  const text = clean(value);
  if (!text) return "missing";
  const head = text.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(head) ? head : "unparsed";
}

function applicationLinkSet(links) {
  const values = Array.isArray(links) ? links : [];
  return [...new Set(values.map((link) => {
    if (typeof link === "string") return clean(link);
    return clean(link?.url ?? link?.href);
  }).filter(Boolean))].sort();
}

function legacyMatchKey(row) {
  const sourceId = clean(row.source_id);
  const canonical = canonicalizeNoticeUrl(row.canonical_url ?? row.notice_url) || clean(row.notice_url);
  return `${sourceId}|${canonical}`;
}

function publicationEligible(row = {}) {
  const classification = clean(row.candidate_classification);
  if (["not_candidate", "out_of_range"].includes(classification)) return false;
  if (row.diagnostic_observation === true || row.diagnosticObservation === true) return false;
  if (clean(row.downstream_eligibility) === "excluded") return false;
  return true;
}

function normalizedRowsFromPlan(plan) {
  const notices = plan?.tables?.ingestion_notices ?? [];
  const revisions = new Map((plan?.tables?.ingestion_notice_revisions ?? []).map((row) => [row.notice_id, row]));
  const occurrences = new Map((plan?.tables?.ingestion_notice_occurrences ?? []).map((row) => [row.notice_id, row]));
  const assetsByNotice = new Map();
  for (const asset of plan?.tables?.ingestion_notice_assets ?? []) {
    const bucket = assetsByNotice.get(asset.notice_id) ?? [];
    bucket.push(asset);
    assetsByNotice.set(asset.notice_id, bucket);
  }

  return notices.map((notice) => {
    const revision = revisions.get(notice.id) ?? null;
    const occurrence = occurrences.get(notice.id) ?? null;
    const assets = assetsByNotice.get(notice.id) ?? [];
    const sections = revision?.normalized_payload?.inline_sections;
    const sectionLinks = Array.isArray(sections)
      ? sections.flatMap((section) => applicationLinkSet(section.section_links))
      : [];
    const payloadAppLinks = applicationLinkSet(
      revision?.normalized_payload?.application_links,
    );
    const candidateClassification = Array.isArray(sections)
      ? clean(sections.find((section) => section.candidate_classification)?.candidate_classification)
      : clean(revision?.normalized_payload?.candidate_classification) || null;
    const diagnosticObservation = Boolean(
      revision?.normalized_payload?.diagnostic_observation
      || occurrence?.provenance?.diagnostic_observation,
    );
    const row = {
      source_id: clean(notice.source_id),
      notice_id: notice.id,
      identity_kind: clean(notice.identity_kind),
      identity_key: clean(notice.identity_key),
      canonical_url: clean(notice.canonical_url),
      title: clean(revision?.title),
      body: clean(revision?.body) || null,
      body_present: Boolean(clean(revision?.body)),
      body_quality: clean(revision?.body_quality_status) || null,
      notice_posted_at: datePresence(occurrence?.raw_date_text),
      raw_date_text: clean(occurrence?.raw_date_text) || null,
      attachment_count: assets.length,
      application_links: [...new Set([...payloadAppLinks, ...sectionLinks])].sort(),
      candidate_classification: candidateClassification || null,
      diagnostic_observation: diagnosticObservation,
      inline_section_count: Array.isArray(sections) ? sections.length : 0,
      inline_sections: Array.isArray(sections) ? sections : [],
      match_key: `${clean(notice.source_id)}|${clean(notice.canonical_url)}`,
    };
    row.publication_eligible = publicationEligible(row);
    return row;
  });
}

function comparePair(legacy, normalized) {
  const reasonCodes = [];
  const detailStatuses = [];

  if (clean(legacy.source_id) !== clean(normalized.source_id)) {
    reasonCodes.push("SOURCE_OWNERSHIP_MISMATCH");
  }
  if (normalizeTitle(legacy.title) !== normalizeTitle(normalized.title)) {
    if (normalized.inline_section_count > 1) {
      reasonCodes.push("INLINE_SECTIONS_COLLAPSED_TO_PAGE_NOTICE");
      detailStatuses.push("title_section_collapse");
    } else {
      reasonCodes.push("TITLE_MISMATCH");
    }
  } else if (normalized.inline_section_count > 1) {
    reasonCodes.push("INLINE_SECTIONS_COLLAPSED_TO_PAGE_NOTICE");
    detailStatuses.push("sections_collapsed_to_page_notice");
  }

  const legacyDate = datePresence(legacy.notice_posted_at || legacy.raw_date_text);
  const normalizedDate = datePresence(normalized.notice_posted_at || normalized.raw_date_text);
  if (legacyDate === "missing" && normalizedDate !== "missing" && normalizedDate !== "unparsed") {
    reasonCodes.push("FABRICATED_DATE");
  } else if (normalizedDate === "missing" && legacyDate !== "missing" && legacyDate !== "unparsed") {
    reasonCodes.push("FABRICATED_DATE");
  } else if (
    legacyDate !== "missing" && normalizedDate !== "missing"
    && legacyDate !== "unparsed" && normalizedDate !== "unparsed"
    && legacyDate !== normalizedDate
  ) {
    reasonCodes.push("PUBLISHED_DATE_MISMATCH");
  } else if (
    (legacyDate === "missing" || legacyDate === "unparsed")
    && (normalizedDate === "missing" || normalizedDate === "unparsed")
    && legacyDate === normalizedDate
  ) {
    reasonCodes.push("DATE_PRESENCE_ALIGNED_MISSING_OR_UNPARSED");
  }

  const legacyCanonical = canonicalizeNoticeUrl(legacy.canonical_url ?? legacy.notice_url);
  if (legacyCanonical && legacyCanonical !== clean(normalized.canonical_url)) {
    reasonCodes.push("CANONICAL_URL_MISMATCH");
  }
  if (Boolean(legacy.body_present) && !Boolean(normalized.body_present)) {
    reasonCodes.push("BODY_LOSS");
  } else if (!Boolean(legacy.body_present) && Boolean(normalized.body_present)) {
    // Graph may preserve richer body; treat as provenance-only unless legacy had body.
    reasonCodes.push("GRAPH_ONLY_PROVENANCE");
  }
  if (Number(legacy.attachment_count ?? 0) > Number(normalized.attachment_count ?? 0)) {
    reasonCodes.push("ATTACHMENT_LOSS");
  } else if (Number(legacy.attachment_count ?? 0) < Number(normalized.attachment_count ?? 0)) {
    reasonCodes.push("GRAPH_SEPARATE_ASSET_ENTITY");
  }

  const legacyApps = applicationLinkSet(legacy.application_links);
  const normalizedApps = applicationLinkSet(normalized.application_links);
  const missingApps = legacyApps.filter((url) => !normalizedApps.includes(url));
  if (missingApps.length > 0) {
    reasonCodes.push("APPLICATION_LINK_LOSS");
  }

  if (clean(legacy.identity_kind) !== clean(normalized.identity_kind)) {
    reasonCodes.push("IDENTITY_MODEL_DIFFERENCE");
  }

  const legacyEligible = publicationEligible(legacy);
  const normalizedEligible = publicationEligible(normalized);
  if (legacyEligible !== normalizedEligible) {
    reasonCodes.push("CANDIDATE_ELIGIBILITY_MISMATCH");
  } else if (!legacyEligible && !normalizedEligible) {
    reasonCodes.push("CANDIDATE_EXCLUDED_BOTH_PATHS");
  }

  if (
    normalized.inline_section_count > 0
    && (!Array.isArray(normalized.inline_sections) || normalized.inline_sections.length === 0)
  ) {
    reasonCodes.push("INLINE_SECTION_EVIDENCE_LOSS");
  }

  const uniqueReasons = [...new Set(reasonCodes)];
  const blocking = uniqueReasons.filter((code) => BLOCKING_REASON_CODES.includes(code));
  const explained = uniqueReasons.filter((code) => EXPLAINED_REASON_CODES.includes(code));

  let classification = "exact_match";
  let detailStatus = "matched";
  if (blocking.length > 0) {
    classification = "blocking_mismatch";
    detailStatus = "field_mismatch";
  } else if (explained.length > 0) {
    classification = "explained_difference";
    detailStatus = detailStatuses[0] || "explained_model_difference";
  }

  return {
    classification,
    detail_status: detailStatus,
    reason_codes: uniqueReasons.sort(),
    identity_mapping: {
      legacy_identity_kind: legacy.identity_kind,
      legacy_identity_key: legacy.identity_key,
      normalized_identity_kind: normalized.identity_kind,
      normalized_identity_key: normalized.identity_key,
    },
  };
}

function collectPlanMetrics(plan) {
  const unsupportedIdentityKindCount = (plan?.tables?.ingestion_notices ?? []).filter(
    (notice) => !["external_article_id", "canonical_detail_url"].includes(clean(notice.identity_kind)),
  ).length;

  let inlineSectionEvidenceLossCount = 0;
  for (const revision of plan?.tables?.ingestion_notice_revisions ?? []) {
    const sections = revision?.normalized_payload?.inline_sections;
    const policy = revision?.normalized_payload?.inline_section_policy;
    if (policy === "page_evidence_v1" && (!Array.isArray(sections) || sections.length === 0)) {
      inlineSectionEvidenceLossCount += 1;
    }
  }

  const noticeIds = (plan?.tables?.ingestion_notices ?? []).map((row) => row.id);
  const duplicateGraphNoticeCount = noticeIds.length - new Set(noticeIds).size;

  return {
    unsupportedIdentityKindCount,
    inlineSectionEvidenceLossCount,
    duplicateGraphNoticeCount,
  };
}

function droppedUrlIndex(legacyArtifact) {
  const dropped = legacyArtifact?.dropped_records ?? [];
  const byCanonical = new Map();
  for (const row of dropped) {
    const canonical = canonicalizeNoticeUrl(row.canonical_url ?? row.notice_url) || clean(row.notice_url);
    if (!canonical) continue;
    const bucket = byCanonical.get(canonical) ?? [];
    bucket.push(row);
    byCanonical.set(canonical, bucket);
  }
  return byCanonical;
}

export function compareShadowParity({
  legacyArtifact,
  adapted,
  caseId = null,
  deterministicRerunMatch = null,
} = {}) {
  const plan = adapted?.plan ?? null;
  const normalizedRows = normalizedRowsFromPlan(plan);
  const legacyRows = (legacyArtifact?.records ?? []).map((row) => ({
    ...row,
    publication_eligible: publicationEligible(row),
    match_key: legacyMatchKey(row),
  }));

  const legacyByKey = new Map();
  let duplicateLegacyCount = 0;
  for (const row of legacyRows) {
    if (legacyByKey.has(row.match_key)) {
      duplicateLegacyCount += 1;
      continue;
    }
    legacyByKey.set(row.match_key, row);
  }

  const normalizedByKey = new Map();
  let duplicateGraphNoticeCountFromKeys = 0;
  for (const row of normalizedRows) {
    if (normalizedByKey.has(row.match_key)) {
      duplicateGraphNoticeCountFromKeys += 1;
      continue;
    }
    normalizedByKey.set(row.match_key, row);
  }

  const droppedByUrl = droppedUrlIndex(legacyArtifact);
  const allKeys = [...new Set([...legacyByKey.keys(), ...normalizedByKey.keys()])].sort();
  const comparisons = [];
  const classificationCounts = {
    exact_match: 0,
    explained_difference: 0,
    blocking_mismatch: 0,
    not_comparable: 0,
  };

  for (const key of allKeys) {
    const legacy = legacyByKey.get(key) ?? null;
    const normalized = normalizedByKey.get(key) ?? null;

    if (legacy && !normalized) {
      const comparison = {
        match_key: key,
        classification: "blocking_mismatch",
        detail_status: "normalized_only_missing",
        reason_codes: ["NORMALIZED_NOTICE_MISSING"],
        legacy,
        normalized: null,
      };
      classificationCounts.blocking_mismatch += 1;
      comparisons.push(comparison);
      continue;
    }

    if (!legacy && normalized) {
      const canonical = clean(normalized.canonical_url);
      const dropped = droppedByUrl.get(canonical) ?? [];
      const collapsed = dropped.find((row) => clean(row.source_id) === clean(normalized.source_id))
        || (dropped.length > 0 && dropped.some((row) => clean(row.notice_url) === clean(normalized.canonical_url) || canonicalizeNoticeUrl(row.notice_url) === canonical));
      if (collapsed) {
        const comparison = {
          match_key: key,
          classification: "explained_difference",
          detail_status: "legacy_global_url_dedupe_collapse",
          reason_codes: ["LEGACY_GLOBAL_URL_DEDUPE_COLLAPSE"],
          legacy: null,
          normalized,
          collapsed_legacy_sources: dropped.map((row) => clean(row.source_id)).filter(Boolean),
        };
        classificationCounts.explained_difference += 1;
        comparisons.push(comparison);
        continue;
      }

      if (normalized.diagnostic_observation || !normalized.publication_eligible) {
        const comparison = {
          match_key: key,
          classification: "not_comparable",
          detail_status: "diagnostic_or_excluded_without_legacy_row",
          reason_codes: ["CANDIDATE_EXCLUDED_BOTH_PATHS"],
          legacy: null,
          normalized,
        };
        classificationCounts.not_comparable += 1;
        comparisons.push(comparison);
        continue;
      }

      const comparison = {
        match_key: key,
        classification: "blocking_mismatch",
        detail_status: "legacy_missing",
        reason_codes: ["LEGACY_NOTICE_MISSING"],
        legacy: null,
        normalized,
      };
      classificationCounts.blocking_mismatch += 1;
      comparisons.push(comparison);
      continue;
    }

    const result = comparePair(legacy, normalized);
    classificationCounts[result.classification] += 1;
    comparisons.push({
      match_key: key,
      classification: result.classification,
      detail_status: result.detail_status,
      reason_codes: result.reason_codes,
      legacy,
      normalized,
      identity_mapping: result.identity_mapping,
    });
  }

  const planMetrics = collectPlanMetrics(plan);
  const duplicateGraphNoticeCount = planMetrics.duplicateGraphNoticeCount + duplicateGraphNoticeCountFromKeys;

  // Inject plan-level blockers as synthetic comparisons only when counts require them.
  if (planMetrics.unsupportedIdentityKindCount > 0) {
    classificationCounts.blocking_mismatch += 1;
    comparisons.push({
      match_key: `${caseId || "plan"}|unsupported_identity`,
      classification: "blocking_mismatch",
      detail_status: "unsupported_identity_kind",
      reason_codes: ["UNSUPPORTED_IDENTITY_KIND"],
      legacy: null,
      normalized: null,
    });
  }
  if (planMetrics.inlineSectionEvidenceLossCount > 0) {
    classificationCounts.blocking_mismatch += 1;
    comparisons.push({
      match_key: `${caseId || "plan"}|inline_section_evidence_loss`,
      classification: "blocking_mismatch",
      detail_status: "inline_section_evidence_loss",
      reason_codes: ["INLINE_SECTION_EVIDENCE_LOSS"],
      legacy: null,
      normalized: null,
    });
  }

  const missingLegacyCount = comparisons.filter((row) =>
    row.classification === "blocking_mismatch"
    && row.reason_codes.includes("LEGACY_NOTICE_MISSING")).length;
  const missingGraphCount = comparisons.filter((row) =>
    row.classification === "blocking_mismatch"
    && row.reason_codes.includes("NORMALIZED_NOTICE_MISSING")).length;

  const summary = {
    input_case_count: caseId ? 1 : 0,
    legacy_row_count: legacyRows.length,
    normalized_notice_count: normalizedRows.length,
    exact_match_count: classificationCounts.exact_match,
    explained_difference_count: classificationCounts.explained_difference,
    blocking_mismatch_count: classificationCounts.blocking_mismatch,
    not_comparable_count: classificationCounts.not_comparable,
    missing_legacy_count: missingLegacyCount,
    missing_graph_count: missingGraphCount,
    duplicate_legacy_count: duplicateLegacyCount + Number(legacyArtifact?.duplicate_url_count ?? 0),
    duplicate_graph_notice_count: duplicateGraphNoticeCount,
    unsupported_identity_kind_count: planMetrics.unsupportedIdentityKindCount,
    inline_section_evidence_loss_count: planMetrics.inlineSectionEvidenceLossCount,
    deterministic_rerun_match: deterministicRerunMatch,
  };

  const gatePass = summary.blocking_mismatch_count === 0
    && summary.missing_legacy_count === 0
    && summary.missing_graph_count === 0
    && summary.duplicate_graph_notice_count === 0
    && summary.unsupported_identity_kind_count === 0
    && summary.inline_section_evidence_loss_count === 0
    && summary.deterministic_rerun_match === true;

  return {
    schema_version: SHADOW_PARITY_SCHEMA_VERSION,
    case_id: caseId,
    summary,
    gate_pass: gatePass,
    classification_counts: classificationCounts,
    legacy_summary: summarizeLegacyArtifact(legacyArtifact),
    normalized_summary: plan ? summarizeGraphPlan(plan) : null,
    blocked_sources: adapted?.blocked_sources ?? [],
    handoff_ready_source_count: (adapted?.graph_input?.source_results ?? []).length,
    handoff_status_contract: HANDOFF_STATUS_READY,
    safety: {
      databaseReadPerformed: false,
      databaseWritePerformed: false,
      publicWritePerformed: false,
      externalLlmCallCount: 0,
      writes_performed: false,
      scheduled_cutover: false,
    },
    comparisons,
  };
}

export function buildCanonicalParityPayload(report) {
  return {
    schema_version: report.schema_version,
    case_id: report.case_id ?? null,
    summary: {
      ...report.summary,
      // Determinism field is computed by the runner and included intentionally.
      deterministic_rerun_match: report.summary?.deterministic_rerun_match ?? null,
    },
    gate_pass: report.gate_pass,
    classification_counts: report.classification_counts,
    comparisons: (report.comparisons ?? []).map((row) => ({
      match_key: row.match_key,
      classification: row.classification,
      detail_status: row.detail_status,
      reason_codes: [...(row.reason_codes ?? [])].sort(),
      identity_mapping: row.identity_mapping ?? null,
      collapsed_legacy_sources: row.collapsed_legacy_sources ?? null,
      legacy: row.legacy
        ? {
          source_id: row.legacy.source_id,
          title: row.legacy.title,
          canonical_url: row.legacy.canonical_url ?? row.legacy.notice_url,
          body_present: row.legacy.body_present,
          attachment_count: row.legacy.attachment_count,
          application_links: applicationLinkSet(row.legacy.application_links),
          candidate_classification: row.legacy.candidate_classification ?? null,
          publication_eligible: row.legacy.publication_eligible,
          notice_posted_at: datePresence(row.legacy.notice_posted_at || row.legacy.raw_date_text),
        }
        : null,
      normalized: row.normalized
        ? {
          source_id: row.normalized.source_id,
          title: row.normalized.title,
          canonical_url: row.normalized.canonical_url,
          identity_kind: row.normalized.identity_kind,
          identity_key: row.normalized.identity_key,
          body_present: row.normalized.body_present,
          attachment_count: row.normalized.attachment_count,
          application_links: applicationLinkSet(row.normalized.application_links),
          candidate_classification: row.normalized.candidate_classification ?? null,
          publication_eligible: row.normalized.publication_eligible,
          inline_section_count: row.normalized.inline_section_count,
          notice_posted_at: datePresence(row.normalized.notice_posted_at || row.normalized.raw_date_text),
        }
        : null,
    })),
    safety: report.safety,
  };
}

export function hashCanonicalParityPayload(payload) {
  return createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

export function renderShadowParityMarkdown(envelope) {
  const parity = envelope.parity ?? envelope;
  const meta = envelope.execution_metadata ?? {};
  const summary = parity.summary ?? {};
  const lines = [];
  lines.push("# Shadow Parity Report");
  lines.push("");
  lines.push(`- schema_version: \`${parity.schema_version}\``);
  lines.push(`- case_id: \`${parity.case_id ?? "n/a"}\``);
  lines.push(`- generated_at: \`${meta.generated_at ?? "n/a"}\``);
  lines.push("- mode: local dry-run (no DB write, no scheduled cutover)");
  lines.push(`- gate_pass: **${parity.gate_pass}**`);
  lines.push("");
  lines.push("## Gate summary");
  lines.push("");
  for (const [key, value] of Object.entries(summary)) {
    lines.push(`- ${key}: **${value}**`);
  }
  lines.push("");
  lines.push("## Comparisons");
  lines.push("");
  for (const row of (parity.comparisons ?? []).slice(0, 50)) {
    lines.push(`### \`${row.match_key}\``);
    lines.push(`- classification: \`${row.classification}\``);
    lines.push(`- detail_status: \`${row.detail_status}\``);
    if (row.reason_codes?.length) lines.push(`- reason_codes: ${row.reason_codes.join(", ")}`);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}
