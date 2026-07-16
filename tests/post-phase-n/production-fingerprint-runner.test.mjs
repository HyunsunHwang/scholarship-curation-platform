import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  diffFingerprints,
  FINGERPRINT_SCHEMA_VERSION,
  isProductionReadOnlyEvidence,
  normalizeFingerprint,
  PRODUCTION_READ_ONLY_EVIDENCE_KIND,
} from "../../lib/post-phase-n-q/fingerprint.mjs";
import {
  buildProductionExecutionReceipt,
  enrichOptionalCatalogEvidence,
  parseFingerprintJson,
  productionWritePerformedFromSafety,
  validateProductionFingerprintDocument,
} from "../../lib/post-phase-n-q/production-fingerprint-runner.mjs";
import {
  extractSupabaseProjectRef,
  inspectProductionReadGate,
  PRODUCTION_READ_CONFIRMATION,
} from "../../lib/post-phase-n-q/safety.mjs";
import {
  buildPsqlArguments,
  buildPsqlEnvironment,
  runProductionFingerprint,
} from "../../scripts/post-phase-n/run-production-read-only-fingerprint.mjs";

const PRODUCTION_REF = "synwudnxdkybwihwmtak";
const NONPRODUCTION_REF = "hrayfvdggbhfmmzfblly";

function fixtureDatabaseUrl({
  protocol = "postgres:",
  username,
  hostname,
  port = "5432",
  password = "fixture-password",
  database = "postgres",
  sslmode = "",
}) {
  const url = new URL(`${protocol}//${hostname}/${database}`);
  url.username = username;
  url.password = password;
  url.port = port;
  if (sslmode) url.searchParams.set("sslmode", sslmode);
  return url.href;
}

const DIRECT_DATABASE_URL = fixtureDatabaseUrl({
  protocol: "postgresql:",
  username: "postgres",
  hostname: `db.${PRODUCTION_REF}.supabase.co`,
});
const SESSION_POOLER_HOST =
  "aws-0-ap-northeast-2.pooler.supabase.com";
const SESSION_POOLER_DATABASE_URL = fixtureDatabaseUrl({
  username: `postgres.${PRODUCTION_REF}`,
  hostname: SESSION_POOLER_HOST,
});

function productionFingerprint(overrides = {}) {
  const base = {
    schema_version: FINGERPRINT_SCHEMA_VERSION,
    generated_at: "2026-07-16T00:00:00.000Z",
    evidence: {
      evidence_kind: PRODUCTION_READ_ONLY_EVIDENCE_KIND,
      environment: "production",
      bounded_scope: "test",
      limitations: ["No row bodies."],
    },
    objects: {
      schemas: [{ name: "public" }],
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
    },
    aggregates: {
      selected_state_distributions: [],
    },
    migration_metadata: {
      status: "pending_runner_catalog_check",
      items: [],
    },
    safety: {
      transaction_read_only: true,
      ddl_performed: false,
      dml_performed: false,
      row_body_dumped: false,
    },
  };
  return {
    ...base,
    ...overrides,
    evidence: { ...base.evidence, ...(overrides.evidence ?? {}) },
    objects: { ...base.objects, ...(overrides.objects ?? {}) },
    safety: { ...base.safety, ...(overrides.safety ?? {}) },
  };
}

const validGateEnvironment = {
  POST_PHASE_N_PRODUCTION_READ: "true",
  POST_PHASE_N_PRODUCTION_PROJECT_REF: PRODUCTION_REF,
  POST_PHASE_N_PRODUCTION_READ_CONFIRMATION: PRODUCTION_READ_CONFIRMATION,
  POST_PHASE_N_PRODUCTION_DATABASE_URL: DIRECT_DATABASE_URL,
};

