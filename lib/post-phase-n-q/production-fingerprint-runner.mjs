import {
  FINGERPRINT_SCHEMA_VERSION,
  isProductionReadOnlyEvidence,
  normalizeFingerprint,
  PRODUCTION_READ_ONLY_EVIDENCE_KIND,
} from "./fingerprint.mjs";

export const OPTIONAL_STATE_DISTRIBUTIONS = Object.freeze([
  {
    key: "scholarships.is_verified",
    schema: "public",
    table: "scholarships",
    column: "is_verified",
    query: `
begin transaction read only;
set local statement_timeout = '30s';
select coalesce(jsonb_object_agg(state, item_count), '{}'::jsonb)
from (
  select is_verified::text as state, count(*) as item_count
  from public.scholarships
  group by is_verified
) bounded_distribution;
rollback;
`,
  },
  {
    key: "crawled_notices.status",
    schema: "public",
    table: "crawled_notices",
    column: "status",
    query: `
begin transaction read only;
set local statement_timeout = '30s';
select coalesce(jsonb_object_agg(state, item_count), '{}'::jsonb)
from (
  select status::text as state, count(*) as item_count
  from public.crawled_notices
  group by status
) bounded_distribution;
rollback;
`,
  },
  {
    key: "notice_sources.enabled",
    schema: "public",
    table: "notice_sources",
    column: "enabled",
    query: `
begin transaction read only;
set local statement_timeout = '30s';
select coalesce(jsonb_object_agg(state, item_count), '{}'::jsonb)
from (
  select enabled::text as state, count(*) as item_count
  from public.notice_sources
  group by enabled
) bounded_distribution;
rollback;
`,
  },
]);

const MIGRATION_METADATA_WITH_NAME_QUERY = `
begin transaction read only;
set local statement_timeout = '30s';
select coalesce(
  jsonb_agg(
    jsonb_build_object('version', version, 'name', name)
    order by version
  ),
  '[]'::jsonb
)
from (
  select version, name
  from supabase_migrations.schema_migrations
  order by version
  limit 5000
) bounded_migrations;
rollback;
`;

const MIGRATION_METADATA_VERSION_ONLY_QUERY = `
begin transaction read only;
set local statement_timeout = '30s';
select coalesce(
  jsonb_agg(
    jsonb_build_object('version', version, 'name', null)
    order by version
  ),
  '[]'::jsonb
)
from (
  select version
  from supabase_migrations.schema_migrations
  order by version
  limit 5000
) bounded_migrations;
rollback;
`;

export function parseJsonValue(text) {
  let parsed;
  try {
    parsed = JSON.parse(String(text ?? "").trim());
  } catch {
    throw new Error("Production fingerprint output is not valid JSON");
  }
  return parsed;
}

export function parseFingerprintJson(text) {
  const parsed = parseJsonValue(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Production fingerprint output must be a JSON object");
  }
  return parsed;
}

function catalogHasRelation(fingerprint, schema, table) {
  return (fingerprint.objects?.tables ?? []).some(
    (item) => item.schema === schema && item.name === table,
  );
}

function catalogHasColumn(fingerprint, schema, table, column) {
  return (fingerprint.objects?.columns ?? []).some(
    (item) =>
      item.schema === schema &&
      item.table === table &&
      item.name === column,
  );
}

function unavailableRecord(spec, status) {
  return {
    key: spec.key,
    schema: spec.schema,
    table: spec.table,
    column: spec.column,
    status,
    values: {},
  };
}

