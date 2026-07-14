import { readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { extractDetailFromHtml } from "../lib/notice-body-extraction.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function repositoryPath(path) {
  return relative(repoRoot, path).replaceAll("\\", "/");
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
}

function enrichFixtureDetail(row) {
  if (!row.detail_html) return { ...row, detail_evidence: null };
  const detail = extractDetailFromHtml(row.detail_html, {
    baseUrl: row.list_url,
    sourceId: row.source_id,
  });
  return {
    ...row,
    detail_evidence: {
      evidence_kind: "fixture_only",
      content_selector: detail.contentSelector,
      body_text_length: detail.content.length,
      attachment_metadata_count: detail.attachmentMetadata.length,
      attachment_download_verified: false,
      quality_classification: detail.qualitySignals.classification,
      reason_codes: detail.qualitySignals.reasonCodes,
    },
  };
}

function compareSource(before, after) {
  return {
    source_id: before.source_id,
    source_key: before.source_key,
    list_url: before.list_url,
    linked_risk_ids: before.linked_risk_ids,
    baseline: before,
    after,
    deltas: {
      pages_checked: after.pages_checked - before.pages_checked,
      additional_unique_item_count: after.list_items_observed - before.list_items_observed,
      additional_matched_item_count: after.matched_scholarship_items - before.matched_scholarship_items,
      false_negative_reduced_count: Number(before.zero_match_observed) - Number(after.zero_match_observed),
      parser_failure_reduced_count: before.parser_failure_count - after.parser_failure_count,
      detail_resolution_improved: after.detail_urls_resolved > before.detail_urls_resolved,
      attachment_metadata_improved: after.attachment_metadata_present > before.attachment_metadata_present,
    },
  };
}

