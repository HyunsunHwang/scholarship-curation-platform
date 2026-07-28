import {
  isSupportedNoticeIdentityKind,
  resolveNoticeIdentity,
  SUPPORTED_NOTICE_IDENTITY_KINDS,
} from "./notice-identity-resolver.mjs";

export const CRAWLER_HANDOFF_VERSION = "crawler-handoff-v1";
export const HANDOFF_STATUS_READY = "ready_for_normalized_graph_plan";
export const HANDOFF_STATUS_BLOCKED = "blocked_schema_not_ready";

function clean(value) { return String(value ?? "").replace(/\s+/g, " ").trim(); }
function links(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function canonicalAssetKey(asset = {}) {
  try {
    const url = new URL(clean(asset.url ?? asset.original_url));
    url.hash = "";
    return url.toString();
  } catch {
    return clean(asset.url ?? asset.original_url);
  }
}
function attachments(value) {
  const seen = new Set();
  return links(value).filter((asset) => {
    const key = `${canonicalAssetKey(asset)}|${clean(asset.role) || "attachment"}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function preserveInlineSectionEvidence(notice = {}) {
  const inlineSectionId = clean(notice.inlineSectionId ?? notice.inline_section_id);
  const inlineSectionLinks = links(notice.inlineSectionLinks ?? notice.inline_section_links);
  const preexisting = notice.inline_sections ?? notice.inlineSections;
  const sections = Array.isArray(preexisting)
    ? preexisting
    : inlineSectionId
      ? [{
        section_id: inlineSectionId,
        section_title: clean(notice.section_title ?? notice.sectionTitle ?? notice.title) || null,
        section_order: Number.isFinite(Number(notice.section_order ?? notice.sectionOrder))
          ? Number(notice.section_order ?? notice.sectionOrder)
          : null,
        section_text: clean(notice.section_text ?? notice.sectionText ?? notice.body ?? notice.content) || null,
        section_links: inlineSectionLinks,
        section_date_evidence: links(
          notice.inlineDateEvidence ?? notice.inline_date_evidence ?? notice.dateEvidence,
        ),
        display_url: clean(notice.displayUrl ?? notice.display_url ?? notice.noticeUrl) || null,
      }]
      : [];
  return {
    inlineSectionId: inlineSectionId || null,
    inline_section_id: inlineSectionId || null,
    inlineSectionLinks,
    inline_section_links: inlineSectionLinks,
    inlineSections: sections,
    inline_sections: sections,
  };
}

export function normalizeCrawlerNotice(notice = {}, { source = {}, candidateResult = null } = {}) {
  const identity = resolveNoticeIdentity(notice);
  const attachmentMetadata = attachments(notice.attachmentMetadata ?? notice.attachment_metadata);
  const sectionEvidence = preserveInlineSectionEvidence(notice);
  const applicationLinks = links(notice.applicationLinks ?? notice.application_links);
  const supportingReferenceLinks = links(notice.supportingReferenceLinks ?? notice.supporting_reference_links);
  const dateEvidence = links(
    notice.inlineDateEvidence ?? notice.inline_date_evidence ?? notice.dateEvidence ?? notice.date_evidence,
  );
  const documentEvidence = notice.normalized_payload?.engine_phase_3
    ?? notice.documentEvidence
    ?? notice.document_evidence
    ?? null;
  const normalized = {
    ...notice,
    sourceId: clean(notice.sourceId ?? notice.source_id ?? source.sourceId),
    source_id: clean(notice.sourceId ?? notice.source_id ?? source.sourceId),
    sourceName: clean(notice.sourceName ?? notice.source_name ?? source.sourceName),
    sourceLevel: clean(notice.sourceLevel ?? notice.source_level ?? source.sourceLevel) || null,
    ...identity,
    ...sectionEvidence,
    noticeUrl: identity.displayUrl,
    notice_url: identity.displayUrl,
    title: clean(notice.detailTitle ?? notice.detail_title) || clean(notice.title),
    rawTitle: clean(notice.rawTitle ?? notice.raw_title ?? notice.title),
    raw_title: clean(notice.rawTitle ?? notice.raw_title ?? notice.title),
    body: clean(notice.body ?? notice.content),
    content: clean(notice.content ?? notice.body),
    dateText: clean(notice.dateText ?? notice.date_text),
    detailDate: clean(notice.detailDate ?? notice.detail_date),
    dateEvidence,
    date_evidence: dateEvidence,
    attachmentMetadata,
    attachment_metadata: attachmentMetadata,
    applicationLinks,
    application_links: applicationLinks,
    supportingReferenceLinks,
    supporting_reference_links: supportingReferenceLinks,
    documentEvidence,
    document_evidence: documentEvidence,
    candidateClassification: candidateResult?.classification ?? notice.candidateClassification ?? null,
    candidate_classification: candidateResult?.classification ?? notice.candidate_classification ?? null,
    candidateReasonCodes: candidateResult?.reasonCodes ?? notice.candidateReasonCodes ?? [],
    candidate_reason_codes: candidateResult?.reasonCodes ?? notice.candidate_reason_codes ?? [],
    identityStability: clean(notice.identityStability ?? notice.identity_stability) || "strong",
    identity_stability: clean(notice.identityStability ?? notice.identity_stability) || "strong",
    identityBasis: clean(notice.identityBasis ?? notice.identity_basis) || "resolved_identity",
    identity_basis: clean(notice.identityBasis ?? notice.identity_basis) || "resolved_identity",
  };
  return deepFreeze(normalized);
}

export function evaluateHandoffDownstreamReadiness(notices = []) {
  const reasons = new Set();
  for (const notice of notices) {
    const identityKind = clean(notice.identity_kind ?? notice.identityKind);
    if (!isSupportedNoticeIdentityKind(identityKind)) {
      reasons.add("unsupported_notice_identity_kind");
    }
    if (!clean(notice.identity_value ?? notice.identityValue)) {
      reasons.add("missing_identity_value");
    }
    if (!clean(notice.canonical_url ?? notice.canonicalUrl)) {
      reasons.add("missing_canonical_url");
    }
    // Legacy crawler observations may still carry section ids; that is allowed as
    // evidence metadata, but must not appear as formal Notice identity_kind.
    if (identityKind === "inline_section_id") {
      reasons.add("inline_section_identity_not_supported_by_current_ingestion_schema");
    }
  }
  const blockReasons = [...reasons];
  if (blockReasons.length > 0) {
    return Object.freeze({
      status: HANDOFF_STATUS_BLOCKED,
      blockReasons,
      supportedIdentityKinds: [...SUPPORTED_NOTICE_IDENTITY_KINDS],
    });
  }
  return Object.freeze({
    status: HANDOFF_STATUS_READY,
    blockReasons: [],
    supportedIdentityKinds: [...SUPPORTED_NOTICE_IDENTITY_KINDS],
  });
}

export function buildImmutableCrawlerHandoff({ sourceResults = [], generatedAt = new Date().toISOString() } = {}) {
  const rows = (Array.isArray(sourceResults) ? sourceResults : []).map((result) => {
    const notices = links(result.notices).map((notice) => normalizeCrawlerNotice(notice, {
      source: {
        sourceId: result.source_id ?? result.sourceId,
        sourceName: result.source_name ?? result.sourceName,
        sourceLevel: result.source_level ?? result.sourceLevel,
      },
      candidateResult: notice.candidate_classification || notice.candidateClassification
        ? {
          classification: notice.candidate_classification ?? notice.candidateClassification,
          reasonCodes: notice.candidate_reason_codes ?? notice.candidateReasonCodes ?? [],
        }
        : null,
    }));
    const readiness = evaluateHandoffDownstreamReadiness(notices);
    return deepFreeze({
      sourceId: clean(result.source_id ?? result.sourceId),
      resultStatus: clean(result.result_status ?? result.resultStatus),
      notices,
      parserEvidence: result.parser_evidence ?? result.parserEvidence ?? null,
      candidateDetection: result.candidate_detection ?? result.candidateDetection ?? null,
      itemSummary: result.item_summary ?? result.itemSummary ?? null,
      operationalDiagnostics: result.operational_diagnostics ?? result.operationalDiagnostics ?? null,
      downstreamHandoffStatus: readiness.status,
      downstream_handoff_status: readiness.status,
      downstreamBlockReasons: readiness.blockReasons,
      downstream_block_reasons: readiness.blockReasons,
      supportedIdentityKinds: readiness.supportedIdentityKinds,
      supported_identity_kinds: readiness.supportedIdentityKinds,
    });
  });
  return deepFreeze({
    handoffVersion: CRAWLER_HANDOFF_VERSION,
    handoff_version: CRAWLER_HANDOFF_VERSION,
    generatedAt,
    generated_at: generatedAt,
    sourceResults: rows,
    source_results: rows,
    safety: {
      databaseReadPerformed: false,
      databaseWritePerformed: false,
      publicWritePerformed: false,
    },
  });
}

export function validateCrawlerHandoff(handoff = {}) {
  const errors = [];
  if (handoff.handoffVersion !== CRAWLER_HANDOFF_VERSION) errors.push("invalid_handoff_version");
  for (const row of handoff.sourceResults ?? []) {
    for (const notice of row.notices ?? []) {
      for (const field of [
        "identity_kind",
        "canonical_url",
        "display_url",
        "body",
        "attachment_metadata",
        "candidate_classification",
        "identity_stability",
      ]) {
        if (!(field in notice)) errors.push(`missing_${field}`);
      }
      if (!isSupportedNoticeIdentityKind(notice.identity_kind)) {
        errors.push("unsupported_notice_identity_kind");
      }
      if (notice.identity_kind === "inline_section_id") {
        errors.push("inline_section_must_not_be_notice_identity");
      }
      if (
        Array.isArray(notice.inline_sections)
        && notice.inline_sections.some((section) => section?.section_id && !clean(section.section_id))
      ) {
        errors.push("invalid_inline_section_evidence");
      }
    }
    const readiness = evaluateHandoffDownstreamReadiness(row.notices ?? []);
    if (row.downstream_handoff_status !== readiness.status) {
      errors.push("handoff_status_mismatch");
    }
  }
  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}
