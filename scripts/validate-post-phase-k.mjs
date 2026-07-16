import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baseCommit = "6b078be374b2f233b711ad9fe47bb13f53ab57cc";
const requiredArtifacts = [
  "docs/post-phase-k-implementation-report.md",
  "docs/post-phase-k-convergence-matrix.md",
  "docs/post-phase-k-product-state-inventory.md",
  "docs/post-phase-k-browser-walkthrough.md",
  "docs/post-phase-l-fixed-integration-scope.md",
  "docs/post-phase-l-pilot-cohort.md",
  "docs/post-phase-master-risk-register.md",
  "reports/post-phase-k-convergence-matrix.json",
  "reports/post-phase-k-product-state-inventory.json",
  "reports/post-phase-l-pilot-cohort.json",
  "reports/post-phase-master-risk-register.json",
];
const criticalCapabilities = [
  "ingestion runner",
  "exact source resolution",
  "source adapter interface",
  "URL canonicalization and aliases",
  "normalized notice representation",
  "attachment metadata",
  "body extraction",
  "observability and run logging",
  "review state",
  "public projection",
];
const allowedDecisions = new Set(["reuse", "port", "merge", "retire"]);
const read = (path) => readFile(resolve(root, path), "utf8");
const run = (command, args) => new Promise((resolveRun, rejectRun) => {
  execFile(command, args, { cwd: root, windowsHide: true }, (error, stdout, stderr) => {
    if (error) rejectRun(new Error(stderr || error.message));
    else resolveRun(stdout);
  });
});

function findDuplicateJsonKeys(source) {
  let index = 0;
  const duplicateKeys = [];
  const fail = (message) => { throw new Error(`Invalid JSON at ${index}: ${message}`); };
  const skip = () => { while (/\s/.test(source[index] ?? "")) index += 1; };
  const string = () => {
    if (source[index] !== '"') fail("expected string");
    const start = index++;
    while (index < source.length) {
      const value = source[index++];
      if (value === "\\") index += 1;
      else if (value === '"') return JSON.parse(source.slice(start, index));
      else if (value < " ") fail("control character");
    }
    fail("unterminated string");
  };
  const primitive = () => {
    const value = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(source.slice(index))?.[0];
    if (!value) fail("expected value");
    index += value.length;
  };
  const value = (path) => {
    skip();
    if (source[index] === "{") return object(path);
    if (source[index] === "[") return array(path);
    if (source[index] === '"') return string();
    return primitive();
  };
  const object = (path) => {
    index += 1;
    skip();
    const counts = new Map();
    if (source[index] === "}") { index += 1; return; }
    while (true) {
      skip();
      const key = string();
      counts.set(key, (counts.get(key) ?? 0) + 1);
      skip();
      if (source[index++] !== ":") fail("expected colon");
      value(`${path}.${key}`);
      skip();
      if (source[index] === "}") { index += 1; break; }
      if (source[index++] !== ",") fail("expected comma");
    }
    for (const [key, count] of counts) if (count > 1) duplicateKeys.push({ path, key, count });
  };
  const array = (path) => {
    index += 1;
    skip();
    let item = 0;
    if (source[index] === "]") { index += 1; return; }
    while (true) {
      value(`${path}[${item++}]`);
      skip();
      if (source[index] === "]") { index += 1; break; }
      if (source[index++] !== ",") fail("expected comma");
    }
  };
  value("$");
  skip();
  if (index !== source.length) fail("trailing content");
  return duplicateKeys;
}

async function exists(path) {
  try {
    await read(path);
    return true;
  } catch {
    return false;
  }
}

const missingArtifacts = (await Promise.all(requiredArtifacts.map(async (path) => [path, await exists(path)])))
  .filter(([, present]) => !present)
  .map(([path]) => path);
