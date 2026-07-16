import fs from "node:fs";
import path from "node:path";
import { normalizeFingerprint } from "../../lib/post-phase-n-q/fingerprint.mjs";

const ROOT = process.cwd();
const nonproduction = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, "reports/post-phase-n-q/nonproduction-fingerprint.json"),
    "utf8",
  ),
);
const fixture = structuredClone(nonproduction);
delete fixture.fingerprint_sha256;
fixture.generated_at = "2026-07-16T00:00:00.000Z";
fixture.evidence = {
  evidence_kind: "synthetic",
  environment: "synthetic_production_fixture",
  bounded_scope: "diff-engine test only",
  command: "node scripts/post-phase-n/build-synthetic-production-fixture.mjs",
  report_path: "fixtures/post-phase-n-q/production-fingerprint.synthetic.json",
  limitations: [
    "This fixture is not production evidence.",
    "It exists only to exercise deterministic diff classification.",
  ],
};
fixture.project = {
  project_ref: "synthetic-production",
  environment_kind: "synthetic",
  automatic_public_publish_enabled: false,
  guard_verified: false,
};
fixture.objects.tables = fixture.objects.tables
  .filter((item) => item.name !== "ingestion_notice_assets")
  .map((item) =>
    item.name === "scholarships" ? { ...item, rls_enabled: false } : item,
  );
fixture.objects.tables.push({
  schema: "public",
  name: "legacy_production_only",
  rls_enabled: true,
  definition_source: "synthetic_fixture",
});
fixture.aggregates = { row_counts: [], state_distributions: [] };
fixture.safety = {
  synthetic_fixture: true,
  production_access_performed: false,
  production_read_performed: false,
  production_write_performed: false,
};

const normalized = normalizeFingerprint(fixture);
fs.writeFileSync(
  path.join(ROOT, "fixtures/post-phase-n-q/production-fingerprint.synthetic.json"),
  `${JSON.stringify(normalized, null, 2)}\n`,
  "utf8",
);
console.log(JSON.stringify({
  passed: true,
  evidence_kind: "synthetic",
  production_access_performed: false,
  output_path: "fixtures/post-phase-n-q/production-fingerprint.synthetic.json",
}, null, 2));
