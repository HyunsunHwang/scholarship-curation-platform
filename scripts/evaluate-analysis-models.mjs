import fs from "node:fs";
import path from "node:path";
import { evaluateAnalysisCandidates } from "../lib/analysis/analysis-evaluation.mjs";
import { callAnthropic } from "../lib/analysis/anthropic-provider.mjs";
import { buildScholarshipAnalysisPrompt } from "../lib/analysis/analysis-prompt.mjs";
import { parseStructuredAnalysisResponse } from "../lib/analysis/analysis-validator.mjs";
import { estimateCostMicros, resolveModelRole } from "../lib/analysis/model-routing-policy.mjs";

function options(argv) {
  return Object.fromEntries(argv.flatMap((arg, index) =>
    arg.startsWith("--") ? [[arg.slice(2), argv[index + 1]?.startsWith("--") ? true : argv[index + 1] ?? true]] : []));
}
function jsonl(file) {
  return fs.readFileSync(path.resolve(file), "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
}
const flags = options(process.argv.slice(2));
if (flags.live && !flags["max-live"]) throw new Error("live_evaluation_requires_max_live");
const gold = jsonl(String(flags.gold ?? "reports/analysis-gold-dataset.jsonl"));
const max = flags.live ? Math.min(Number(flags["max-live"]), 20) : gold.length;
let candidates = flags.candidates
  ? jsonl(String(flags.candidates))
  : gold.slice(0, max).map((row) => ({
    revision_id: row.revision_id,
    output: row.raw_model_structured_output ?? row.effective_gold_output,
    usage: {},
    latency_ms: 0,
  }));
if (flags.live) {
  const role = resolveModelRole(String(flags.role ?? "baseline"));
  candidates = [];
  for (const row of gold.slice(0, max)) {
    if (!row.safe_analysis_input) throw new Error(`safe_analysis_input_missing:${row.revision_id}`);
    const response = await callAnthropic({
      prompt: buildScholarshipAnalysisPrompt(row.safe_analysis_input),
      model: role.model,
    });
    candidates.push({
      revision_id: row.revision_id,
      output: parseStructuredAnalysisResponse(response.text),
      usage: response.usage,
      latency_ms: response.latency_ms,
      estimated_cost_micros: estimateCostMicros(role, {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      }),
    });
  }
}
console.log(JSON.stringify(evaluateAnalysisCandidates(gold.slice(0, max), candidates, {
  candidateName: String(flags.name ?? "replay"),
}), null, 2));
