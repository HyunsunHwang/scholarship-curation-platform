import fs from "node:fs";
import path from "node:path";
import { callAnthropic } from "../lib/analysis/anthropic-provider.mjs";
import { SEGMENT_REFERENCE_V3_MODEL, MAX_SEGMENT_REFERENCE_V3_PROVIDER_CALLS } from "../lib/analysis/segment-reference-schema-v3.mjs";
import { SEGMENT_REFERENCE_V3_TIMEOUT_MS, evaluateSegmentReferenceV3 } from "../lib/analysis/segment-reference-evaluation-v3.mjs";

function args(argv) { const result = {}; for (let index = 0; index < argv.length; index += 1) { const value = argv[index]; if (!value.startsWith("--")) continue; const key = value.slice(2); const next = argv[index + 1]; result[key] = next && !next.startsWith("--") ? (index += 1, next) : true; } return result; }
function writeJson(file, value) { fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true }); fs.writeFileSync(path.resolve(file), `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
const flags = args(process.argv.slice(2));
const fixturePath = String(flags.fixture ?? "fixtures/llm-analysis/ewha-real-notices-4.json");
const output = String(flags.output ?? "reports/llm-analysis/ewha-segment-reference-evaluation-v3.json");
const live = flags.live === true; const model = String(flags.model ?? SEGMENT_REFERENCE_V3_MODEL); const timeoutMs = Number(flags["timeout-ms"] ?? SEGMENT_REFERENCE_V3_TIMEOUT_MS);
if (flags.retry) throw new Error("retry_not_supported");
if (live && process.env.POST_PHASE_L_ALLOW_LIVE_PROVIDER !== "true") throw new Error("live_provider_permission_missing");
const fixture = JSON.parse(fs.readFileSync(path.resolve(fixturePath), "utf8"));
const report = await evaluateSegmentReferenceV3({ fixture, live, model, timeoutMs, providerCall: live ? callAnthropic : undefined, onUpdate: (partial) => writeJson(output, partial) });
report.fixture_path = fixturePath; report.max_provider_calls = MAX_SEGMENT_REFERENCE_V3_PROVIDER_CALLS; writeJson(output, report);
console.log(JSON.stringify({ status: report.status, provider_call_count: report.provider_call_count, configured_timeout_ms: timeoutMs, report: path.resolve(output) }, null, 2));
