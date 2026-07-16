import fs from "node:fs";
import path from "node:path";
import { buildBetaCohort } from "../../lib/post-phase-n-q/beta-cohort.mjs";

const ROOT = process.cwd();
const output = path.join(ROOT, "reports/post-phase-n-q/beta-source-cohort.json");
const cohort = {
  generated_at: new Date().toISOString(),
  ...buildBetaCohort(),
  production_access_performed: false,
  crawl_performed: false,
};
fs.writeFileSync(output, `${JSON.stringify(cohort, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  passed: cohort.exact_source_resolution_passed,
  source_count: cohort.source_count,
  additional_source_count: cohort.additional_source_count,
  output_path: "reports/post-phase-n-q/beta-source-cohort.json",
}, null, 2));
if (!cohort.exact_source_resolution_passed) process.exitCode = 1;
