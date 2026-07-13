import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSourceIdentityIndex,
  resolveSourceKey,
} from "./resolve-crawler-source-identities.mjs";
import {
  buildReviewBacklogQualityFoundation,
} from "./build-review-backlog-quality-foundation.mjs";

const __filename = fileURLToPath(import.meta.url);
const DEFAULT_SOURCES = "data/notice-sources.csv";
const DEFAULT_MAPPING_SNAPSHOT =
  "fixtures/integration-foundation/source-identity-mapping-snapshot.json";

const RESOLUTION_POLICIES = {
  resolved: {
    reason: "exact_source_key_mapping_resolved",
    normal_candidate: true,
    blocking: false,
  },
  unresolved: {
    reason: "no_exact_source_key_mapping",
    normal_candidate: false,
    blocking: true,
  },
  ambiguous: {
    reason: "multiple_source_id_candidates",
    normal_candidate: false,
    blocking: true,
  },
  missing_source_key: {
    reason: "source_key_missing",
    normal_candidate: false,
    blocking: true,
  },
  inactive_source: {
    reason: "source_marked_inactive",
    normal_candidate: false,
    blocking: true,
  },
  source_key_alias_required: {
    reason: "explicit_alias_mapping_required",
    normal_candidate: false,
    blocking: true,
  },
};

const REQUIRED_FIELDS = [
  "source_id",
  "source_key_snapshot",
  "source_resolution_status",
  "source_resolution_reason",
  "canonical_key",
  "title",
  "original_url",
  "normalized_url",
  "published_at",
  "body_text",
  "body_text_length",
  "has_assets",
  "asset_count",
  "no_assets",
  "body_quality",
  "image_only_suspected",
  "review_status",
  "quality_status",
  "blocker_status",
  "duplicate_status",
  "auto_apply_allowed",
  "admin_review_required",
  "recommended_action",
  "target_summary",
  "keyword_summary",
  "latest_run_id",
  "latest_batch_label",
  "batch_observability_status",
  "source_result_status",
  "zero_match_observed",
  "observability_issue_count",
  "rollback_scope_available",
  "occurrence_summary",
  "evidence_json",
  "created_at",
  "updated_at",
];

