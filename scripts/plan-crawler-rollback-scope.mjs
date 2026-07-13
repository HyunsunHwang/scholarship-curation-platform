import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildSourceIdentityIndex,
  resolveSourceKey,
} from "./resolve-crawler-source-identities.mjs";

const __filename = fileURLToPath(import.meta.url);

const DEFAULT_INPUT = "fixtures/post-phase-d/clean-single-run.json";
const DEFAULT_SOURCES = "data/notice-sources.csv";
const DEFAULT_MAPPING_SNAPSHOT =
  "fixtures/integration-foundation/source-identity-mapping-snapshot.json";
const DEFAULT_OUTPUT = "reports/post-phase-d-rollback-scope-plan.json";

const ENTITY_MODEL = [
  {
    entity: "source",
    conceptual_entity: "source",
    current_personal_dev_table: "crawler_notice_sources",
    current_upstream_equivalent: "notice_sources",
    integration_status: "existing upstream canonical source row; not a cleanup target",
    record_kind: "sources",
    cleanup_default: false,
  },
  {
    entity: "notice",
    conceptual_entity: "canonical notice",
    current_personal_dev_table: "crawler_notices",
    current_upstream_equivalent: "crawled_notices/read-model compatibility",
    integration_status: "graph-backed canonical proposal; current upstream equivalent is transitional",
    record_kind: "notices",
    cleanup_default: true,
  },
  {
    entity: "occurrence",
    conceptual_entity: "source notice occurrence",
    current_personal_dev_table: "crawler_notice_occurrences",
    current_upstream_equivalent: "none yet",
    integration_status: "normalized graph concept only",
    record_kind: "occurrences",
    cleanup_default: true,
  },
  {
    entity: "url_alias",
    conceptual_entity: "URL alias",
    current_personal_dev_table: "crawler_notice_url_aliases",
    current_upstream_equivalent: "notice_url/normalized_url fields",
    integration_status: "normalized graph concept only",
    record_kind: "url_aliases",
    cleanup_default: true,
  },
  {
    entity: "asset",
    conceptual_entity: "notice asset",
    current_personal_dev_table: "crawler_notice_assets",
    current_upstream_equivalent: "crawled_notices.image_urls",
    integration_status: "adapter-derived compatibility field",
    record_kind: "assets",
    cleanup_default: true,
  },
  {
    entity: "target",
    conceptual_entity: "target relation",
    current_personal_dev_table: "crawler_notice_targets",
    current_upstream_equivalent: "scholarship target fields/manual review",
    integration_status: "normalized graph concept only",
    record_kind: "targets",
    cleanup_default: true,
  },
  {
    entity: "keyword_match",
    conceptual_entity: "keyword match relation",
    current_personal_dev_table: "crawler_notice_keyword_matches",
    current_upstream_equivalent: "review evidence only",
    integration_status: "normalized graph concept only",
    record_kind: "keyword_matches",
    cleanup_default: true,
  },
  {
    entity: "crawler_run",
    conceptual_entity: "crawler run",
    current_personal_dev_table: "crawler_runs",
    current_upstream_equivalent: "none yet",
    integration_status: "audit metadata only",
    record_kind: "runs",
    cleanup_default: false,
  },
  {
    entity: "source_result",
    conceptual_entity: "source result",
    current_personal_dev_table: "crawler_source_results",
    current_upstream_equivalent: "none yet",
    integration_status: "audit metadata only",
    record_kind: "source_results",
    cleanup_default: false,
  },
  {
    entity: "error_audit_record",
    conceptual_entity: "error/audit record",
    current_personal_dev_table: "crawler_audit_events",
    current_upstream_equivalent: "none yet",
    integration_status: "audit metadata only",
    record_kind: "audit_records",
    cleanup_default: false,
  },
];
const CLEANUP_TARGET_ENTITIES = new Set(
  ENTITY_MODEL.filter((model) => model.cleanup_default).map((model) => model.entity),
);

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