assert.equal(
  extractSupabaseProjectRef(DIRECT_DATABASE_URL),
  PRODUCTION_REF,
);
assert.equal(
  extractSupabaseProjectRef(SESSION_POOLER_DATABASE_URL),
  PRODUCTION_REF,
);
assert.equal(
  extractSupabaseProjectRef(
    fixtureDatabaseUrl({
      username: `postgres.${PRODUCTION_REF}`,
      hostname: SESSION_POOLER_HOST,
      port: "",
    }),
  ),
  PRODUCTION_REF,
);
assert.equal(inspectProductionReadGate({}).safe, false);
assert.ok(
  inspectProductionReadGate({}).errors.includes(
    "production_read_flag_missing",
  ),
);
assert.ok(
  inspectProductionReadGate({
    ...validGateEnvironment,
    POST_PHASE_N_PRODUCTION_PROJECT_REF: "wrong-project",
  }).errors.includes("production_project_ref_mismatch"),
);
assert.ok(
  inspectProductionReadGate({
    ...validGateEnvironment,
    POST_PHASE_N_PRODUCTION_READ_CONFIRMATION: "wrong-confirmation",
  }).errors.includes("production_read_confirmation_mismatch"),
);
assert.ok(
  inspectProductionReadGate({
    ...validGateEnvironment,
    POST_PHASE_N_PRODUCTION_DATABASE_URL:
      "postgresql://owner@db.wrongproject.supabase.co:5432/postgres",
  }).errors.includes("production_database_url_ref_mismatch"),
);
assert.equal(inspectProductionReadGate(validGateEnvironment).safe, true);
const validSessionPoolerEnvironment = {
  ...validGateEnvironment,
  POST_PHASE_N_PRODUCTION_DATABASE_URL: SESSION_POOLER_DATABASE_URL,
};
const validSessionPoolerGate = inspectProductionReadGate(
  validSessionPoolerEnvironment,
);
assert.equal(validSessionPoolerGate.safe, true);
assert.equal(validSessionPoolerGate.database_ref_match, true);
assert.equal(
  JSON.stringify(validSessionPoolerGate).includes(
    SESSION_POOLER_DATABASE_URL,
  ),
  false,
);

const invalidSessionPoolerUrls = [
  fixtureDatabaseUrl({
    username: `postgres.${NONPRODUCTION_REF}`,
    hostname: SESSION_POOLER_HOST,
  }),
  fixtureDatabaseUrl({
    username: "postgres.wrongproject",
    hostname: SESSION_POOLER_HOST,
  }),
  fixtureDatabaseUrl({
    username: `postgres.${PRODUCTION_REF}`,
    hostname: `${SESSION_POOLER_HOST}.evil.example`,
  }),
  fixtureDatabaseUrl({
    username: "postgres",
    hostname: SESSION_POOLER_HOST,
  }),
  fixtureDatabaseUrl({
    username: `postgres.${PRODUCTION_REF}`,
    hostname: SESSION_POOLER_HOST,
    port: "6543",
  }),
];
for (const databaseUrl of invalidSessionPoolerUrls) {
  const gate = inspectProductionReadGate({
    ...validGateEnvironment,
    POST_PHASE_N_PRODUCTION_DATABASE_URL: databaseUrl,
  });
  assert.equal(gate.safe, false);
  assert.ok(gate.errors.includes("production_database_url_ref_mismatch"));
}

const childEnvironment = buildPsqlEnvironment({
  ...validGateEnvironment,
  PATH: "test-path",
  PGSSLMODE: "verify-full",
  PGPASSWORD: "parent-password-must-not-forward",
  SUPABASE_SERVICE_ROLE_KEY: "must-not-be-forwarded",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "must-not-be-forwarded",
  NEXT_PUBLIC_SUPABASE_URL: "https://nonproduction.example",
});
assert.equal(childEnvironment.PGHOST, `db.${PRODUCTION_REF}.supabase.co`);
assert.equal(childEnvironment.PGPORT, "5432");
assert.equal(childEnvironment.PGUSER, "postgres");
assert.equal(childEnvironment.PGPASSWORD, "fixture-password");
assert.equal(childEnvironment.PGDATABASE, "postgres");
assert.equal(childEnvironment.PGSSLMODE, "verify-full");
assert.equal(
  childEnvironment.PGDATABASE.includes("postgresql:"),
  false,
);
assert.equal(
  childEnvironment.POST_PHASE_N_PRODUCTION_DATABASE_URL,
  undefined,
);
assert.equal(childEnvironment.SUPABASE_SERVICE_ROLE_KEY, undefined);
assert.equal(childEnvironment.NEXT_PUBLIC_SUPABASE_ANON_KEY, undefined);
assert.equal(childEnvironment.NEXT_PUBLIC_SUPABASE_URL, undefined);

