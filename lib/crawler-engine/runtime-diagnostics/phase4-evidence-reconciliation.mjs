import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  canonicalPhase4ArtifactJson,
  validatePhase4CaptureArtifact,
} from "./phase4-capture-artifact-validator.mjs";
import { validatePhase4CaptureJournal } from "./phase4-capture-orchestration.mjs";

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;

function reconciliationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function sourceSet(values, label) {
  if (!Array.isArray(values)) throw reconciliationError("phase4_reconciliation_source_set_mismatch", `${label} must be an array.`);
  const clean = values.map((value) => String(value ?? "").trim());
  if (clean.some((value) => !value)) throw reconciliationError("phase4_reconciliation_source_set_mismatch", `${label} has an empty Source ID.`);
  if (new Set(clean).size !== clean.length) throw reconciliationError("phase4_reconciliation_duplicate_source", `${label} has duplicate Source IDs.`);
  return new Set(clean);
}

function assertSameSet(expected, actual, label) {
  const missing = [...expected].filter((value) => !actual.has(value)).sort();
  const unexpected = [...actual].filter((value) => !expected.has(value)).sort();
  if (missing.length) throw reconciliationError("phase4_reconciliation_missing_source", `${label} is missing: ${missing.join(", ")}`);
  if (unexpected.length) throw reconciliationError("phase4_reconciliation_unexpected_source", `${label} is unexpected: ${unexpected.join(", ")}`);
}

async function readJsonWithBytes(filePath) {
  const bytes = await fs.readFile(filePath);
  try { return { bytes, value: JSON.parse(bytes.toString("utf8")) }; }
  catch { throw reconciliationError("phase4_reconciliation_artifact_validation_failure", `Invalid JSON: ${filePath}`); }
}

async function assertRegularPath(runDirectory, sourceId) {
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(sourceId)) throw reconciliationError("phase4_reconciliation_artifact_path_mismatch", "Invalid Source ID in artifact path.");
  const capturesDirectory = path.resolve(runDirectory, "captures");
  const artifactPath = path.resolve(capturesDirectory, `${sourceId}.json`);
  if (path.relative(runDirectory, capturesDirectory) !== "captures" || path.relative(capturesDirectory, artifactPath) !== `${sourceId}.json`) {
    throw reconciliationError("phase4_reconciliation_artifact_path_mismatch", `${sourceId}: non-canonical artifact path.`);
  }
  for (const entry of [runDirectory, capturesDirectory, artifactPath]) {
    const stat = await fs.lstat(entry);
    if (stat.isSymbolicLink()) throw reconciliationError("phase4_reconciliation_artifact_path_mismatch", `${sourceId}: symlink is forbidden.`);
  }
  const [realRun, realCaptures, realArtifact] = await Promise.all([fs.realpath(runDirectory), fs.realpath(capturesDirectory), fs.realpath(artifactPath)]);
  if (path.relative(realRun, realCaptures) !== "captures" || path.relative(realCaptures, realArtifact) !== `${sourceId}.json`) {
    throw reconciliationError("phase4_reconciliation_artifact_path_mismatch", `${sourceId}: artifact path escapes captures.`);
  }
  return artifactPath;
}

function transportClass(artifact) {
  const evidence = artifact.transport_evidence ?? {};
  const code = String(evidence.error_code ?? evidence.transport_error_code ?? evidence.error?.code ?? "").toUpperCase();
  if (/ENOTFOUND|EAI_AGAIN/.test(code)) return "dns_failure";
  if (/ECONNRESET/.test(code)) return "connection_reset";
  if (/ETIMEDOUT|TIMEDOUT/.test(code)) return "connect_timeout";
  if (/TLS|CERT|SSL/.test(code)) return "tls_failure";
  return "unknown_transport_failure";
}

/**
 * Verifies the authoritative private Phase 4 run using raw file bytes. The
 * returned object is deterministic and deliberately excludes local paths.
 */
