function observationKey(observation, index) {
  return String(
    observation?.observationId
    ?? observation?.observation_id
    ?? observation?.noticeUrl
    ?? observation?.notice_url
    ?? index,
  );
}

export function buildDetailFetchPlan({
  observations = [],
  candidateResults = [],
  seenNoticeUrls = [],
  shouldRefetchSeen = null,
  diagnosticDetailProbeEnabled = true,
  detailFetchRequired = true,
} = {}) {
  const rows = Array.isArray(observations) ? observations : [];
  const decisions = Array.isArray(candidateResults) ? candidateResults : [];
  if (rows.length !== decisions.length) {
    throw new Error("Detail fetch planning requires one candidate result per observation.");
  }
  const fetch = [];
  const skip = [];
  const seenUrls = new Set(Array.isArray(seenNoticeUrls) ? seenNoticeUrls.map(String) : []);
  rows.forEach((observation, index) => {
    const candidateResult = decisions[index];
    const eligible = candidateResult?.classification === "candidate"
      || candidateResult?.classification === "undetermined";
    if (eligible && candidateResult?.eligibleForDetailFetch !== false) {
      if (!detailFetchRequired) {
        skip.push({
          observation,
          candidateResult,
          skipReason: "source_detail_fetch_not_required",
          observationKey: observationKey(observation, index),
        });
        return;
      }
      const noticeUrl = String(observation?.noticeUrl ?? observation?.notice_url ?? "");
      const seenBefore = Boolean(noticeUrl && seenUrls.has(noticeUrl));
      if (
        seenBefore
        && typeof shouldRefetchSeen === "function"
        && shouldRefetchSeen({ observation, candidateResult, seenBefore }) === false
      ) {
        skip.push({
          observation,
          candidateResult,
          skipReason: "existing_notice_refetch_not_required",
          observationKey: observationKey(observation, index),
        });
        return;
      }
      fetch.push(observation);
      return;
    }
    skip.push({
      observation,
      candidateResult,
      skipReason: candidateResult?.reasonCodes?.[0]
        ?? `candidate_${candidateResult?.classification ?? "unknown"}`,
      observationKey: observationKey(observation, index),
    });
  });
  // A source with no eligible scholarship candidate would otherwise never exercise
  // its detail parser. Probe the last usable non-candidate list item once so the
  // runtime diagnostics can distinguish "no scholarship" from a broken detail
  // page. This probe is intentionally separate from `fetch`: it must not enter
  // candidate detection, seen-state, or downstream notice output.
  const diagnosticDetailProbe = diagnosticDetailProbeEnabled && fetch.length === 0
    ? [...skip].reverse().find((entry) => {
        const noticeUrl = String(entry?.observation?.noticeUrl ?? entry?.observation?.notice_url ?? "");
        return Boolean(noticeUrl);
      }) ?? null
    : null;
  return {
    fetch,
    skip,
    diagnosticDetailProbe: diagnosticDetailProbe ? {
      observation: diagnosticDetailProbe.observation,
      observationKey: diagnosticDetailProbe.observationKey,
      selectionReason: "last_non_candidate_list_observation",
    } : null,
    seenNoticeUrlCount: rows.filter((observation) =>
      seenUrls.has(String(observation?.noticeUrl ?? observation?.notice_url ?? ""))).length,
  };
}
