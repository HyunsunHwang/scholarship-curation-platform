import assert from "node:assert/strict";
import fs from "node:fs";

const workflow = fs.readFileSync(".github/workflows/crawl-scholarship-notices.yml", "utf8");
for (const group of ["ewha", "cau", "korea", "khu", "hanyang", "hongik", "yonsei", "skku", "uos"]) assert.match(workflow, new RegExp(`\\b${group}\\b`));
assert.match(workflow, /source_registry_mode:/);
assert.match(workflow, /"manifest:\$\{GROUP\}"/);
assert.match(workflow, /"db:\$\{GROUP\}"/);
assert.match(workflow, /Run university crawler \(Git manifest registry\)[\s\S]{0,3000}?node scripts\/crawl-scholarship-notices\.mjs "manifest:\$\{GROUP\}"/);
assert.doesNotMatch(workflow.match(/Run university crawler \(Git manifest registry\)[\s\S]*?Clean university crawl results/)?.[0] ?? "", /SUPABASE_(URL|SERVICE_ROLE_KEY)/);
assert.match(workflow, /\.crawler\/\$\{\{ matrix\.group \}\}-daily-state\.json/);
assert.match(workflow, /name: crawl-result-\$\{\{ matrix\.group \}\}/);
assert.match(workflow, /needs: crawl-by-university/);
assert.match(workflow, /SUPABASE_SERVICE_ROLE_KEY: \$\{\{ secrets\.SUPABASE_SERVICE_ROLE_KEY \}\}/);
console.log("manifest_workflow_tests_passed=1");