const sessionPoolerChildEnvironment = buildPsqlEnvironment({
  ...validSessionPoolerEnvironment,
  POST_PHASE_N_PRODUCTION_DATABASE_URL: fixtureDatabaseUrl({
    username: `postgres.${PRODUCTION_REF}`,
    hostname: SESSION_POOLER_HOST,
    sslmode: "require",
  }),
  PGSSLMODE: "verify-full",
});
assert.deepEqual(
  {
    host: sessionPoolerChildEnvironment.PGHOST,
    port: sessionPoolerChildEnvironment.PGPORT,
    user: sessionPoolerChildEnvironment.PGUSER,
    password: sessionPoolerChildEnvironment.PGPASSWORD,
    database: sessionPoolerChildEnvironment.PGDATABASE,
    sslmode: sessionPoolerChildEnvironment.PGSSLMODE,
  },
  {
    host: SESSION_POOLER_HOST,
    port: "5432",
    user: `postgres.${PRODUCTION_REF}`,
    password: "fixture-password",
    database: "postgres",
    sslmode: "require",
  },
);

const encodedUsername = "encoded user";
const encodedPassword = "fixture password/+";
const encodedChildEnvironment = buildPsqlEnvironment({
  POST_PHASE_N_PRODUCTION_DATABASE_URL: fixtureDatabaseUrl({
    username: encodedUsername,
    password: encodedPassword,
    hostname: `db.${PRODUCTION_REF}.supabase.co`,
  }),
});
assert.equal(encodedChildEnvironment.PGUSER, encodedUsername);
assert.equal(encodedChildEnvironment.PGPASSWORD, encodedPassword);

const psqlArguments = buildPsqlArguments(["--file", "fixture.sql"]);
const serializedPsqlArguments = JSON.stringify(psqlArguments);
assert.equal(psqlArguments.includes("--dbname"), false);
assert.equal(serializedPsqlArguments.includes(DIRECT_DATABASE_URL), false);
assert.equal(serializedPsqlArguments.includes("fixture-password"), false);

const invalidConnectionCases = [
  {
    url: "not-a-connection-url",
    error: /connection URL is invalid/iu,
  },
  {
    url: fixtureDatabaseUrl({
      protocol: "https:",
      username: "postgres",
      hostname: `db.${PRODUCTION_REF}.supabase.co`,
    }),
    error: /protocol is unsupported/iu,
  },
  {
    url: "postgres:///postgres",
    error: /hostname is missing|connection URL is invalid/iu,
  },
  {
    url: fixtureDatabaseUrl({
      username: "",
      hostname: `db.${PRODUCTION_REF}.supabase.co`,
    }),
    error: /username is missing/iu,
  },
  {
    url: fixtureDatabaseUrl({
      username: "postgres",
      password: "",
      hostname: `db.${PRODUCTION_REF}.supabase.co`,
    }),
    error: /password is missing/iu,
  },
  {
    url: fixtureDatabaseUrl({
      username: "postgres",
      hostname: `db.${PRODUCTION_REF}.supabase.co`,
      database: "",
    }),
    error: /database name is missing/iu,
  },
  {
    url: fixtureDatabaseUrl({
      username: "postgres",
      hostname: `db.${PRODUCTION_REF}.supabase.co`,
      sslmode: "unsafe-mode",
    }),
    error: /sslmode is unsupported/iu,
  },
];
for (const testCase of invalidConnectionCases) {
  assert.throws(
    () =>
      buildPsqlEnvironment({
        POST_PHASE_N_PRODUCTION_DATABASE_URL: testCase.url,
      }),
    testCase.error,
  );
}

