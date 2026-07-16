import { readSourceConfigFromCsv } from "../notice-sources-loader.mjs";

export const EXISTING_CONTROLLED_SOURCE_KEYS = [
  "cau_001",
  "cau_002",
  "cau_003",
  "cau_007",
  "cau_008",
  "yonsei_060",
];
export const ADDITIONAL_BETA_SOURCE_KEYS = [
  "cau_004",
  "cau_006",
  "cau_010",
  "cau_011",
];
export const BETA_SOURCE_KEYS = [
  ...EXISTING_CONTROLLED_SOURCE_KEYS,
  ...ADDITIONAL_BETA_SOURCE_KEYS,
];

export function buildBetaCohort() {
  const inventory = readSourceConfigFromCsv("data/notice-sources.csv");
  const sources = [];
  const conflicts = [];
  for (const sourceKey of BETA_SOURCE_KEYS) {
    const matches = inventory.filter((row) => row.sourceId === sourceKey);
    if (matches.length !== 1) {
      conflicts.push({
        source_key: sourceKey,
        reason: "canonical_inventory_exact_match_count",
        count: matches.length,
      });
      continue;
    }
    const source = matches[0];
    sources.push({
      source_key: source.sourceId,
      cohort_role: ADDITIONAL_BETA_SOURCE_KEYS.includes(source.sourceId)
        ? "additional_candidate"
        : "existing_controlled",
      source_name: source.sourceName,
      source_level: source.sourceLevel,
      official_list_url: source.listUrl,
      base_url: source.baseUrl || null,
      list_selector: source.listItemSelector || null,
      link_selector: source.linkSelector || null,
      detail_body_selector: source.detailContentSelector || null,
      adapter: source.adapter || null,
      enabled: source.enabled === true,
      selection_reason: ADDITIONAL_BETA_SOURCE_KEYS.includes(source.sourceId)
        ? "Exact canonical inventory identity in a bounded Central University cohort."
        : "Existing Post-Phase M controlled evidence.",
    });
  }
  return {
    contract_version: "post-phase-p-beta-cohort/v1",
    evidence_kind: "static_repository",
    source_keys: BETA_SOURCE_KEYS,
    source_count: BETA_SOURCE_KEYS.length,
    existing_source_count: EXISTING_CONTROLLED_SOURCE_KEYS.length,
    additional_source_count: ADDITIONAL_BETA_SOURCE_KEYS.length,
    max_pages_per_source: 5,
    max_items_per_source: 30,
    sources,
    conflicts,
    exact_source_resolution_passed:
      conflicts.length === 0 && sources.length === BETA_SOURCE_KEYS.length,
    fuzzy_source_match_count: 0,
    automatic_source_create_count: 0,
    cau_012: {
      inventory_status: "owner_pending",
      automatic_source_create_count: 0,
    },
  };
}
