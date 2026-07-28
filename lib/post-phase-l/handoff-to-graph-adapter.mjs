import {
  HANDOFF_STATUS_BLOCKED,
  validateCrawlerHandoff,
} from "../crawler-engine/crawler-handoff.mjs";
import { buildNormalizedGraphPlan } from "./normalized-graph.mjs";

function clean(value) {
  return String(value ?? "").trim();
}

/**
 * Map crawler-handoff-v1 into buildNormalizedGraphPlan input.
 * Fail-closed on missing/mismatched source identity.
 * Does not perform DB reads or writes.
 */
export function adaptHandoffToGraphInput(handoff, options = {}) {
  const generatedAt = clean(options.generatedAt ?? handoff?.generated_at ?? handoff?.generatedAt)
    || new Date().toISOString();
  const idempotencyKey = clean(options.idempotencyKey)
    || `shadow-parity-${generatedAt.replace(/[^0-9]/g, "")}`;

  const validation = validateCrawlerHandoff(handoff ?? {});
  const sourceResults = Array.isArray(handoff?.sourceResults)
    ? handoff.sourceResults
    : Array.isArray(handoff?.source_results)
      ? handoff.source_results
      : [];

  const blockedSources = [];
  const adapted = [];

  for (const row of sourceResults) {
    const sourceId = clean(row.sourceId ?? row.source_id);
    if (!sourceId) {
      throw new Error("handoff_source_missing_source_id");
    }
    const status = clean(row.downstream_handoff_status ?? row.downstreamHandoffStatus);
    const blockReasons = row.downstream_block_reasons
      ?? row.downstreamBlockReasons
      ?? [];
    if (status === HANDOFF_STATUS_BLOCKED || (Array.isArray(blockReasons) && blockReasons.length > 0)) {
      blockedSources.push({
        source_id: sourceId,
        downstream_handoff_status: status || HANDOFF_STATUS_BLOCKED,
        downstream_block_reasons: Array.isArray(blockReasons) ? blockReasons : [String(blockReasons)],
      });
      continue;
    }

    adapted.push({
      source_key: sourceId,
      source_id: sourceId,
      source_name: clean(row.sourceName ?? row.source_name) || sourceId,
      result_status: clean(row.resultStatus ?? row.result_status) || "success",
      notices: Array.isArray(row.notices) ? row.notices : [],
      observed_count: Array.isArray(row.notices) ? row.notices.length : 0,
      matched_count: Array.isArray(row.notices) ? row.notices.length : 0,
      evidence: {
        parser_evidence: row.parserEvidence ?? row.parser_evidence ?? null,
        candidate_detection: row.candidateDetection ?? row.candidate_detection ?? null,
        item_summary: row.itemSummary ?? row.item_summary ?? null,
      },
    });
  }

  return {
    graph_input: {
      run: {
        idempotency_key: idempotencyKey,
        execution_mode: clean(options.executionMode) || "shadow_parity_dry_run",
        runner_version: clean(options.runnerVersion) || "shadow-parity-v1",
        status: blockedSources.length > 0 && adapted.length === 0 ? "blocked" : "succeeded",
        started_at: generatedAt,
        finished_at: generatedAt,
        metadata: {
          handoff_version: clean(handoff?.handoffVersion ?? handoff?.handoff_version),
          blocked_source_count: blockedSources.length,
        },
      },
      source_results: adapted,
      generated_at: generatedAt,
    },
    blocked_sources: blockedSources,
    validation,
    safety: {
      databaseReadPerformed: false,
      databaseWritePerformed: false,
      publicWritePerformed: false,
      writes_performed: false,
    },
  };
}

export function buildGraphPlanFromHandoff(handoff, options = {}) {
  const adapted = adaptHandoffToGraphInput(handoff, options);
  if (adapted.graph_input.source_results.length === 0) {
    return {
      ...adapted,
      plan: null,
      plan_error: adapted.blocked_sources.length > 0
        ? "all_sources_blocked_for_normalized_graph"
        : "no_source_results",
    };
  }
  try {
    const plan = buildNormalizedGraphPlan(adapted.graph_input, {
      generatedAt: adapted.graph_input.generated_at,
      targetProjectRef: options.targetProjectRef,
    });
    return {
      ...adapted,
      plan: {
        ...plan,
        writes_performed: false,
      },
      plan_error: null,
    };
  } catch (error) {
    return {
      ...adapted,
      plan: null,
      plan_error: error?.message ?? String(error),
    };
  }
}