function snapshotExistingEvidence(file) {
  if (!fs.existsSync(file)) return null;
  const contents = fs.readFileSync(file);
  return {
    byte_count: contents.length,
    sha256: crypto.createHash("sha256").update(contents).digest("hex"),
  };
}

const ownerEvidencePaths = [
  path.join(
    process.cwd(),
    "reports/post-phase-n-q/production-fingerprint-owner-output.json",
  ),
  path.join(
    process.cwd(),
    "reports/post-phase-n-q/production-fingerprint-execution-receipt.json",
  ),
];
const ownerEvidenceBefore = ownerEvidencePaths.map(snapshotExistingEvidence);
const temporaryEvidenceDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), "post-phase-n-fingerprint-runner-"),
);
const staleEvidencePaths = {
  outputPath: path.join(
    temporaryEvidenceDirectory,
    "production-fingerprint-owner-output.json",
  ),
  receiptPath: path.join(
    temporaryEvidenceDirectory,
    "production-fingerprint-execution-receipt.json",
  ),
};
let gateFailureExecuteCallCount = 0;
try {
  for (const evidencePath of Object.values(staleEvidencePaths)) {
    fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
    fs.writeFileSync(evidencePath, '{"stale":true}\n', "utf8");
  }
  assert.throws(
    () =>
      runProductionFingerprint({
        env: {},
        execute: () => {
          gateFailureExecuteCallCount += 1;
          throw new Error("execute must not run when the production gate fails");
        },
        evidencePaths: staleEvidencePaths,
      }),
    /production read gate blocked/iu,
  );
  for (const evidencePath of Object.values(staleEvidencePaths)) {
    assert.equal(fs.existsSync(evidencePath), false);
  }
  assert.equal(gateFailureExecuteCallCount, 0);
} finally {
  fs.rmSync(temporaryEvidenceDirectory, { recursive: true, force: true });
}

let connectionFailureExecuteCallCount = 0;
const directUrlWithoutPassword = fixtureDatabaseUrl({
  username: "postgres",
  password: "",
  hostname: `db.${PRODUCTION_REF}.supabase.co`,
});
assert.throws(
  () =>
    runProductionFingerprint({
      env: {
        ...validGateEnvironment,
        POST_PHASE_N_PRODUCTION_DATABASE_URL: directUrlWithoutPassword,
      },
      execute: () => {
        connectionFailureExecuteCallCount += 1;
        throw new Error("execute must not run for invalid connection input");
      },
      evidencePaths: staleEvidencePaths,
    }),
  /password is missing/iu,
);
assert.equal(connectionFailureExecuteCallCount, 0);

let projectRefMismatchExecuteCallCount = 0;
assert.throws(
  () =>
    runProductionFingerprint({
      env: {
        ...validGateEnvironment,
        POST_PHASE_N_PRODUCTION_DATABASE_URL: fixtureDatabaseUrl({
          username: `postgres.${NONPRODUCTION_REF}`,
          hostname: SESSION_POOLER_HOST,
        }),
      },
      execute: () => {
        projectRefMismatchExecuteCallCount += 1;
        throw new Error("execute must not run for project ref mismatch");
      },
      evidencePaths: staleEvidencePaths,
    }),
  /production_database_url_ref_mismatch/iu,
);
assert.equal(projectRefMismatchExecuteCallCount, 0);

assert.throws(
  () => parseFingerprintJson("{not-json"),
  /not valid JSON/,
);
const mockedCommandOutput = JSON.stringify(productionFingerprint());
assert.equal(
  parseFingerprintJson(mockedCommandOutput).schema_version,
  FINGERPRINT_SCHEMA_VERSION,
);

