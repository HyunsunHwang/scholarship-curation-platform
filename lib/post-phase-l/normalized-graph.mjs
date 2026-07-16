import crypto from "node:crypto";

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
    if (!['http:', 'https:'].includes(url.protocol)) return null;
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

    for (const notice of notices) {
      const originalUrl = clean(notice.original_url ?? notice.notice_url ?? notice.noticeUrl);
      const canonicalUrl = canonicalizeNoticeUrl(
        notice.canonical_url ?? notice.normalized_url ?? originalUrl,
      );
      if (!canonicalUrl) {
        throw new Error(`ambiguous_identity: ${sourceId} has no canonical detail URL`);
      }
      const externalArticleId = clean(notice.external_article_id) || extractExternalArticleId(canonicalUrl);
      const canonicalUrlHash = sha256(canonicalUrl);
      const identityKey = externalArticleId
        ? `external:${externalArticleId}`
        : `url:${canonicalUrlHash}`;
      const noticeId = stableUuid("ingestion_notices", `${sourceId}|${identityKey}`);
      const occurrenceId = stableUuid(
        "ingestion_notice_occurrences",
        `${runId}|${sourceId}|${sha256(originalUrl || canonicalUrl)}`,
      );
      const title = clean(notice.title);
      const body = clean(notice.body ?? notice.content ?? notice.body_text);
      const contentHash = sha256(JSON.stringify({ title, body, canonical_url: canonicalUrl }));
      const revisionId = stableUuid("ingestion_notice_revisions", `${noticeId}|${contentHash}`);

      plan.tables.ingestion_notices.push({
        id: noticeId,
        source_id: sourceId,
        identity_kind: externalArticleId ? "external_article_id" : "canonical_detail_url",
        identity_key: identityKey,
        external_article_id: externalArticleId || null,
        canonical_url: canonicalUrl,
        canonical_url_hash: canonicalUrlHash,
        legacy_crawled_notice_id: null,
        first_seen_at: clean(notice.first_seen_at) || generatedAt,
        last_seen_at: clean(notice.last_seen_at) || generatedAt,
        created_at: generatedAt,
      });

      const aliases = [
        { value: originalUrl, kind: "original" },
        { value: canonicalUrl, kind: "canonical" },
        { value: clean(notice.final_url), kind: "redirect_final" },
      ];
      const seenAliasHashes = new Set();
      for (const alias of aliases) {
        const normalized = canonicalizeNoticeUrl(alias.value);
        if (!normalized) continue;
        const normalizedHash = sha256(normalized);
        if (seenAliasHashes.has(normalizedHash)) continue;
        seenAliasHashes.add(normalizedHash);
        plan.tables.ingestion_notice_url_aliases.push({
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
        original_url: originalUrl || canonicalUrl,
        canonical_url: canonicalUrl,
        final_url: clean(notice.final_url) || canonicalUrl,
        observed_url_hash: sha256(originalUrl || canonicalUrl),
        raw_title: title,
        raw_body: body || null,
        raw_date_text: clean(notice.raw_date_text ?? notice.date_text) || null,
        observed_at: clean(notice.observed_at) || generatedAt,
        transport_status: clean(notice.transport_status) || "success",
        parser_status: clean(notice.parser_status) || "success",
        provenance: notice.provenance ?? {},
      });

      const qualityStatus = bodyQualityStatus(notice);
      plan.tables.ingestion_notice_revisions.push({
        id: revisionId,
        notice_id: noticeId,
        occurrence_id: occurrenceId,
        content_hash: contentHash,
        revision_ordinal: Number(notice.revision_ordinal ?? 1) || 1,
        title,
        body: body || null,
        normalized_payload: notice.normalized_payload ?? {},
        parser_version: clean(notice.parser_version) || "main-runner",
        body_quality_status: qualityStatus,
        evidence_fingerprint: sha256(JSON.stringify(notice.provenance ?? {})),
        created_at: generatedAt,
      });

      for (const asset of normalizeAssets(notice)) {
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
        title,
        notice_url: canonicalUrl,
        notice_posted_at: clean(notice.notice_posted_at ?? notice.published_at) || null,
        raw_date_text: clean(notice.raw_date_text ?? notice.date_text) || null,
        body: body || null,
        image_urls: normalizeAssets(notice)
          .filter((asset) => asset.asset_kind === "image")
          .map((asset) => asset.original_url),
        scholarship_type: "on_campus",
        status: "new",
        run_at: generatedAt,
      });
    }
  }

  for (const [table, rows] of Object.entries(plan.tables)) {
    const key = table === "crawled_notices_compatibility" ? "notice_url" : "id";
    const values = rows.map((row) => row[key]).filter(Boolean);
    if (new Set(values).size !== values.length) {
      throw new Error(`Duplicate ${key} generated for ${table}`);
    }
  }
  return plan;
}

export function applyPlanToMemory(state, plan) {
  const target = state ?? {};
  const inserted = {};
  for (const [table, rows] of Object.entries(plan.tables)) {
    const key = table === "crawled_notices_compatibility" ? "notice_url" : "id";
    const bucket = target[table] ?? new Map();
    let count = 0;
    for (const row of rows) {
      if (bucket.has(row[key])) continue;
      bucket.set(row[key], structuredClone(row));
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
