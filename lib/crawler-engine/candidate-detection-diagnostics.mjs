export const CANDIDATE_DETECTION_STATUSES = Object.freeze([
  "success_with_candidates",
  "success_no_scholarship_candidate",
  "success_with_skipped_non_candidates",
  "partial_with_candidates",
  "candidate_detection_undetermined",
  "candidate_detection_blocked_by_parse_failure",
  "zero_observation_unverified",
  "crawl_failed_before_candidate_detection",
]);

function count(value) {
  return Math.max(0, Number(value) || 0);
}

function classifySourceCandidateDetection(executionResult, detection) {
  const runtimeStatus = String(executionResult?.result_status ?? "");
  const observed = count(detection?.observed_list_item_count);
  const finalCandidates = count(detection?.final_summary?.candidate_count);
  const finalUndetermined = count(detection?.final_summary?.undetermined_count);
  const detectionErrors = count(detection?.preliminary_summary?.detection_error_count)
    + count(detection?.final_summary?.detection_error_count);
  const skipped = count(detection?.detail_fetch_skipped_count);
  const failedDetails = count(executionResult?.item_summary?.failed_count);

  if (!detection && runtimeStatus === "parser_error") {
    return "candidate_detection_blocked_by_parse_failure";
  }
  if (!detection && !["success", "empty_observed", "partial"].includes(runtimeStatus)) {
    return "crawl_failed_before_candidate_detection";
  }
  if (!detection || observed === 0) {
    if (runtimeStatus === "parser_error") return "candidate_detection_blocked_by_parse_failure";
    if (!["success", "empty_observed", "partial"].includes(runtimeStatus)) {
      return "crawl_failed_before_candidate_detection";
    }
    return "zero_observation_unverified";
  }
  if (detectionErrors > 0 && finalCandidates === 0) {
    return "candidate_detection_blocked_by_parse_failure";
  }
  if (finalCandidates > 0 && (runtimeStatus === "partial" || failedDetails > 0)) {
    return "partial_with_candidates";
  }
  if (finalCandidates > 0 && skipped > 0) return "success_with_skipped_non_candidates";
  if (finalCandidates > 0) return "success_with_candidates";
  if (finalUndetermined > 0) return "candidate_detection_undetermined";
  return "success_no_scholarship_candidate";
}

export function buildCandidateDetectionDiagnostics(sourceResults = []) {
  const rows = (Array.isArray(sourceResults) ? sourceResults : []).map((row) => {
    const executionResult = row?.executionResult ?? row?.execution_result ?? {};
    const detection = executionResult?.candidate_detection ?? row?.candidateDetection ?? null;
    const observed = count(detection?.observed_list_item_count);
    const planned = count(detection?.detail_fetch_planned_count);
    const skipped = count(detection?.detail_fetch_skipped_count);
    return {
      source_id: row?.sourceId ?? row?.source_id ?? executionResult?.source_id ?? executionResult?.source_key ?? null,
      status: classifySourceCandidateDetection(executionResult, detection),
      observed_list_item_count: observed,
      preliminary_candidate_count: count(detection?.preliminary_summary?.candidate_count),
      preliminary_not_candidate_count: count(detection?.preliminary_summary?.not_candidate_count),
      preliminary_out_of_range_count: count(detection?.preliminary_summary?.out_of_range_count),
      preliminary_undetermined_count: count(detection?.preliminary_summary?.undetermined_count),
      detail_fetch_planned_count: planned,
      detail_fetch_completed_count: count(detection?.detail_fetch_completed_count),
      authoritative_content_available_count:
        count(detection?.authoritative_content_available_count),
      detail_fetch_skipped_count: skipped,
      detail_fetch_skip_rate: observed > 0 ? skipped / observed : null,
      final_candidate_count: count(detection?.final_summary?.candidate_count),
      final_not_candidate_count: count(detection?.final_summary?.not_candidate_count),
      final_out_of_range_count: count(detection?.final_summary?.out_of_range_count),
      final_undetermined_count: count(detection?.final_summary?.undetermined_count),
      candidate_detection_error_count:
        count(detection?.preliminary_summary?.detection_error_count)
        + count(detection?.final_summary?.detection_error_count),
      requests_avoided_by_preliminary_filter:
        count(detection?.requests_avoided_by_preliminary_filter),
    };
  });
  const sum = (field) => rows.reduce((total, row) => total + count(row[field]), 0);
  const statusCounts = CANDIDATE_DETECTION_STATUSES.map((status) => ({
    status,
    source_count: rows.filter((row) => row.status === status).length,
  })).filter((row) => row.source_count > 0);
  const observed = sum("observed_list_item_count");
  const skipped = sum("detail_fetch_skipped_count");
  return {
    version: "candidate-detection-diagnostics-v1",
    policy_version: "scholarship-candidate-policy-v1",
    sources: rows,
    summary: {
      source_count: rows.length,
      observed_list_item_count: observed,
      preliminary_candidate_count: sum("preliminary_candidate_count"),
      preliminary_not_candidate_count: sum("preliminary_not_candidate_count"),
      preliminary_out_of_range_count: sum("preliminary_out_of_range_count"),
      preliminary_undetermined_count: sum("preliminary_undetermined_count"),
      detail_fetch_planned_count: sum("detail_fetch_planned_count"),
      detail_fetch_completed_count: sum("detail_fetch_completed_count"),
      authoritative_content_available_count:
        sum("authoritative_content_available_count"),
      detail_fetch_skipped_count: skipped,
      detail_fetch_skip_rate: observed > 0 ? skipped / observed : null,
      final_candidate_count: sum("final_candidate_count"),
      final_not_candidate_count: sum("final_not_candidate_count"),
      final_out_of_range_count: sum("final_out_of_range_count"),
      final_undetermined_count: sum("final_undetermined_count"),
      candidate_detection_error_count: sum("candidate_detection_error_count"),
      requests_avoided_by_preliminary_filter:
        sum("requests_avoided_by_preliminary_filter"),
      status_counts: statusCounts,
    },
  };
}
