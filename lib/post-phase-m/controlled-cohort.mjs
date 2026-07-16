import { readSourceConfigFromCsv } from "../notice-sources-loader.mjs";

export const POST_PHASE_M_CONTROL_SOURCE_KEYS = ["cau_001", "cau_002", "yonsei_060"];
export const POST_PHASE_M_EXPANSION_SOURCE_KEYS = ["cau_003", "cau_007", "cau_008"];
export const POST_PHASE_M_SOURCE_KEYS = [
  ...POST_PHASE_M_CONTROL_SOURCE_KEYS,
  ...POST_PHASE_M_EXPANSION_SOURCE_KEYS,
];
export const POST_PHASE_M_INVENTORY_ONLY_SOURCE_KEY = "cau_012";

const INVENTORY_FILES = [
  "data/notice-sources.csv",
  "data/notice-sources-cau.csv",
  "data/notice-sources-cau-smoke.csv",
];

function clean(value) {
  return String(value ?? "").trim();
}

function comparable(source) {
  return {
    source_id: source.sourceId,
    university_slug: source.universitySlug,
    university_id: Number(source.universityId),
    college_id: Number(source.collegeId),
    department_id: Number(source.departmentId),
    inventory_org_unit_id: Number(source.orgUnitId),
    college_name: source.collegeName || null,
    department_name: source.departmentName || null,
    source_level: source.sourceLevel,
    source_name: source.sourceName,
    list_url: source.listUrl,
    base_url: source.baseUrl || null,
    list_item_selector: source.listItemSelector || null,
    link_selector: source.linkSelector || null,
    title_selector: source.titleSelector || null,
    date_selector: source.dateSelector || null,
    detail_content_selector: source.detailContentSelector || null,
    detail_date_selector: source.detailDateSelector || null,
    notice_url_pattern: source.noticeUrlPattern || null,
    keywords: source.keywords.join("|"),
    adapter: source.adapter || null,
    enabled: source.enabled === true,
  };
}

function stableMetadata(source) {
  const row = comparable(source);
  return JSON.stringify({
    source_id: row.source_id,
    university_slug: row.university_slug,
    source_level: row.source_level,
    source_name: row.source_name,
    list_url: row.list_url,
    base_url: row.base_url,
    enabled: row.enabled,
  });
}

export function buildPostPhaseMCohortPlan() {
  const inventories = INVENTORY_FILES.map((file) => ({
    file,
    rows: readSourceConfigFromCsv(file),
  }));
  const master = inventories[0].rows;
  const sources = [];
  const conflicts = [];

  for (const sourceKey of POST_PHASE_M_SOURCE_KEYS) {
    const masterMatches = master.filter((row) => row.sourceId === sourceKey);
    if (masterMatches.length !== 1) {
      conflicts.push({ source_key: sourceKey, reason: "master_inventory_exact_match_count", count: masterMatches.length });
      continue;
    }
    const source = masterMatches[0];
    if (sourceKey.startsWith("cau_")) {
      for (const inventory of inventories.slice(1)) {
        const matches = inventory.rows.filter((row) => row.sourceId === sourceKey);
        if (matches.length !== 1 || stableMetadata(matches[0]) !== stableMetadata(source)) {
          conflicts.push({
            source_key: sourceKey,
            reason: "cross_inventory_metadata_conflict",
            inventory: inventory.file,
            count: matches.length,
          });
        }
      }
    }
    sources.push(comparable(source));
  }

  const inventoryOnlyMatches = inventories.flatMap((inventory) =>
    inventory.rows
      .filter((row) => row.sourceId === POST_PHASE_M_INVENTORY_ONLY_SOURCE_KEY)
      .map((row) => ({ inventory: inventory.file, source_id: row.sourceId })),
  );

  return {
    contract_version: "post-phase-m-controlled-cohort/v1",
    target_project_ref: "hrayfvdggbhfmmzfblly",
    control_source_keys: POST_PHASE_M_CONTROL_SOURCE_KEYS,
    expansion_source_keys: POST_PHASE_M_EXPANSION_SOURCE_KEYS,
    source_keys: POST_PHASE_M_SOURCE_KEYS,
    source_count: POST_PHASE_M_SOURCE_KEYS.length,
    sources,
    exact_source_resolution_passed:
      conflicts.length === 0 && sources.length === POST_PHASE_M_SOURCE_KEYS.length,
    fuzzy_source_match_count: 0,
    automatic_source_create_count: 0,
    conflicts,
    inventory_files: INVENTORY_FILES,
    inventory_only_risk: {
      source_key: POST_PHASE_M_INVENTORY_ONLY_SOURCE_KEY,
      source_inventory_status: inventoryOnlyMatches.length === 0 ? "absent" : "present",
      source_absence_proven: false,
      automatic_source_create_count: 0,
      matches: inventoryOnlyMatches,
    },
  };
}

export function sourceInsertRow(source, orgUnitId) {
  return {
    source_id: source.source_id,
    university_slug: source.university_slug,
    org_unit_id: orgUnitId,
    source_level: source.source_level,
    source_name: source.source_name,
    college_name: source.college_name,
    department_name: source.department_name,
    list_url: source.list_url,
    base_url: source.base_url,
    list_item_selector: source.list_item_selector,
    link_selector: source.link_selector,
    title_selector: source.title_selector,
    date_selector: source.date_selector,
    detail_content_selector: source.detail_content_selector,
    detail_date_selector: source.detail_date_selector,
    notice_url_pattern: source.notice_url_pattern,
    keywords: source.keywords,
    adapter: source.adapter,
    enabled: source.enabled,
    university_id: source.university_id,
    college_id: source.college_id,
    department_id: source.department_id,
    notes: "Post-Phase M controlled cohort; exact committed sanitized inventory.",
  };
}

export function orgUnitIdentity(source) {
  if (source.source_level === "department") {
    return {
      unit_type: "department",
      name: source.department_name,
      legacy_table: "university_departments",
      legacy_id: source.department_id,
    };
  }
  return {
    unit_type: "college",
    name: source.college_name,
    legacy_table: "university_colleges",
    legacy_id: source.college_id,
  };
}

export function sameSourceMetadata(existing, planned) {
  const fields = [
    "source_id", "university_slug", "source_level", "source_name", "college_name",
    "department_name", "list_url", "base_url", "list_item_selector", "link_selector",
    "title_selector", "date_selector", "detail_content_selector", "detail_date_selector",
    "notice_url_pattern", "keywords", "adapter", "enabled", "university_id", "college_id",
    "department_id",
  ];
  return fields.every((field) => clean(existing[field]) === clean(planned[field]));
}
