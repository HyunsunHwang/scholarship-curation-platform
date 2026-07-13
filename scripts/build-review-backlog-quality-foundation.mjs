import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);

const BODY_QUALITY_VALUES = new Set([
  "good_text",
  "text_sufficient_no_assets",
  "short_body_needs_review",
  "image_only_suspected",
  "empty_or_missing_body",
  "attachment_required_unknown",
]);

const CLASSIFICATION_POLICY = {
  clean: {
    reason_code: "clean_candidate",
    severity: "info",
    is_auto_apply_allowed: true,
    requires_admin_review: false,
    is_blocking: false,
    recommended_action: "retain_for_later_approved_apply_path",
  },
  duplicate_review: {
    reason_code: "duplicate_requires_review",
    severity: "warning",
    is_auto_apply_allowed: false,
    requires_admin_review: true,
    is_blocking: false,
    recommended_action: "compare_duplicate_evidence",
  },
  quality_review: {
    reason_code: "body_quality_requires_review",
    severity: "warning",
    is_auto_apply_allowed: false,
    requires_admin_review: true,
    is_blocking: false,
    recommended_action: "review_body_quality",
  },
  blocked_missing_source: {
    reason_code: "source_identity_missing",
    severity: "error",
    is_auto_apply_allowed: false,
    requires_admin_review: true,
    is_blocking: true,
    recommended_action: "resolve_source_identity_explicitly",
  },
  blocked_missing_target: {
    reason_code: "target_missing",
    severity: "error",
    is_auto_apply_allowed: false,
    requires_admin_review: true,
    is_blocking: true,
    recommended_action: "supply_target_evidence",
  },
  blocked_invalid_date: {
    reason_code: "published_at_invalid",
    severity: "error",
    is_auto_apply_allowed: false,
    requires_admin_review: true,
    is_blocking: true,
    recommended_action: "correct_published_date",
  },
  blocked_invalid_url: {
    reason_code: "notice_url_invalid",
    severity: "error",
    is_auto_apply_allowed: false,
    requires_admin_review: true,
    is_blocking: true,
    recommended_action: "correct_notice_url",
  },
  no_assets_text_sufficient: {
    reason_code: "no_assets_text_sufficient",
    severity: "info",
    is_auto_apply_allowed: true,
    requires_admin_review: false,
    is_blocking: false,
    recommended_action: "retain_text_evidence",
  },
  no_assets_needs_review: {
    reason_code: "no_assets_quality_uncertain",
    severity: "warning",
    is_auto_apply_allowed: false,
    requires_admin_review: true,
    is_blocking: false,
    recommended_action: "review_attachment_or_body_completeness",
  },
  image_only_suspected: {
    reason_code: "image_only_content_suspected",
    severity: "warning",
    is_auto_apply_allowed: false,
    requires_admin_review: true,
    is_blocking: false,
    recommended_action: "review_image_or_attachment_content",
  },
  source_failure: {
    reason_code: "source_run_failed",
    severity: "error",
    is_auto_apply_allowed: false,
    requires_admin_review: true,
    is_blocking: true,
    recommended_action: "investigate_source_run",
  },
  zero_match_observed: {
    reason_code: "zero_match_observed_not_absence_proof",
    severity: "warning",
    is_auto_apply_allowed: false,
    requires_admin_review: true,
    is_blocking: true,
    recommended_action: "review_source_coverage_before_any_conclusion",
  },
};

