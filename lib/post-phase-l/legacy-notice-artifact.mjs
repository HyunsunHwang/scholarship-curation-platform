import fs from "node:fs";
import path from "node:path";
import { canonicalizeNoticeUrl } from "./normalized-graph.mjs";

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const input = String(text ?? "");
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const next = input[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    if (ch === "\r") continue;
    cell += ch;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function toDateOrNull(value) {
  const text = clean(value);
  if (!text) return null;
  const head = text.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(head) ? head : null;
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function parseJsonArrayCell(value) {
  const text = clean(value);
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return text.split("|").map((part) => clean(part)).filter(Boolean);
  }
}

function bodyQualityBucket(body) {
  const length = clean(body).length;
  if (length >= 120) return "text_sufficient";
  if (length > 0) return "short_body_needs_review";
  return "missing_body";
}

/**
 * Normalize a legacy ingest-shaped notice row without DB access.
 */
export function normalizeLegacyNoticeRow(row = {}) {
  const noticeUrl = clean(row.notice_url ?? row.noticeUrl);
  const title = clean(row.title);
  const body = clean(row.body ?? row.content) || null;
  const attachments = Array.isArray(row.attachment_metadata ?? row.attachmentMetadata)
    ? (row.attachment_metadata ?? row.attachmentMetadata)
    : parseJsonArrayCell(row.attachment_metadata ?? row.attachments);
  const applicationLinks = Array.isArray(row.application_links ?? row.applicationLinks)
    ? (row.application_links ?? row.applicationLinks)
    : parseJsonArrayCell(row.application_links);
  const canonicalUrl = canonicalizeNoticeUrl(noticeUrl) || noticeUrl || null;
  return {
    source_group: clean(row.source_group ?? row.sourceGroup) || "unknown",
    source_id: clean(row.source_id ?? row.sourceId),
    source_name: clean(row.source_name ?? row.sourceName),
    title,
    notice_url: noticeUrl,
    canonical_url: canonicalUrl,
    notice_posted_at: toDateOrNull(row.notice_posted_at ?? row.noticePostedAt),
    raw_date_text: clean(row.raw_date_text ?? row.date_text ?? row.detail_date) || null,
    body,
    body_present: Boolean(body),
    body_quality: bodyQualityBucket(body),
    attachment_metadata: attachments,
    attachment_count: attachments.length,
    application_links: applicationLinks,
    candidate_classification: clean(
      row.candidate_classification ?? row.candidateClassification,
    ) || null,
    identity_kind: "legacy_notice_url",
    identity_key: noticeUrl,
  };
}

/**
 * Parse legacy CSV using the same required columns as ingest-notices-to-supabase.
 * Dedupes by exact notice_url like the legacy ingest script.
 */
export function parseLegacyNoticeCsv(text) {
  const table = parseCsv(String(text ?? "").replace(/^\uFEFF/, ""));
  if (table.length === 0) {
    return { records: [], duplicate_url_count: 0, raw_row_count: 0 };
  }
  const [header, ...body] = table;
  const index = Object.fromEntries(header.map((name, i) => [name, i]));
  for (const column of ["source_group", "title", "notice_url"]) {
    if (!(column in index)) {
      throw new Error(`Missing required column in CSV: ${column}`);
    }
  }

  const seenUrls = new Set();
  let duplicateUrlCount = 0;
  const records = [];
  for (const cells of body) {
    if (cells.length === 0 || cells.every((cell) => clean(cell) === "")) continue;
    const noticeUrl = clean(cells[index.notice_url]);
    const title = clean(cells[index.title]);
    if (!title || !isHttpUrl(noticeUrl)) continue;
    if (seenUrls.has(noticeUrl)) {
      duplicateUrlCount += 1;
      continue;
    }
    seenUrls.add(noticeUrl);
    records.push(normalizeLegacyNoticeRow({
      source_group: cells[index.source_group],
      source_id: index.source_id != null ? cells[index.source_id] : "",
      source_name: index.source_name != null ? cells[index.source_name] : "",
      title,
      notice_url: noticeUrl,
      notice_posted_at: index.notice_posted_at != null ? cells[index.notice_posted_at] : "",
      date_text: index.date_text != null ? cells[index.date_text] : "",
      detail_date: index.detail_date != null ? cells[index.detail_date] : "",
      content: index.content != null ? cells[index.content] : "",
      attachment_metadata: index.attachment_metadata != null ? cells[index.attachment_metadata] : "",
      application_links: index.application_links != null ? cells[index.application_links] : "",
      candidate_classification: index.candidate_classification != null
        ? cells[index.candidate_classification]
        : "",
    }));
  }
  return {
    records,
    duplicate_url_count: duplicateUrlCount,
    raw_row_count: body.length,
  };
}

/**
 * Mirror legacy ingest URL dedupe: first notice_url wins globally.
 * This intentionally drops later rows that share a URL across sources.
 */
export function applyLegacyNoticeUrlDedupe(records = []) {
  const seenUrls = new Set();
  let duplicateUrlCount = 0;
  const deduped = [];
  for (const row of records) {
    const noticeUrl = clean(row.notice_url);
    if (!noticeUrl) continue;
    if (seenUrls.has(noticeUrl)) {
      duplicateUrlCount += 1;
      continue;
    }
    seenUrls.add(noticeUrl);
    deduped.push(row);
  }
  return { records: deduped, duplicate_url_count: duplicateUrlCount };
}

export function loadLegacyNoticeArtifact(input, options = {}) {
  const applyDedupe = options.applyLegacyUrlDedupe !== false;
  if (Array.isArray(input)) {
    const normalized = input.map((row) => normalizeLegacyNoticeRow(row));
    const deduped = applyDedupe
      ? applyLegacyNoticeUrlDedupe(normalized)
      : { records: normalized, duplicate_url_count: 0 };
    return {
      records: deduped.records,
      duplicate_url_count: deduped.duplicate_url_count,
      raw_row_count: normalized.length,
      source: "json_rows",
    };
  }
  if (input && typeof input === "object" && Array.isArray(input.records)) {
    const loaded = loadLegacyNoticeArtifact(input.records, options);
    return { ...loaded, source: "json_object" };
  }
  if (input && typeof input === "object" && Array.isArray(input.legacy_records)) {
    const loaded = loadLegacyNoticeArtifact(input.legacy_records, options);
    return { ...loaded, source: "fixture_object" };
  }
  if (typeof input === "string") {
    const resolved = path.resolve(input);
    const text = fs.readFileSync(resolved, "utf8");
    if (resolved.endsWith(".json")) {
      const parsed = JSON.parse(text);
      return { ...loadLegacyNoticeArtifact(parsed, options), source: resolved };
    }
    return { ...parseLegacyNoticeCsv(text), source: resolved };
  }
  throw new Error("unsupported_legacy_artifact_input");
}

export function summarizeLegacyArtifact(artifact) {
  const records = artifact?.records ?? [];
  return {
    notice_count: records.length,
    source_count: new Set(records.map((row) => row.source_id).filter(Boolean)).size,
    duplicate_url_count: Number(artifact?.duplicate_url_count ?? 0),
    body_present_count: records.filter((row) => row.body_present).length,
    attachment_total: records.reduce((sum, row) => sum + Number(row.attachment_count ?? 0), 0),
  };
}