function repoRelativePath(filePath) {
  return path.relative(process.cwd(), path.resolve(filePath)).split(path.sep).join("/");
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(values.map(cleanText).filter(Boolean))].sort();
}

function normalizeRecord(record, fallbackKind = "unknown") {
  return {
    ...record,
    id: cleanText(record.id ?? record.record_id ?? record.notice_id ?? record.occurrence_id),
    entity: cleanText(record.entity ?? record.kind ?? fallbackKind),
    run_id: cleanText(record.run_id),
    batch_id: cleanText(record.batch_id),
    source_id: cleanText(record.source_id),
    source_key: cleanText(record.source_key),
    canonical_key: cleanText(record.canonical_key),
    notice_id: cleanText(record.notice_id),
    occurrence_id: cleanText(record.occurrence_id),
    url_alias_id: cleanText(record.url_alias_id),
    asset_id: cleanText(record.asset_id),
    target_id: cleanText(record.target_id),
    keyword_match_id: cleanText(record.keyword_match_id),
    created_at: cleanText(record.created_at),
    updated_at: cleanText(record.updated_at),
    pre_existing: record.pre_existing === true,
    created_by_apply: record.created_by_apply === true,
    shared_with_out_of_scope: record.shared_with_out_of_scope === true,
  };
}

function recordsFromGraph(graphRecords) {
  const out = [];
  if (!graphRecords || typeof graphRecords !== "object") return out;
  for (const model of ENTITY_MODEL) {
    for (const record of toArray(graphRecords[model.record_kind])) {
      out.push(normalizeRecord(record, model.entity));
    }
  }
  return out;
}

function recordsFromApplied(appliedRecords) {
  return toArray(appliedRecords).map((record) => normalizeRecord(record));
}

function selectorValues(input, appliedRecords, graphRecords) {
  return {
    rehearsal_label: cleanText(input.rehearsal_label),
    batch_id: cleanText(input.batch_id),
    run_ids: unique([
      ...toArray(input.run_ids),
      ...appliedRecords.map((row) => row.run_id),
      ...graphRecords.map((row) => row.run_id),
    ]),
    source_ids: unique([
      ...toArray(input.source_ids),
      ...appliedRecords.map((row) => row.source_id),
      ...graphRecords.map((row) => row.source_id),
    ]),
    source_keys: unique([
      ...toArray(input.source_keys),
      ...appliedRecords.map((row) => row.source_key),
      ...graphRecords.map((row) => row.source_key),
    ]),
    canonical_keys: unique([
      ...toArray(input.canonical_keys),
      ...appliedRecords.map((row) => row.canonical_key),
      ...graphRecords.map((row) => row.canonical_key),
    ]),
  };
}

function hasAnyRollbackIdentifier(selectors) {
  return Boolean(
    selectors.rehearsal_label ||
      selectors.batch_id ||
      selectors.run_ids.length ||
      selectors.source_ids.length ||
      selectors.source_keys.length ||
      selectors.canonical_keys.length,
  );
}

