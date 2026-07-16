import {
  DIFF_CLASSIFICATIONS,
  diffFingerprints,
  normalizeFingerprint,
} from "./fingerprint.mjs";

export const MIGRATION_OBJECT_KINDS = [
  "tables",
  "columns",
  "indexes",
  "constraints",
  "policies",
  "grants",
  "functions",
  "triggers",
  "views",
  "materialized_views",
];

export const MANAGED_SCHEMA_EXCLUSIONS = new Set([
  "auth",
  "storage",
  "realtime",
  "extensions",
  "vault",
  "supabase_migrations",
]);

function schemaFor(kind, item) {
  return kind === "schemas" ? item.name : item.schema ?? "public";
}

function emptyObjects() {
  return {
    schemas: [],
    tables: [],
    columns: [],
    indexes: [],
    constraints: [],
    policies: [],
    grants: [],
    functions: [],
    triggers: [],
    views: [],
    materialized_views: [],
  };
}

function objectMap(fingerprint) {
  return new Map(
    Object.values(fingerprint.objects).flat().map((item) => [item.key, item]),
  );
}

export function scopeFingerprintForMigration(input) {
  const normalized = normalizeFingerprint(input);
  const objects = emptyObjects();
  const excludedCountsBySchema = {};
  let excludedObjectCount = 0;
  for (const [kind, items] of Object.entries(normalized.objects)) {
    for (const item of items) {
      const schema = schemaFor(kind, item);
      if (schema === "public") {
        objects[kind].push(item);
      } else {
        excludedObjectCount += 1;
        excludedCountsBySchema[schema] =
          (excludedCountsBySchema[schema] ?? 0) + 1;
      }
    }
  }
  return {
    fingerprint: { ...normalized, objects },
    exclusion: {
      schema: "public",
      excluded_schema_count: Object.keys(excludedCountsBySchema).length,
      excluded_object_count: excludedObjectCount,
      excluded_counts_by_schema: excludedCountsBySchema,
      exclusion_reason:
        "Supabase-managed schemas are outside scoped migration readiness.",
    },
  };
}

function coverageEntry(kind, productionItems, nonproductionItems) {
  const productionCount = productionItems.length;
  const nonproductionCount = nonproductionItems.length;
  const status =
    productionCount > 0 && nonproductionCount > 0
      ? "comparable"
      : productionCount > 0
        ? "production_only_evidence"
        : nonproductionCount > 0
          ? "nonproduction_only_evidence"
          : "insufficient_evidence";
  return {
    object_kind: kind,
    status,
    production_object_count: productionCount,
    nonproduction_object_count: nonproductionCount,
  };
}

function fingerprintForComparableKinds(fingerprint, coverage) {
  const objects = emptyObjects();
  for (const kind of MIGRATION_OBJECT_KINDS) {
    if (coverage.find((entry) => entry.object_kind === kind)?.status === "comparable") {
      objects[kind] = fingerprint.objects[kind];
    }
  }
  objects.schemas = fingerprint.objects.schemas;
  return { ...fingerprint, objects };
}

function buildBetaRequiredTableStatus(target, production, nonproduction) {
  const productionObjects = objectMap(production);
  const nonproductionObjects = objectMap(nonproduction);
  return (target.beta_required_objects ?? []).map((key) => {
    const presentInProduction = productionObjects.has(key);
    const presentInNonproduction = nonproductionObjects.has(key);
    return {
      table: key.replace("table:public.", ""),
      present_in_production: presentInProduction,
      present_in_nonproduction: presentInNonproduction,
      target_classification: "REQUIRED_FOR_BETA",
      migration_required: !presentInProduction,
      evidence_level:
        presentInProduction && presentInNonproduction
          ? "comparable"
          : presentInProduction
            ? "production_only_evidence"
            : presentInNonproduction
              ? "nonproduction_only_evidence"
              : "insufficient_evidence",
      blocker_status: !presentInProduction
        ? "production_presence_unverified_or_missing"
        : !presentInNonproduction
          ? "nonproduction_presence_missing"
          : "present_in_both",
    };
  });
}

export function buildScopedMigrationReadiness({
  production,
  nonproduction,
  target,
}) {
  const productionScope = scopeFingerprintForMigration(production);
  const nonproductionScope = scopeFingerprintForMigration(nonproduction);
  const coverage = MIGRATION_OBJECT_KINDS.map((kind) =>
    coverageEntry(
      kind,
      productionScope.fingerprint.objects[kind],
      nonproductionScope.fingerprint.objects[kind],
    ),
  );
  const fullDiff = diffFingerprints({
    production: fingerprintForComparableKinds(productionScope.fingerprint, coverage),
    nonproduction: fingerprintForComparableKinds(
      nonproductionScope.fingerprint,
      coverage,
    ),
    target,
    productionEvidenceAvailable: true,
  });
  const betaRequiredTableStatus = buildBetaRequiredTableStatus(
    target,
    productionScope.fingerprint,
    nonproductionScope.fingerprint,
  );
  const insufficientCoverageCount = coverage.filter(
    (entry) => entry.status !== "comparable",
  ).length;
  const betaBlockerCount = betaRequiredTableStatus.filter(
    (entry) => entry.blocker_status !== "present_in_both",
  ).length;
  const migrationReadiness =
    betaBlockerCount > 0
      ? "HOLD"
      : insufficientCoverageCount > 0
        ? "CONDITIONAL"
        : "CONDITIONAL";

  return {
    full_diff: {
      ...fullDiff,
      scope: {
        schema: "public",
        production_exclusions: productionScope.exclusion,
        nonproduction_exclusions: nonproductionScope.exclusion,
      },
      evidence_coverage_matrix: coverage,
      beta_required_table_status: betaRequiredTableStatus,
      migration_readiness: migrationReadiness,
    },
    sanitized_summary: {
      contract_version: "post-phase-n-scoped-migration-readiness/v1",
      scope: {
        schema: "public",
        excluded_schema_count: productionScope.exclusion.excluded_schema_count,
        excluded_object_count: productionScope.exclusion.excluded_object_count,
        excluded_counts_by_schema: productionScope.exclusion.excluded_counts_by_schema,
        exclusion_reason: productionScope.exclusion.exclusion_reason,
      },
      evidence_coverage_matrix: coverage,
      classification_counts: Object.fromEntries(
        DIFF_CLASSIFICATIONS.map((classification) => [
          classification,
          fullDiff.classification_counts[classification] ?? 0,
        ]),
      ),
      classification_arithmetic_consistent: fullDiff.arithmetic_consistent,
      comparable_difference_count: fullDiff.difference_count,
      beta_required_table_status: betaRequiredTableStatus,
      blocker_count: betaBlockerCount + insufficientCoverageCount,
      migration_readiness: migrationReadiness,
      known_limitations: [
        "Columns, constraints, and grants remain insufficiently evidenced in non-production.",
        "Managed Supabase schemas are excluded from migration readiness classification.",
      ],
    },
  };
}
