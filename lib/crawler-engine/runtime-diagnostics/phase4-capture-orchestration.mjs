import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
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
import { PHASE3_CLUSTER_VERSION } from "./phase3-remediation-clustering.mjs";

export const PHASE4_CAPTURE_SCHEMA_VERSION = "phase4-same-html-capture-v1";
export const PHASE4_CAPTURE_ARTIFACT_SCHEMA_VERSION = "phase4-capture-artifact-v1";
export const PHASE4_CAPTURE_CHECKPOINT_SCHEMA_VERSION = "phase4-capture-checkpoint-v1";
export const PHASE4_CAPTURE_CONTRACT_VERSION = "phase4-capture-contract-v2";
export const PHASE4_CAPTURE_STATUSES = Object.freeze([
  "capture_success",
  "blocked_external",
  "transport_failure",
  "invalid_content",
  "insufficient_evidence",
  "artifact_commit_failure",
  "resume_skipped",
]);

function clean(value) { return String(value ?? "").trim(); }
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}
function canonicalJson(value) { return JSON.stringify(stable(value)); }
function gitHead() {
  if (clean(process.env.GITHUB_SHA)) return clean(process.env.GITHUB_SHA);
  try { return clean(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })) || null; } catch { return null; }
}
function sourceConfigSha256(source) {
  // SourceConfig is manifest-derived and contains the complete parser-affecting contract.
  return sha256(canonicalJson(source ?? {}));
}
function controlConfigSha256(controlConfig) {
  return controlConfig ? sha256(canonicalJson(controlConfig)) : "historical_control_unavailable";
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
function captureRecord({ source, response, transportEvidence, capturedAt, sourceRegistry, codeSha }) {
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
    code_sha: codeSha,
    transport_evidence: transportEvidence,
  };
}

