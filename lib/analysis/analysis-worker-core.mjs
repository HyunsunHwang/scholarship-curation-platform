import { evaluateAnalysisReadiness } from "./analysis-readiness.mjs";
import { buildAnalysisInput } from "./analysis-input-builder.mjs";
import { buildScholarshipAnalysisPrompt } from "./analysis-prompt.mjs";
import {
  buildAnalysisArtifacts,
  parseStructuredAnalysisResponse,
  validateStructuredAnalysis,
} from "./analysis-validator.mjs";
import {
  ANALYSIS_PROVIDER,
  resolveAnalysisModel,
} from "./analysis-policy.mjs";
import {
  analysisSha256,
  stableAnalysisUuid,
} from "./analysis-identifiers.mjs";

function errorCode(error) {
  return String(error?.code ?? "analysis_execution_failed");
}

function validationStatusFor(error) {
  if (errorCode(error) === "json_invalid") return "json_invalid";
  return error?.validation_status ?? "not_validated";
}

function safeValidationErrors(errors = []) {
  return errors.slice(0, 50).map((entry) => ({
    code: String(entry?.code ?? "validation_error").slice(0, 80),
    path: String(entry?.path ?? "/").slice(0, 240),
  }));
}

function safeCriticalFieldDiagnostics(structured) {
  const paths = [
    "program.name",
    "cycle.name",
    "application.end_date.value",
    "eligibility_conditions",
    "benefits",
  ];
  const presence = {};
  const unresolved = [];
  for (const path of paths) {
    const value = path.split(".").reduce((current, key) => current?.[key], structured);
    const present = value != null && value !== "" && (!Array.isArray(value) || value.length > 0);
    presence[path] = present;
    if (!present) unresolved.push(path);
  }
  return { critical_field_presence: presence, unresolved_field_paths: unresolved };
}

