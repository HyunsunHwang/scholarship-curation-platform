import crypto from "node:crypto";
import {
  isSupportedNoticeIdentityKind,
  resolveNoticeIdentity,
} from "../crawler-engine/notice-identity-resolver.mjs";

export const POST_PHASE_L_GRAPH_VERSION = "post-phase-l-graph-v1";
export const POST_PHASE_L_PILOT_SOURCE_KEYS = [
  "cau_001",
  "cau_002",
  "yonsei_060",
];

function clean(value) {
  return String(value ?? "").trim();
}

export function sha256(value) {
  return crypto.createHash("sha256").update(String(value ?? "")).digest("hex");
}

export function stableUuid(namespace, value) {
  const hash = sha256(`${namespace}\u0000${value}`);
  const chars = hash.slice(0, 32).split("");
  chars[12] = "5";
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const hex = chars.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function canonicalizeNoticeUrl(value) {
  try {
    const url = new URL(clean(value));
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_[a-z]+|fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
    }
    const sorted = [...url.searchParams.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    );
    url.search = "";
    for (const [key, entryValue] of sorted) url.searchParams.append(key, entryValue);
    url.pathname = url.pathname.replace(/\/{2,}/g, "/");
    return url.toString();
  } catch {
    return null;
  }
}

const EXTERNAL_ID_KEYS = [
  "BBS_SEQ",
  "uid",
  "articleNo",
  "boardNo",
  "nttNo",
  "wr_id",
  "b_idx",
  "seq",
  "no",
];

export function extractExternalArticleId(value) {
  try {
    const url = new URL(clean(value));
    for (const key of EXTERNAL_ID_KEYS) {
      const articleId = clean(url.searchParams.get(key));
      if (/^[A-Za-z0-9_-]+$/.test(articleId)) return `${key}:${articleId}`;
    }
  } catch {
    return null;
  }
  return null;
}

function normalizeAssets(notice) {
  const metadata = Array.isArray(notice.attachment_metadata)
    ? notice.attachment_metadata
    : Array.isArray(notice.attachmentMetadata)
      ? notice.attachmentMetadata
      : [];
  const images = Array.isArray(notice.image_urls)
    ? notice.image_urls
    : Array.isArray(notice.imageUrls)
      ? notice.imageUrls
      : [];
  const assets = metadata.map((asset) => ({
    original_url: clean(asset.url ?? asset.original_url),
    asset_kind: clean(asset.kind) || "attachment",
    mime_type: clean(asset.mime_type) || null,
    byte_size: Number.isFinite(Number(asset.size)) ? Number(asset.size) : null,
    verification_status: clean(asset.verification_status) || "metadata_only",
    metadata: asset,
  }));
  for (const imageUrl of images) {
    const url = clean(imageUrl);
    if (!url || assets.some((asset) => asset.original_url === url)) continue;
    assets.push({
      original_url: url,
      asset_kind: "image",
      mime_type: null,
      byte_size: null,
      verification_status: "metadata_only",
      metadata: {},
    });
  }
  return assets.filter((asset) => canonicalizeNoticeUrl(asset.original_url));
}

function bodyQualityStatus(notice) {
  const explicit = clean(notice.body_quality_status ?? notice.bodyQuality);
  if (explicit) return explicit;
  const body = clean(notice.body ?? notice.content ?? notice.body_text);
  if (body.length >= 120) return "text_sufficient";
  if (body.length > 0) return "short_body_needs_review";
  return "missing_body";
}

function sourceResultStatus(result) {
  const explicit = clean(result.result_status ?? result.status);
  if (explicit) return explicit;
  if (result.error) return "blocked_transport";
  const notices = Array.isArray(result.notices) ? result.notices : [];
  return notices.length > 0 ? "success" : "zero_match_observed";
}

function sectionLinks(notice) {
  const links = notice.inline_section_links
    ?? notice.inlineSectionLinks
    ?? notice.section_links
    ?? notice.sectionLinks
    ?? [];
  return Array.isArray(links) ? links : [];
}

