import fs from "node:fs";
import path from "node:path";
import { callAnthropic } from "../lib/analysis/anthropic-provider.mjs";
import { validateMinimalFixture } from "../lib/analysis/minimal-evaluation-schema.mjs";
import { segmentNoticeBody, validateNoticeSegments } from "../lib/analysis/notice-segmentation.mjs";
import {
  MAX_SEGMENT_REFERENCE_PROVIDER_CALLS,
  SEGMENT_REFERENCE_EVALUATION_MODEL,
  SEGMENT_REFERENCE_SCHEMA_VERSION,
  buildSegmentReferencePrompt,
  reconstructEvidence,
  segmentReferenceOutputSchema,
  validateSegmentReferenceOutput,
} from "../lib/analysis/segment-reference-schema.mjs";

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
  if (code.includes("json")) return "json_parse";
  return "provider_error";
}
function validationSummary(errors) {
  return {
    schema_valid: !errors.some((error) => error.startsWith("schema:")),
    source_ref_valid: !errors.some((error) => error.startsWith("invalid_source_refs:")),
    raw_value_valid: !errors.some((error) => error.startsWith("raw_value_not_found:")),
    critical_claims_without_refs: errors.filter((error) => error.startsWith("invalid_source_refs:")).length,
  };
}

const flags = args(process.argv.slice(2));
const fixturePath = String(flags.fixture ?? "fixtures/llm-analysis/ewha-real-notices-4.json");
const reportPath = String(flags.output ?? "reports/llm-analysis/ewha-segment-reference-evaluation.json");
const live = flags.live === true;
const model = String(flags.model ?? SEGMENT_REFERENCE_EVALUATION_MODEL);
const fixture = readJson(fixturePath);
const fixtureValidation = validateMinimalFixture(fixture);
if (!fixtureValidation.valid) throw new Error(`fixture_invalid:${fixtureValidation.errors.join(",")}`);
if (model !== SEGMENT_REFERENCE_EVALUATION_MODEL) throw new Error("model_not_allowlisted");
if (fixture.length > MAX_SEGMENT_REFERENCE_PROVIDER_CALLS) throw new Error("max_call_count_exceeded");
if (flags.retry) throw new Error("retry_not_supported");
if (live && process.env.POST_PHASE_L_ALLOW_LIVE_PROVIDER !== "true") throw new Error("live_provider_permission_missing");

const prepared = fixture.map((record) => {
  const segments = segmentNoticeBody(record.body_text);
  return { record, segments, segmentation_validation: validateNoticeSegments(record.body_text, segments) };
});
if (prepared.some((item) => !item.segmentation_validation.valid)) throw new Error("segmentation_invalid");

const report = {
  evaluation: "db-independent-segment-reference-llm-evaluation-v2",
  schema_version: SEGMENT_REFERENCE_SCHEMA_VERSION,
  generated_at: new Date().toISOString(), fixture_path: fixturePath, fixture_validation: fixtureValidation,
  model, live, retry_count: 0, db_read_count: 0, db_write_count: 0, production_access_count: 0, provider_call_count: 0,
  segmentation: prepared.map(({ record, segments, segmentation_validation }) => ({ fixture_id: record.fixture_id, body_length: record.body_text.length, segment_count: segments.length, id_uniqueness: new Set(segments.map((segment) => segment.segment_id)).size === segments.length, offset_integrity: segmentation_validation.valid, reconstruction_valid: segmentation_validation.reconstruction === record.body_text })),
  results: [],
};
if (!live) {
  report.status = "dry_run";
  writeJson(reportPath, report);
  console.log(JSON.stringify({ status: report.status, provider_call_count: 0, report: path.resolve(reportPath) }, null, 2));
  process.exit(0);
}
// Persist the empty run before the first network request and after each notice.
// This preserves the exact completed prefix if the surrounding process stops.
writeJson(reportPath, report);

for (const { record, segments } of prepared) {
  const startedAt = new Date().toISOString();
  report.provider_call_count += 1;
  try {
    const response = await callAnthropic({ prompt: buildSegmentReferencePrompt(record, segments), model, outputSchema: segmentReferenceOutputSchema });
    let parsed;
    try { parsed = JSON.parse(response.text); } catch { throw Object.assign(new Error("provider_response_json_invalid"), { code: "json_invalid" }); }
    const validation = validateSegmentReferenceOutput(parsed, segments);
    const summary = validationSummary(validation.errors);
    report.results.push({
      fixture_id: record.fixture_id, article_id: record.article_id, model: response.model, started_at: startedAt, finished_at: new Date().toISOString(),
      status: validation.valid ? "completed" : "validation_failed", parsed_model_output: parsed,
      reconstructed_evidence: validation.valid ? reconstructEvidence(parsed, segments) : null,
      normalized_values: validation.valid ? { application_periods: reconstructEvidence(parsed, segments).application_periods.map((claim) => claim.normalized_period), benefits: reconstructEvidence(parsed, segments).benefits.map((claim) => claim.normalized_amount), contacts: reconstructEvidence(parsed, segments).contacts.map((claim) => claim.normalized_contact) } : null,
      validation: { valid: validation.valid, errors: validation.errors, ...summary }, usage: response.usage, sanitized_error_category: null, manual_assessment: "PENDING_MANUAL_REVIEW",
    });
    writeJson(reportPath, report);
    if (!validation.valid) break;
  } catch (error) {
    report.results.push({ fixture_id: record.fixture_id, article_id: record.article_id, model, started_at: startedAt, finished_at: new Date().toISOString(), status: "failed", parsed_model_output: null, reconstructed_evidence: null, normalized_values: null, validation: { valid: false, errors: [] }, usage: null, sanitized_error_category: safeError(error), manual_assessment: "NOT_AVAILABLE" });
    writeJson(reportPath, report);
    break;
  }
}
report.status = report.results.some((result) => result.status === "failed") ? "provider_connectivity_hold" : report.results.some((result) => result.status === "validation_failed") ? "validation_hold" : "completed";
writeJson(reportPath, report);
console.log(JSON.stringify({ status: report.status, provider_call_count: report.provider_call_count, report: path.resolve(reportPath) }, null, 2));