export async function executeAnalysisJob({
  job,
  revision,
  notice,
  occurrence,
  assets = [],
  source = {},
  privacy_status,
  provider,
  now = new Date().toISOString(),
  model = resolveAnalysisModel(),
  runKey = "default",
  providerName = ANALYSIS_PROVIDER,
  estimatedCostMicros = null,
  onProviderResponse = null,
} = {}) {
  let providerCalled = false;
  let responseSummary = null;
  const readiness = evaluateAnalysisReadiness({
    revision,
    notice,
    occurrence,
    assets,
    source,
    candidate_classification: job?.metadata?.input_profile?.candidate_classification
      ?? revision?.normalized_payload?.candidate_classification,
    notice_type: job?.metadata?.input_profile?.notice_type
      ?? revision?.normalized_payload?.notice_type,
    multiple_programs_suspected: job?.metadata?.input_profile?.multiple_program_suspected,
    privacy_status,
  });
  if (!readiness.ready) {
    return {
      ok: false,
      provider_called: false,
      readiness,
      error: { code: "analysis_not_ready", message: readiness.reason_codes.join(",") },
      run: null,
      result: null,
      evidence: [],
    };
  }
  const built = buildAnalysisInput({
    revision,
    notice,
    assets,
    source,
    privacy_status,
  }, {
    promptVersion: job.prompt_version,
    schemaVersion: job.schema_version,
  });
  if (built.input_fingerprint !== job.input_fingerprint) {
    return {
      ok: false,
      provider_called: false,
      readiness,
      error: { code: "input_fingerprint_mismatch", message: "job input differs from durable revision input" },
      run: null,
      result: null,
      evidence: [],
    };
  }
  const run = {
    id: stableAnalysisUuid(
      "notice_analysis_runs",
      `${job.id}|${Number(job.attempt_count ?? 1)}|${runKey}`,
    ),
    job_id: job.id,
    attempt_number: Number(job.attempt_count ?? 1),
    run_role: runKey === "default" ? "baseline" : runKey,
    provider: providerName,
    model,
    request_id: null,
    status: "started",
    started_at: now,
    finished_at: null,
    latency_ms: null,
    input_token_count: null,
    output_token_count: null,
    cached_input_token_count: null,
    estimated_cost_micros: estimatedCostMicros,
    currency_code: "USD",
    prompt_version: job.prompt_version,
    schema_version: job.schema_version,
    input_fingerprint: built.input_fingerprint,
    response_fingerprint: null,
    validation_status: "not_validated",
    error_code: null,
    error_message: null,
    raw_response_retention_until: null,
    raw_response: null,
    metadata: {
      mode: provider?.mode ?? "unknown",
      run_key: runKey,
      safe_analysis_input: built.normalized_input,
    },
    created_at: now,
  };
  try {
    providerCalled = true;
    const response = await provider.call({
      prompt: buildScholarshipAnalysisPrompt(built.normalized_input),
      analysisInput: built.normalized_input,
      model,
    });
    run.status = "content_received";
    run.request_id = response.request_id ?? null;
    run.model = response.model ?? model;
    run.latency_ms = response.latency_ms ?? null;
    run.input_token_count = response.usage?.input_tokens ?? null;
    run.output_token_count = response.usage?.output_tokens ?? null;
    run.cached_input_token_count = response.usage?.cached_input_tokens ?? null;
    run.response_fingerprint = analysisSha256(response.text);
    run.usage_status = Number.isFinite(run.input_token_count)
      && Number.isFinite(run.output_token_count) ? "recorded" : "missing";
    if (onProviderResponse) {
      await onProviderResponse({
        run: structuredClone(run),
        response_shape: response.response_shape ?? null,
      });
    }
    responseSummary = {
      json_parse_success: false,
      top_level_keys: [],
      evidence_count: 0,
      provider_shape: response.response_shape ?? null,
    };
    const structured = parseStructuredAnalysisResponse(response.text);
    responseSummary = {
      json_parse_success: true,
      top_level_keys: Object.keys(structured).sort().slice(0, 50),
      evidence_count: Array.isArray(structured?.evidence) ? structured.evidence.length : 0,
      provider_shape: response.response_shape ?? null,
      ...safeCriticalFieldDiagnostics(structured),
    };
    run.status = "json_parsed";
    const validation = validateStructuredAnalysis(structured, {
      analysisInput: built.normalized_input,
    });
    if (!validation.valid) {
      throw Object.assign(new Error("structured analysis validation failed"), {
        code: validation.validation_status,
        validation_status: validation.validation_status,
        validation_errors: validation.errors,
      });
    }
    run.status = "succeeded";
    run.validation_status = "validated";
    run.finished_at = now;
    run.metadata = {
      ...run.metadata,
      provider_called: providerCalled,
      response_summary: responseSummary,
      validation_errors: [],
    };
    const artifacts = buildAnalysisArtifacts({ job, run, structuredResult: structured, now });
    return {
      ok: true,
      provider_called: providerCalled,
      readiness,
      analysis_input: built,
      run,
      ...artifacts,
      error: null,
      stop_routing: run.usage_status !== "recorded",
      stop_escalation: run.usage_status !== "recorded",
      reconciliation_required: run.usage_status !== "recorded",
    };
  } catch (error) {
    run.status = error?.retryable === false ? "terminal_failed" : "retryable_failed";
    run.validation_status = validationStatusFor(error);
    run.error_code = errorCode(error);
    run.error_message = String(error?.message ?? error);
    run.finished_at = now;
    run.metadata = {
      ...run.metadata,
      provider_called: providerCalled,
      response_summary: responseSummary ?? {
        json_parse_success: false,
        top_level_keys: [],
        evidence_count: 0,
      },
      validation_errors: safeValidationErrors(error?.validation_errors),
      first_failure_stage: errorCode(error),
    };
    return {
      ok: false,
      provider_called: providerCalled,
      readiness,
      analysis_input: built,
      run,
      result: null,
      evidence: [],
      error: {
        code: run.error_code,
        message: run.error_message,
        validation_errors: error?.validation_errors ?? [],
      },
      stop_routing: Boolean(error?.stop_routing) || run.usage_status === "missing",
      stop_escalation: Boolean(error?.stop_escalation) || run.usage_status === "missing",
      reconciliation_required:
        Boolean(error?.reconciliation_required) || run.usage_status === "missing",
    };
  }
}

export function createReplayProvider(response) {
  return {
    mode: "mock",
    calls: 0,
    async call() {
      this.calls += 1;
      return {
        text: typeof response === "string" ? response : JSON.stringify(response),
        provider: "anthropic",
        model: "claude-sonnet-5-replay",
        request_id: `replay-${this.calls}`,
        latency_ms: 0,
        usage: { input_tokens: 0, output_tokens: 0, cached_input_tokens: 0 },
      };
    },
  };
}
