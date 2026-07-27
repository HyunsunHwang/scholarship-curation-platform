import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createPhase4PrivateArtifactIndex } from "../lib/crawler-engine/runtime-diagnostics/phase4-private-artifact-retention.mjs";
import { validatePhase4CaptureJournal } from "../lib/crawler-engine/runtime-diagnostics/phase4-capture-orchestration.mjs";
import { validatePhase4CaptureArtifact } from "../lib/crawler-engine/runtime-diagnostics/phase4-capture-artifact-validator.mjs";

const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeNew = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
const countBy = (rows, field) => Object.fromEntries([...new Set(rows.map((row) => row[field] ?? "none"))].sort().map((value) => [value, rows.filter((row) => (row[field] ?? "none") === value).length]));
const required = (value, name) => { if (!value) throw new Error(`${name} is required.`); return value; };

export function finalizePhase4FullCapture({ runDirectory, reportJsonPath, reportMarkdownPath, authorityControlCommit, branch = "fix/crawler-phase2-parser-remediation" } = {}) {
  const run = path.resolve(required(runDirectory, "runDirectory"));
  const captures = path.join(run, "captures");
  const checkpointPath = path.join(run, "checkpoint.json");
  const journalPath = `${checkpointPath}.phase4-capture.json`;
  const files = fs.readdirSync(captures).filter((file) => file.endsWith(".json")).sort();
  if (files.length !== 87) throw new Error("phase4_finalization_result_count_mismatch");
  const artifacts = files.map((file) => ({ file, value: read(path.join(captures, file)) }));
  const first = artifacts[0]?.value;
  const runIdentity = first?.run_identity; const contractFingerprint = first?.contract_fingerprint;
  if (!runIdentity || !contractFingerprint || new Set(artifacts.map(({ value }) => `${value.run_identity}|${value.contract_fingerprint}`)).size !== 1) throw new Error("phase4_finalization_contract_mismatch");
  const sourceIds = artifacts.map(({ value }) => value.source_id).sort();
  if (new Set(sourceIds).size !== 87) throw new Error("phase4_finalization_duplicate_source");
  for (const { value } of artifacts) validatePhase4CaptureArtifact(value, { expected: { sourceId: value.source_id, runIdentity, contractFingerprint } });
  const journal = validatePhase4CaptureJournal(read(journalPath), { runIdentity, contractFingerprint, sourceIds });
  if (Object.keys(journal.attempts).length || Object.keys(journal.terminal_artifacts).length !== 87) throw new Error("phase4_finalization_incomplete_run");
  const indexRows = artifacts.map(({ file, value }) => ({
    source_id: value.source_id, capture_status: value.capture_status, artifact_relative_path: `captures/${file}`,
    artifact_sha256: hash(fs.readFileSync(path.join(captures, file))), html_sha256: value.capture?.html_sha256 ?? null,
    response_byte_count: value.capture?.response_byte_count ?? 0, capture_id: value.capture?.capture_id ?? null,
    source_config_sha256: value.contract.sources.find((row) => row.source_id === value.source_id).source_config_sha256,
    transport_policy_fingerprint: value.contract.sources.find((row) => row.source_id === value.source_id).resolved_transport_policy_fingerprint ?? "unavailable",
  }));
  const index = createPhase4PrivateArtifactIndex({ runDirectory: run, contractFingerprint, codeSha: first.contract.code_sha, authorityControlCommit: required(authorityControlCommit, "authorityControlCommit"), sourceCount: 87, artifacts: indexRows });
  const rows = artifacts.map(({ file, value }) => ({ source_id: value.source_id, capture_status: value.capture_status, evidence_status: value.evidence_status, next_phase_queue: value.next_phase_queue, blocking_reason: value.blocking_reason, artifact_sha256: hash(fs.readFileSync(path.join(captures, file))) })).sort((a, b) => a.source_id.localeCompare(b.source_id));
  const accounting = { result_count: 87, capture_success_count: rows.filter((r) => r.capture_status === "capture_success").length, blocked_external_count: rows.filter((r) => r.capture_status === "blocked_external").length, transport_failure_count: rows.filter((r) => r.capture_status === "transport_failure").length, invalid_content_count: rows.filter((r) => r.capture_status === "invalid_content").length, artifact_commit_failure_count: 0, terminal_artifact_count: 87, incomplete_attempt_count: 0, verified_artifact_count: 87, remaining_source_count: 0 };
  const privateSummary = { schema_version: "phase4-private-run-summary-v1", run_identity: runIdentity, contract_fingerprint: contractFingerprint, accounting, checkpoint_sha256: hash(fs.readFileSync(checkpointPath)), journal_sha256: hash(fs.readFileSync(journalPath)), private_index_sha256: index.index_sha256 };
  writeNew(path.join(run, "private-run-summary.json"), privateSummary);
  const report = { schema_version: "phase4-full-capture-live-v1", implementation_code_sha: first.contract.code_sha, repository_branch: branch, contract_fingerprint: contractFingerprint, derived_run_identity: runIdentity, execution: { target_source_count: 87, ...first.contract.execution, logical_list_fetch_budget: 87, detail_fetch_count: 0, pagination_fetch_count: 0 }, accounting, comparison: { ready_for_fixture_count: rows.filter((r) => r.evidence_status === "ready_for_fixture").length, historical_control_reconciliation_count: rows.filter((r) => r.next_phase_queue === "historical_control_reconciliation").length }, next_phase_queue_counts: countBy(rows, "next_phase_queue"), blocking_reason_counts: countBy(rows, "blocking_reason"), sources: rows };
  writeNew(path.resolve(reportJsonPath), report);
  fs.writeFileSync(path.resolve(reportMarkdownPath), `# Phase 4 full capture\n\n- Sources: 87\n- Capture success: ${accounting.capture_success_count}\n- Blocked external: ${accounting.blocked_external_count}\n- Transport failure: ${accounting.transport_failure_count}\n- Verified artifacts: 87\n- Remaining: 0\n`, { flag: "wx" });
  return report;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const [runDirectory, reportJsonPath, reportMarkdownPath, authorityControlCommit] = process.argv.slice(2);
  finalizePhase4FullCapture({ runDirectory, reportJsonPath, reportMarkdownPath, authorityControlCommit });
}
