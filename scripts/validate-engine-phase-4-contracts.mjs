import fs from "node:fs";
import path from "node:path";
import {
  REQUIRED_METRICS,
  REQUIRED_SCENARIOS,
  REQUIRED_THRESHOLD_STAGES,
  contractPaths,
  createSchemaValidators,
  readJson,
  repositoryRoot,
  validateCanonicalRecord,
  validateEvaluationManifest,
} from "../lib/engine-phase-4/contracts.mjs";

const checks = [];
function check(name, pass, detail = null) {
  checks.push({ name, pass: Boolean(pass), detail });
  console.log(`${pass ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const requiredFiles = [
  "docs/engine/adr/phase-4-identity-schema-evidence-evaluation.md",
  "docs/engine/engine-phase-4-evaluation-contract.md",
  "schemas/engine/phase-4-canonical-scholarship.schema.json",
  "schemas/engine/phase-4-evidence.schema.json",
  "schemas/engine/phase-4-evaluation-case.schema.json",
  "fixtures/engine-phase-4-contract/valid-canonical-record.json",
  "fixtures/engine-phase-4-contract/evaluation-cases.json",
  "reports/engine-phase-4-foundation-contracts.json",
];
check("required contract files exist", requiredFiles.every((entry) => fs.existsSync(path.join(repositoryRoot, entry))));

let validators;
try {
  validators = createSchemaValidators();
  check("all JSON schemas compile with Ajv 2020", true);
} catch (error) {
  check("all JSON schemas compile with Ajv 2020", false, error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const record = readJson(contractPaths.validRecord);
const manifest = readJson(contractPaths.evaluationCases);
const canonicalResult = validateCanonicalRecord(record, validators);
const evaluationResult = validateEvaluationManifest(manifest, validators);

check("canonical fixture satisfies JSON Schema", validators.canonical(record), JSON.stringify(validators.canonical.errors ?? []));
check("evidence items satisfy evidence schema", record.evidence.every((entry) => validators.evidence(entry)));
check("evaluation manifest satisfies JSON Schema", validators.evaluation(manifest), JSON.stringify(validators.evaluation.errors ?? []));
check("canonical semantic validation passes", canonicalResult.valid, JSON.stringify(canonicalResult.errors));
check("evaluation semantic validation passes", evaluationResult.valid, JSON.stringify(evaluationResult.errors));
check("evidence reference integrity", !canonicalResult.errors.some((entry) => entry.code === "missing_evidence_ref"));
check("evidence identifiers are unique", new Set(record.evidence.map((entry) => entry.evidence_id)).size === record.evidence.length);
check("field value status enum is enforced", validators.schemas.canonicalSchema.$defs.valueStatus.enum.length === 6);
check("normalized present values have evidence", Object.values(record.fields).filter((field) => field.value_status === "present").every((field) => field.evidence_refs.length > 0));
check("identity hierarchy is consistent", !canonicalResult.errors.some((entry) => entry.code === "identity_hierarchy_contradiction"));
check("schema version is explicit", record.schema_version === "engine-phase-4-canonical-scholarship/v1");
check("fixture case identifiers are unique", new Set(manifest.cases.map((entry) => entry.case_id)).size === manifest.cases.length);
check("representative fixture count is bounded", manifest.cases.length >= 10 && manifest.cases.length <= 20, String(manifest.cases.length));
check("all required scenarios are represented", REQUIRED_SCENARIOS.every((entry) => manifest.cases.some((item) => item.scenario === entry)));
check("all evaluation metrics are defined", REQUIRED_METRICS.every((entry) => manifest.metrics.includes(entry)));
check("all threshold stages are defined", REQUIRED_THRESHOLD_STAGES.every((entry) => manifest.threshold_stages.includes(entry)));

const packageJson = readJson(path.join(repositoryRoot, "package.json"));
check("Ajv is a direct dev dependency", packageJson.devDependencies?.ajv === "^8.18.0");
check("Phase 4 package scripts exist", Boolean(packageJson.scripts?.["test:engine-phase-4-contracts"] && packageJson.scripts?.["validate:engine-phase-4-contracts"]));

const reportPath = path.join(repositoryRoot, "reports/engine-phase-4-foundation-contracts.json");
const reportText = fs.readFileSync(reportPath, "utf8");
const report = JSON.parse(reportText);
check("tracked report has no absolute local path", !/(?:[A-Za-z]:\\\\|\/Users\/|\/home\/)/.test(reportText));
check("tracked report safety is fail-closed", [
  "database_accessed", "production_accessed", "production_credentials_requested", "external_llm_called",
  "migration_created_or_executed", "canary_write_performed", "production_scheduler_added",
  "queue_or_worker_added", "full_613_source_run", "parser_cache_modified", "crawler_checkpoint_contract_modified",
].every((key) => report.safety?.[key] === false));
check("report identifies official Gate A", report.official_phase === "ENGINE_PHASE_4_FOUNDATION" && report.official_gate === "GATE_A");

const passed = checks.filter((entry) => entry.pass).length;
console.log(`ENGINE PHASE 4 FOUNDATION CONTRACTS: ${passed === checks.length ? "PASS" : "FAIL"}`);
console.log(`checks=${passed}/${checks.length}`);
if (passed !== checks.length) process.exitCode = 1;
