import crypto from "node:crypto";

export const FINGERPRINT_SCHEMA_VERSION = "post-phase-n-fingerprint/v1";
export const EVIDENCE_KINDS = new Set([
  "live_public",
  "fixture",
  "synthetic",
  "static_repository",
  "database_nonproduction",
  "design_only",
  "owner_pending",
  "not_authorized",
]);
export const DIFF_CLASSIFICATIONS = [
  "REQUIRED_FOR_BETA",
  "COMPATIBILITY_REQUIRED",
  "DEFER_AFTER_BETA",
  "REMOVE_OR_REPLACE",
  "OWNER_DECISION_REQUIRED",
  "UNEXPECTED_PRODUCTION_ONLY",
  "UNEXPECTED_NONPRODUCTION_ONLY",
];

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue).sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

export function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

export function fingerprintHash(value) {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

function objectKey(kind, item) {
  const schema = item.schema ?? "public";
  const name = item.name ?? item.table ?? item.function ?? item.view;
  if (kind === "grant") {
    if (!item.table || !item.grantee || !item.privilege) {
      throw new Error("Fingerprint grant entry is incomplete");
    }
    return `${kind}:${schema}.${item.table}.${item.grantee}.${item.privilege}`;
  }
  if (!name) throw new Error(`Fingerprint ${kind} entry is missing a name`);
  const signature = item.signature ? `(${item.signature})` : "";
  const table = item.table ? `${item.table}.` : "";
  return `${kind}:${schema}.${table}${name}${signature}`;
}

function normalizeObjectList(kind, items = []) {
  return items
    .map((item) => ({
      ...stableValue(item),
      key: objectKey(kind, item),
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

export function normalizeFingerprint(input) {
  if (input.schema_version !== FINGERPRINT_SCHEMA_VERSION) {
    throw new Error(`Unsupported fingerprint schema: ${input.schema_version}`);
  }
  if (!EVIDENCE_KINDS.has(input.evidence?.evidence_kind)) {
    throw new Error("Fingerprint evidence_kind is invalid");
  }

  const objects = input.objects ?? {};
  const normalized = {
    ...input,
    objects: {
      tables: normalizeObjectList("table", objects.tables),
      columns: normalizeObjectList("column", objects.columns),
      indexes: normalizeObjectList("index", objects.indexes),
      constraints: normalizeObjectList("constraint", objects.constraints),
      policies: normalizeObjectList("policy", objects.policies),
      grants: normalizeObjectList("grant", objects.grants),
      functions: normalizeObjectList("function", objects.functions),
      triggers: normalizeObjectList("trigger", objects.triggers),
      views: normalizeObjectList("view", objects.views),
      materialized_views: normalizeObjectList(
        "materialized_view",
        objects.materialized_views,
      ),
    },
  };

  return {
    ...stableValue(normalized),
    fingerprint_sha256: fingerprintHash(normalized),
  };
}

function flattenObjects(fingerprint) {
  return Object.values(fingerprint.objects).flat();
}

function classifyKey(key, target, defaultClassification) {
  const overrides = [
    ["beta_required_objects", "REQUIRED_FOR_BETA"],
    ["deferred_objects", "DEFER_AFTER_BETA"],
    ["remove_or_replace_objects", "REMOVE_OR_REPLACE"],
    ["owner_decision_objects", "OWNER_DECISION_REQUIRED"],
  ];
  for (const [field, classification] of overrides) {
    if ((target[field] ?? []).includes(key)) return classification;
  }
  return defaultClassification;
}

export function diffFingerprints({
  production,
  nonproduction,
  target = {},
  productionEvidenceAvailable = true,
}) {
  const normalizedProduction = normalizeFingerprint(production);
  const normalizedNonproduction = normalizeFingerprint(nonproduction);
  const productionMap = new Map(
    flattenObjects(normalizedProduction).map((item) => [item.key, item]),
  );
  const nonproductionMap = new Map(
    flattenObjects(normalizedNonproduction).map((item) => [item.key, item]),
  );
  const keys = [...new Set([...productionMap.keys(), ...nonproductionMap.keys()])]
    .sort();
  const differences = [];

  for (const key of keys) {
    const productionObject = productionMap.get(key) ?? null;
    const nonproductionObject = nonproductionMap.get(key) ?? null;
    if (!productionObject) {
      differences.push({
        key,
        classification: classifyKey(
          key,
          target,
          "UNEXPECTED_NONPRODUCTION_ONLY",
        ),
        production: null,
        nonproduction: nonproductionObject,
      });
      continue;
    }
    if (!nonproductionObject) {
      differences.push({
        key,
        classification: classifyKey(
          key,
          target,
          "UNEXPECTED_PRODUCTION_ONLY",
        ),
        production: productionObject,
        nonproduction: null,
      });
      continue;
    }
    if (stableStringify(productionObject) !== stableStringify(nonproductionObject)) {
      differences.push({
        key,
        classification: classifyKey(
          key,
          target,
          "COMPATIBILITY_REQUIRED",
        ),
        production: productionObject,
        nonproduction: nonproductionObject,
      });
    }
  }

  const classification_counts = Object.fromEntries(
    DIFF_CLASSIFICATIONS.map((classification) => [
      classification,
      differences.filter((item) => item.classification === classification).length,
    ]),
  );

  return {
    schema_version: "post-phase-n-schema-diff/v1",
    generated_at: new Date().toISOString(),
    evidence_kind: productionEvidenceAvailable ? "database_nonproduction" : "synthetic",
    production_fingerprint_available: productionEvidenceAvailable,
    status: productionEvidenceAvailable
      ? "READY_FOR_OWNER_REVIEW"
      : "CONDITIONAL_ON_PRODUCTION_FINGERPRINT",
    production_fingerprint_sha256: normalizedProduction.fingerprint_sha256,
    nonproduction_fingerprint_sha256:
      normalizedNonproduction.fingerprint_sha256,
    difference_count: differences.length,
    classification_counts,
    arithmetic_consistent:
      Object.values(classification_counts).reduce((sum, value) => sum + value, 0) ===
      differences.length,
    differences,
  };
}