function buildSectionEvidence(notice, sectionOrder) {
  const sectionId = clean(notice.inline_section_id ?? notice.inlineSectionId);
  const explicitSectionTitle = clean(notice.section_title ?? notice.sectionTitle);
  const explicitSectionText = clean(notice.section_text ?? notice.sectionText);
  // Ordinary notices must not invent section evidence. Only preserve real
  // inline-section observations or explicitly provided section fields.
  if (!sectionId && !explicitSectionTitle && !explicitSectionText) return null;

  const title = explicitSectionTitle || clean(notice.title ?? notice.detailTitle);
  const text = explicitSectionText
    || clean(notice.body ?? notice.content ?? notice.body_text);
  const links = sectionLinks(notice);
  const dateEvidence = notice.inline_date_evidence
    ?? notice.inlineDateEvidence
    ?? notice.section_date_evidence
    ?? [];
  return {
    section_id: sectionId || `section-order:${sectionOrder}`,
    section_title: title || null,
    section_order: sectionOrder,
    section_text: text || null,
    section_links: links,
    section_date_evidence: Array.isArray(dateEvidence) ? dateEvidence : [],
    display_url: clean(notice.display_url ?? notice.displayUrl ?? notice.original_url ?? notice.notice_url) || null,
    identity_stability: clean(notice.identity_stability ?? notice.identityStability) || null,
    identity_basis: clean(notice.identity_basis ?? notice.identityBasis) || null,
    candidate_classification: clean(
      notice.candidate_classification ?? notice.candidateClassification,
    ) || null,
    candidate_reason_codes: notice.candidate_reason_codes ?? notice.candidateReasonCodes ?? [],
  };
}

function resolveFormalIdentity(notice, sourceId) {
  const originalUrl = clean(notice.original_url ?? notice.notice_url ?? notice.noticeUrl);
  const identity = resolveNoticeIdentity({
    ...notice,
    original_url: originalUrl,
    canonical_url: notice.canonical_url ?? notice.normalized_url ?? originalUrl,
  });
  const canonicalUrl = canonicalizeNoticeUrl(identity.canonical_url ?? identity.canonicalUrl);
  if (!canonicalUrl) {
    throw new Error(`ambiguous_identity: ${sourceId} has no canonical detail URL`);
  }
  const externalArticleId = clean(identity.external_article_id)
    || extractExternalArticleId(canonicalUrl)
    || null;
  const identityKind = externalArticleId ? "external_article_id" : "canonical_detail_url";
  if (!isSupportedNoticeIdentityKind(identityKind)) {
    throw new Error(`unsupported_identity_kind: ${identityKind}`);
  }
  const canonicalUrlHash = sha256(canonicalUrl);
  const identityKey = externalArticleId
    ? `external:${externalArticleId}`
    : `url:${canonicalUrlHash}`;
  return {
    originalUrl,
    canonicalUrl,
    canonicalUrlHash,
    externalArticleId,
    identityKind,
    identityKey,
    displayUrl: clean(identity.display_url ?? identity.displayUrl) || originalUrl || canonicalUrl,
  };
}

function mergeNoticeGroup(notices) {
  const sections = [];
  const assets = [];
  const seenAssetUrls = new Set();
  const titles = [];
  const bodies = [];
  let firstSeenAt = null;
  let lastSeenAt = null;
  let observedAt = null;
  let transportStatus = null;
  let parserStatus = null;
  let parserVersion = null;
  let noticePostedAt = null;
  let rawDateText = null;
  let provenance = {};
  let normalizedPayload = {};
  let explicitSections = [];

  notices.forEach((notice, index) => {
    const section = buildSectionEvidence(notice, index);
    if (section) sections.push(section);
    const preexisting = notice.inline_sections ?? notice.inlineSections;
    if (Array.isArray(preexisting)) explicitSections = explicitSections.concat(preexisting);

    const title = clean(notice.title ?? notice.detailTitle ?? notice.detail_title);
    const body = clean(notice.body ?? notice.content ?? notice.body_text);
    if (title) titles.push(title);
    if (body) bodies.push(body);

    for (const asset of normalizeAssets(notice)) {
      const key = canonicalizeNoticeUrl(asset.original_url);
      if (!key || seenAssetUrls.has(key)) continue;
      seenAssetUrls.add(key);
      assets.push(asset);
    }

    firstSeenAt = firstSeenAt || clean(notice.first_seen_at) || null;
    lastSeenAt = clean(notice.last_seen_at) || lastSeenAt;
    observedAt = clean(notice.observed_at) || observedAt;
    transportStatus = clean(notice.transport_status) || transportStatus;
    parserStatus = clean(notice.parser_status) || parserStatus;
    parserVersion = clean(notice.parser_version) || parserVersion;
    noticePostedAt = clean(notice.notice_posted_at ?? notice.published_at) || noticePostedAt;
    rawDateText = clean(notice.raw_date_text ?? notice.date_text) || rawDateText;
    if (notice.provenance && typeof notice.provenance === "object") {
      provenance = { ...provenance, ...notice.provenance };
    }
    if (notice.normalized_payload && typeof notice.normalized_payload === "object") {
      normalizedPayload = { ...normalizedPayload, ...notice.normalized_payload };
    }
  });

  const inlineSections = explicitSections.length > 0 ? explicitSections : sections;
  const title = titles[0] || clean(notices[0]?.title) || "Untitled notice";
  const body = bodies.length > 1
    ? bodies.map((text, index) => {
      const sectionTitle = inlineSections[index]?.section_title || titles[index] || `Section ${index + 1}`;
      return `## ${sectionTitle}\n${text}`;
    }).join("\n\n")
    : (bodies[0] || "");

  return {
    title,
    body,
    assets,
    inlineSections,
    firstSeenAt,
    lastSeenAt,
    observedAt,
    transportStatus,
    parserStatus,
    parserVersion,
    noticePostedAt,
    rawDateText,
    provenance,
    normalizedPayload: {
      ...normalizedPayload,
      inline_sections: inlineSections,
      inline_section_policy: "page_evidence_v1",
    },
    // Representative notice for URL alias candidates.
    representative: notices[0],
  };
}