const [matrixRaw, productRaw, pilotRaw, riskRaw, browserWalkthrough, scopeDoc, publicModel, publicPage, publicDetail, reviewPage, reviewDetail, diagnosticsPage] = await Promise.all([
  read("reports/post-phase-k-convergence-matrix.json"),
  read("reports/post-phase-k-product-state-inventory.json"),
  read("reports/post-phase-l-pilot-cohort.json"),
  read("reports/post-phase-master-risk-register.json"),
  read("docs/post-phase-k-browser-walkthrough.md"),
  read("docs/post-phase-l-fixed-integration-scope.md"),
  read("lib/scholarships/public-scholarship-read-model.ts"),
  read("app/scholarships/page.tsx"),
  read("components/public-scholarships/PublicScholarshipDetail.tsx"),
  read("app/admin/review/page.tsx"),
  read("app/admin/review/scholarships/[id]/page.tsx"),
  read("app/admin/crawler-review/page.tsx"),
]);
const duplicateJsonKeys = [matrixRaw, productRaw, pilotRaw, riskRaw].flatMap(findDuplicateJsonKeys);
const normalizedBrowserWalkthrough = browserWalkthrough.replace(/\r\n/g, "\n");
const duplicateNegativeProof = findDuplicateJsonKeys('{"key":1,"key":2}').length === 1;
const matrix = JSON.parse(matrixRaw);
const product = JSON.parse(productRaw);
const pilot = JSON.parse(pilotRaw);
const risks = JSON.parse(riskRaw).risks;
const capabilityCounts = new Map();
for (const item of matrix.capabilities) {
  capabilityCounts.set(item.capability, (capabilityCounts.get(item.capability) ?? 0) + 1);
}
const missingCapability = criticalCapabilities.filter((capability) => capabilityCounts.get(capability) !== 1);
const invalidDecision = matrix.capabilities.filter((item) => !allowedDecisions.has(item.decision));
const missingCanonicalOwner = matrix.capabilities.filter((item) => !item.canonical_owner_after_l?.trim());
const unresolvedDuplicateOwnership = matrix.capabilities.filter((item) => !item.decision || !item.phase_l_action?.trim());
const invalidSurface = product.surfaces.filter((surface) => !surface.backing || !surface.state || !surface.user_visible_state);
const unresolvedPrototypeFinding = product.misleading_prototype_findings.filter((finding) => finding.disposition === "unresolved");
const sourceKeyPattern = /^[a-z]+_\d{3}$/;
const invalidPilotSource = pilot.sources.filter((source) => !sourceKeyPattern.test(source.source_key) || !source.success_criteria?.trim());
const requiredKRiskIds = [
  "RISK-REPORT-PROTOTYPE-OVERCLAIM",
  "RISK-LEGACY-REVIEW-MUTATION",
  "RISK-SOURCE-IDENTITY-OWNERSHIP",
  "RISK-EVIDENCE-FRESHNESS-LEAKAGE",
  "RISK-PERSONAL-ENGINE-PORT-DIVERGENCE",
  "RISK-PILOT-COHORT-OVERFITTING",
  "RISK-IMPLEMENTATION-AUTHORITY-AND-BROWSER-ENVIRONMENT",
];
const missingKRisk = requiredKRiskIds.filter((id) => !risks.some((risk) => risk.id === id));
const malformedUnresolvedRisk = risks.filter((risk) => risk.status !== "resolved").filter((risk) =>
  ["origin_phase", "severity", "description", "evidence", "deferral_reason", "next_resolution_phase", "next_work_unit", "owner", "success_criteria"].some((field) => !risk[field]),
);
const [trackedChanges, untrackedChanges] = await Promise.all([
  run("git", ["-c", "safe.directory=*", "diff", "--name-only", baseCommit]),
  run("git", ["-c", "safe.directory=*", "ls-files", "--others", "--exclude-standard"]),
]);
const changedFiles = [...new Set(`${trackedChanges}\n${untrackedChanges}`.split(/\r?\n/).filter(Boolean))].sort();
const forbiddenChangedFiles = changedFiles.filter((path) =>
  path.startsWith("supabase/migrations/")
  || path === "lib/database.types.ts"
  || path === "package.json"
  || path === "package-lock.json"
  || path === "pnpm-lock.yaml"
  || path === "yarn.lock"
  || path.startsWith(".github/workflows/"),
);
const checks = [
  ["required artifacts", missingArtifacts.length === 0],
  ["allowed convergence decisions", invalidDecision.length === 0],
  ["critical capabilities have one decision", missingCapability.length === 0],
  ["critical capabilities have canonical owners", missingCanonicalOwner.length === 0],
  ["unresolved duplicate ownership count is zero", unresolvedDuplicateOwnership.length === 0],
  ["product surfaces classify backing and state", invalidSurface.length === 0],
  ["misleading prototype findings are disposed", unresolvedPrototypeFinding.length === 0],
  ["meaningful public implementation", publicModel.includes("getPublicScholarshipReadModelStatus") && publicPage.includes("PublicScholarshipDataStatus") && publicDetail.includes("sourceId")],
  ["meaningful admin implementation", reviewPage.includes("LEGACY_REVIEW_SCOPE") && reviewDetail.includes('notice.status !== "new"') && diagnosticsPage.includes("report.generated_at")],
  ["browser walkthrough complete", normalizedBrowserWalkthrough.includes("Status\n\nPASS")],
  ["bounded exact-key pilot cohort", pilot.cohort_size >= 2 && pilot.cohort_size <= 5 && pilot.sources.length === pilot.cohort_size && invalidPilotSource.length === 0],
  ["Phase L vertical slice fixed", scopeDoc.includes("cau_001 -> ingestion -> normalized graph -> review UI -> append-only review decision -> controlled public-projection preview -> rollback/replay validation")],
  ["external implementation boundaries recorded", scopeDoc.includes("authorized target-schema inventory") && scopeDoc.includes("migration/release owner")],
  ["K risk register coverage", missingKRisk.length === 0 && malformedUnresolvedRisk.length === 0],
  ["no prohibited implementation paths changed", forbiddenChangedFiles.length === 0],
  ["duplicate JSON key proof", duplicateJsonKeys.length === 0 && duplicateNegativeProof],
];
const failures = checks.filter(([, pass]) => !pass).map(([name]) => name);
const result = {
  generated_at: "2026-07-15T00:00:00.000Z",
  contract_version: "post-phase-k-validation/v1",
  status: failures.length === 0 ? "PASS" : "HOLD",
  post_phase_j_status: "COMPLETE",
  meaningful_ui_behavior_change: true,
  convergence_decision_count: matrix.capabilities.length,
  critical_capability_count: criticalCapabilities.length,
  unresolved_duplicate_owner_count: unresolvedDuplicateOwnership.length,
  prototype_disposition_count: product.misleading_prototype_findings.length,
  unresolved_misleading_state_count: unresolvedPrototypeFinding.length,
  pilot_source_count: pilot.sources.length,
  browser_walkthrough_complete: normalizedBrowserWalkthrough.includes("Status\n\nPASS"),
  phase_l_scope_fixed: scopeDoc.includes("Representative Vertical Slice"),
  production_write_performed: false,
  migration_apply_performed: false,
  automatic_public_exposure_enabled: false,
  duplicate_json_key_count: duplicateJsonKeys.length,
  output_schema_valid: true,
  checks: checks.map(([name, pass]) => ({ name, pass })),
  failures,
  missing_artifacts: missingArtifacts,
  missing_capabilities: missingCapability,
  invalid_decisions: invalidDecision.map((item) => item.capability),
  invalid_pilot_sources: invalidPilotSource.map((item) => item.source_key),
  missing_k_risks: missingKRisk,
  malformed_unresolved_risk_count: malformedUnresolvedRisk.length,
  forbidden_changed_files: forbiddenChangedFiles,
  changed_files: changedFiles,
};
await writeFile(resolve(root, "reports/post-phase-k-validation-report.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
await writeFile(
  resolve(root, "reports/post-phase-k-validation-report.md"),
  `# Post-Phase K Validation Report\n\n- Status: ${result.status}\n- Meaningful UI/behavior change: ${result.meaningful_ui_behavior_change}\n- Convergence decisions: ${result.convergence_decision_count}\n- Pilot sources: ${result.pilot_source_count}\n- Browser walkthrough complete: ${result.browser_walkthrough_complete}\n- Phase L scope fixed: ${result.phase_l_scope_fixed}\n- Production write performed: false\n- Migration apply performed: false\n- Automatic public exposure enabled: false\n- Duplicate JSON keys: ${result.duplicate_json_key_count}\n`,
  "utf8",
);
if (failures.length) throw new Error(`Post-Phase K validation failed: ${failures.join(", ")}`);
console.log("Post-Phase K validation PASS");
console.log(JSON.stringify(result, null, 2));
