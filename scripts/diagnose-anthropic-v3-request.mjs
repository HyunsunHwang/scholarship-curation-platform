import fs from "node:fs";
import path from "node:path";
import { callAnthropic } from "../lib/analysis/anthropic-provider.mjs";
import { schemaMetrics, sanitizedErrorRecord } from "../lib/analysis/anthropic-request-diagnostics.mjs";
import { segmentNoticeBody, validateNoticeSegments } from "../lib/analysis/notice-segmentation.mjs";
import { SEGMENT_REFERENCE_V3_MODEL, buildSegmentReferenceV3Prompt, segmentReferenceV3OutputSchema } from "../lib/analysis/segment-reference-schema-v3.mjs";
import { SEGMENT_REFERENCE_V3_TIMEOUT_MS } from "../lib/analysis/segment-reference-evaluation-v3.mjs";
import { trustedSourceContextFor } from "../lib/analysis/trusted-source-context.mjs";

function args(argv) { const result = {}; for (let index = 0; index < argv.length; index += 1) { const value = argv[index]; if (!value.startsWith("--")) continue; const key = value.slice(2); const next = argv[index + 1]; result[key] = next && !next.startsWith("--") ? (index += 1, next) : true; } return result; }
function writeJson(file, value) { fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true }); fs.writeFileSync(path.resolve(file), `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
const flags = args(process.argv.slice(2)); const live = flags.live === true; const model = String(flags.model ?? SEGMENT_REFERENCE_V3_MODEL); const output = String(flags.output ?? "reports/llm-analysis/anthropic-v3-request-diagnostic.json");
if (model !== SEGMENT_REFERENCE_V3_MODEL) throw new Error("model_not_allowlisted"); if (flags.retry) throw new Error("retry_not_supported"); if (live && process.env.POST_PHASE_L_ALLOW_LIVE_PROVIDER !== "true") throw new Error("live_provider_permission_missing");
const fixture = JSON.parse(fs.readFileSync(path.resolve("fixtures/llm-analysis/ewha-real-notices-4.json"), "utf8")); const record = fixture.find((item) => item.article_id === "365300"); const segments = segmentNoticeBody(record.body_text); const segmentation = validateNoticeSegments(record.body_text, segments); if (!segmentation.valid) throw new Error("segmentation_invalid");
const report = { diagnostic: "anthropic-v3-request-diagnostic", schema_version: "segment-reference-extraction-v3", fixture_id: record.fixture_id, model, configured_timeout_ms: SEGMENT_REFERENCE_V3_TIMEOUT_MS, provider_call_count: 0, db_read_count: 0, db_write_count: 0, production_access_count: 0, schema_metrics: schemaMetrics(segmentReferenceV3OutputSchema), status: live ? "running" : "dry_run" };
if (live) { report.provider_call_count = 1; const started = Date.now(); try { const response = await callAnthropic({ prompt: buildSegmentReferenceV3Prompt(record, segments, trustedSourceContextFor(record.source_id)), model, outputSchema: segmentReferenceV3OutputSchema, timeoutMs: SEGMENT_REFERENCE_V3_TIMEOUT_MS }); report.status = "success"; report.latency_ms = response.latency_ms; report.request_id = response.request_id; report.http_status = 200; report.usage = response.usage; } catch (error) { report.status = "failed"; report.latency_ms = Date.now() - started; Object.assign(report, sanitizedErrorRecord(error)); } }
writeJson(output, report); console.log(JSON.stringify({ status: report.status, provider_call_count: report.provider_call_count, report: path.resolve(output) }, null, 2));
