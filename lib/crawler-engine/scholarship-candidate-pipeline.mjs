import {
  detectScholarshipCandidate,
  summarizeScholarshipCandidateResults,
} from "../detection/scholarship-candidate-detector.mjs";
import { buildDetailFetchPlan } from "./detail-fetch-planner.mjs";

export function buildPreliminaryScholarshipCandidatePlan(
  observations,
  {
    detector = detectScholarshipCandidate,
    planner = buildDetailFetchPlan,
    detectorOptions = {},
    plannerOptions = {},
  } = {},
) {
  const rows = Array.isArray(observations) ? observations : [];
  const preliminaryCandidateResults = rows.map((observation) => detector(observation, {
    ...detectorOptions,
    stage: "preliminary",
  }));
  const detailFetchPlan = planner({
    observations: rows,
    candidateResults: preliminaryCandidateResults,
    ...plannerOptions,
  });
  return { preliminaryCandidateResults, detailFetchPlan };
}

export function finalizeScholarshipCandidateDetection({
  listObservations = [],
  preliminaryCandidateResults = [],
  detailFetchPlan = { fetch: [], skip: [] },
  detailObservations = [],
  detector = detectScholarshipCandidate,
  detectorOptions = {},
  detailFetchRequired = true,
  detailContentAlreadyAvailable = false,
} = {}) {
  const finalCandidateResults = detailObservations.map((observation) => detector(observation, {
    ...detectorOptions,
    stage: "final",
  }));
  const skipped = Array.isArray(detailFetchPlan?.skip) ? detailFetchPlan.skip : [];
  const planned = Array.isArray(detailFetchPlan?.fetch) ? detailFetchPlan.fetch : [];
  const diagnosticDetailProbe = detailFetchPlan?.diagnosticDetailProbe ?? null;
  return {
    policy_version: finalCandidateResults[0]?.policyVersion
      ?? preliminaryCandidateResults[0]?.policyVersion
      ?? null,
    observed_list_item_count: listObservations.length,
    preliminary_candidate_results: preliminaryCandidateResults,
    preliminary_summary: summarizeScholarshipCandidateResults(preliminaryCandidateResults),
    detail_fetch_planned_count: planned.length,
    detail_fetch_completed_count: detailContentAlreadyAvailable ? 0 : detailObservations.length,
    authoritative_content_available_count:
      detailContentAlreadyAvailable ? detailObservations.length : 0,
    detail_fetch_skipped_count: skipped.length,
    diagnostic_detail_probe_planned_count: diagnosticDetailProbe ? 1 : 0,
    requests_avoided_by_preliminary_filter: detailFetchRequired
      ? Math.max(0, skipped.length - (diagnosticDetailProbe ? 1 : 0))
      : 0,
    skipped,
    final_candidate_results: finalCandidateResults,
    final_summary: summarizeScholarshipCandidateResults(finalCandidateResults),
  };
}