export async function reconcilePhase4Evidence({ runDirectory, expectedSourceIds, runIdentity, contractFingerprint } = {}) {
  const run = path.resolve(runDirectory ?? "");
  const expected = sourceSet(expectedSourceIds, "expected Source set");
  const [indexInput, journalInput, summaryInput] = await Promise.all([
    readJsonWithBytes(path.join(run, "private-artifact-index.json")),
    readJsonWithBytes(path.join(run, "checkpoint.json.phase4-capture.json")),
    readJsonWithBytes(path.join(run, "private-run-summary.json")),
  ]);
  const index = indexInput.value;
  const journal = journalInput.value;
  const summary = summaryInput.value;
  if (index.run_identity !== runIdentity || index.contract_fingerprint !== contractFingerprint
    || journal.run_identity !== runIdentity || journal.contract_fingerprint !== contractFingerprint
    || summary.run_identity !== runIdentity || summary.contract_fingerprint !== contractFingerprint) {
    throw reconciliationError("phase4_reconciliation_metadata_mismatch", "Run identity or contract fingerprint mismatch.");
  }
  if (summary.private_index_sha256 !== sha256(indexInput.bytes)
    || summary.journal_sha256 !== sha256(journalInput.bytes)
    || (summary.checkpoint_sha256 && summary.checkpoint_sha256 !== sha256(await fs.readFile(path.join(run, "checkpoint.json"))))) {
    throw reconciliationError("phase4_reconciliation_artifact_sha_mismatch", "Private summary does not bind the raw index, journal, or checkpoint bytes.");
  }
  validatePhase4CaptureJournal(journal, { runIdentity, contractFingerprint, sourceIds: [...expected] });
  const indexCreated = sourceSet(index.created_source_ids, "index created Source set");
  const indexTerminal = sourceSet(index.terminal_source_ids, "index terminal Source set");
  const journalSources = sourceSet(journal.source_ids, "journal Source set");
  const journalTerminal = sourceSet(Object.keys(journal.terminal_artifacts ?? {}), "journal terminal Source set");
  assertSameSet(expected, indexCreated, "index created Source set");
  assertSameSet(expected, indexTerminal, "index terminal Source set");
  assertSameSet(expected, journalSources, "journal Source set");
  assertSameSet(expected, journalTerminal, "journal terminal Source set");
  if (Object.keys(journal.attempts ?? {}).length !== 0 || index.source_count !== expected.size || index.artifact_count !== expected.size
    || summary.accounting?.terminal_artifact_count !== expected.size || summary.accounting?.incomplete_attempt_count !== 0) {
    throw reconciliationError("phase4_reconciliation_source_set_mismatch", "Phase 4 terminal accounting is incomplete.");
  }
  const artifacts = Array.isArray(index.artifacts) ? index.artifacts : null;
  if (!artifacts || artifacts.length !== expected.size) throw reconciliationError("phase4_reconciliation_source_set_mismatch", "Index artifact accounting is invalid.");
  const byId = new Map();
  for (const metadata of artifacts) {
    const sourceId = String(metadata?.source_id ?? "").trim();
    if (!sourceId) throw reconciliationError("phase4_reconciliation_metadata_mismatch", "Index artifact metadata misses source_id.");
    if (byId.has(sourceId)) throw reconciliationError("phase4_reconciliation_duplicate_source", `Index duplicates ${sourceId}.`);
    byId.set(sourceId, metadata);
  }
  assertSameSet(expected, new Set(byId.keys()), "index artifact Source set");
  const rows = [];
  for (const sourceId of [...expected].sort()) {
    const metadata = byId.get(sourceId);
    const terminal = journal.terminal_artifacts[sourceId];
    const expectedRelativePath = `captures/${sourceId}.json`;
    if (metadata.artifact_relative_path !== expectedRelativePath) throw reconciliationError("phase4_reconciliation_artifact_path_mismatch", `${sourceId}: index path mismatch.`);
    const artifactPath = await assertRegularPath(run, sourceId);
    const { bytes, value: artifact } = await readJsonWithBytes(artifactPath);
    const artifactFileSha256 = sha256(bytes);
    if (metadata.artifact_sha256 !== artifactFileSha256 || terminal?.artifact_sha256 !== artifactFileSha256) {
      throw reconciliationError("phase4_reconciliation_artifact_sha_mismatch", `${sourceId}: raw artifact SHA mismatch.`);
    }
    try {
      validatePhase4CaptureArtifact(artifact, { expected: { sourceId, runIdentity, contractFingerprint }, metadata: terminal });
    } catch (error) {
      throw reconciliationError("phase4_reconciliation_artifact_validation_failure", `${sourceId}: ${error.code ?? error.message}`);
    }
    if (artifact.source_id !== sourceId || terminal?.source_id !== sourceId
      || artifact.run_identity !== runIdentity || artifact.contract_fingerprint !== contractFingerprint) {
      throw reconciliationError("phase4_reconciliation_metadata_mismatch", `${sourceId}: source or run metadata mismatch.`);
    }
    const canonicalSha256 = sha256(canonicalPhase4ArtifactJson(artifact));
    const comparison = artifact.same_html_comparison?.candidate_comparison ?? null;
    const parserRegression = comparison && (comparison.removed_real_notice_count > 0 || comparison.removed_unresolved_count > 0 || comparison.added_false_positive_count > 0);
    rows.push(stable({
      source_id: sourceId,
      artifact_file_sha256: artifactFileSha256,
      artifact_canonical_sha256: canonicalSha256,
      capture_status: artifact.capture_status,
      evidence_status: artifact.evidence_status,
      comparison_validation_status: comparison ? "exact_valid" : "not_present",
      action_class: artifact.capture_status === "capture_success" ? (parserRegression ? "parser_remediation" : "no_action") : "transport_recovery",
      evidence_basis: artifact.capture_status === "capture_success" ? "same_html_delta" : "capture_transport_evidence",
      normalized_transport_failure: artifact.capture_status === "capture_success" ? null : transportClass(artifact),
      same_html_comparison: artifact.same_html_comparison ?? null,
    }));
  }
  const count = (predicate) => rows.filter(predicate).length;
  return stable({
    schema_version: "phase4-authoritative-evidence-reconciliation-v2",
    run_identity: runIdentity,
    contract_fingerprint: contractFingerprint,
    input_file_sha256: {
      private_artifact_index: sha256(indexInput.bytes), journal: sha256(journalInput.bytes), private_run_summary: sha256(summaryInput.bytes),
    },
    accounting: {
      expected_source_count: expected.size, index_source_count: indexCreated.size, journal_source_count: journalSources.size,
      terminal_artifact_count: journalTerminal.size, incomplete_attempt_count: Object.keys(journal.attempts ?? {}).length,
      artifact_file_count: rows.length, capture_success_count: count((row) => row.capture_status === "capture_success"),
      transport_lane_count: count((row) => row.capture_status !== "capture_success"),
      verified_equivalent_count: count((row) => row.comparison_validation_status === "exact_valid" && row.action_class === "no_action"),
      parser_regression_count: count((row) => row.action_class === "parser_remediation"),
    },
    sources: rows,
  });
}
