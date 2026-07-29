import fs from "node:fs";
import path from "node:path";
import { callAnthropic } from "../lib/analysis/anthropic-provider.mjs";
import {
  MAX_MINIMAL_EVALUATION_CALLS,
  MINIMAL_EVALUATION_MODEL,
  buildMinimalEvaluationPrompt,
  criticalEvidenceErrors,
  minimalEvaluationOutputSchema,
  validateMinimalEvaluationOutput,
  validateMinimalFixture,
} from "../lib/analysis/minimal-evaluation-schema.mjs";

function args(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]; if (!value.startsWith("--")) continue;
    const key = value.slice(2); const next = argv[index + 1];
    result[key] = next && !next.startsWith("--") ? (index += 1, next) : true;
  }
  return result;
}
function readJson(file) { return JSON.parse(fs.readFileSync(path.resolve(file), "utf8")); }
function writeJson(file, value) { fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true }); fs.writeFileSync(path.resolve(file), `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function safeError(error) {
  const code = String(error?.code ?? "");
  if (code.includes("credentials")) return "authentication";
  if (code.includes("transport") || error?.name === "AbortError") return "transport";
  return "provider_error";
}

const flags = args(process.argv.slice(2));
const fixturePath = String(flags.fixture ?? "fixtures/llm-analysis/ewha-real-notices-4.json");
const reportPath = String(flags.output ?? "reports/llm-analysis/ewha-minimal-evaluation.json");
const live = flags.live === true;
const model = String(flags.model ?? MINIMAL_EVALUATION_MODEL);
const fixture = readJson(fixturePath);
const fixtureValidation = validateMinimalFixture(fixture);
if (!fixtureValidation.valid) throw new Error(`fixture_invalid:${fixtureValidation.errors.join(",")}`);
if (model !== MINIMAL_EVALUATION_MODEL) throw new Error("model_not_allowlisted");
if (fixture.length > MAX_MINIMAL_EVALUATION_CALLS) throw new Error("max_call_count_exceeded");
if (live && process.env.POST_PHASE_L_ALLOW_LIVE_PROVIDER !== "true") throw new Error("live_provider_permission_missing");
if (live && flags.retry) throw new Error("retry_not_supported");

const report = {
  evaluation: "db-independent-minimal-llm-evaluation-v1",
  generated_at: new Date().toISOString(),
  fixture_path: fixturePath,
  fixture_validation: fixtureValidation,
  model,
  live,
  retry_count: 0,
  db_read_count: 0,
  db_write_count: 0,
  production_access_count: 0,
  provider_call_count: 0,
  results: [],
};
if (!live) {
  report.status = "dry_run";
  report.provider_call_count = 0;
  writeJson(reportPath, report);
  console.log(JSON.stringify({ status: report.status, provider_call_count: 0, report: path.resolve(reportPath) }, null, 2));
  process.exit(0);
}

for (const record of fixture) {
  const startedAt = new Date().toISOString();
  report.provider_call_count += 1;
  try {
    const response = await callAnthropic({
      prompt: buildMinimalEvaluationPrompt(record), model, outputSchema: minimalEvaluationOutputSchema,
    });
    let parsed;
    try { parsed = JSON.parse(response.text); } catch { throw Object.assign(new Error("provider_response_json_invalid"), { code: "json_invalid" }); }
    const validation = validateMinimalEvaluationOutput(parsed, record);
    report.results.push({ fixture_id: record.fixture_id, model: response.model, started_at: startedAt, finished_at: new Date().toISOString(), status: validation.valid ? "completed" : "validation_failed", structured_result: parsed, schema_validation_status: validation.errors.some((error) => error.startsWith("schema:") || error.startsWith("invalid_date:")) ? "invalid" : "valid", evidence_validation_status: validation.errors.some((error) => error.startsWith("missing_evidence:") || error.startsWith("evidence_not_found:")) ? "invalid" : "valid", validation_errors: validation.errors, critical_hallucination_indicators: criticalEvidenceErrors(validation.errors), usage: response.usage, sanitized_error_category: null, manual_assessment: "PENDING_MANUAL_REVIEW" });
    if (!validation.valid) break;
  } catch (error) {
    report.results.push({ fixture_id: record.fixture_id, model, started_at: startedAt, finished_at: new Date().toISOString(), status: "failed", structured_result: null, schema_validation_status: "not_available", evidence_validation_status: "not_available", validation_errors: [], critical_hallucination_indicators: [], usage: null, sanitized_error_category: safeError(error), manual_assessment: "NOT_AVAILABLE" });
    break;
  }
}
report.status = report.results.some((result) => result.status === "failed") ? "provider_connectivity_hold" : report.results.some((result) => result.status === "validation_failed") ? "validation_hold" : "completed";
writeJson(reportPath, report);
console.log(JSON.stringify({ status: report.status, provider_call_count: report.provider_call_count, report: path.resolve(reportPath) }, null, 2));
