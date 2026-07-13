import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSourceIdentityIndex,
  resolveSourceKey,
} from "./resolve-crawler-source-identities.mjs";

const __filename = fileURLToPath(import.meta.url);

const DEFAULT_INPUT = "fixtures/integration-foundation/normalized-crawler-sample.json";
const DEFAULT_SOURCES = "data/notice-sources.csv";
const DEFAULT_MAPPING_SNAPSHOT =
  "fixtures/integration-foundation/source-identity-mapping-snapshot.json";
const DEFAULT_OUTPUT = "reports/integration-foundation-review-read-model.json";

const BODY_QUALITY_VALUES = new Set([
  "good_text",
  "no_assets_but_text_sufficient",
  "short_body_needs_review",
  "image_only_suspected",
  "attachment_required_unknown",
]);

const DUPLICATE_STATUS_VALUES = new Set([
  "unique",
  "duplicate_review",
  "duplicate_existing",
  "duplicate_within_input",
  "changed_existing",
  "unchanged_existing",
]);

const SOURCE_RESULT_VALUES = new Set([
  "success",
  "partial",
  "failed",
  "zero_match_observed",
  "unknown",
]);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function writeJson(filePath, value) {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeAssets(record) {
  return toArray(record.assets ?? record.attachments ?? record.image_urls)
    .map((asset) => {
      if (typeof asset === "string") return { url: asset, kind: "unknown" };
      return {
        url: cleanText(asset.url ?? asset.href),
        kind: cleanText(asset.kind ?? asset.type) || "unknown",
      };
    })
    .filter((asset) => asset.url);
}

function inferBodyQuality(record, assets) {
  const explicit = cleanText(record.body_quality);
  if (BODY_QUALITY_VALUES.has(explicit)) return explicit;
  const body = cleanText(record.body_text ?? record.body ?? record.content);
  const noAssets = record.no_assets === true || assets.length === 0;
  if (!body && assets.some((asset) => asset.kind === "image")) return "image_only_suspected";
  if (body.length < 80) return "short_body_needs_review";
  if (noAssets) return "no_assets_but_text_sufficient";
  return "good_text";
}

function normalizeDuplicateStatus(record) {
  const status = cleanText(record.duplicate_status ?? record.duplicateStatus);
  if (DUPLICATE_STATUS_VALUES.has(status)) return status;
  const classification = cleanText(record.classification ?? record.review_classification);
  if (/duplicate/i.test(classification)) return "duplicate_review";
  return "unique";
}

function normalizeSourceResultStatus(record) {
  const status = cleanText(
    record.latest_source_result_status ?? record.source_result_status,
  );
  return SOURCE_RESULT_VALUES.has(status) ? status : "unknown";
}

function mapReviewStatus({ resolution, duplicateStatus, bodyQuality, sourceResultStatus }) {
  if (resolution.resolution_status !== "resolved") return "blocked";
  if (sourceResultStatus === "failed") return "blocked";
  if (sourceResultStatus === "zero_match_observed") return "blocked";
  if (
    duplicateStatus === "duplicate_review" ||
    duplicateStatus === "duplicate_existing" ||
    duplicateStatus === "duplicate_within_input" ||
    duplicateStatus === "changed_existing"
  ) {
    return "needs_review";
  }
  if (bodyQuality === "short_body_needs_review") return "needs_review";
  if (bodyQuality === "image_only_suspected") return "needs_review";
  if (bodyQuality === "attachment_required_unknown") return "needs_review";
  return "clean";
}

function normalizePublishedAt(record) {
  const value = cleanText(record.published_at ?? record.notice_posted_at);
  return value || null;
}

function normalizeNotice(record, sourceIndex) {
  const sourceKey = cleanText(record.source_key ?? record.source_id);
  const resolution = resolveSourceKey(sourceKey, sourceIndex);
  const assets = normalizeAssets(record);
  const bodyQuality = inferBodyQuality(record, assets);
  const duplicateStatus = normalizeDuplicateStatus(record);
  const sourceResultStatus = normalizeSourceResultStatus(record);
  const reviewStatus = mapReviewStatus({
    resolution,
    duplicateStatus,
    bodyQuality,
    sourceResultStatus,
  });
  const now = cleanText(record.updated_at ?? record.created_at) || new Date(0).toISOString();
  const originalUrl = cleanText(record.original_url ?? record.source_url ?? record.notice_url);
  const normalizedUrl = cleanText(record.normalized_url) || originalUrl;

  return {
    source_id: resolution.source_id,
    source_key_snapshot: sourceKey,
    canonical_key: cleanText(record.canonical_key),
    title: cleanText(record.title),
    original_url: originalUrl,
    normalized_url: normalizedUrl,
    body_text: cleanText(record.body_text ?? record.body ?? record.content),
    published_at: normalizePublishedAt(record),
    asset_count: assets.length,
    has_assets: assets.length > 0,
    no_assets: record.no_assets === true || assets.length === 0,
    body_quality: bodyQuality,
    duplicate_status: duplicateStatus,
    review_status: reviewStatus,
    target_summary: toArray(record.targets ?? record.target_summary),
    keyword_summary: toArray(record.keyword_matches ?? record.keyword_summary),
    occurrence_count: Number(record.occurrence_count ?? 1),
    latest_run_id: cleanText(record.latest_run_id ?? record.run_id) || null,
    latest_source_result_status: sourceResultStatus,
    evidence_json: {
      ...(record.evidence ?? {}),
      source_resolution: resolution,
      admin_review_field_mapping: {
        source_group: "derived from source_id prefix for crawled_notices compatibility",
        source_id: "resolved notice_sources.source_id",
        source_name: "available from source resolution evidence",
        title: "direct from normalized record",
        notice_url: "normalized_url fallback original_url",
        notice_posted_at: "published_at",
        raw_date_text: "default nullable",
        body: "body_text",
        image_urls: "derived from image assets",
        scholarship_type: "default on_campus until review contract expands",
        status: "new/promoted/rejected legacy field remains separate from adapter review_status",
      },
    },
    created_at: now,
    updated_at: now,
  };
}

export function buildScholarshipReviewReadModel(input, options = {}) {
  const sourceIndex = buildSourceIdentityIndex({
    sourceCsvPath: options.sourceCsvPath ?? DEFAULT_SOURCES,
    mappingSnapshotPath: options.mappingSnapshotPath ?? DEFAULT_MAPPING_SNAPSHOT,
  });
  const records = Array.isArray(input)
    ? input
    : Array.isArray(input.notices)
      ? input.notices
      : [];
  const readModel = records.map((record) => normalizeNotice(record, sourceIndex));
  const statusCounts = readModel.reduce((acc, row) => {
    acc[`${row.review_status}_count`] = (acc[`${row.review_status}_count`] ?? 0) + 1;
    acc[`${row.duplicate_status}_count`] =
      (acc[`${row.duplicate_status}_count`] ?? 0) + 1;
    acc[`${row.body_quality}_count`] = (acc[`${row.body_quality}_count`] ?? 0) + 1;
    if (row.no_assets) acc.no_assets_count += 1;
    if (row.latest_source_result_status === "zero_match_observed") {
      acc.zero_match_source_count += 1;
    }
    return acc;
  }, {
    clean_count: 0,
    needs_review_count: 0,
    blocked_count: 0,
    duplicate_review_count: 0,
    quality_review_count: 0,
    no_assets_count: 0,
    zero_match_source_count: 0,
  });

  statusCounts.quality_review_count =
    (statusCounts.short_body_needs_review_count ?? 0) +
    (statusCounts.image_only_suspected_count ?? 0) +
    (statusCounts.attachment_required_unknown_count ?? 0);

  return {
    generated_at: options.generatedAt ?? input.generated_at ?? new Date().toISOString(),
    read_only: true,
    db_access: false,
    db_write: false,
    migration: false,
    candidate_count_requested: readModel.length,
    counts: statusCounts,
    read_model: readModel,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = args.input ?? DEFAULT_INPUT;
  const outputPath = args.output ?? DEFAULT_OUTPUT;
  const input = readJson(inputPath);
  const report = buildScholarshipReviewReadModel(input, {
    sourceCsvPath: args.sources ?? DEFAULT_SOURCES,
    mappingSnapshotPath: args["mapping-snapshot"] ?? DEFAULT_MAPPING_SNAPSHOT,
  });
  writeJson(outputPath, report);
  console.log(`review_read_model=${path.resolve(outputPath)}`);
  console.log(`candidates=${report.candidate_count_requested}`);
  console.log(`clean=${report.counts.clean_count}`);
  console.log(`needs_review=${report.counts.needs_review_count}`);
  console.log(`blocked=${report.counts.blocked_count}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
