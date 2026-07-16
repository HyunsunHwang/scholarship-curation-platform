import assert from "node:assert/strict";
import fs from "node:fs";
import {
  diffFingerprints,
  FINGERPRINT_SCHEMA_VERSION,
  normalizeFingerprint,
} from "../../lib/post-phase-n-q/fingerprint.mjs";
import {
  inspectApprovedNonproductionTarget,
  inspectProductionReadGate,
  PRODUCTION_READ_CONFIRMATION,
} from "../../lib/post-phase-n-q/safety.mjs";

function fingerprint(kind, tables) {
  return normalizeFingerprint({
    schema_version: FINGERPRINT_SCHEMA_VERSION,
    generated_at: "2026-07-16T00:00:00.000Z",
    evidence: {
      evidence_kind: kind,
      environment: kind,
      bounded_scope: "test",
    },
    objects: {
      tables,
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
  });
}

const production = fingerprint("synthetic", [
  { schema: "public", name: "shared", rls_enabled: false },
  { schema: "public", name: "production_only", rls_enabled: true },
]);
const nonproduction = fingerprint("database_nonproduction", [
  { schema: "public", name: "shared", rls_enabled: true },
  { schema: "public", name: "required", rls_enabled: true },
]);
const diff = diffFingerprints({
  production,
  nonproduction,
  productionEvidenceAvailable: false,
  target: {
    beta_required_objects: ["table:public.required"],
    owner_decision_objects: ["table:public.production_only"],
  },
});
assert.equal(diff.status, "CONDITIONAL_ON_PRODUCTION_FINGERPRINT");
assert.equal(diff.arithmetic_consistent, true);
assert.equal(
  diff.differences.find((item) => item.key === "table:public.required")
    ?.classification,
  "REQUIRED_FOR_BETA",
);
assert.equal(
  diff.differences.find((item) => item.key === "table:public.production_only")
    ?.classification,
  "OWNER_DECISION_REQUIRED",
);
assert.equal(
  diff.differences.find((item) => item.key === "table:public.shared")
    ?.classification,
  "COMPATIBILITY_REQUIRED",
);

const nonproductionGuard = inspectApprovedNonproductionTarget({
  POST_PHASE_N_TARGET_PROJECT_REF: "hrayfvdggbhfmmzfblly",
  NEXT_PUBLIC_SUPABASE_URL: "https://hrayfvdggbhfmmzfblly.supabase.co",
});
assert.equal(nonproductionGuard.safe, true);
assert.equal(
  inspectApprovedNonproductionTarget({
    POST_PHASE_N_TARGET_PROJECT_REF: "synwudnxdkybwihwmtak",
    NEXT_PUBLIC_SUPABASE_URL: "https://synwudnxdkybwihwmtak.supabase.co",
  }).safe,
  false,
);
assert.equal(inspectProductionReadGate({}).safe, false);
assert.equal(
  inspectProductionReadGate({
    POST_PHASE_N_PRODUCTION_READ: "true",
    POST_PHASE_N_PRODUCTION_PROJECT_REF: "synwudnxdkybwihwmtak",
    POST_PHASE_N_PRODUCTION_READ_CONFIRMATION: PRODUCTION_READ_CONFIRMATION,
    POST_PHASE_N_PRODUCTION_DATABASE_URL:
      "postgresql://example@db.synwudnxdkybwihwmtak.supabase.co:5432/postgres",
  }).safe,
  true,
);

const sql = fs
  .readFileSync(
    "supabase/post-phase-n-q/001_production_read_only_fingerprint.sql",
    "utf8",
  )
  .toLowerCase();
assert.match(sql, /begin transaction read only/);
assert.match(sql, /\nrollback;/);
assert.doesNotMatch(
  sql,
  /^\s*(insert|update|delete|create|alter|drop|truncate|call)\s+/m,
);
const nonproductionReport = JSON.parse(
  fs.readFileSync(
    "reports/post-phase-n-q/nonproduction-fingerprint.json",
    "utf8",
  ),
);
assert.equal(nonproductionReport.safety.production_access_performed, false);
assert.equal(
  nonproductionReport.aggregates.row_counts.filter((item) => item.reachable)
    .length,
  22,
);

console.log(JSON.stringify({
  passed: true,
  diff_classification_tested: true,
  production_gate_fail_closed: true,
  nonproduction_target_guard_tested: true,
  read_only_sql_tested: true,
  nonproduction_reachable_table_count: 22,
}, null, 2));
