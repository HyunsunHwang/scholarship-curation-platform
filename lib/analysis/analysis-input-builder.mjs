import { createHash } from "node:crypto";
import {
  ANALYSIS_PROMPT_VERSION,
  ANALYSIS_SCHEMA_VERSION,
} from "./analysis-policy.mjs";
import {
  buildAnalysisInputFingerprint,
  REDACTION_VERSION,
} from "./analysis-readiness.mjs";

const DEFAULT_BODY_LIMIT = 24_000;
const DEFAULT_ATTACHMENT_LIMIT = 18_000;
const DEFAULT_TOTAL_ATTACHMENT_LIMIT = 36_000;

function clean(value) {
  return String(value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

export function stableAnalysisJson(value) {
  return JSON.stringify(stable(value));
}

export function fingerprintAnalysisInput(value) {
  return createHash("sha256").update(stableAnalysisJson(value)).digest("hex");
}

function truncate(text, limit) {
  const value = clean(text);
  return {
    text: value.slice(0, limit),
    truncated: value.length > limit,
    original_length: value.length,
    included_length: Math.min(value.length, limit),
  };
}

function assetText(asset) {
  return asset.extracted_text ?? asset.extractedText ?? asset.metadata?.extracted_text ?? "";
}

export function buildAnalysisInput(input = {}, options = {}) {
  const revision = input.revision ?? {};
  const notice = input.notice ?? {};
  const occurrence = input.occurrence ?? {};
  const source = input.source ?? {};
  const assets = [...(Array.isArray(input.assets) ? input.assets : [])]
    .sort((left, right) => String(left.id ?? "").localeCompare(String(right.id ?? "")));
  const body = truncate(revision.body ?? "", options.bodyLimit ?? DEFAULT_BODY_LIMIT);
  let remaining = options.totalAttachmentLimit ?? DEFAULT_TOTAL_ATTACHMENT_LIMIT;
  const attachments = assets.flatMap((asset) => {
    if (remaining <= 0) return [];
    const entry = truncate(assetText(asset), Math.min(
      options.attachmentLimit ?? DEFAULT_ATTACHMENT_LIMIT,
      remaining,
    ));
    if (!entry.text) return [];
    remaining -= entry.included_length;
    return [{
      asset_id: String(asset.id ?? asset.original_url_hash ?? ""),
      kind: String(asset.asset_kind ?? "attachment"),
      mime_type: asset.mime_type ?? null,
      text: entry.text,
      truncated: entry.truncated,
      original_length: entry.original_length,
      included_length: entry.included_length,
    }];
  });
  const normalized = {
    contract: {
      prompt_version: options.promptVersion ?? ANALYSIS_PROMPT_VERSION,
      schema_version: options.schemaVersion ?? ANALYSIS_SCHEMA_VERSION,
    },
    lineage: {
      notice_id: String(notice.id ?? revision.notice_id ?? ""),
      revision_id: String(revision.id ?? ""),
      source_id: String(source.source_id ?? notice.source_id ?? ""),
    },
    notice: {
      title: clean(revision.title ?? notice.title),
      body: body.text,
      canonical_url: clean(notice.canonical_url) || null,
      published_date: revision.normalized_payload?.published_date
        ?? revision.normalized_payload?.notice_posted_at
        ?? occurrence.raw_date_text
        ?? null,
      published_date_uncertain: Boolean(
        revision.normalized_payload?.published_date_uncertain,
      ) || Boolean(
        occurrence.raw_date_text
        && !/^\d{4}-\d{2}-\d{2}$/.test(String(occurrence.raw_date_text).trim()),
      ),
    },
    source: {
      source_id: String(source.source_id ?? notice.source_id ?? ""),
      source_name: clean(source.source_name) || null,
      scholarship_dedicated: Boolean(source.scholarship_dedicated),
    },
    privacy: {
      status: String(input.privacy_status ?? input.privacy?.status ?? "not_scanned"),
      redaction_version: String(
        input.redaction_version ?? input.privacy?.redaction_version ?? "analysis-redaction-contract-v1",
      ),
    },
    attachments,
    input_metadata: {
      body_truncated: body.truncated,
      body_original_length: body.original_length,
      attachment_count: attachments.length,
      attachments_truncated: attachments.some((asset) => asset.truncated) || remaining <= 0,
      excluded_content: ["html_markup", "navigation_text", "binary_content"],
    },
  };
  return {
    normalized_input: normalized,
    input_fingerprint: buildAnalysisInputFingerprint({
      revision: {
        ...revision,
        notice_id: normalized.lineage.notice_id,
      },
      assets,
      source: {
        ...source,
        source_id: normalized.lineage.source_id,
        notice_id: normalized.lineage.notice_id,
      },
      redactionVersion: normalized.privacy.redaction_version || REDACTION_VERSION,
    }),
    prompt_version: normalized.contract.prompt_version,
    schema_version: normalized.contract.schema_version,
  };
}
