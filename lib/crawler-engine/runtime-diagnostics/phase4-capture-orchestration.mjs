import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { TextDecoder } from "node:util";
import { createCrawlerCheckpointSession } from "../checkpoint.mjs";
import { boundedMap, createCrawlerRateLimiter } from "../execution-policy.mjs";
import { extractFromList } from "../crawler-list-parser.mjs";
import { applyListParserProfile } from "../list-parser-profiles.mjs";
import {
  createTransportClient,
  createTransportDispatcherPool,
  loadTransportPolicyRegistry,
  resolveTransportPoliciesForSources,
} from "../transport/index.mjs";
import { buildPhase2SameHtmlComparison } from "./phase2-same-html-comparison.mjs";

export const PHASE4_CAPTURE_SCHEMA_VERSION = "phase4-same-html-capture-v1";
export const PHASE4_CAPTURE_STATUSES = Object.freeze([
  "capture_success",
  "blocked_external",
  "transport_failure",
  "invalid_content",
  "insufficient_evidence",
  "resume_skipped",
]);

function clean(value) { return String(value ?? "").trim(); }
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function gitHead() {
  if (clean(process.env.GITHUB_SHA)) return clean(process.env.GITHUB_SHA);
  try { return clean(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })) || null; } catch { return null; }
}
function sourceConfigSha256(source) {
  const selected = Object.fromEntries(["sourceId", "listUrl", "baseUrl", "adapter", "listItemSelector", "linkSelector", "titleSelector", "dateSelector", "noticeUrlPattern", "listParserProfile"].map((key) => [key, source?.[key] ?? null]));
  return sha256(JSON.stringify(selected));
}
function contentTypeIsHtml(value) { return /(?:text\/html|application\/xhtml\+xml)/i.test(clean(value)); }
function charsetFromContentType(value) {
  return clean(value).match(/charset\s*=\s*([^;\s]+)/i)?.[1]?.replace(/^["']|["']$/g, "") || "utf-8";
}
function errorCode(error) { return clean(error?.code ?? error?.cause?.code ?? error?.cause?.errno) || "capture_request_failed"; }
function statusForError(error) {
  const status = Number(error?.httpStatus);
  if (status >= 400 && status < 500) return "blocked_external";
  return "transport_failure";
}
function treatmentOnly({ source, capture }) {
  const configured = applyListParserProfile(source);
  const html = new TextDecoder(capture.charset || "utf-8").decode(Buffer.from(capture.html_base64, "base64"));
  const items = extractFromList(configured, html);
  const parserEvidence = items.operational_parser_evidence ?? null;
  return {
    source_id: source.sourceId,
    capture_id: capture.capture_id,
    requested_url: capture.requested_url,
    final_url: capture.final_url,
    html_sha256: capture.html_sha256,
    parser_config: {
      list_item_selector: clean(configured.listItemSelector) || null,
      link_selector: clean(configured.linkSelector) || null,
      title_selector: clean(configured.titleSelector) || null,
      date_selector: clean(configured.dateSelector) || null,
      notice_url_pattern: clean(configured.noticeUrlPattern) || null,
      list_parser_profile: clean(configured.listParserProfile) || null,
      adapter: clean(configured.adapter) || null,
      adapter_id: clean(configured.adapterId) || null,
      adapter_family: clean(configured.adapterFamily) || null,
    },
    parser_evidence: parserEvidence,
    candidates: items.map((item) => ({
      ...item,
      provenance: item.__crawlerCandidateProvenance ?? null,
      source_capture_hash: capture.html_sha256,
      parser_strategy: parserEvidence?.parser_strategy ?? null,
    })),
  };
}
function captureRecord({ source, response, transportEvidence, capturedAt, sourceRegistry }) {
  const bytes = Buffer.from(response.bytes);
  return {
    schema_version: PHASE4_CAPTURE_SCHEMA_VERSION,
    source_id: source.sourceId,
    capture_id: `${source.sourceId}-${sha256(`${source.sourceId}\u0000${response.finalUrl}\u0000${sha256(bytes)}`).slice(0, 24)}`,
    requested_url: source.listUrl,
    final_url: response.finalUrl,
    captured_at: capturedAt,
    http_status: response.httpStatus,
    content_type: response.contentType,
    charset: charsetFromContentType(response.contentType),
    response_byte_count: bytes.length,
    redirect_chain: response.redirectChain ?? [],
    html_base64: bytes.toString("base64"),
    html_sha256: sha256(bytes),
    source_registry: sourceRegistry,
    source_config_sha256: sourceConfigSha256(source),
    code_sha: gitHead(),
    transport_evidence: transportEvidence,
  };
}

/** One bounded list fetch per Source. No crawler output, state, or manifest mutation. */
export async function runPhase4SameHtmlCapture({
  sources = [], sourceRegistry = null, checkpointPath = null, resume = false,
  sourceConcurrency = 2, hostConcurrency = 1, timeoutMs = 25_000, retryCount = 1,
  controlConfigs = {}, transportClientFactory = null, transportRegistry = null,
  transportPolicyResolver = null, transportPolicySources = null,
  onResult = null,
} = {}) {
  const selected = [...sources].sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  if (selected.length === 0) throw new Error("Phase 4 capture requires at least one Source.");
  if (new Set(selected.map((source) => source.sourceId)).size !== selected.length) throw new Error("Phase 4 capture Sources must be unique.");
  // A subset pilot must still validate bindings against the full registry source set.
  const registry = transportRegistry ?? loadTransportPolicyRegistry({ sources: transportPolicySources ?? selected });
  const policies = transportPolicyResolver
    ? transportPolicyResolver({ sources: selected, registry, timeoutMs, retryCount })
    : resolveTransportPoliciesForSources({ sources: selected, registry, runtimeOverrides: { policy: { timeoutMs, retry: { count: retryCount } } } });
  const runIdentity = `phase4-capture-${sha256(JSON.stringify(selected.map((source) => [source.sourceId, source.listUrl, sourceConfigSha256(source)])))}`;
  const checkpoint = await createCrawlerCheckpointSession({
    checkpointPath, resume, runIdentity, sourceKeys: selected.map((source) => source.sourceId),
    runnerVersion: "phase4-same-html-capture-v1",
    configuration: { source_concurrency: sourceConcurrency, host_concurrency: hostConcurrency, timeout_ms: timeoutMs, retry_count: retryCount, transport_policy_registry_fingerprint: registry.registryFingerprint, resolved_transport_policy_fingerprints: Object.fromEntries([...policies].map(([id, policy]) => [id, policy.policyFingerprint])) },
  });
  const limiter = createCrawlerRateLimiter({ maximumHostConcurrency: hostConcurrency });
  const dispatcherPool = createTransportDispatcherPool();
  const results = await boundedMap(selected, sourceConcurrency, async (source) => {
    if (checkpoint?.shouldSkipSource(source.sourceId)) {
      return { source_id: source.sourceId, capture_status: "resume_skipped", evidence_status: "insufficient_evidence", next_phase_queue: "resume_artifact_lookup", blocking_reason: "checkpoint_completed_source", list_fetch_count: 0, request_attempt_count: 0 };
    }
    const policy = policies.get(source.sourceId);
    const client = transportClientFactory
      ? transportClientFactory({ source, policy, requestLimiter: limiter, dispatcherPool })
      : createTransportClient({ source, policy, requestLimiter: limiter, dispatcherPool });
    let result;
    try {
      const response = await client.fetchHtml(source.listUrl, { kind: "phase4_same_html_capture", timeoutMs, retryCount });
      const capture = captureRecord({ source, response, transportEvidence: client.evidence(), capturedAt: new Date().toISOString(), sourceRegistry });
      if (!contentTypeIsHtml(capture.content_type) || capture.response_byte_count === 0) {
        result = { source_id: source.sourceId, capture_status: "invalid_content", evidence_status: "insufficient_evidence", next_phase_queue: "capture_content_validation", blocking_reason: !contentTypeIsHtml(capture.content_type) ? "non_html_content_type" : "empty_response_bytes", list_fetch_count: 1, request_attempt_count: client.evidence().request_attempt_count, capture };
      } else if (!controlConfigs[source.sourceId]) {
        result = { source_id: source.sourceId, capture_status: "capture_success", evidence_status: "insufficient_evidence", next_phase_queue: "historical_control_reconciliation", blocking_reason: "historical_control_config_unavailable", list_fetch_count: 1, request_attempt_count: client.evidence().request_attempt_count, capture, treatment: treatmentOnly({ source, capture }) };
      } else {
        const comparison = buildPhase2SameHtmlComparison({ capture, controlConfig: controlConfigs[source.sourceId], treatmentConfig: source });
        result = { source_id: source.sourceId, capture_status: "capture_success", evidence_status: "ready_for_fixture", next_phase_queue: "fixture_first_parser_remediation", blocking_reason: null, list_fetch_count: 1, request_attempt_count: client.evidence().request_attempt_count, capture, same_html_comparison: comparison };
      }
    } catch (error) {
      const status = statusForError(error);
      result = { source_id: source.sourceId, capture_status: status, evidence_status: "insufficient_evidence", next_phase_queue: status === "blocked_external" ? "external_retry" : "transport_recovery", blocking_reason: errorCode(error), list_fetch_count: 1, request_attempt_count: client.evidence().request_attempt_count, transport_evidence: client.evidence() };
    }
    // A capture attempt is terminal for this run, including external/invalid states.
    await checkpoint?.recordSourceResult({ source_key: source.sourceId, result_status: "success", notices: [] });
    await onResult?.(result);
    return result;
  });
  await checkpoint?.markCompleted();
  return { schema_version: "phase4-capture-run-v1", run_identity: runIdentity, source_count: selected.length, results: results.sort((left, right) => left.source_id.localeCompare(right.source_id)), checkpoint: checkpoint?.snapshot() ?? null, limiter_evidence: limiter.snapshot?.() ?? null };
}
