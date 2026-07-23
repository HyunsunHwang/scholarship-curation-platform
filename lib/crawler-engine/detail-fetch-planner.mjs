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
  return {
    fetch,
    skip,
    seenNoticeUrlCount: rows.filter((observation) =>
      seenUrls.has(String(observation?.noticeUrl ?? observation?.notice_url ?? ""))).length,
  };
}
