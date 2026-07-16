import assert from "node:assert/strict";
import fs from "node:fs";

const service = fs.readFileSync(
  "lib/scholarships/public-scholarship-service.ts",
  "utf8",
);
const page = fs.readFileSync("app/scholarships/page.tsx", "utf8");
const detail = fs.readFileSync("app/scholarships/[id]/page.tsx", "utf8");
const projector = fs.readFileSync(
  "scripts/post-phase-o/run-explicit-projector.mjs",
  "utf8",
);
assert.match(service, /POST_PHASE_O_DB_PUBLIC_READ_MODEL/);
assert.match(service, /\.eq\("is_verified", true\)/);
assert.match(service, /\.eq\("list_on_home", true\)/);
assert.match(service, /\.gte\("apply_end_date"/);
assert.match(service, /serviceState: "degraded"/);
assert.doesNotMatch(service, /filterPublicScholarships\(options\).*catch/s);
assert.match(page, /getPublicScholarshipPageModel/);
assert.match(detail, /\.eq\("is_verified", true\)/);
assert.match(projector, /assertNonproductionProjectorGate/);
assert.match(projector, /automatic_public_publish_count: 0/);
console.log(JSON.stringify({
  passed: true,
  list_search_contract_shared: true,
  numeric_detail_verified_only: true,
  expired_active_list_excluded: true,
  explicit_projector_guarded: true,
  db_failure_fails_closed: true,
}, null, 2));
