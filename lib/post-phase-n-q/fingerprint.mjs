import crypto from "node:crypto";

export const FINGERPRINT_SCHEMA_VERSION = "post-phase-n-fingerprint/v1";
export const PRODUCTION_READ_ONLY_EVIDENCE_KIND =
  "database_production_read_only";
export const EVIDENCE_KINDS = new Set([
  "live_public",
  "fixture",
  "synthetic",
  "static_repository",
  "database_nonproduction",
  PRODUCTION_READ_ONLY_EVIDENCE_KIND,
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

export function compareCanonicalStrings(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue).sort((left, right) =>
      compareCanonicalStrings(JSON.stringify(left), JSON.stringify(right)),
    );
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => compareCanonicalStrings(left, right))
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
  if (kind === "schema") {
    if (!name) throw new Error("Fingerprint schema entry is missing a name");
    return `${kind}:${name}`;
  }
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
    .sort((left, right) => compareCanonicalStrings(left.key, right.key));
}

export function normalizeFingerprint(input) {
  if (input.schema_version !== FINGERPRINT_SCHEMA_VERSION) {
    throw new Error(`Unsupported fingerprint schema: ${input.schema_version}`);
  }
  if (!EVIDENCE_KINDS.has(input.evidence?.evidence_kind)) {
    throw new Error("Fingerprint evidence_kind is invalid");
  }

  const inputWithoutHash = structuredClone(input);
  delete inputWithoutHash.fingerprint_sha256;
  const objects = inputWithoutHash.objects ?? {};
  const normalized = {
    ...inputWithoutHash,
    objects: {
      schemas: normalizeObjectList("schema", objects.schemas),
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

export function isProductionReadOnlyEvidence(input) {
  return (
    input?.schema_version === FINGERPRINT_SCHEMA_VERSION &&
    input?.evidence?.evidence_kind === PRODUCTION_READ_ONLY_EVIDENCE_KIND &&
    input?.evidence?.environment === "production" &&
    input?.safety?.transaction_read_only === true &&
    input?.safety?.ddl_performed === false &&
    input?.safety?.dml_performed === false &&
    input?.safety?.row_body_dumped === false
  );
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
  productionEvidenceAvailable,
}) {
  const normalizedProduction = normalizeFingerprint(production);
  const normalizedNonproduction = normalizeFingerprint(nonproduction);
  const validatedProductionEvidence =
    isProductionReadOnlyEvidence(normalizedProduction);
  const effectiveProductionEvidenceAvailable =
    productionEvidenceAvailable === undefined
      ? validatedProductionEvidence
      : validatedProductionEvidence && productionEvidenceAvailable;
  const productionMap = new Map(
    flattenObjects(normalizedProduction).map((item) => [item.key, item]),
  );
  const nonproductionMap = new Map(
    flattenObjects(normalizedNonproduction).map((item) => [item.key, item]),
  );
  const keys = [...new Set([...productionMap.keys(), ...nonproductionMap.keys()])]
    .sort(compareCanonicalStrings);
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
    evidence_kind: effectiveProductionEvidenceAvailable
      ? PRODUCTION_READ_ONLY_EVIDENCE_KIND
      : normalizedProduction.evidence.evidence_kind,
    production_fingerprint_available: effectiveProductionEvidenceAvailable,
    status: effectiveProductionEvidenceAvailable
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