function buildIdentifierAssessment(selectors, sourceResolutions) {
  return [
    {
      identifier: "rehearsal_label",
      value_count: selectors.rehearsal_label ? 1 : 0,
      cleanup_scope_role: selectors.rehearsal_label ? "primary_selector" : "missing",
      standalone_use_risk: "medium",
      shared_record_possible: false,
      evidence_state: "documented_fixture_evidence",
      personal_dev_verified: false,
      upstream_status: "not in upstream schema",
    },
    {
      identifier: "batch_id",
      value_count: selectors.batch_id ? 1 : 0,
      cleanup_scope_role: selectors.batch_id ? "primary_selector" : "missing",
      standalone_use_risk: "medium",
      shared_record_possible: true,
      evidence_state: "immutable when emitted by apply result",
      personal_dev_verified: false,
      upstream_status: "not in upstream schema",
    },
    {
      identifier: "run_id",
      value_count: selectors.run_ids.length,
      cleanup_scope_role: selectors.run_ids.length ? "primary_selector" : "missing",
      standalone_use_risk: selectors.run_ids.length === 1 ? "medium" : "high_if_multiple",
      shared_record_possible: true,
      evidence_state: "immutable crawler/apply evidence",
      personal_dev_verified: false,
      upstream_status: "not in upstream schema",
    },
    {
      identifier: "source_id",
      value_count: selectors.source_ids.length,
      cleanup_scope_role: selectors.source_ids.length ? "secondary_evidence" : "missing",
      standalone_use_risk: "high",
      shared_record_possible: true,
      evidence_state: "upstream canonical source identifier",
      personal_dev_verified: false,
      upstream_status: "notice_sources.source_id exists",
    },
    {
      identifier: "source_key",
      value_count: selectors.source_keys.length,
      cleanup_scope_role: selectors.source_keys.length ? "secondary_evidence" : "missing",
      standalone_use_risk: "high_without_source_id_resolution",
      shared_record_possible: true,
      evidence_state: "crawler-facing natural/idempotency key",
      personal_dev_verified: false,
      upstream_status: "adapter contract only",
      source_resolution_statuses: sourceResolutions.map((row) => row.resolution_status),
    },
    {
      identifier: "canonical_key",
      value_count: selectors.canonical_keys.length,
      cleanup_scope_role: selectors.canonical_keys.length ? "secondary_evidence" : "missing",
      standalone_use_risk: "high",
      shared_record_possible: true,
      evidence_state: "immutable normalized notice identity when produced by crawler",
      personal_dev_verified: false,
      upstream_status: "not in upstream schema",
    },
    {
      identifier: "notice/occurrence/url_alias/asset/target/keyword ids",
      value_count: 0,
      cleanup_scope_role: "secondary_evidence_only",
      standalone_use_risk: "high",
      shared_record_possible: true,
      evidence_state: "fixture/apply evidence only",
      personal_dev_verified: false,
      upstream_status: "normalized graph proposal",
    },
    {
      identifier: "created_at/updated_at",
      value_count: 0,
      cleanup_scope_role: "secondary_evidence_only",
      standalone_use_risk: "high_mutable_or_non_unique",
      shared_record_possible: true,
      evidence_state: "mutable state; never a primary selector alone",
      personal_dev_verified: false,
      upstream_status: "exists on several upstream tables but not rollback ownership evidence",
    },
  ];
}

function matchesScope(record, selectors) {
  if (selectors.batch_id && record.batch_id === selectors.batch_id) return true;
  if (selectors.run_ids.includes(record.run_id)) return true;
  if (selectors.source_ids.includes(record.source_id)) return true;
  if (selectors.source_keys.includes(record.source_key)) return true;
  if (selectors.canonical_keys.includes(record.canonical_key)) return true;
  return false;
}

function collectScopedRecords(records, selectors) {
  return records.filter((record) => matchesScope(record, selectors));
}

function buildTableImpacts(scopedRecords) {
  return ENTITY_MODEL.map((model) => {
    const rows = scopedRecords.filter((row) => row.entity === model.entity);
    const preExisting = rows.filter((row) => row.pre_existing).length;
    const newlyCreated = rows.filter((row) => row.created_by_apply).length;
    const unknownOwnership = rows.length - preExisting - newlyCreated;
    return {
      entity: model.entity,
      conceptual_entity: model.conceptual_entity,
      current_personal_dev_table: model.current_personal_dev_table,
      current_upstream_equivalent: model.current_upstream_equivalent,
      integration_status: model.integration_status,
      estimated_affected_row_count: rows.length,
      estimated_newly_created_count: newlyCreated,
      estimated_pre_existing_count: preExisting,
      estimated_unknown_ownership_count: unknownOwnership,
      default_cleanup_target: model.cleanup_default,
      cleanup_plan_status: model.cleanup_default ? "dry_run_only" : "not_cleanup_target",
    };
  });
}