export function enrichOptionalCatalogEvidence(
  input,
  executeAllowlistedQuery,
) {
  const fingerprint = structuredClone(input);
  const distributions = OPTIONAL_STATE_DISTRIBUTIONS.map((spec) => {
    if (!catalogHasRelation(fingerprint, spec.schema, spec.table)) {
      return unavailableRecord(spec, "missing_relation");
    }
    if (
      !catalogHasColumn(
        fingerprint,
        spec.schema,
        spec.table,
        spec.column,
      )
    ) {
      return unavailableRecord(spec, "missing_column");
    }
    try {
      const values = executeAllowlistedQuery(spec.query, spec.key);
      return {
        ...unavailableRecord(spec, "available"),
        values:
          values && typeof values === "object" && !Array.isArray(values)
            ? values
            : {},
      };
    } catch {
      return unavailableRecord(spec, "unavailable");
    }
  });

  const migrationSpec = {
    schema: "supabase_migrations",
    table: "schema_migrations",
  };
  let migrationMetadata;
  if (
    !catalogHasRelation(
      fingerprint,
      migrationSpec.schema,
      migrationSpec.table,
    )
  ) {
    migrationMetadata = { status: "missing_relation", items: [] };
  } else if (
    !catalogHasColumn(
      fingerprint,
      migrationSpec.schema,
      migrationSpec.table,
      "version",
    )
  ) {
    migrationMetadata = { status: "missing_column", items: [] };
  } else {
    const hasName = catalogHasColumn(
      fingerprint,
      migrationSpec.schema,
      migrationSpec.table,
      "name",
    );
    try {
      const items = executeAllowlistedQuery(
        hasName
          ? MIGRATION_METADATA_WITH_NAME_QUERY
          : MIGRATION_METADATA_VERSION_ONLY_QUERY,
        "supabase_migrations.schema_migrations",
      );
      migrationMetadata = {
        status: "available",
        name_column_available: hasName,
        items: Array.isArray(items) ? items : [],
      };
    } catch {
      migrationMetadata = {
        status: "unavailable",
        name_column_available: hasName,
        items: [],
      };
    }
  }

  fingerprint.aggregates = {
    ...(fingerprint.aggregates ?? {}),
    selected_state_distributions: distributions,
  };
  fingerprint.migration_metadata = migrationMetadata;
  return fingerprint;
}

export function productionWritePerformedFromSafety(safety) {
  return !(
    safety?.transaction_read_only === true &&
    safety?.ddl_performed === false &&
    safety?.dml_performed === false
  );
}

export function validateProductionFingerprintDocument(input) {
  const errors = [];
  if (input?.schema_version !== FINGERPRINT_SCHEMA_VERSION) {
    errors.push("schema_version_mismatch");
  }
  if (
    input?.evidence?.evidence_kind !==
    PRODUCTION_READ_ONLY_EVIDENCE_KIND
  ) {
    errors.push("evidence_kind_mismatch");
  }
  if (input?.evidence?.environment !== "production") {
    errors.push("evidence_environment_mismatch");
  }
  if (input?.safety?.transaction_read_only !== true) {
    errors.push("transaction_read_only_not_true");
  }
  if (input?.safety?.ddl_performed !== false) {
    errors.push("ddl_performed_not_false");
  }
  if (input?.safety?.dml_performed !== false) {
    errors.push("dml_performed_not_false");
  }
  if (input?.safety?.row_body_dumped !== false) {
    errors.push("row_body_dumped_not_false");
  }

  let normalized = null;
  try {
    normalized = normalizeFingerprint(input);
  } catch {
    errors.push("fingerprint_normalization_failed");
  }
  if (normalized && !isProductionReadOnlyEvidence(normalized)) {
    errors.push("production_evidence_contract_failed");
  }

  return {
    passed: errors.length === 0,
    errors,
    normalized,
    production_write_performed: productionWritePerformedFromSafety(
      input?.safety,
    ),
  };
}

export function buildProductionExecutionReceipt({
  guard,
  fingerprint,
  outputByteCount,
}) {
  const validation = validateProductionFingerprintDocument(fingerprint);
  if (!validation.passed || validation.production_write_performed) {
    throw new Error(
      `Production fingerprint validation failed: ${validation.errors.join(", ")}`,
    );
  }
  return {
    passed: true,
    project_ref_match: guard.project_ref_match === true,
    confirmation_match: guard.confirmation_match === true,
    database_ref_match: guard.database_ref_match === true,
    transaction_read_only:
      validation.normalized.safety.transaction_read_only,
    ddl_performed: validation.normalized.safety.ddl_performed,
    dml_performed: validation.normalized.safety.dml_performed,
    row_body_dumped: validation.normalized.safety.row_body_dumped,
    fingerprint_sha256: validation.normalized.fingerprint_sha256,
    output_byte_count: outputByteCount,
    production_write_performed: validation.production_write_performed,
    credentials_printed: false,
  };
}
