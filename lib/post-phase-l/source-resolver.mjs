function clean(value) {
  return String(value ?? "").trim();
}

export function resolveExactSourceKey(sourceKey, inventoryRows) {
  const key = clean(sourceKey);
  if (!key) {
    return {
      source_key: key,
      source_id: null,
      resolution_status: "blocked_missing_source",
      match_count: 0,
      blocked: true,
      reason: "empty_source_key",
    };
  }

  const matches = (Array.isArray(inventoryRows) ? inventoryRows : []).filter(
    (row) => clean(row?.source_id) === key,
  );
  if (matches.length === 0) {
    return {
      source_key: key,
      source_id: null,
      resolution_status: "blocked_missing_source",
      match_count: 0,
      blocked: true,
      reason: "no_exact_notice_sources_source_id_match",
    };
  }
  if (matches.length > 1) {
    return {
      source_key: key,
      source_id: null,
      resolution_status: "blocked_ambiguous_inventory",
      match_count: matches.length,
      blocked: true,
      reason: "multiple_exact_notice_sources_source_id_matches",
    };
  }

  return {
    source_key: key,
    source_id: clean(matches[0].source_id),
    resolution_status: "resolved",
    match_count: 1,
    blocked: false,
    reason: "exact_notice_sources_source_id_match",
    source: matches[0],
  };
}

export function resolvePilotCohort(sourceKeys, inventoryRows) {
  return sourceKeys.map((sourceKey) =>
    resolveExactSourceKey(sourceKey, inventoryRows),
  );
}