function detectSharedRecordRisks(scopedRecords) {
  return scopedRecords
    .filter((row) => row.shared_with_out_of_scope || toArray(row.out_of_scope_refs).length > 0)
    .map((row) => ({
      entity: row.entity,
      id: row.id || row.canonical_key || row.notice_id || row.asset_id || row.url_alias_id,
      canonical_key: row.canonical_key || null,
      reason: cleanText(row.shared_reason) || "record may be referenced outside rollback scope",
      out_of_scope_refs: toArray(row.out_of_scope_refs),
      classification: "blocked",
    }));
}

function detectOrphanRisks(scopedRecords) {
  const noticeIds = new Set(scopedRecords.filter((row) => row.entity === "notice").map((row) => row.notice_id || row.id));
  const occurrenceIds = new Set(
    scopedRecords.filter((row) => row.entity === "occurrence").map((row) => row.occurrence_id || row.id),
  );
  const risks = [];
  for (const row of scopedRecords) {
    if (row.entity === "occurrence" && row.notice_id && !noticeIds.has(row.notice_id)) {
      risks.push({
        entity: "occurrence",
        id: row.occurrence_id || row.id,
        reason: "occurrence exists but owner notice is outside scoped evidence",
        classification: "blocked",
      });
    }
    if (
      ["url_alias", "asset", "target", "keyword_match"].includes(row.entity) &&
      row.notice_id &&
      !noticeIds.has(row.notice_id)
    ) {
      risks.push({
        entity: row.entity,
        id: row.id || row.url_alias_id || row.asset_id || row.target_id || row.keyword_match_id,
        reason: `${row.entity} exists but owner notice is outside scoped evidence`,
        classification: "blocked",
      });
    }
    if (row.entity === "asset" && row.occurrence_id && !occurrenceIds.has(row.occurrence_id)) {
      risks.push({
        entity: "asset",
        id: row.asset_id || row.id,
        reason: "asset relation exists but occurrence evidence is missing",
        classification: "blocked",
      });
    }
  }
  return risks;
}

function detectPartialWrites(scopedRecords) {
  const byCanonical = new Map();
  for (const row of scopedRecords) {
    if (!row.canonical_key) continue;
    const bucket = byCanonical.get(row.canonical_key) ?? [];
    bucket.push(row);
    byCanonical.set(row.canonical_key, bucket);
  }

  const findings = [];
  for (const [canonicalKey, rows] of byCanonical.entries()) {
    const entities = new Set(rows.map((row) => row.entity));
    const hasNotice = entities.has("notice");
    const hasOccurrence = entities.has("occurrence");
    const sourceResults = rows.filter((row) => row.entity === "source_result");
    const created = rows.some((row) => row.created_by_apply);
    const preExisting = rows.some((row) => row.pre_existing);

    if (hasNotice && !hasOccurrence) {
      findings.push({
        canonical_key: canonicalKey,
        pattern: "notice_without_occurrence",
        classification: "blocked",
      });
    }
    if (hasOccurrence && !hasNotice) {
      findings.push({
        canonical_key: canonicalKey,
        pattern: "occurrence_without_notice",
        classification: "blocked",
      });
    }
    for (const result of sourceResults) {
      if (
        cleanText(result.status) === "success" &&
        Number(result.expected_child_records ?? 0) > Number(result.actual_child_records ?? 0)
      ) {
        findings.push({
          canonical_key: canonicalKey,
          pattern: "source_result_success_but_expected_children_missing",
          classification: "blocked",
        });
      }
    }
    if (created && preExisting) {
      findings.push({
        canonical_key: canonicalKey,
        pattern: "pre_existing_and_new_records_mixed",
        classification: "blocked",
      });
    }
  }
  return findings;
}

function findUnknownEntities(records) {
  const known = new Set(ENTITY_MODEL.map((model) => model.entity));
  return unique(records.map((row) => (known.has(row.entity) ? "" : row.entity)));
}

function sourceResolutionFindings(selectors, sourceIndex) {
  return selectors.source_keys.map((sourceKey) => resolveSourceKey(sourceKey, sourceIndex));
}

