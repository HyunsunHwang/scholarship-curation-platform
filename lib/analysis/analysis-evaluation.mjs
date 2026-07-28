import { analysisSha256 } from "./analysis-identifiers.mjs";
import { validateAnalysisSchema } from "./analysis-validator.mjs";

export const EVALUATED_FIELDS = [
  "notice_classification", "program.name", "cycle.name", "organizations", "benefits",
  "application.start_date.value", "application.end_date.value", "application.method",
  "eligibility_conditions", "target_scope", "required_documents", "important_cautions",
];

function get(value, path) {
  return path.split(".").reduce((current, key) => current?.[key], value);
}

function comparable(value) {
  if (Array.isArray(value)) return JSON.stringify([...value].sort((a, b) =>
    JSON.stringify(a).localeCompare(JSON.stringify(b))));
  if (value && typeof value === "object") {
    return JSON.stringify(Object.fromEntries(Object.entries(value).sort()));
  }
  return String(value ?? "").replace(/\s+/g, " ").trim().toLocaleLowerCase("ko-KR");
}

export function evaluateAnalysisCandidates(rows, candidates, { candidateName = "replay" } = {}) {
  const candidateByRevision = new Map(candidates.map((row) => [row.revision_id, row]));
  const fields = Object.fromEntries(EVALUATED_FIELDS.map((path) => [
    path, { compared: 0, exact_match: 0, missing: 0 },
  ]));
  const failures = [];
  const totals = {
    rows: rows.length, schema_valid: 0, evidence_present: 0, lineage_valid: 0,
    input_tokens: 0, output_tokens: 0, estimated_cost_micros: 0, latency_ms: 0,
    escalated: 0,
  };
  for (const gold of rows) {
    const candidate = candidateByRevision.get(gold.revision_id);
    if (!candidate) {
      failures.push({ revision_id: gold.revision_id, code: "candidate_missing" });
      continue;
    }
    const output = candidate.output;
    if (validateAnalysisSchema(output).valid) totals.schema_valid += 1;
    if (output?.evidence?.length) totals.evidence_present += 1;
    if (output?.lineage?.revision_id === gold.revision_id
      && output?.lineage?.notice_id === gold.notice_id) totals.lineage_valid += 1;
    for (const path of EVALUATED_FIELDS) {
      const metric = fields[path];
      metric.compared += 1;
      const actual = get(output, path);
      if (actual == null || actual === "" || (Array.isArray(actual) && !actual.length)) metric.missing += 1;
      if (comparable(actual) === comparable(get(gold.effective_gold_output, path))) metric.exact_match += 1;
    }
    totals.input_tokens += Number(candidate.usage?.input_tokens ?? 0);
    totals.output_tokens += Number(candidate.usage?.output_tokens ?? 0);
    totals.estimated_cost_micros += Number(candidate.estimated_cost_micros ?? 0);
    totals.latency_ms += Number(candidate.latency_ms ?? 0);
    totals.escalated += candidate.escalated ? 1 : 0;
  }
  return {
    evaluation_version: "analysis-evaluation-v1",
    candidate_name: candidateName,
    dataset_fingerprint: analysisSha256(rows.map((row) => row.input_fingerprint).sort().join("|")),
    fields,
    totals,
    failures,
  };
}

export function summarizeOperations({ jobs = [], runs = [], decisions = [] }) {
  const selected = decisions.filter((row) => row.selected_run_id);
  return {
    jobs: {
      total: jobs.length,
      queued: jobs.filter((row) => row.status === "queued").length,
      failed: jobs.filter((row) => String(row.status).includes("failed")).length,
    },
    runs: {
      total: runs.length,
      succeeded: runs.filter((row) => row.status === "succeeded").length,
      cost_micros: runs.reduce((sum, row) => sum + Number(row.estimated_cost_micros ?? 0), 0),
      input_tokens: runs.reduce((sum, row) => sum + Number(row.input_token_count ?? 0), 0),
      output_tokens: runs.reduce((sum, row) => sum + Number(row.output_token_count ?? 0), 0),
      average_latency_ms: runs.length
        ? Math.round(runs.reduce((sum, row) => sum + Number(row.latency_ms ?? 0), 0) / runs.length)
        : 0,
    },
    routing: {
      decisions: decisions.length,
      escalated: decisions.filter((row) => row.escalation_run_id).length,
      selected: selected.length,
      economy_retained: decisions.filter((row) =>
        row.economy_run_id && row.selected_run_id === row.economy_run_id && row.escalation_run_id).length,
    },
  };
}
