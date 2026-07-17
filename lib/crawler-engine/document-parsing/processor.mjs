import { createDocumentResult, sha256Bytes } from "./contract.mjs";
import { attachEnginePhase3Payload } from "./handoff.mjs";

export function buildAssetPreflightKey(asset = {}, metadata = {}) {
  const url = String(asset.url ?? metadata.url ?? "").trim();
  const etag = String(metadata.etag ?? asset.etag ?? "").trim();
  const lastModified = String(metadata.lastModified ?? metadata.last_modified ?? asset.lastModified ?? asset.last_modified ?? "").trim();
  const contentLength = Number(metadata.contentLength ?? metadata.content_length ?? asset.contentLength ?? asset.content_length);
  const mimeType = String(metadata.mimeType ?? metadata.mime_type ?? asset.mimeLikeHint ?? "").trim().toLowerCase();
  if (!url || (!etag && !(lastModified && Number.isFinite(contentLength)))) return null;
  return sha256Bytes(JSON.stringify({
    url,
    validator: etag ? { etag } : { last_modified: lastModified, content_length: contentLength },
    mime_type: mimeType || null,
  }));
}

export function createNoticeDocumentProcessor({
  registry,
  inspectAsset = null,
  fetchAsset = null,
  assetEvidenceCache = new Map(),
  options = {},
}) {
  if (!registry || typeof registry.parse !== "function") throw new TypeError("A document parser registry is required.");
  return async ({ source, notice, detailHtml = "" }) => {
    const results = [];
    const html = detailHtml || notice.detail_html || notice.html || null;
    const text = notice.body ?? notice.content ?? notice.body_text ?? "";
    if (html !== null || text) {
      results.push(await registry.parse({
        source_key: source?.sourceKey ?? source?.sourceId ?? notice.source_key,
        source_id: notice.source_id,
        notice_identity_reference: notice.canonical_url ?? notice.noticeUrl,
        original_url: notice.original_url ?? notice.noticeUrl,
        canonical_url: notice.canonical_url ?? notice.noticeUrl,
        filename: "notice.html",
        mime_type: "text/html",
        html: html ?? `<main><p>${String(text).replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char])}</p></main>`,
      }, options));
    }
    if (typeof fetchAsset === "function") {
      for (const asset of notice.attachment_metadata ?? notice.attachmentMetadata ?? []) {
        try {
          let inspected = {};
          if (typeof inspectAsset === "function") {
            try { inspected = await inspectAsset(asset, { source, notice }) ?? {}; } catch { inspected = {}; }
          }
          const preflightKey = buildAssetPreflightKey(asset, inspected);
          const preflightCached = preflightKey ? assetEvidenceCache.get(preflightKey) : null;
          if (preflightCached) {
            results.push(createDocumentResult({
              ...preflightCached,
              cache_status: "hit_success",
              cache_hit: true,
              reparsed: false,
              provenance: { ...(preflightCached.provenance ?? {}), asset_preflight_cache_hit: true },
            }));
            continue;
          }
          const fetched = await fetchAsset(asset, { source, notice, inspected });
          const parsed = await registry.parse({
            source_key: source?.sourceKey ?? source?.sourceId ?? notice.source_key,
            source_id: notice.source_id,
            notice_identity_reference: notice.canonical_url ?? notice.noticeUrl,
            original_url: asset.url,
            canonical_url: fetched.finalUrl ?? asset.url,
            filename: asset.fileName ?? asset.filename,
            mime_type: fetched.mimeType ?? inspected.mimeType ?? asset.mimeLikeHint,
            bytes: fetched.bytes,
            provenance: {
              etag: fetched.etag ?? inspected.etag ?? null,
              last_modified: fetched.lastModified ?? inspected.lastModified ?? null,
              content_length: fetched.contentLength ?? inspected.contentLength ?? null,
              asset_preflight_cache_hit: false,
            },
            notice_context: {
              filename: asset.fileName ?? asset.filename,
              bodyText: text,
              hasAlternativeReadableDocument: results.some((result) => result.normalized_text.length >= 80),
            },
          }, options);
          results.push(parsed);
          const resolvedPreflightKey = buildAssetPreflightKey(asset, { ...inspected, ...fetched });
          if (resolvedPreflightKey) assetEvidenceCache.set(resolvedPreflightKey, parsed);
        } catch (error) {
          results.push(createDocumentResult({
            source_key: source?.sourceKey ?? source?.sourceId ?? notice.source_key,
            source_id: notice.source_id,
            notice_identity_reference: notice.canonical_url ?? notice.noticeUrl,
            original_url: asset.url ?? null,
            canonical_url: asset.url ?? null,
            filename: asset.fileName ?? asset.filename ?? null,
            extraction_status: "download_failed",
            quality_status: "manual_review_required",
            quality_reasons: ["download_failed"],
            manual_review_required: true,
            manual_review_reasons: ["download_failed"],
            error_summary: error,
          }));
        }
      }
    }
    const readableBody = results[0]?.detected_format === "html" && results[0].normalized_text.length >= 40;
    const finalizedResults = results.map((result, index) => {
      if (index === 0 || readableBody || result.normalized_text.length < 40) return result;
      return createDocumentResult({
        ...result,
        extraction_status: "attachment_primary_content",
        provenance: { ...(result.provenance ?? {}), attachment_primary_content: true },
      });
    });
    return attachEnginePhase3Payload({
      ...notice,
      document_extraction_results: finalizedResults,
      document_quality_summary: {
        document_count: finalizedResults.length,
        manual_review_count: finalizedResults.filter((result) => result.manual_review_required).length,
        ocr_invocation_count: finalizedResults.reduce((sum, result) => sum + (Number(result.ocr_invocation_count) || 0), 0),
        statuses: finalizedResults.map((result) => result.extraction_status),
      },
    });
  };
}
