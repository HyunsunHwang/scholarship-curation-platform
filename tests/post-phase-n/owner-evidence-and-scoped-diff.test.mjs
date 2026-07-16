import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FINGERPRINT_SCHEMA_VERSION,
  fingerprintHash,
  normalizeFingerprint,
  stableStringify,
} from "../../lib/post-phase-n-q/fingerprint.mjs";
import { validateOwnerProductionFingerprint } from "../../lib/post-phase-n-q/owner-evidence.mjs";
import { OPTIONAL_STATE_DISTRIBUTIONS } from "../../lib/post-phase-n-q/production-fingerprint-runner.mjs";
import { buildScopedMigrationReadiness } from "../../lib/post-phase-n-q/scoped-migration-diff.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const betaTarget = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, "fixtures/post-phase-n-q/beta-schema-target.json"),
    "utf8",
  ),
);

function fingerprint({ evidenceKind, environment, objects = {} }) {
  return {
    schema_version: FINGERPRINT_SCHEMA_VERSION,
    generated_at: "2026-07-17T00:00:00.000Z",
    evidence: {
      evidence_kind: evidenceKind,
      environment,
      bounded_scope: "synthetic test evidence",
    },
    objects: {
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
      ...objects,
    },
    aggregates: { selected_state_distributions: [] },
    migration_metadata: { status: "available", items: [] },
    safety: {
      transaction_read_only: true,
      ddl_performed: false,
      dml_performed: false,
      row_body_dumped: false,
    },
  };
}

const orderA = {
  metadata: { z: ["한글", "alpha"], a: "first" },
  values: [{ name: "z" }, { name: "a" }],
};
const orderB = {
  values: [{ name: "a" }, { name: "z" }],
  metadata: { a: "first", z: ["alpha", "한글"] },
};
const originalLocale = process.env.LC_ALL;
process.env.LC_ALL = "en_US";
const enUsCanonicalHash = fingerprintHash(orderA);
process.env.LC_ALL = "ko_KR";
const koKrCanonicalHash = fingerprintHash(orderB);
if (originalLocale === undefined) delete process.env.LC_ALL;
else process.env.LC_ALL = originalLocale;
assert.equal(enUsCanonicalHash, koKrCanonicalHash);
assert.equal(stableStringify(orderA), stableStringify(orderB));

assert.deepEqual(
  OPTIONAL_STATE_DISTRIBUTIONS.find(
    (item) => item.table === "notice_sources",
  ),
  {
    key: "notice_sources.enabled",
    schema: "public",
    table: "notice_sources",
    column: "enabled",
    query: OPTIONAL_STATE_DISTRIBUTIONS.find(
      (item) => item.table === "notice_sources",
    ).query,
  },
);

const ownerFingerprint = normalizeFingerprint(
  fingerprint({
    evidenceKind: "database_production_read_only",
    environment: "production",
    objects: {
      tables: [{ schema: "public", name: "owner_fixture", rls_enabled: true }],
    },
  }),
);
const legacyOwnerFingerprint = {
  ...ownerFingerprint,
  fingerprint_sha256: "f".repeat(64),
};
assert.notEqual(
  legacyOwnerFingerprint.fingerprint_sha256,
  fingerprintHash(legacyOwnerFingerprint),
);
const temporaryDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), "post-phase-n-owner-evidence-"),
);
try {
  const ownerPath = path.join(temporaryDirectory, "owner.json");
  const receiptPath = path.join(temporaryDirectory, "receipt.json");
  const ownerRaw = `${JSON.stringify(legacyOwnerFingerprint, null, 2)}\n`;
  fs.writeFileSync(ownerPath, ownerRaw, "utf8");
  fs.writeFileSync(
    receiptPath,
    `${JSON.stringify(
      {
        passed: true,
        transaction_read_only: true,
        ddl_performed: false,
        dml_performed: false,
        row_body_dumped: false,
        production_write_performed: false,
        credentials_printed: false,
        fingerprint_sha256: legacyOwnerFingerprint.fingerprint_sha256,
        output_byte_count: Buffer.byteLength(ownerRaw, "utf8"),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  const acceptance = validateOwnerProductionFingerprint({
    fingerprintPath: ownerPath,
    receiptPath,
  });
  assert.equal(acceptance.passed, true);
  assert.equal(acceptance.output_byte_count_match, true);
  assert.equal(acceptance.legacy_hash_consistent, true);
  assert.equal(acceptance.canonical_hash_matches_legacy, false);
  assert.equal(acceptance.obvious_credential_pattern_count, 0);
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}

const betaTables = betaTarget.beta_required_objects.map((key) => ({
  schema: "public",
  name: key.replace("table:public.", ""),
  rls_enabled: true,
}));
const production = fingerprint({
  evidenceKind: "database_production_read_only",
  environment: "production",
  objects: {
    tables: [
      ...betaTables,
      { schema: "auth", name: "managed_users", rls_enabled: true },
    ],
    columns: [
      { schema: "public", table: betaTables[0].name, name: "id" },
    ],
    constraints: [
      { schema: "public", table: betaTables[0].name, name: "owner_pk" },
    ],
    grants: [
      {
        schema: "public",
        table: betaTables[0].name,
        grantee: "authenticated",
        privilege: "SELECT",
      },
    ],
  },
});
const nonproduction = fingerprint({
  evidenceKind: "database_nonproduction",
  environment: "approved_nonproduction",
  objects: { tables: betaTables },
});
const scoped = buildScopedMigrationReadiness({
  production,
  nonproduction,
  target: betaTarget,
});
assert.equal(scoped.sanitized_summary.scope.schema, "public");
assert.equal(scoped.sanitized_summary.scope.excluded_counts_by_schema.auth, 1);
assert.equal(
  scoped.sanitized_summary.evidence_coverage_matrix.find(
    (entry) => entry.object_kind === "columns",
  ).status,
  "production_only_evidence",
);
assert.equal(
  scoped.sanitized_summary.classification_counts.UNEXPECTED_PRODUCTION_ONLY,
  0,
);
assert.equal(scoped.sanitized_summary.beta_required_table_status.length, 11);
assert.ok(
  scoped.sanitized_summary.beta_required_table_status.every(
    (entry) =>
      entry.present_in_production === true &&
      entry.present_in_nonproduction === true &&
      entry.target_classification === "REQUIRED_FOR_BETA",
  ),
);
assert.equal(scoped.sanitized_summary.migration_readiness, "CONDITIONAL");

console.log(
  JSON.stringify(
    {
      passed: true,
      locale_independent_canonical_hash: true,
      array_and_object_ordering_deterministic: true,
      owner_evidence_fixture_validated: true,
      legacy_hash_difference_recorded: true,
      optional_aggregate_enabled_spec: true,
      managed_schema_exclusion_tested: true,
      insufficient_evidence_not_overclassified: true,
      beta_required_table_matrix_count: 11,
      production_access_performed: false,
      production_execute_called: false,
      production_write_performed: false,
    },
    null,
    2,
  ),
);