export function buildNormalizedGraphPlan(input, options = {}) {
  const generatedAt = clean(options.generatedAt ?? input.generated_at) || new Date().toISOString();
  const runInput = input.run ?? {};
  const idempotencyKey = clean(runInput.idempotency_key ?? input.idempotency_key);
  if (!idempotencyKey) throw new Error("Missing run idempotency_key");
  const sourceResults = Array.isArray(input.source_results) ? input.source_results : [];
  const sourceKeys = sourceResults.map((row) => clean(row.source_key));
  if (sourceKeys.length === 0) throw new Error("At least one source_result is required");
  if (new Set(sourceKeys).size !== sourceKeys.length) {
    throw new Error("Duplicate source_key in one run");
  }

  const runId = stableUuid("ingestion_crawl_runs", idempotencyKey);
  const plan = {
    graph_version: POST_PHASE_L_GRAPH_VERSION,
    generated_at: generatedAt,
    execution_mode: clean(runInput.execution_mode) || "fixture",
    writes_performed: false,
    tables: {
      ingestion_crawl_runs: [
        {
          id: runId,
          idempotency_key: idempotencyKey,
          execution_mode: clean(runInput.execution_mode) || "fixture",
          runner_version: clean(runInput.runner_version) || "main-runner",
          replay_of_run_id: runInput.replay_of_run_id ?? null,
          target_project_ref: clean(options.targetProjectRef) || "hrayfvdggbhfmmzfblly",
          status: clean(runInput.status) || "succeeded",
          started_at: clean(runInput.started_at) || generatedAt,
          finished_at: clean(runInput.finished_at) || generatedAt,
          source_count: sourceResults.length,
          metadata: runInput.metadata ?? {},
        },
      ],
      ingestion_source_run_results: [],
      ingestion_notices: [],
      ingestion_notice_url_aliases: [],
      ingestion_notice_occurrences: [],
      ingestion_notice_revisions: [],
      ingestion_notice_assets: [],
      review_items: [],
      crawled_notices_compatibility: [],
    },
  };

  // Alias uniqueness contract: unique(source_id, normalized_url_hash)
  const aliasOwnership = new Map();

  for (const result of sourceResults) {
    const sourceKey = clean(result.source_key);
    const sourceId = clean(result.source_id);
    if (!sourceKey || !sourceId || sourceKey !== sourceId) {
      throw new Error(`Source must be exact-resolved before graph planning: ${sourceKey || "missing"}`);
    }
    const notices = Array.isArray(result.notices) ? result.notices : [];
    const status = sourceResultStatus(result);
    const sourceResultId = stableUuid("ingestion_source_run_results", `${runId}|${sourceId}`);
    plan.tables.ingestion_source_run_results.push({
      id: sourceResultId,
      crawl_run_id: runId,
      source_id: sourceId,
      source_key_snapshot: sourceKey,
      result_status: status,
      observed_count: Number(result.observed_count ?? notices.length) || 0,
      matched_count: Number(result.matched_count ?? notices.length) || 0,
      retry_count: Number(result.retry_count ?? 0) || 0,
      error_code: clean(result.error_code) || null,
      error_message: clean(result.error_message ?? result.error) || null,
      evidence: result.evidence ?? {},
      created_at: generatedAt,
    });

    const groups = new Map();
    for (const notice of notices) {
      const identity = resolveFormalIdentity(notice, sourceId);
      const groupKey = `${sourceId}|${identity.identityKey}`;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, { identity, notices: [] });
      }
      groups.get(groupKey).notices.push(notice);
    }

    for (const { identity, notices: groupedNotices } of groups.values()) {
      const merged = mergeNoticeGroup(groupedNotices);
      const noticeId = stableUuid("ingestion_notices", `${sourceId}|${identity.identityKey}`);
      const occurrenceId = stableUuid(
        "ingestion_notice_occurrences",
        `${runId}|${sourceId}|${sha256(identity.canonicalUrl)}`,
      );
      const contentHash = sha256(JSON.stringify({
        title: merged.title,
        body: merged.body,
        canonical_url: identity.canonicalUrl,
        inline_sections: merged.inlineSections,
      }));
      const revisionId = stableUuid("ingestion_notice_revisions", `${noticeId}|${contentHash}`);

      plan.tables.ingestion_notices.push({
        id: noticeId,
        source_id: sourceId,
        identity_kind: identity.identityKind,
        identity_key: identity.identityKey,
        external_article_id: identity.externalArticleId,
        canonical_url: identity.canonicalUrl,
        canonical_url_hash: identity.canonicalUrlHash,
        legacy_crawled_notice_id: null,
        first_seen_at: merged.firstSeenAt || generatedAt,
        last_seen_at: merged.lastSeenAt || generatedAt,
        created_at: generatedAt,
      });

      const aliasCandidates = [
        { value: identity.originalUrl, kind: "original" },
        { value: identity.canonicalUrl, kind: "canonical" },
        { value: clean(merged.representative.final_url), kind: "redirect_final" },
        ...groupedNotices.flatMap((notice) => ([
          { value: clean(notice.original_url ?? notice.notice_url ?? notice.noticeUrl), kind: "original" },
          { value: clean(notice.canonical_url ?? notice.normalized_url), kind: "canonical" },
          { value: clean(notice.final_url), kind: "redirect_final" },
        ])),
      ];
      const seenAliasHashes = new Set();
      for (const alias of aliasCandidates) {
        const normalized = canonicalizeNoticeUrl(alias.value);
        if (!normalized) continue;
        const normalizedHash = sha256(normalized);
        if (seenAliasHashes.has(normalizedHash)) continue;
        seenAliasHashes.add(normalizedHash);

        const ownershipKey = `${sourceId}|${normalizedHash}`;
        const existingOwner = aliasOwnership.get(ownershipKey);
        if (existingOwner && existingOwner !== noticeId) {
          throw new Error(
            `url_alias_ownership_conflict: source=${sourceId} hash=${normalizedHash}`,
          );
        }
        aliasOwnership.set(ownershipKey, noticeId);

        plan.tables.ingestion_notice_url_aliases.push({
          // Matches SQL unique(source_id, normalized_url_hash) and upsert conflict target.
          id: stableUuid("ingestion_notice_url_aliases", `${sourceId}|${normalizedHash}`),
          notice_id: noticeId,
          source_id: sourceId,
          original_url: alias.value,
          normalized_url: normalized,
          normalized_url_hash: normalizedHash,
          alias_kind: alias.kind,
          normalization_version: "url-normalization-v1",
          first_observed_at: generatedAt,
          last_observed_at: generatedAt,
        });
      }

      plan.tables.ingestion_notice_occurrences.push({
        id: occurrenceId,
        notice_id: noticeId,
        crawl_run_id: runId,
        source_result_id: sourceResultId,
        source_id: sourceId,
        original_url: identity.displayUrl || identity.canonicalUrl,
        canonical_url: identity.canonicalUrl,
        final_url: clean(merged.representative.final_url) || identity.canonicalUrl,
        observed_url_hash: sha256(identity.canonicalUrl),
        raw_title: merged.title,
        raw_body: merged.body || null,
        raw_date_text: merged.rawDateText || null,
        observed_at: merged.observedAt || generatedAt,
        transport_status: merged.transportStatus || "success",
        parser_status: merged.parserStatus || "success",
        provenance: {
          ...merged.provenance,
          inline_section_count: merged.inlineSections.length,
          collapsed_section_observations: groupedNotices.length,
        },
      });

      const qualityStatus = bodyQualityStatus({
        body: merged.body,
        body_quality_status: merged.representative.body_quality_status,
      });
      plan.tables.ingestion_notice_revisions.push({
        id: revisionId,
        notice_id: noticeId,
        occurrence_id: occurrenceId,
        content_hash: contentHash,
        revision_ordinal: Number(merged.representative.revision_ordinal ?? 1) || 1,
        title: merged.title,
        body: merged.body || null,
        normalized_payload: merged.normalizedPayload,
        parser_version: merged.parserVersion || "main-runner",
        body_quality_status: qualityStatus,
        evidence_fingerprint: sha256(JSON.stringify({
          provenance: merged.provenance,
          inline_sections: merged.inlineSections,
        })),
        created_at: generatedAt,
      });

      for (const asset of merged.assets) {
        const normalizedAssetUrl = canonicalizeNoticeUrl(asset.original_url);
        const originalUrlHash = sha256(normalizedAssetUrl);
        plan.tables.ingestion_notice_assets.push({
          id: stableUuid("ingestion_notice_assets", `${occurrenceId}|${originalUrlHash}`),
          notice_id: noticeId,
          occurrence_id: occurrenceId,
          revision_id: revisionId,
          original_url: asset.original_url,
          original_url_hash: originalUrlHash,
          asset_kind: asset.asset_kind,
          mime_type: asset.mime_type,
          byte_size: asset.byte_size,
          storage_reference: null,
          verification_status: asset.verification_status,
          metadata: asset.metadata,
          created_at: generatedAt,
        });
      }

      plan.tables.review_items.push({
        id: stableUuid("review_items", `${noticeId}|scholarship_notice`),
        notice_id: noticeId,
        current_revision_id: revisionId,
        review_scope: "scholarship_notice",
        state: status === "success" ? "open" : "blocked",
        created_at: generatedAt,
        updated_at: generatedAt,
      });
      plan.tables.crawled_notices_compatibility.push({
        graph_notice_id: noticeId,
        source_group: sourceId.split("_")[0] || "unknown",
        source_id: sourceId,
        source_name: clean(result.source_name) || sourceId,
        title: merged.title,
        notice_url: identity.canonicalUrl,
        notice_posted_at: merged.noticePostedAt || null,
        raw_date_text: merged.rawDateText || null,
        body: merged.body || null,
        image_urls: merged.assets
          .filter((asset) => asset.asset_kind === "image")
          .map((asset) => asset.original_url),
        scholarship_type: "on_campus",
        status: "new",
        run_at: generatedAt,
      });
    }
  }

  for (const [table, rows] of Object.entries(plan.tables)) {
    const values = rows.map((row) => compatibilityRowKey(table, row)).filter(Boolean);
    if (new Set(values).size !== values.length) {
      throw new Error(`Duplicate key generated for ${table}`);
    }
  }

  // Cross-check alias uniqueness contract inside a plan.
  const aliasKeys = plan.tables.ingestion_notice_url_aliases.map(
    (row) => `${row.source_id}|${row.normalized_url_hash}`,
  );
  if (new Set(aliasKeys).size !== aliasKeys.length) {
    throw new Error("Duplicate source_id+normalized_url_hash alias generated");
  }

  return plan;
}

function compatibilityRowKey(table, row) {
  if (table === "crawled_notices_compatibility") {
    // Different sources may share one normalized URL; uniqueness is per source.
    return `${clean(row.source_id)}|${clean(row.notice_url)}`;
  }
  return row.id;
}

export function applyPlanToMemory(state, plan) {
  const target = state ?? {};
  const inserted = {};
  for (const [table, rows] of Object.entries(plan.tables)) {
    const bucket = target[table] ?? new Map();
    let count = 0;
    for (const row of rows) {
      const key = compatibilityRowKey(table, row);
      if (bucket.has(key)) continue;
      bucket.set(key, structuredClone(row));
      count += 1;
    }
    target[table] = bucket;
    inserted[table] = count;
  }
  return { state: target, inserted };
}

export function summarizeGraphPlan(plan) {
  return Object.fromEntries(
    Object.entries(plan.tables).map(([table, rows]) => [table, rows.length]),
  );
}
