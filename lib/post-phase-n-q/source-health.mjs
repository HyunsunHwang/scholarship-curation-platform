export function calculateSourceHealth({
  source,
  observations,
  reviewDistribution = {},
  publicProjectionCount = 0,
  attachmentDownloadSuccessCount = 0,
}) {
  const successful = observations.filter((item) => !item.error);
  const attributable = observations.filter(
    (item) => (item.detail_attribution_count ?? 0) > 0,
  );
  const matched = observations.reduce(
    (sum, item) => sum + (item.matched_count ?? 0),
    0,
  );
  const bodyUsable = observations.reduce(
    (sum, item) => sum + (item.body_usable_count ?? 0),
    0,
  );
  let consecutiveZeroMatchCount = 0;
  for (const item of [...observations].reverse()) {
    if (item.error || (item.matched_count ?? 0) > 0) break;
    consecutiveZeroMatchCount += 1;
  }
  const latest = observations.at(-1);
  let status = "SUCCESS";
  if (source.status === "SELECTOR_OR_SCOPE_DEFECT") status = "SELECTOR_CHANGED";
  else if (source.transport?.final_status === "TLS_BLOCKED") status = "TLS_BLOCKED";
  else if (latest?.error) status = "TRANSPORT_BLOCKED";
  else if (source.status === "BOUNDED_ZERO_MATCH") status = "ZERO_MATCH_OBSERVED";
  else if (matched > 0 && bodyUsable === 0) status = "BODY_UNUSABLE";

  return {
    source_key: source.source_key,
    status,
    last_success_at: successful.at(-1)?.observed_at ?? null,
    list_request_success_rate:
      observations.length === 0 ? 0 : successful.length / observations.length,
    detail_attribution_success_rate:
      observations.length === 0 ? 0 : attributable.length / observations.length,
    body_usable_rate: matched === 0 ? null : bodyUsable / matched,
    attachment_download_success_rate:
      source.attachment.metadata_discovered_count === 0
        ? null
        : attachmentDownloadSuccessCount /
          source.attachment.metadata_discovered_count,
    new_item_count: observations.reduce(
      (sum, item) => sum + (item.new_item_count ?? 0),
      0,
    ),
    consecutive_zero_match_count: consecutiveZeroMatchCount,
    collection_latency_ms: null,
    collection_latency_unavailable_reason:
      "The crawler report does not retain per-source start and finish timestamps.",
    review_queue_count: reviewDistribution.needs_review ?? 0,
    review_distribution: reviewDistribution,
    public_projection_count: publicProjectionCount,
  };
}