const ownerPending = productionFingerprint({
  evidence: { evidence_kind: "owner_pending" },
});
const synthetic = productionFingerprint({
  evidence: {
    evidence_kind: "synthetic",
    environment: "synthetic_production_fixture",
  },
});
assert.equal(isProductionReadOnlyEvidence(ownerPending), false);
assert.equal(isProductionReadOnlyEvidence(synthetic), false);
assert.equal(
  diffFingerprints({
    production: ownerPending,
    nonproduction: productionFingerprint({
      evidence: {
        evidence_kind: "database_nonproduction",
        environment: "approved_nonproduction",
      },
    }),
  }).production_fingerprint_available,
  false,
);
assert.equal(
  diffFingerprints({
    production: synthetic,
    nonproduction: productionFingerprint({
      evidence: {
        evidence_kind: "database_nonproduction",
        environment: "approved_nonproduction",
      },
    }),
  }).production_fingerprint_available,
  false,
);

for (const [field, value, expectedError] of [
  ["transaction_read_only", false, "transaction_read_only_not_true"],
  ["ddl_performed", true, "ddl_performed_not_false"],
  ["dml_performed", true, "dml_performed_not_false"],
  ["row_body_dumped", true, "row_body_dumped_not_false"],
]) {
  const validation = validateProductionFingerprintDocument(
    productionFingerprint({ safety: { [field]: value } }),
  );
  assert.equal(validation.passed, false);
  assert.ok(validation.errors.includes(expectedError));
}

const missingOptional = enrichOptionalCatalogEvidence(
  productionFingerprint(),
  () => {
    throw new Error("Optional executor must not run for missing relations");
  },
);
assert.equal(
  validateProductionFingerprintDocument(missingOptional).passed,
  true,
);
assert.equal(missingOptional.migration_metadata.status, "missing_relation");
assert.ok(
  missingOptional.aggregates.selected_state_distributions.every(
    (item) => item.status === "missing_relation",
  ),
);

const partialCatalog = productionFingerprint({
  objects: {
    schemas: [
      { name: "public" },
      { name: "supabase_migrations" },
    ],
    tables: [
      { schema: "public", name: "scholarships", rls_enabled: true },
      {
        schema: "supabase_migrations",
        name: "schema_migrations",
        rls_enabled: false,
      },
    ],
    columns: [
      {
        schema: "public",
        table: "scholarships",
        name: "is_verified",
      },
      {
        schema: "supabase_migrations",
        table: "schema_migrations",
        name: "version",
      },
    ],
  },
});
const optionalUnavailable = enrichOptionalCatalogEvidence(
  partialCatalog,
  (_query, key) => {
    if (key === "scholarships.is_verified") {
      throw new Error("permission denied");
    }
    if (key === "supabase_migrations.schema_migrations") {
      return [{ version: "1", name: null }];
    }
    return {};
  },
);
assert.equal(
  optionalUnavailable.aggregates.selected_state_distributions.find(
    (item) => item.key === "scholarships.is_verified",
  ).status,
  "unavailable",
);
assert.equal(optionalUnavailable.migration_metadata.status, "available");
assert.equal(
  optionalUnavailable.migration_metadata.name_column_available,
  false,
);

const valid = normalizeFingerprint(optionalUnavailable);
assert.equal(
  normalizeFingerprint(valid).fingerprint_sha256,
  valid.fingerprint_sha256,
);
const validResult = validateProductionFingerprintDocument(valid);
assert.equal(validResult.passed, true);
assert.equal(isProductionReadOnlyEvidence(valid), true);
assert.equal(
  diffFingerprints({
    production: valid,
    nonproduction: productionFingerprint({
      evidence: {
        evidence_kind: "database_nonproduction",
        environment: "approved_nonproduction",
      },
    }),
  }).status,
  "READY_FOR_OWNER_REVIEW",
);
assert.equal(
  productionWritePerformedFromSafety(valid.safety),
  false,
);
const receipt = buildProductionExecutionReceipt({
  guard: validSessionPoolerGate,
  fingerprint: valid,
  outputByteCount: 1234,
});
assert.deepEqual(
  {
    passed: receipt.passed,
    project_ref_match: receipt.project_ref_match,
    confirmation_match: receipt.confirmation_match,
    database_ref_match: receipt.database_ref_match,
    production_write_performed: receipt.production_write_performed,
    credentials_printed: receipt.credentials_printed,
  },
  {
    passed: true,
    project_ref_match: true,
    confirmation_match: true,
    database_ref_match: true,
    production_write_performed: false,
    credentials_printed: false,
  },
);
assert.equal(receipt.fingerprint_sha256, valid.fingerprint_sha256);
assert.equal(
  JSON.stringify(receipt).includes(SESSION_POOLER_DATABASE_URL),
  false,
);
assert.equal(
  JSON.stringify(receipt).includes("fixture-password"),
  false,
);

