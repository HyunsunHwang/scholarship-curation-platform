import assert from "node:assert/strict";
import fs from "node:fs";

const plan = JSON.parse(
  fs.readFileSync("reports/post-phase-n-q/migration-plan.json", "utf8"),
);
assert.equal(plan.status, "CONDITIONAL_ON_PRODUCTION_FINGERPRINT");
assert.equal(plan.production_migration_authorized, false);
assert.equal(plan.stages.length, 7);
for (const stage of plan.stages) {
  for (const field of [
    "precondition",
    "affected_objects",
    "expected_lock_risk",
    "compatibility_risk",
    "expected_row_impact",
    "idempotence",
    "rerun_behavior",
    "verification",
    "rollback",
    "irreversible_aspects",
    "owner",
  ]) {
    assert.notEqual(stage[field], undefined, `${stage.name} missing ${field}`);
  }
}
console.log(JSON.stringify({
  passed: true,
  migration_stage_count: plan.stages.length,
  production_migration_authorized: false,
}, null, 2));
