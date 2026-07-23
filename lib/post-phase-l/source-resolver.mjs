import { loadNoticeSourceManifestRegistry } from "../notice-source-manifest-loader.mjs";

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

// The normalized-graph dry-run and approved apply paths must share this exact
// fail-closed registry resolution. Local inventories are fixture metadata only.
export function resolveInputWithManifestRegistry(input, { manifestRoot } = {}) {
  const registry = loadNoticeSourceManifestRegistry({
    rootDirectory: manifestRoot,
    includeDisabled: true,
  });
  const inventory = registry.sources.map((source) => ({
    source_id: source.sourceId,
    source_name: source.sourceName,
    enabled: source.enabled,
  }));
  const sourceResults = (input.source_results ?? []).map((result) => {
    const resolution = resolveExactSourceKey(result.source_key, inventory);
    if (resolution.blocked) {
      throw new Error(`Manifest exact source resolution blocked: ${resolution.reason}`);
    }
    if (resolution.source.enabled !== true) {
      throw new Error(`Manifest source is disabled: ${result.source_key}`);
    }
    return { ...result, source_id: resolution.source_id };
  });
  return {
    ...input,
    source_results: sourceResults,
    source_registry: registry.fingerprint,
    source_registry_resolution_mode: "manifest_exact",
    exact_source_resolution_passed: true,
    fuzzy_source_match_count: 0,
    automatic_source_create_count: 0,
  };
}