function cleanText(value) {
  return String(value ?? "").trim();
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeResolution(record, sourceIndex) {
  const sourceKey = cleanText(record.source_key ?? record.source_key_snapshot);
  if (!sourceKey) {
    return {
      source_id: null,
      source_key: sourceKey,
      source_resolution_status: "missing_source_key",
      source_resolution_reason: RESOLUTION_POLICIES.missing_source_key.reason,
      evidence: { reason: "source_key is empty" },
    };
  }

  const resolution = resolveSourceKey(sourceKey, sourceIndex);
  if (resolution.resolution_status === "ambiguous") {
    return {
      source_id: null,
      source_key: sourceKey,
      source_resolution_status: "ambiguous",
      source_resolution_reason: RESOLUTION_POLICIES.ambiguous.reason,
      evidence: resolution.resolution_evidence,
    };
  }
  if (resolution.resolution_status !== "resolved") {
    const status = record.source_key_alias_required === true
      ? "source_key_alias_required"
      : "unresolved";
    return {
      source_id: null,
      source_key: sourceKey,
      source_resolution_status: status,
      source_resolution_reason: RESOLUTION_POLICIES[status].reason,
      evidence: resolution.resolution_evidence,
    };
  }
  if (record.source_active === false) {
    return {
      source_id: resolution.source_id,
      source_key: sourceKey,
      source_resolution_status: "inactive_source",
      source_resolution_reason: RESOLUTION_POLICIES.inactive_source.reason,
      evidence: resolution.resolution_evidence,
    };
  }
  return {
    source_id: resolution.source_id,
    source_key: sourceKey,
    source_resolution_status: "resolved",
    source_resolution_reason: RESOLUTION_POLICIES.resolved.reason,
    evidence: resolution.resolution_evidence,
  };
}

function normalizeObservability(record) {
  const observability = record.observability ?? {};
  const batchStatus = cleanText(observability.batch_observability_status ?? observability.batch_status) || "healthy";
  const sourceResultStatus = cleanText(
    observability.source_result_status ?? record.source_result_status,
  ) || "success";
  return {
    latest_batch_label: cleanText(observability.latest_batch_label ?? record.latest_batch_label) || null,
    latest_run_id: cleanText(observability.latest_run_id ?? record.latest_run_id) || null,
    batch_observability_status: batchStatus,
    source_result_status: sourceResultStatus,
    zero_match_observed: sourceResultStatus === "zero_match_observed",
    observability_issue_count: Math.max(0, Number(observability.issue_count ?? 0) || 0),
    rollback_scope_available: observability.rollback_scope_available === true,
  };
}

function enrichWithAdapterPolicy(row, resolution, observability) {
  const resolutionPolicy = RESOLUTION_POLICIES[resolution.source_resolution_status];
  const batchBlocked = observability.batch_observability_status === "blocked";
  const batchWarning = ["incomplete", "degraded"].includes(observability.batch_observability_status);
  const sourceBlocked = resolutionPolicy.blocking;
  const blocking = row.is_blocking || sourceBlocked || batchBlocked;
  const requiresReview = row.requires_admin_review || sourceBlocked || batchBlocked || batchWarning;
  const autoApplyAllowed = row.is_auto_apply_allowed && !sourceBlocked && !batchBlocked && !batchWarning;
  const blockerStatus = sourceBlocked
    ? `source_resolution_${resolution.source_resolution_status}`
    : batchBlocked
      ? "batch_observability_blocked"
      : row.blocker_status;
  const recommendedAction = sourceBlocked
    ? "resolve_source_identity_before_review"
    : batchBlocked
      ? "review_blocked_batch_observability"
      : batchWarning && row.is_auto_apply_allowed
        ? "review_incomplete_batch_evidence"
        : row.recommended_action;
  const adapterWarnings = [];
  if (batchWarning) adapterWarnings.push(`batch_${observability.batch_observability_status}`);
  if (observability.zero_match_observed) adapterWarnings.push("zero_match_observed_not_absence_proof");

  return {
    source_id: resolution.source_id,
    source_key_snapshot: resolution.source_key,
    source_resolution_status: resolution.source_resolution_status,
    source_resolution_reason: resolution.source_resolution_reason,
    canonical_key: row.canonical_key,
    title: row.title,
    original_url: row.original_url,
    normalized_url: row.normalized_url,
    published_at: row.published_at,
    body_text: row.body_text,
    body_text_length: row.body_text_length,
    has_assets: row.has_assets,
    asset_count: row.asset_count,
    no_assets: row.no_assets,
    body_quality: row.body_quality,
    image_only_suspected: row.image_only_suspected,
    review_status: blocking ? "blocked" : requiresReview ? "needs_review" : "clean",
    quality_status: row.quality_status,
    blocker_status: blockerStatus,
    duplicate_status: row.duplicate_status,
    auto_apply_allowed: autoApplyAllowed,
    admin_review_required: requiresReview,
    recommended_action: recommendedAction,
    target_summary: row.target_summary,
    keyword_summary: row.keyword_summary,
    latest_run_id: observability.latest_run_id,
    latest_batch_label: observability.latest_batch_label,
    batch_observability_status: observability.batch_observability_status,
    source_result_status: observability.source_result_status,
    zero_match_observed: observability.zero_match_observed,
    observability_issue_count: observability.observability_issue_count,
    rollback_scope_available: observability.rollback_scope_available,
    occurrence_summary: {
      occurrence_count: Number(row.occurrence_count ?? 1),
      classification_status: row.classification_status,
    },
    evidence_json: {
      source_resolution: {
        source_key: resolution.source_key,
        source_id: resolution.source_id,
        status: resolution.source_resolution_status,
        reason: resolution.source_resolution_reason,
        evidence: resolution.evidence,
      },
      quality_policy: row.evidence_json,
      observability: {
        ...observability,
        zero_match_interpretation: observability.zero_match_observed
          ? "Observed no match only; not a source-exhaustion or scholarship-absence proof."
          : null,
      },
      adapter_warning_codes: adapterWarnings,
    },
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function emptyCounts() {
  return {
    candidate_count: 0,
    resolved_source_count: 0,
    unresolved_source_count: 0,
    ambiguous_source_count: 0,
    missing_source_key_count: 0,
    inactive_source_count: 0,
    source_key_alias_required_count: 0,
    clean_count: 0,
    duplicate_review_count: 0,
    quality_review_count: 0,
    blocked_count: 0,
    no_assets_count: 0,
    image_only_suspected_count: 0,
    zero_match_observed_count: 0,
    admin_review_required_count: 0,
    auto_apply_allowed_count: 0,
    batch_warning_count: 0,
    rollback_scope_available_count: 0,
  };
}

function resolutionCountKey(status) {
  return {
    resolved: "resolved_source_count",
    unresolved: "unresolved_source_count",
    ambiguous: "ambiguous_source_count",
    missing_source_key: "missing_source_key_count",
    inactive_source: "inactive_source_count",
    source_key_alias_required: "source_key_alias_required_count",
  }[status];
}

export function buildAdapterBackedReviewReadModel(input, options = {}) {
  const generatedAt = options.generatedAt ?? input.generated_at ?? "1970-01-01T00:00:00.000Z";
  const sourceIndex = buildSourceIdentityIndex({
    sourceCsvPath: options.sourceCsvPath ?? DEFAULT_SOURCES,
    mappingSnapshotPath: options.mappingSnapshotPath ?? DEFAULT_MAPPING_SNAPSHOT,
  });
  const candidates = toArray(input.candidates);
  const adapterRows = candidates.map((candidate) => {
    const resolution = normalizeResolution(candidate, sourceIndex);
    const observability = normalizeObservability(candidate);
    const qualityInput = {
      ...candidate,
      source_id: resolution.source_id,
      source_key: resolution.source_key,
      source_resolution_status: resolution.source_resolution_status === "resolved" ? "resolved" : "missing",
      source_result_status: observability.source_result_status,
      latest_run_id: observability.latest_run_id,
      latest_batch_label: observability.latest_batch_label,
      generated_at: generatedAt,
    };
    const qualityRow = buildReviewBacklogQualityFoundation({
      generated_at: generatedAt,
      candidates: [qualityInput],
    }, { generatedAt }).review_backlog[0];
    return enrichWithAdapterPolicy(qualityRow, resolution, observability);
  });

  const counts = adapterRows.reduce((acc, row) => {
    acc.candidate_count += 1;
    acc[resolutionCountKey(row.source_resolution_status)] += 1;
    if (row.review_status === "clean") acc.clean_count += 1;
    if (row.duplicate_status !== "unique") acc.duplicate_review_count += 1;
    if (["short_body_needs_review", "empty_or_missing_body", "attachment_required_unknown"].includes(row.body_quality)) {
      acc.quality_review_count += 1;
    }
    if (row.review_status === "blocked") acc.blocked_count += 1;
    if (row.no_assets) acc.no_assets_count += 1;
    if (row.image_only_suspected) acc.image_only_suspected_count += 1;
    if (row.zero_match_observed) acc.zero_match_observed_count += 1;
    if (row.admin_review_required) acc.admin_review_required_count += 1;
    if (row.auto_apply_allowed) acc.auto_apply_allowed_count += 1;
    if (["incomplete", "degraded", "blocked"].includes(row.batch_observability_status)) {
      acc.batch_warning_count += 1;
    }
    if (row.rollback_scope_available) acc.rollback_scope_available_count += 1;
    return acc;
  }, emptyCounts());

  return {
    generated_at: generatedAt,
    contract_version: "post-phase-f0-adapter-foundation/v1",
    read_only: true,
    db_access: false,
    db_write: false,
    migration: false,
    crawler_execution: false,
    destructive_action: false,
    fixture_name: cleanText(input.fixture_name) || null,
    source_identity_policy: {
      canonical_db_identifier: "notice_sources.source_id",
      crawler_facing_key: "source_key",
      exact_resolution_only: true,
      no_fuzzy_matching: true,
      no_automatic_source_creation: true,
      resolved_only_normal_candidates: true,
      fail_closed_statuses: Object.keys(RESOLUTION_POLICIES).filter((status) => status !== "resolved"),
    },
    counts,
    review_read_model: adapterRows,
    required_output_fields: REQUIRED_FIELDS,
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
    throw new Error("Usage: node scripts/build-adapter-backed-review-read-model.mjs --input <fixture.json> --output <report.json>");
  }
  const input = readJson(args.input);
  const report = buildAdapterBackedReviewReadModel(input, {
    sourceCsvPath: args.sources ?? DEFAULT_SOURCES,
    mappingSnapshotPath: args["mapping-snapshot"] ?? DEFAULT_MAPPING_SNAPSHOT,
  });
  writeJson(args.output, report);
  console.log(`adapter_read_model=${path.resolve(args.output)}`);
  console.log(`candidate_count=${report.counts.candidate_count}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