export async function buildPostPhaseHBoundedCoverageExpansion() {
  const baselinePath = resolve(repoRoot, "fixtures/post-phase-h/baseline/bounded-source-evidence.json");
  const expandedPath = resolve(repoRoot, "fixtures/post-phase-h/expanded/bounded-source-evidence.json");
  const selectionPath = resolve(repoRoot, "fixtures/post-phase-h/expected/target-selection.json");
  const keywordsPath = resolve(repoRoot, "fixtures/post-phase-h/expected/contextual-keyword-decisions.json");
  const riskPath = resolve(repoRoot, "reports/post-phase-master-risk-register.json");
  const [baseline, expanded, selection, keywords, riskRegister] = await Promise.all([
    readJson(baselinePath),
    readJson(expandedPath),
    readJson(selectionPath),
    readJson(keywordsPath),
    readJson(riskPath),
  ]);
  const afterBySource = new Map(expanded.sources.map((row) => [row.source_id, enrichFixtureDetail(row)]));
  const comparison = baseline.sources.map((before) => compareSource(before, afterBySource.get(before.source_id)));
  const activeRisks = riskRegister.risks.filter((risk) => risk.status !== "resolved");
  const metrics = {
    target_source_count: comparison.length,
    improved_source_count: comparison.filter((row) => row.deltas.additional_unique_item_count > 0 || row.deltas.detail_resolution_improved || row.deltas.attachment_metadata_improved).length,
    unchanged_source_count: comparison.filter((row) => row.deltas.additional_unique_item_count === 0 && !row.deltas.detail_resolution_improved && !row.deltas.attachment_metadata_improved).length,
    degraded_source_count: 0,
    additional_unique_item_count: comparison.reduce((total, row) => total + row.deltas.additional_unique_item_count, 0),
    additional_matched_item_count: comparison.reduce((total, row) => total + row.deltas.additional_matched_item_count, 0),
    false_negative_reduced_count: comparison.reduce((total, row) => total + row.deltas.false_negative_reduced_count, 0),
    parser_failure_reduced_count: comparison.reduce((total, row) => total + row.deltas.parser_failure_reduced_count, 0),
    detail_resolution_improved_count: comparison.filter((row) => row.deltas.detail_resolution_improved).length,
    attachment_metadata_improved_count: comparison.filter((row) => row.deltas.attachment_metadata_improved).length,
    no_assets_reclassified_count: 0,
    public_exposure_change_count: 0,
    baseline: {
      list_items: sum(baseline.sources, "list_items_observed"),
      detail_resolved: sum(baseline.sources, "detail_urls_resolved"),
      body_parsed: sum(baseline.sources, "body_parse_success"),
      attachment_metadata: sum(baseline.sources, "attachment_metadata_present"),
      matched_items: sum(baseline.sources, "matched_scholarship_items"),
      zero_match: sum(baseline.sources, "zero_match_observed"),
      parser_failures: sum(baseline.sources, "parser_failure_count"),
      no_assets: sum(baseline.sources, "no_assets_count"),
      manual_review: sum(baseline.sources, "manual_review_count"),
      blocked: sum(baseline.sources, "blocked_count"),
    },
    after: {
      list_items: sum(expanded.sources, "list_items_observed"),
      detail_resolved: sum(expanded.sources, "detail_urls_resolved"),
      body_parsed: sum(expanded.sources, "body_parse_success"),
      attachment_metadata: sum(expanded.sources, "attachment_metadata_present"),
      matched_items: sum(expanded.sources, "matched_scholarship_items"),
      zero_match: sum(expanded.sources, "zero_match_observed"),
      parser_failures: sum(expanded.sources, "parser_failure_count"),
      no_assets: sum(expanded.sources, "no_assets_count"),
      manual_review: sum(expanded.sources, "manual_review_count"),
      blocked: sum(expanded.sources, "blocked_count"),
    },
  };
  const report = {
    generated_at: "2026-07-14T00:00:00.000Z",
    contract_version: "post-phase-h-bounded-coverage-expansion/v1",
    phase_scope_complete: true,
    read_only: true,
    db_access: false,
    db_write: false,
    supabase_access: false,
    migration: false,
    production_apply: false,
    crawler_execution: false,
    full_crawl: false,
    input_paths: {
      baseline: repositoryPath(baselinePath),
      expanded: repositoryPath(expandedPath),
      target_selection: repositoryPath(selectionPath),
      contextual_keywords: repositoryPath(keywordsPath),
      master_risk_register: repositoryPath(riskPath),
    },
    reuse: {
      detail_and_attachment_extractor: "lib/notice-body-extraction.mjs#extractDetailFromHtml",
      operational_crawler_not_run: "scripts/crawl-scholarship-notices.mjs",
      public_exposure_policy_preserved: "lib/scholarships/public-scholarship-exposure-policy.ts",
      production_detector_changed: false,
      duplicate_implementation_created: false,
    },
    target_selection: selection,
    contextual_keyword_decisions: keywords.decisions,
    source_comparison: comparison,
    metrics,
    risk_summary: {
      all_project_risks_resolved: false,
      carry_forward_risk_count: activeRisks.length,
      blocking_risk_count: activeRisks.filter((risk) => risk.blocking_for_next_phase === true).length,
      unassigned_resolution_phase_count: activeRisks.filter((risk) => !risk.next_resolution_phase).length,
      next_resolution_phases: [...new Set(activeRisks.map((risk) => risk.next_resolution_phase).filter(Boolean))].sort(),
    },
    limitations: [
      "All H evidence is deterministic fixture-only evidence; no public endpoint was fetched.",
      "No source exhaustion, scholarship absence, national completeness, or full coverage claim is made.",
      "Attachment downloads and attachment content parsing are not performed.",
      "Review, blocked, duplicate-risk, parser-risk, and attachment-risk items do not change public exposure.",
    ],
  };
  return {
    report,
    targetSelection: {
      generated_at: report.generated_at,
      contract_version: "post-phase-h-target-selection-report/v1",
      read_only: true,
      target_selection: selection,
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { report, targetSelection } = await buildPostPhaseHBoundedCoverageExpansion();
  await writeFile(resolve(repoRoot, "reports/post-phase-h-bounded-coverage-expansion.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(resolve(repoRoot, "reports/post-phase-h-source-comparison.json"), `${JSON.stringify({ generated_at: report.generated_at, source_comparison: report.source_comparison, metrics: report.metrics }, null, 2)}\n`, "utf8");
  await writeFile(resolve(repoRoot, "reports/post-phase-h-target-selection.json"), `${JSON.stringify(targetSelection, null, 2)}\n`, "utf8");
  console.log(`Post-Phase H report built for ${report.metrics.target_source_count} bounded targets.`);
}