const sql = fs.readFileSync(
  "supabase/post-phase-n-q/001_production_read_only_fingerprint.sql",
  "utf8",
);
for (const forbidden of [
  "supabase_migrations.schema_migrations",
  "public.scholarships",
  "public.crawled_notices",
  "public.notice_sources",
  "digest(",
]) {
  assert.equal(sql.includes(forbidden), false, `SQL contains ${forbidden}`);
}
for (const required of [
  "pg_namespace",
  "pg_class",
  "information_schema.columns",
  "pg_constraint",
  "pg_indexes",
  "pg_policies",
  "role_table_grants",
  "pg_proc",
  "pg_trigger",
  "pg_views",
  "pg_matviews",
]) {
  assert.ok(sql.includes(required), `SQL missing ${required}`);
}

const runnerSources = [
  "lib/post-phase-n-q/production-fingerprint-runner.mjs",
  "scripts/post-phase-n/run-production-read-only-fingerprint.mjs",
]
  .map((file) => fs.readFileSync(file, "utf8"))
  .join("\n");
assert.match(
  runnerSources,
  /production-fingerprint-owner-output\.json/,
);
assert.match(
  runnerSources,
  /production-fingerprint-execution-receipt\.json/,
);
assert.doesNotMatch(
  runnerSources,
  /NODE_TLS_REJECT_UNAUTHORIZED|rejectUnauthorized\s*:\s*false/,
);
assert.doesNotMatch(
  runnerSources,
  /console\.log\([^)]*POST_PHASE_N_PRODUCTION_DATABASE_URL/s,
);
assert.doesNotMatch(runnerSources, /--dbname/);

const testEvidence = {
  passed: true,
  production_gate_failures_tested: 4,
  malformed_json_fail_closed: true,
  evidence_kind_validation_tested: true,
  read_only_safety_failures_tested: 4,
  missing_optional_relation_passed: true,
  optional_unavailable_recorded: true,
  valid_production_evidence_passed: true,
  stale_evidence_gate_failure_tested: true,
  execute_not_called_on_gate_failure:
    gateFailureExecuteCallCount === 0,
  direct_url_project_ref_tested: true,
  session_pooler_project_ref_tested: true,
  session_pooler_negative_security_case_count:
    invalidSessionPoolerUrls.length,
  session_pooler_credential_redaction_tested: true,
  direct_libpq_decomposition_tested: true,
  session_pooler_libpq_decomposition_tested: true,
  pgdatabase_is_database_name: childEnvironment.PGDATABASE === "postgres",
  psql_arguments_secret_free: true,
  encoded_credentials_decoded: true,
  sslmode_mapping_tested: true,
  connection_validation_failure_count: invalidConnectionCases.length,
  connection_validation_execute_not_called:
    connectionFailureExecuteCallCount === 0,
  project_ref_mismatch_execute_not_called:
    projectRefMismatchExecuteCallCount === 0,
  owner_evidence_preserved_if_present: true,
  production_execute_called:
    gateFailureExecuteCallCount +
      connectionFailureExecuteCallCount +
      projectRefMismatchExecuteCallCount >
    0,
  production_access_performed: false,
};
const serializedTestEvidence = JSON.stringify(testEvidence, null, 2);
assert.equal(serializedTestEvidence.includes("fixture-password"), false);
assert.equal(serializedTestEvidence.includes(DIRECT_DATABASE_URL), false);
assert.equal(
  serializedTestEvidence.includes(SESSION_POOLER_DATABASE_URL),
  false,
);
assert.deepEqual(
  ownerEvidencePaths.map(snapshotExistingEvidence),
  ownerEvidenceBefore,
);
console.log(serializedTestEvidence);