function cleanText(value) {
  return String(value ?? "").trim();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeAssets(record) {
  return toArray(record.assets ?? record.attachments ?? record.image_urls)
    .map((asset) => {
      if (typeof asset === "string") return { url: asset, kind: "unknown" };
      return {
        url: cleanText(asset?.url ?? asset?.href),
        kind: cleanText(asset?.kind ?? asset?.type) || "unknown",
      };
    })
    .filter((asset) => asset.url);
}

function isValidIsoDate(value) {
  const text = cleanText(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(text);
  if (!match || Number.isNaN(Date.parse(text))) return false;
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
  return date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() + 1 === Number(match[2]) &&
    date.getUTCDate() === Number(match[3]);
}

function isValidHttpUrl(value) {
  try {
    const url = new URL(cleanText(value));
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function inferQuality(record, assets) {
  const bodyText = cleanText(record.body_text ?? record.body ?? record.content);
  const noAssets = record.no_assets === true || assets.length === 0;
  const explicit = cleanText(record.body_quality);
  const imageOnly = record.image_only_suspected === true ||
    (!bodyText && assets.some((asset) => asset.kind === "image"));
  const attachmentUnknown = record.attachment_required_unknown === true;
  let bodyQuality;
  if (BODY_QUALITY_VALUES.has(explicit)) {
    bodyQuality = explicit;
  } else if (imageOnly) {
    bodyQuality = "image_only_suspected";
  } else if (attachmentUnknown) {
    bodyQuality = "attachment_required_unknown";
  } else if (!bodyText) {
    bodyQuality = "empty_or_missing_body";
  } else if (bodyText.length < 120) {
    bodyQuality = "short_body_needs_review";
  } else if (noAssets) {
    bodyQuality = "text_sufficient_no_assets";
  } else {
    bodyQuality = "good_text";
  }

  const qualityReasonCodes = [];
  if (noAssets) qualityReasonCodes.push("no_assets");
  if (bodyQuality !== "good_text") qualityReasonCodes.push(bodyQuality);
  if (attachmentUnknown) qualityReasonCodes.push("attachment_required_unknown");
  return {
    body_text: bodyText,
    body_text_length: bodyText.length,
    has_assets: assets.length > 0,
    asset_count: assets.length,
    no_assets: noAssets,
    body_quality: bodyQuality,
    image_only_suspected: imageOnly,
    attachment_required_unknown: attachmentUnknown,
    quality_reason_codes: [...new Set(qualityReasonCodes)],
    quality_review_required: !["good_text", "text_sufficient_no_assets"].includes(bodyQuality),
  };
}

function selectClassification(record, quality) {
  const resolution = cleanText(record.source_resolution_status) || "resolved";
  const sourceResult = cleanText(record.source_result_status) || "success";
  const duplicate = cleanText(record.duplicate_status) || "unique";
  const targetMissing = record.target_status === "missing" ||
    (record.target_required === true && toArray(record.target_summary).length === 0);
  const url = cleanText(record.normalized_url ?? record.original_url ?? record.notice_url);

  if (sourceResult === "failed" || sourceResult === "timeout") return "source_failure";
  if (sourceResult === "zero_match_observed") return "zero_match_observed";
  if (resolution !== "resolved" || !cleanText(record.source_id)) return "blocked_missing_source";
  if (targetMissing) return "blocked_missing_target";
  if (!isValidIsoDate(record.published_at)) return "blocked_invalid_date";
  if (!isValidHttpUrl(url)) return "blocked_invalid_url";
  if (/^duplicate/.test(duplicate) || duplicate === "changed_existing") return "duplicate_review";
  if (quality.body_quality === "image_only_suspected") return "image_only_suspected";
  if (quality.no_assets && quality.quality_review_required) return "no_assets_needs_review";
  if (quality.quality_review_required) return "quality_review";
  if (quality.no_assets) return "no_assets_text_sufficient";
  return "clean";
}

function reviewStatusFor(policy) {
  if (policy.is_blocking) return "blocked";
  return policy.requires_admin_review ? "needs_review" : "clean";
}

function normalizeCandidate(record, options) {
  const assets = normalizeAssets(record);
  const quality = inferQuality(record, assets);
  const classificationStatus = selectClassification(record, quality);
  const policy = CLASSIFICATION_POLICY[classificationStatus];
  const originalUrl = cleanText(record.original_url ?? record.notice_url);
  const normalizedUrl = cleanText(record.normalized_url) || originalUrl;
  const timestamp = cleanText(record.updated_at ?? record.created_at) || options.generatedAt;
  const sourceResolutionStatus = cleanText(record.source_resolution_status) || "resolved";
  const duplicateStatus = cleanText(record.duplicate_status) || "unique";

  return {
    source_id: cleanText(record.source_id) || null,
    source_key_snapshot: cleanText(record.source_key_snapshot ?? record.source_key),
    canonical_key: cleanText(record.canonical_key),
    title: cleanText(record.title),
    original_url: originalUrl,
    normalized_url: normalizedUrl,
    published_at: cleanText(record.published_at) || null,
    ...quality,
    duplicate_status: duplicateStatus,
    classification_status: classificationStatus,
    review_status: reviewStatusFor(policy),
    blocker_status: policy.is_blocking ? classificationStatus : null,
    quality_status: quality.quality_review_required ? quality.body_quality : "accepted",
    status: classificationStatus,
    reason_code: policy.reason_code,
    severity: policy.severity,
    is_auto_apply_allowed: policy.is_auto_apply_allowed,
    requires_admin_review: policy.requires_admin_review,
    is_blocking: policy.is_blocking,
    recommended_action: policy.recommended_action,
    target_summary: toArray(record.target_summary),
    keyword_summary: toArray(record.keyword_summary),
    evidence_json: {
      source_resolution_status: sourceResolutionStatus,
      source_result_status: cleanText(record.source_result_status) || "success",
      assets,
      input_evidence: record.evidence ?? {},
      policy_note: classificationStatus === "zero_match_observed"
        ? "Observed no match is source-run evidence only and is not a source-exhaustion or scholarship-absence proof."
        : null,
    },
    latest_run_id: cleanText(record.latest_run_id) || null,
    latest_batch_label: cleanText(record.latest_batch_label) || null,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

function emptyCounts() {
  return Object.fromEntries([
    ...Object.keys(CLASSIFICATION_POLICY).map((status) => [`${status}_count`, 0]),
    ...[...BODY_QUALITY_VALUES].map((status) => [`body_quality_${status}_count`, 0]),
    ["candidate_count", 0],
    ["blocked_count", 0],
    ["admin_review_required_count", 0],
    ["auto_apply_allowed_count", 0],
    ["no_assets_count", 0],
    ["quality_backlog_count", 0],
  ]);
}

export function buildReviewBacklogQualityFoundation(input, options = {}) {
  const generatedAt = options.generatedAt ?? input.generated_at ?? "1970-01-01T00:00:00.000Z";
  const candidates = Array.isArray(input) ? input : toArray(input.candidates);
  const readModel = candidates.map((record) => normalizeCandidate(record, { generatedAt }));
  const counts = readModel.reduce((acc, row) => {
    acc.candidate_count += 1;
    acc[`${row.classification_status}_count`] += 1;
    acc[`body_quality_${row.body_quality}_count`] += 1;
    if (row.is_blocking) acc.blocked_count += 1;
    if (row.requires_admin_review) acc.admin_review_required_count += 1;
    if (row.is_auto_apply_allowed) acc.auto_apply_allowed_count += 1;
    if (row.no_assets) acc.no_assets_count += 1;
    if (["quality_review", "no_assets_needs_review", "image_only_suspected"].includes(row.classification_status)) {
      acc.quality_backlog_count += 1;
    }
    return acc;
  }, emptyCounts());

  return {
    generated_at: generatedAt,
    contract_version: "post-phase-bc-review-quality-foundation/v1",
    read_only: true,
    db_access: false,
    db_write: false,
    migration: false,
    crawler_execution: false,
    destructive_action: false,
    fixture_name: cleanText(input.fixture_name) || null,
    counts,
    review_backlog: readModel,
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) args[key] = true;
    else {
      args[key] = value;
      index += 1;
    }
  }
  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
}

function writeJson(filePath, value) {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input || !args.output) {
    throw new Error("Usage: node scripts/build-review-backlog-quality-foundation.mjs --input <fixture.json> --output <report.json>");
  }
  const input = readJson(args.input);
  const report = buildReviewBacklogQualityFoundation(input);
  writeJson(args.output, report);
  console.log(`review_backlog=${path.resolve(args.output)}`);
  console.log(`candidate_count=${report.counts.candidate_count}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