function checkpointError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function writeJsonAtomic(filePath, value) {
  const resolved = path.resolve(filePath);
  const temporary = `${resolved}.tmp-${process.pid}-${crypto.randomBytes(6).toString("hex")}`;
  let handle = null;
  try {
    await fs.mkdir(path.dirname(resolved), { recursive: true });
    handle = await fs.open(temporary, "wx");
    await handle.writeFile(`${JSON.stringify(stable(value), null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close(); handle = null;
    await fs.rename(temporary, resolved);
  } catch {
    try { await handle?.close(); } catch {}
    try { await fs.unlink(temporary); } catch {}
    throw checkpointError("phase4_checkpoint_atomic_write_failed", "Phase 4 checkpoint metadata could not be saved.");
  }
}

async function createPhase4CaptureJournal({ checkpointPath, resume, runIdentity, contractFingerprint, sourceIds }) {
  if (!checkpointPath) return null;
  const journalPath = `${path.resolve(checkpointPath)}.phase4-capture.json`;
  let journal;
  if (resume) {
    try { journal = JSON.parse(await fs.readFile(journalPath, "utf8")); } catch (error) {
      if (error?.code !== "ENOENT") throw checkpointError("phase4_checkpoint_invalid", "Phase 4 capture checkpoint metadata is unreadable.");
      journal = { schema_version: PHASE4_CAPTURE_CHECKPOINT_SCHEMA_VERSION, run_identity: runIdentity, contract_fingerprint: contractFingerprint, source_ids: [...sourceIds].sort(), terminal_artifacts: {}, attempts: {}, recovered_from_artifacts: true };
    }
    if (journal.schema_version !== PHASE4_CAPTURE_CHECKPOINT_SCHEMA_VERSION || journal.run_identity !== runIdentity || journal.contract_fingerprint !== contractFingerprint) {
      throw checkpointError("phase4_checkpoint_contract_mismatch", "Phase 4 capture checkpoint contract does not match this run.");
    }
  } else {
    try { await fs.access(journalPath); throw checkpointError("phase4_checkpoint_exists_resume_required", "Phase 4 capture checkpoint metadata already exists; use resume or a new path."); } catch (error) { if (error?.code !== "ENOENT") throw error; }
    journal = { schema_version: PHASE4_CAPTURE_CHECKPOINT_SCHEMA_VERSION, run_identity: runIdentity, contract_fingerprint: contractFingerprint, source_ids: [...sourceIds].sort(), terminal_artifacts: {}, attempts: {} };
    await writeJsonAtomic(journalPath, journal);
  }
  const save = async () => writeJsonAtomic(journalPath, journal);
  return {
    path: journalPath,
    entry(sourceId) { return journal.terminal_artifacts[sourceId] ?? null; },
    async recordArtifact(sourceId, metadata) { journal.terminal_artifacts[sourceId] = stable(metadata); delete journal.attempts[sourceId]; await save(); },
    async recordAttempt(sourceId, metadata) { journal.attempts[sourceId] = stable(metadata); await save(); },
    snapshot() { return structuredClone(journal); },
  };
}

function phase4Contract({ selected, sourceRegistry, registry, policies, controlConfigs, sourceConcurrency, hostConcurrency, timeoutMs, retryCount, codeSha }) {
  return stable({
    capture_contract_version: PHASE4_CAPTURE_CONTRACT_VERSION,
    capture_schema_version: PHASE4_CAPTURE_SCHEMA_VERSION,
    artifact_schema_version: PHASE4_CAPTURE_ARTIFACT_SCHEMA_VERSION,
    checkpoint_schema_version: PHASE4_CAPTURE_CHECKPOINT_SCHEMA_VERSION,
    phase2_same_html_schema_version: "phase2-same-html-comparison-v1",
    phase3_cluster_version: PHASE3_CLUSTER_VERSION,
    parser_contract_version: "phase2-parser-contract-v1",
    control_reconstruction_version: "historical-control-reconstruction-v1",
    report_schema_version: "phase4-capture-pilot-report-v1",
    code_sha: codeSha,
    source_registry: sourceRegistry,
    transport_policy_registry_fingerprint: registry.registryFingerprint,
    execution: { source_concurrency: sourceConcurrency, host_concurrency: hostConcurrency, timeout_ms: timeoutMs, retry_count: retryCount },
    sources: selected.map((source) => ({
      source_id: source.sourceId,
      source_config_sha256: sourceConfigSha256(source),
      treatment_config_sha256: sourceConfigSha256(source),
      historical_control_config_sha256: controlConfigSha256(controlConfigs[source.sourceId]),
      resolved_transport_policy_fingerprint: policies.get(source.sourceId)?.policyFingerprint ?? null,
    })),
  });
}

function artifactPayload({ result, runIdentity, contractFingerprint, contract }) {
  return stable({
    schema_version: PHASE4_CAPTURE_ARTIFACT_SCHEMA_VERSION,
    run_identity: runIdentity,
    capture_contract_version: PHASE4_CAPTURE_CONTRACT_VERSION,
    contract_fingerprint: contractFingerprint,
    source_id: result.source_id,
    capture_status: result.capture_status,
    evidence_status: result.evidence_status,
    next_phase_queue: result.next_phase_queue,
    blocking_reason: result.blocking_reason,
    list_fetch_count: result.list_fetch_count,
    request_attempt_count: result.request_attempt_count,
    capture: result.capture ?? null,
    treatment: result.treatment ?? null,
    same_html_comparison: result.same_html_comparison ?? null,
    contract,
  });
}

/** One bounded list fetch per Source. No crawler output, state, or manifest mutation. */
export async function runPhase4SameHtmlCapture({
  sources = [], sourceRegistry = null, checkpointPath = null, resume = false,
  sourceConcurrency = 2, hostConcurrency = 1, timeoutMs = 25_000, retryCount = 1,
  controlConfigs = {}, transportClientFactory = null, transportRegistry = null,
  transportPolicyResolver = null, transportPolicySources = null,
  artifactWriter = null, codeSha = gitHead(),
} = {}) {
  const selected = [...sources].sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  if (selected.length === 0) throw new Error("Phase 4 capture requires at least one Source.");
  if (new Set(selected.map((source) => source.sourceId)).size !== selected.length) throw new Error("Phase 4 capture Sources must be unique.");
  // A subset pilot must still validate bindings against the full registry source set.
  const registry = transportRegistry ?? loadTransportPolicyRegistry({ sources: transportPolicySources ?? selected });
  const policies = transportPolicyResolver
    ? transportPolicyResolver({ sources: selected, registry, timeoutMs, retryCount })
    : resolveTransportPoliciesForSources({ sources: selected, registry, runtimeOverrides: { policy: { timeoutMs, retry: { count: retryCount } } } });
  if (!artifactWriter?.commit || !artifactWriter?.verify) {
    throw new Error("Phase 4 capture requires an artifactWriter with commit and verify methods.");
  }
  const contract = phase4Contract({ selected, sourceRegistry, registry, policies, controlConfigs, sourceConcurrency, hostConcurrency, timeoutMs, retryCount, codeSha });
  const contractFingerprint = sha256(canonicalJson(contract));
  const runIdentity = `phase4-capture-${contractFingerprint}`;
  const checkpoint = await createCrawlerCheckpointSession({
    checkpointPath, resume, runIdentity, sourceKeys: selected.map((source) => source.sourceId),
    runnerVersion: "phase4-same-html-capture-v1",
    configuration: { source_concurrency: sourceConcurrency, host_concurrency: hostConcurrency, timeout_ms: timeoutMs, retry_count: retryCount, transport_policy_registry_fingerprint: registry.registryFingerprint, resolved_transport_policy_fingerprints: Object.fromEntries([...policies].map(([id, policy]) => [id, policy.policyFingerprint])) },
  });
  const journal = await createPhase4CaptureJournal({ checkpointPath, resume, runIdentity, contractFingerprint, sourceIds: selected.map((source) => source.sourceId) });
  const limiter = createCrawlerRateLimiter({ maximumHostConcurrency: hostConcurrency });
  const dispatcherPool = createTransportDispatcherPool();
  const results = await boundedMap(selected, sourceConcurrency, async (source) => {
    let resumedEntry = journal?.entry(source.sourceId);
    if (resume && !resumedEntry && typeof artifactWriter.recover === "function") {
      const recovered = await artifactWriter.recover({ sourceId: source.sourceId, runIdentity, contractFingerprint });
      if (recovered) {
        await journal?.recordArtifact(source.sourceId, recovered);
        resumedEntry = recovered;
      }
    }
    if (resume && resumedEntry) {
      const verified = await artifactWriter.verify(resumedEntry, { sourceId: source.sourceId, runIdentity, contractFingerprint });
      if (!verified) throw checkpointError("checkpoint_artifact_mismatch", `${source.sourceId}: checkpoint artifact is missing, corrupt, or mismatched.`);
      if (resumedEntry.capture_status === "capture_success" && !checkpoint?.shouldSkipSource(source.sourceId)) {
        throw checkpointError("checkpoint_artifact_mismatch", `${source.sourceId}: artifact is committed but the success checkpoint is incomplete.`);
      }
      return { source_id: source.sourceId, capture_status: "resume_skipped", resumed_capture_status: resumedEntry.capture_status, evidence_status: resumedEntry.evidence_status, next_phase_queue: "resume_artifact_lookup", blocking_reason: "terminal_artifact_verified", list_fetch_count: 0, request_attempt_count: 0, artifact: resumedEntry };
    }
    if (resume && checkpoint?.shouldSkipSource(source.sourceId)) {
      throw checkpointError("checkpoint_artifact_mismatch", `${source.sourceId}: checkpoint marks completion without a verified Phase 4 artifact.`);
    }
    const policy = policies.get(source.sourceId);
    const client = transportClientFactory
      ? transportClientFactory({ source, policy, requestLimiter: limiter, dispatcherPool })
      : createTransportClient({ source, policy, requestLimiter: limiter, dispatcherPool });
    let result;
    try {
      const response = await client.fetchHtml(source.listUrl, { kind: "phase4_same_html_capture", timeoutMs, retryCount });
      const capture = captureRecord({ source, response, transportEvidence: client.evidence(), capturedAt: new Date().toISOString(), sourceRegistry, codeSha });
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
    const artifact = artifactPayload({ result, runIdentity, contractFingerprint, contract });
    try {
      const committed = await artifactWriter.commit(artifact, { source, runIdentity, contractFingerprint });
      if (!committed?.artifact_committed || !clean(committed.artifact_path) || !/^[a-f0-9]{64}$/i.test(clean(committed.artifact_sha256))) {
        throw checkpointError("artifact_commit_failure", `${source.sourceId}: artifact writer did not return committed artifact metadata.`);
      }
      const metadata = {
        source_id: source.sourceId,
        capture_id: result.capture?.capture_id ?? null,
        capture_status: result.capture_status,
        evidence_status: result.evidence_status,
        next_phase_queue: result.next_phase_queue,
        blocking_reason: result.blocking_reason,
        artifact_status: "committed",
        artifact_path: committed.artifact_path,
        artifact_sha256: committed.artifact_sha256,
        artifact_schema_version: PHASE4_CAPTURE_ARTIFACT_SCHEMA_VERSION,
        capture_contract_version: PHASE4_CAPTURE_CONTRACT_VERSION,
      };
      if (!await artifactWriter.verify(metadata, { sourceId: source.sourceId, runIdentity, contractFingerprint })) {
        throw checkpointError("checkpoint_artifact_mismatch", `${source.sourceId}: committed artifact failed verification.`);
      }
      await journal?.recordArtifact(source.sourceId, metadata);
      // Generic crawler completion is reserved for a capture-success artifact only.
      await checkpoint?.recordSourceResult({ source_key: source.sourceId, result_status: result.capture_status === "capture_success" ? "success" : "failed", error_code: result.capture_status, notices: [] });
      result.artifact = { ...metadata, artifact_committed: true };
    } catch (error) {
      const failed = {
        source_id: source.sourceId,
        capture_status: "artifact_commit_failure",
        evidence_status: "insufficient_evidence",
        next_phase_queue: "artifact_recovery",
        blocking_reason: clean(error?.code) || "artifact_commit_failure",
        list_fetch_count: result.list_fetch_count,
        request_attempt_count: result.request_attempt_count,
        capture: result.capture ?? null,
      };
      await journal?.recordAttempt(source.sourceId, { source_id: source.sourceId, attempt_status: "incomplete", capture_status: "artifact_commit_failure", artifact_status: "failed", blocking_reason: failed.blocking_reason });
      await checkpoint?.recordSourceResult({ source_key: source.sourceId, result_status: "failed", error_code: "artifact_commit_failure", notices: [] });
      return failed;
    }
    return result;
  });
  const boundedErrors = results.filter((result) => result?.__bounded_map_error);
  if (boundedErrors.length > 0) {
    const error = boundedErrors[0].__bounded_map_error;
    throw error instanceof Error ? error : checkpointError("phase4_capture_worker_failed", "Phase 4 capture worker failed.");
  }
  await checkpoint?.markCompleted();
  return { schema_version: "phase4-capture-run-v2", run_identity: runIdentity, contract_fingerprint: contractFingerprint, contract, source_count: selected.length, results: results.sort((left, right) => left.source_id.localeCompare(right.source_id)), checkpoint: checkpoint?.snapshot() ?? null, phase4_checkpoint: journal?.snapshot() ?? null, limiter_evidence: limiter.snapshot?.() ?? null };
}