function buildBlockedReasons({
  input,
  selectors,
  scopedRecords,
  allRecords,
  sourceResolutions,
  sharedRecordRisks,
  orphanRisks,
  partialWriteFindings,
  unknownEntities,
}) {
  const reasons = [];
  if (!hasAnyRollbackIdentifier(selectors)) {
    reasons.push("rollback_identifier_missing");
  }
  if (scopedRecords.length === 0) {
    reasons.push("zero_affected_rows_requires_review");
  }
  if (selectors.run_ids.length > 1 && !selectors.batch_id) {
    reasons.push("ambiguous_multiple_run_ids_without_batch_selector");
  }
  if (input.ambiguous_identifier === true) {
    reasons.push("ambiguous_identifier_requires_manual_disambiguation");
  }
  if (sourceResolutions.some((row) => row.resolution_status !== "resolved")) {
    reasons.push("source_resolution_failed_or_ambiguous");
  }
  if (sharedRecordRisks.length) reasons.push("shared_reference_exists");
  if (orphanRisks.length) reasons.push("orphan_risk_exists");
  if (partialWriteFindings.length) reasons.push("partial_write_state_unclassified_for_execution");
  if (unknownEntities.length) reasons.push("unknown_entity_or_table_found");
  if (
    allRecords.some((row) =>
      row.pre_existing &&
      CLEANUP_TARGET_ENTITIES.has(row.entity) &&
      matchesScope(row, selectors),
    )
  ) {
    reasons.push("pre_existing_and_new_ownership_must_be_separated");
  }
  return unique(reasons);
}

function buildManualReview({ blockedReasons, sharedRecordRisks, orphanRisks, partialWriteFindings }) {
  const out = [];
  if (blockedReasons.includes("zero_affected_rows_requires_review")) {
    out.push("zero affected row dry-run is no-op/review, not cleanup success");
  }
  if (sharedRecordRisks.length) out.push("shared record references require human ownership review");
  if (orphanRisks.length) out.push("orphan risk requires table-by-table evidence review");
  if (partialWriteFindings.length) out.push("partial write finding requires apply/audit reconciliation");
  if (blockedReasons.includes("source_resolution_failed_or_ambiguous")) {
    out.push("source identity must resolve exactly before cleanup planning can proceed");
  }
  if (blockedReasons.includes("pre_existing_and_new_ownership_must_be_separated")) {
    out.push("pre-existing rows must be separated from newly-created rows before any destructive phase");
  }
  return unique(out);
}

export function planCrawlerRollbackScope(input, options = {}) {
  const generatedAt = options.generatedAt ?? input.generated_at ?? new Date().toISOString();
  const appliedRecords = recordsFromApplied(input.applied_records);
  const graphRecords = recordsFromGraph(input.graph_records);
  const allRecords = [...appliedRecords, ...graphRecords];
  const selectors = selectorValues(input, appliedRecords, graphRecords);
  const scopedRecords = collectScopedRecords(allRecords, selectors);
  const sourceIndex = buildSourceIdentityIndex({
    sourceCsvPath: options.sourceCsvPath ?? DEFAULT_SOURCES,
    mappingSnapshotPath: options.mappingSnapshotPath ?? DEFAULT_MAPPING_SNAPSHOT,
  });
  const sourceResolutions = sourceResolutionFindings(selectors, sourceIndex);
  const sharedRecordRisks = detectSharedRecordRisks(scopedRecords);
  const orphanRisks = detectOrphanRisks(scopedRecords);
  const partialWriteFindings = detectPartialWrites(scopedRecords);
  const unknownEntities = findUnknownEntities(allRecords);
  const tableImpacts = buildTableImpacts(scopedRecords);
  const blockedReasons = buildBlockedReasons({
    input,
    selectors,
    scopedRecords,
    allRecords,
    sourceResolutions,
    sharedRecordRisks,
    orphanRisks,
    partialWriteFindings,
    unknownEntities,
  });
  const manualReviewRequired = buildManualReview({
    blockedReasons,
    sharedRecordRisks,
    orphanRisks,
    partialWriteFindings,
  });
  const estimatedAffectedRowCount = tableImpacts.reduce(
    (sum, row) => sum + row.estimated_affected_row_count,
    0,
  );

  return {
    generated_at: generatedAt,
    read_only: true,
    db_access: false,
    db_write: false,
    cleanup_execution: false,
    sql_generation: false,
    input: {
      fixture_name: cleanText(input.fixture_name) || null,
      input_path: options.inputPath ? repoRelativePath(options.inputPath) : null,
    },
    scope: {
      rehearsal_label: selectors.rehearsal_label || null,
      batch_id: selectors.batch_id || null,
      run_ids: selectors.run_ids,
      source_ids: selectors.source_ids,
      source_keys: selectors.source_keys,
      canonical_keys: selectors.canonical_keys,
      scoped_record_count: scopedRecords.length,
      primary_selectors: [
        selectors.rehearsal_label ? "rehearsal_label" : null,
        selectors.batch_id ? "batch_id" : null,
        selectors.run_ids.length ? "run_id" : null,
      ].filter(Boolean),
      secondary_evidence: [
        selectors.source_ids.length ? "source_id" : null,
        selectors.source_keys.length ? "source_key" : null,
        selectors.canonical_keys.length ? "canonical_key" : null,
      ].filter(Boolean),
    },
    identifier_assessment: buildIdentifierAssessment(selectors, sourceResolutions),
    source_resolution: {
      policy: sourceIndex.mapping_policy,
      resolutions: sourceResolutions,
    },
    table_impacts: tableImpacts,
    shared_record_risks: sharedRecordRisks,
    orphan_risks: orphanRisks,
    partial_write_findings: partialWriteFindings,
    unknown_entities: unknownEntities,
    blocked_reasons: blockedReasons,
    manual_review_required: manualReviewRequired,
    safe_to_generate_execution_plan: false,
    safety_note:
      "This is a read-only cleanup scope dry-run. It is not approval to generate or execute destructive cleanup SQL.",
    metrics: {
      input_record_count: allRecords.length,
      scoped_run_count: selectors.run_ids.length,
      scoped_source_count: unique([...selectors.source_ids, ...selectors.source_keys]).length,
      scoped_canonical_key_count: selectors.canonical_keys.length,
      table_entity_count: ENTITY_MODEL.length,
      estimated_affected_row_count: estimatedAffectedRowCount,
      shared_record_risk_count: sharedRecordRisks.length,
      orphan_risk_count: orphanRisks.length,
      partial_write_finding_count: partialWriteFindings.length,
      blocked_reason_count: blockedReasons.length,
      manual_review_required_count: manualReviewRequired.length,
      missing_identifier_count: hasAnyRollbackIdentifier(selectors) ? 0 : 1,
      ambiguous_identifier_count: blockedReasons.includes(
        "ambiguous_multiple_run_ids_without_batch_selector",
      ) || blockedReasons.includes("ambiguous_identifier_requires_manual_disambiguation")
        ? 1
        : 0,
      db_access: false,
      db_write: false,
      cleanup_execution: false,
    },
    limitations: [
      "all counts are fixture/evidence-based estimates, not live DB row counts",
      "no DB state was read, inferred, or mutated",
      "source identity uses exact source_key to notice_sources.source_id resolution only",
      "source rows are audit/context records and are not default cleanup targets",
      "safe_to_generate_execution_plan=false in this phase by design",
    ],
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = args.input ?? DEFAULT_INPUT;
  const outputPath = args.output ?? DEFAULT_OUTPUT;
  const input = readJson(inputPath);
  const report = planCrawlerRollbackScope(input, {
    inputPath,
    sourceCsvPath: args.sources ?? DEFAULT_SOURCES,
    mappingSnapshotPath: args["mapping-snapshot"] ?? DEFAULT_MAPPING_SNAPSHOT,
  });
  writeJson(outputPath, report);
  console.log(`rollback_scope_plan=${path.resolve(outputPath)}`);
  console.log(`estimated_affected_row_count=${report.metrics.estimated_affected_row_count}`);
  console.log(`blocked_reason_count=${report.metrics.blocked_reason_count}`);
  console.log(`manual_review_required_count=${report.metrics.manual_review_required_count}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
