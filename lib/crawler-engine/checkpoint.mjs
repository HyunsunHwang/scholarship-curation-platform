import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  canonicalizeNoticeUrl,
  extractExternalArticleId,
  sha256,
  stableUuid,
} from "../post-phase-l/normalized-graph.mjs";

export const CRAWLER_CHECKPOINT_SCHEMA_VERSION = 1;
export const CRAWLER_CHECKPOINT_RUNNER_VERSION = "engine-phase-2-gate-b-v1";

const CHECKPOINT_STATUSES = new Set(["running", "cancelled", "completed"]);
const CONFIGURATION_KEYS = Object.freeze([
  "allow_undated",
  "detail_concurrency",
  "document_parsing_enabled",
  "fetch_details",
  "host_concurrency",
  "host_minimum_interval_ms",
  "ignore_seen",
  "lookback_days",
  "maximum_items_per_source",
  "maximum_pages_per_source",
  "retry_backoff_ms",
  "retry_count",
  "retry_jitter_ratio",
  "retry_maximum_delay_ms",
  "runner_contract_version",
  "source_concurrency",
  "source_execution_isolation_enabled",
  "source_execution_mode",
  "source_execution_timeout_ms",
  "source_minimum_interval_ms",
  "timeout_ms",
  "transport_policy_registry_fingerprint",
  "transport_policy_registry_version",
  "transport_policy_schema_version",
  "resolved_transport_policy_fingerprints",
  "runtime_transport_overrides",
]);

function codepointCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function clean(value) {
  return String(value ?? "").trim();
}

function sameEvidence(left, right) {
  return clean(left?.source_key) === clean(right?.source_key) &&
    clean(left?.work_item_key) === clean(right?.work_item_key) &&
    clean(left?.reason_code) === clean(right?.reason_code);
}

function checkpointError(code, message, checkpointPath = null, cause = null) {
  const error = new Error(message);
  error.name = "CrawlerCheckpointError";
  error.code = code;
  error.checkpoint_path = checkpointPath;
  error.scheduling_started = false;
  error.scheduled_source_count = 0;
  error.scheduled_work_item_count = 0;
  if (cause) error.cause = cause;
  return error;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort(codepointCompare)
      .map((key) => [key, canonicalize(value[key])]),
  );
}

export function serializeCrawlerCheckpoint(checkpoint) {
  return `${JSON.stringify(canonicalize(checkpoint), null, 2)}\n`;
}

export function fingerprintCrawlerConfiguration(configuration = {}) {
  const selected = {};
  for (const key of CONFIGURATION_KEYS) {
    if (Object.hasOwn(configuration, key)) selected[key] = configuration[key];
  }
  return sha256(JSON.stringify(canonicalize(selected)));
}

export function normalizeCheckpointSourceKeys(sourceKeys) {
  const cleaned = (sourceKeys ?? []).map(clean);
  if (cleaned.some((key) => !key)) {
    throw checkpointError("checkpoint_invalid_source_key", "Checkpoint source keys must be non-empty.");
  }
  if (new Set(cleaned).size !== cleaned.length) {
    throw checkpointError("checkpoint_duplicate_source_key", "Checkpoint source keys must be unique.");
  }
  return cleaned.sort(codepointCompare);
}

export function fingerprintCrawlerSourceSet(sourceKeys) {
  return sha256(JSON.stringify(normalizeCheckpointSourceKeys(sourceKeys)));
}

export function buildCrawlerWorkItemKey(sourceKey, notice = {}) {
  const normalizedSourceKey = clean(sourceKey);
  const originalUrl = clean(
    notice.original_url ?? notice.notice_url ?? notice.noticeUrl ?? notice.canonical_url,
  );
  const canonicalUrl = canonicalizeNoticeUrl(notice.canonical_url ?? originalUrl);
  if (!normalizedSourceKey || !canonicalUrl) return null;
  const inlineSectionId = clean(notice.inline_section_id ?? notice.inlineSectionId);
  const externalArticleId = clean(notice.external_article_id) || extractExternalArticleId(canonicalUrl);
  const identityKey = inlineSectionId
    ? `inline:${inlineSectionId}`
    : externalArticleId ? `external:${externalArticleId}` : `url:${sha256(canonicalUrl)}`;
  return stableUuid("ingestion_notices", `${normalizedSourceKey}|${identityKey}`);
}

function normalizeEvidenceRows(rows, fieldName, sourceSet) {
  if (!Array.isArray(rows)) throw checkpointError("checkpoint_invalid_schema", `${fieldName} must be an array.`);
  const seen = new Set();
  return rows.map((row) => {
    const sourceKey = clean(row?.source_key);
    const workItemKey = row?.work_item_key == null ? null : clean(row.work_item_key);
    const reasonCode = clean(row?.reason_code);
    if (!sourceSet.has(sourceKey) || !reasonCode || (row?.work_item_key != null && !workItemKey)) {
      throw checkpointError("checkpoint_invalid_evidence", `${fieldName} contains malformed evidence.`);
    }
    const identity = `${sourceKey}\u0000${workItemKey ?? ""}\u0000${reasonCode}`;
    if (seen.has(identity)) throw checkpointError("checkpoint_duplicate_evidence", `${fieldName} contains duplicate evidence.`);
    seen.add(identity);
    return { source_key: sourceKey, work_item_key: workItemKey, reason_code: reasonCode };
  });
}

export function validateCrawlerCheckpoint(checkpoint, expected = {}) {
  const checkpointPath = expected.checkpointPath ?? null;
  try {
    if (!checkpoint || typeof checkpoint !== "object" || Array.isArray(checkpoint)) {
      throw checkpointError("checkpoint_invalid_schema", "Checkpoint root must be an object.", checkpointPath);
    }
    if (checkpoint.schema_version !== CRAWLER_CHECKPOINT_SCHEMA_VERSION) {
      throw checkpointError("checkpoint_unsupported_schema", "Checkpoint schema version is unsupported.", checkpointPath);
    }
    if (clean(checkpoint.runner_version) !== clean(expected.runnerVersion ?? CRAWLER_CHECKPOINT_RUNNER_VERSION)) {
      throw checkpointError("checkpoint_runner_mismatch", "Checkpoint runner version is incompatible.", checkpointPath);
    }
    if (!clean(checkpoint.run_identity)) {
      throw checkpointError("checkpoint_missing_run_identity", "Checkpoint run identity is required.", checkpointPath);
    }
    if (!/^[a-f0-9]{64}$/.test(clean(checkpoint.configuration_fingerprint)) ||
        !/^[a-f0-9]{64}$/.test(clean(checkpoint.source_set_fingerprint))) {
      throw checkpointError("checkpoint_invalid_fingerprint", "Checkpoint fingerprints are malformed.", checkpointPath);
    }
    if (expected.configurationFingerprint && checkpoint.configuration_fingerprint !== expected.configurationFingerprint) {
      throw checkpointError("checkpoint_configuration_mismatch", "Checkpoint configuration does not match this run.", checkpointPath);
    }
    if (expected.sourceSetFingerprint && checkpoint.source_set_fingerprint !== expected.sourceSetFingerprint) {
      throw checkpointError("checkpoint_source_set_mismatch", "Checkpoint source set does not match this run.", checkpointPath);
    }
    const sourceKeys = normalizeCheckpointSourceKeys(checkpoint.source_keys);
    const sourceSet = new Set(sourceKeys);
    if (
      checkpoint.transport_policy_registry_fingerprint != null
      && !/^[a-f0-9]{64}$/.test(clean(checkpoint.transport_policy_registry_fingerprint))
    ) {
      throw checkpointError(
        "checkpoint_invalid_transport_policy_fingerprint",
        "Checkpoint transport policy registry fingerprint is malformed.",
        checkpointPath,
      );
    }
    if (checkpoint.resolved_transport_policy_fingerprints != null) {
      if (
        !checkpoint.resolved_transport_policy_fingerprints
        || typeof checkpoint.resolved_transport_policy_fingerprints !== "object"
        || Array.isArray(checkpoint.resolved_transport_policy_fingerprints)
      ) {
        throw checkpointError(
          "checkpoint_invalid_transport_policy_fingerprint",
          "Checkpoint resolved transport policy fingerprints must be an object.",
          checkpointPath,
        );
      }
      for (const [sourceKey, fingerprint] of Object.entries(
        checkpoint.resolved_transport_policy_fingerprints,
      )) {
        if (!sourceSet.has(sourceKey) || !/^[a-f0-9]{64}$/.test(clean(fingerprint))) {
          throw checkpointError(
            "checkpoint_invalid_transport_policy_fingerprint",
            "Checkpoint contains a malformed source transport policy fingerprint.",
            checkpointPath,
          );
        }
      }
      const fingerprintSourceKeys = Object.keys(
        checkpoint.resolved_transport_policy_fingerprints,
      ).sort(codepointCompare);
      if (JSON.stringify(fingerprintSourceKeys) !== JSON.stringify(sourceKeys)) {
        throw checkpointError(
          "checkpoint_invalid_transport_policy_fingerprint",
          "Checkpoint transport policy fingerprints must cover the exact source set.",
          checkpointPath,
        );
      }
    }
    if (expected.sourceKeys && JSON.stringify(sourceKeys) !== JSON.stringify(normalizeCheckpointSourceKeys(expected.sourceKeys))) {
      throw checkpointError("checkpoint_source_keys_mismatch", "Checkpoint source keys do not match this run.", checkpointPath);
    }
    if (!CHECKPOINT_STATUSES.has(checkpoint.status)) {
      throw checkpointError("checkpoint_invalid_status", "Checkpoint status is invalid.", checkpointPath);
    }
    const completedSourceKeys = normalizeCheckpointSourceKeys(checkpoint.completed_source_keys);
    if (completedSourceKeys.some((key) => !sourceSet.has(key))) {
      throw checkpointError("checkpoint_invalid_completed_source", "Checkpoint completed sources are outside the source set.", checkpointPath);
    }
    if (!Array.isArray(checkpoint.completed_work_item_keys) ||
        checkpoint.completed_work_item_keys.some((key) => !/^[a-f0-9-]{36}$/.test(clean(key))) ||
        new Set(checkpoint.completed_work_item_keys).size !== checkpoint.completed_work_item_keys.length) {
      throw checkpointError("checkpoint_invalid_completed_work_item", "Checkpoint completed work-item identities are malformed or duplicated.", checkpointPath);
    }
    const failedWorkItems = normalizeEvidenceRows(checkpoint.failed_work_items, "failed_work_items", sourceSet);
    const cancelledWorkItems = normalizeEvidenceRows(checkpoint.cancelled_work_items, "cancelled_work_items", sourceSet);
    const summary = checkpoint.summary;
    if (!summary || typeof summary !== "object" ||
        Number(summary.source_total) !== sourceKeys.length ||
        Number(summary.source_completed) !== completedSourceKeys.length ||
        Number(summary.work_item_completed) !== checkpoint.completed_work_item_keys.length ||
        Number(summary.work_item_failed) !== failedWorkItems.length ||
        Number(summary.work_item_cancelled) !== cancelledWorkItems.length) {
      throw checkpointError("checkpoint_summary_mismatch", "Checkpoint summary contradicts recorded identities.", checkpointPath);
    }
    if (!clean(checkpoint.created_at) || !clean(checkpoint.updated_at)) {
      throw checkpointError("checkpoint_missing_timestamp", "Checkpoint timestamps are required.", checkpointPath);
    }
    return canonicalize({
      ...checkpoint,
      source_keys: sourceKeys,
      completed_source_keys: completedSourceKeys,
      completed_work_item_keys: [...checkpoint.completed_work_item_keys].sort(codepointCompare),
      failed_work_items: failedWorkItems,
      cancelled_work_items: cancelledWorkItems,
    });
  } catch (error) {
    if (error?.name === "CrawlerCheckpointError") {
      error.checkpoint_path ??= checkpointPath;
      throw error;
    }
    throw checkpointError("checkpoint_invalid_schema", "Checkpoint schema validation failed.", checkpointPath, error);
  }
}

export async function readCrawlerCheckpoint(checkpointPath, { fsApi = fs } = {}) {
  let raw;
  try {
    raw = await fsApi.readFile(checkpointPath, "utf8");
  } catch (error) {
    throw checkpointError("checkpoint_read_failed", "Checkpoint could not be read.", checkpointPath, error);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw checkpointError("checkpoint_corrupt_json", "Checkpoint is not valid JSON.", checkpointPath, error);
  }
}

export async function writeCrawlerCheckpointAtomic(checkpointPath, checkpoint, {
  fsApi = fs,
  beforeWrite,
  beforeRename,
  nonce = () => crypto.randomBytes(6).toString("hex"),
} = {}) {
  const resolvedPath = path.resolve(checkpointPath);
  const tempPath = `${resolvedPath}.tmp-${process.pid}-${nonce()}`;
  let handle = null;
  try {
    await fsApi.mkdir(path.dirname(resolvedPath), { recursive: true });
    await beforeWrite?.({ checkpointPath: resolvedPath, tempPath });
    handle = await fsApi.open(tempPath, "wx");
    await handle.writeFile(serializeCrawlerCheckpoint(checkpoint), "utf8");
    await handle.sync?.();
    await handle.close();
    handle = null;
    await beforeRename?.({ checkpointPath: resolvedPath, tempPath });
    await fsApi.rename(tempPath, resolvedPath);
    return resolvedPath;
  } catch (error) {
    try { await handle?.close(); } catch {}
    try { await fsApi.unlink(tempPath); } catch {}
    throw checkpointError("checkpoint_atomic_write_failed", "Checkpoint atomic write failed.", resolvedPath, error);
  }
}

function summaryFor(checkpoint) {
  return {
    source_total: checkpoint.source_keys.length,
    source_completed: checkpoint.completed_source_keys.length,
    work_item_completed: checkpoint.completed_work_item_keys.length,
    work_item_failed: checkpoint.failed_work_items.length,
    work_item_cancelled: checkpoint.cancelled_work_items.length,
  };
}

export async function createCrawlerCheckpointSession({
  checkpointPath,
  resume = false,
  runIdentity,
  sourceKeys,
  configuration = {},
  runnerVersion = CRAWLER_CHECKPOINT_RUNNER_VERSION,
  clock = { nowIso: () => new Date().toISOString() },
  fsApi = fs,
  atomicWriteOptions = {},
} = {}) {
  if (!checkpointPath) return null;
  const resolvedPath = path.resolve(checkpointPath);
  const normalizedSourceKeys = normalizeCheckpointSourceKeys(sourceKeys);
  const configurationFingerprint = fingerprintCrawlerConfiguration(configuration);
  const sourceSetFingerprint = fingerprintCrawlerSourceSet(normalizedSourceKeys);
  let checkpoint;
  if (resume) {
    checkpoint = validateCrawlerCheckpoint(await readCrawlerCheckpoint(resolvedPath, { fsApi }), {
      checkpointPath: resolvedPath,
      runnerVersion,
      configurationFingerprint,
      sourceSetFingerprint,
      sourceKeys: normalizedSourceKeys,
    });
    if (runIdentity && clean(runIdentity) !== checkpoint.run_identity) {
      throw checkpointError("checkpoint_run_identity_mismatch", "Checkpoint run identity does not match the requested run.", resolvedPath);
    }
  } else {
    try {
      await fsApi.access(resolvedPath);
      throw checkpointError("checkpoint_exists_resume_required", "Checkpoint already exists; use explicit resume or a new path.", resolvedPath);
    } catch (error) {
      if (error?.name === "CrawlerCheckpointError") throw error;
      if (error?.code !== "ENOENT") throw checkpointError("checkpoint_access_failed", "Checkpoint path could not be inspected.", resolvedPath, error);
    }
    const now = clock.nowIso();
    checkpoint = {
      schema_version: CRAWLER_CHECKPOINT_SCHEMA_VERSION,
      runner_version: runnerVersion,
      run_identity: clean(runIdentity) || crypto.randomUUID(),
      configuration_fingerprint: configurationFingerprint,
      source_set_fingerprint: sourceSetFingerprint,
      ...(clean(configuration.transport_policy_registry_fingerprint)
        ? {
            transport_policy_registry_fingerprint:
              clean(configuration.transport_policy_registry_fingerprint),
          }
        : {}),
      ...(Object.hasOwn(configuration, "resolved_transport_policy_fingerprints")
        ? {
            resolved_transport_policy_fingerprints: canonicalize(
              configuration.resolved_transport_policy_fingerprints,
            ),
          }
        : {}),
      source_keys: normalizedSourceKeys,
      completed_source_keys: [],
      completed_work_item_keys: [],
      failed_work_items: [],
      cancelled_work_items: [],
      status: "running",
      cancellation_reason: null,
      summary: {
        source_total: normalizedSourceKeys.length,
        source_completed: 0,
        work_item_completed: 0,
        work_item_failed: 0,
        work_item_cancelled: 0,
      },
      created_at: now,
      updated_at: now,
    };
    await writeCrawlerCheckpointAtomic(resolvedPath, checkpoint, { fsApi, ...atomicWriteOptions });
  }

  let queue = Promise.resolve();
  let closed = false;
  const enqueue = (mutator) => {
    queue = queue.then(async () => {
      mutator(checkpoint);
      checkpoint.completed_source_keys = [...new Set(checkpoint.completed_source_keys)].sort(codepointCompare);
      checkpoint.completed_work_item_keys = [...new Set(checkpoint.completed_work_item_keys)].sort(codepointCompare);
      checkpoint.summary = summaryFor(checkpoint);
      checkpoint.updated_at = clock.nowIso();
      checkpoint = validateCrawlerCheckpoint(checkpoint, {
        checkpointPath: resolvedPath,
        runnerVersion,
        configurationFingerprint,
        sourceSetFingerprint,
        sourceKeys: normalizedSourceKeys,
      });
      await writeCrawlerCheckpointAtomic(resolvedPath, checkpoint, { fsApi, ...atomicWriteOptions });
      return checkpoint;
    });
    return queue;
  };

  return {
    checkpoint_path: resolvedPath,
    resumed: resume,
    run_identity: checkpoint.run_identity,
    configuration_fingerprint: configurationFingerprint,
    source_set_fingerprint: sourceSetFingerprint,
    shouldSkipSource(sourceKey) {
      return checkpoint.completed_source_keys.includes(clean(sourceKey));
    },
    shouldSkipWorkItem(workItemKey) {
      return Boolean(workItemKey) && checkpoint.completed_work_item_keys.includes(clean(workItemKey));
    },
    async recordWorkItem({ sourceKey, workItemKey, status = "completed", reasonCode = status }) {
      if (closed) return;
      const normalizedSourceKey = clean(sourceKey);
      const normalizedWorkItemKey = clean(workItemKey);
      if (!normalizedSourceKeys.includes(normalizedSourceKey) || !normalizedWorkItemKey) return;
      await enqueue((next) => {
        if (status === "completed") {
          next.completed_work_item_keys.push(normalizedWorkItemKey);
        } else {
          const target = status === "cancelled" ? next.cancelled_work_items : next.failed_work_items;
          const row = { source_key: normalizedSourceKey, work_item_key: normalizedWorkItemKey, reason_code: clean(reasonCode) || status };
          if (!target.some((item) => sameEvidence(item, row))) target.push(row);
        }
      });
    },
    async recordSourceResult(result) {
      if (closed) return;
      const sourceKey = clean(result?.source_key);
      await enqueue((next) => {
        if (["success", "empty_observed"].includes(result?.result_status)) next.completed_source_keys.push(sourceKey);
        for (const notice of result?.notices ?? []) {
          if (clean(notice?.detailResultStatus)) continue;
          const workItemKey = buildCrawlerWorkItemKey(sourceKey, notice);
          if (workItemKey) next.completed_work_item_keys.push(workItemKey);
        }
        if (!["success", "empty_observed"].includes(result?.result_status) && !result?.cancelled) {
          const row = { source_key: sourceKey, work_item_key: null, reason_code: clean(result?.final_reason_code ?? result?.error_code) || "source_failed" };
          if (!next.failed_work_items.some((item) => sameEvidence(item, row))) next.failed_work_items.push(row);
        }
      });
    },
    async markCancelled(reason = "crawler_cancelled", cancelledRows = []) {
      try {
        await enqueue((next) => {
          next.status = "cancelled";
          next.cancellation_reason = clean(reason) || "crawler_cancelled";
          for (const row of cancelledRows) {
            const normalized = {
              source_key: clean(row.source_key),
              work_item_key: row.work_item_key ? clean(row.work_item_key) : null,
              reason_code: clean(row.reason_code) || next.cancellation_reason,
            };
            if (normalized.source_key && !next.cancelled_work_items.some((item) => sameEvidence(item, normalized))) {
              next.cancelled_work_items.push(normalized);
            }
          }
        });
        closed = true;
        return { checkpoint_saved: true, checkpoint_save_error: null };
      } catch (error) {
        closed = true;
        return { checkpoint_saved: false, checkpoint_save_error: clean(error?.code) || "checkpoint_save_failed" };
      }
    },
    async markCompleted() {
      await enqueue((next) => {
        next.status = "completed";
        next.cancellation_reason = null;
      });
      closed = true;
    },
    snapshot() {
      return structuredClone(checkpoint);
    },
    async flush() {
      await queue;
    },
  };
}

export function installCrawlerSignalHandlers({
  signalTarget = process,
  controller,
  onSecondSignal = () => {},
} = {}) {
  if (!controller || typeof controller.abort !== "function") {
    throw new TypeError("An AbortController is required for crawler signal handling.");
  }
  let firstSignal = null;
  let disposed = false;
  const handler = (signalName) => {
    if (!firstSignal) {
      firstSignal = signalName;
      controller.abort(signalName);
      return;
    }
    onSecondSignal({ first_signal: firstSignal, second_signal: signalName });
  };
  const onSigint = () => handler("SIGINT");
  const onSigterm = () => handler("SIGTERM");
  signalTarget.on("SIGINT", onSigint);
  signalTarget.on("SIGTERM", onSigterm);
  return {
    get first_signal() { return firstSignal; },
    dispose() {
      if (disposed) return;
      disposed = true;
      signalTarget.off("SIGINT", onSigint);
      signalTarget.off("SIGTERM", onSigterm);
    },
  };
}

export function parseCrawlerCheckpointArguments(argv = []) {
  const positional = [];
  const options = {
    checkpoint_path: null,
    resume: false,
    run_identity: null,
    settle_timeout_ms: 5_000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = String(argv[index]);
    if (argument === "--resume") {
      options.resume = true;
    } else if (argument === "--checkpoint-path" || argument === "--run-identity" || argument === "--settle-timeout-ms") {
      const value = argv[index + 1];
      if (value == null || String(value).startsWith("--")) {
        throw checkpointError("checkpoint_cli_option_missing_value", `${argument} requires a value.`);
      }
      index += 1;
      if (argument === "--checkpoint-path") options.checkpoint_path = String(value);
      if (argument === "--run-identity") options.run_identity = clean(value);
      if (argument === "--settle-timeout-ms") {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed < 0) {
          throw checkpointError("checkpoint_cli_invalid_settle_timeout", "--settle-timeout-ms must be a non-negative number.");
        }
        options.settle_timeout_ms = Math.floor(parsed);
      }
    } else if (argument.startsWith("--")) {
      throw checkpointError("checkpoint_cli_unknown_option", `Unknown crawler option: ${argument}`);
    } else {
      positional.push(argument);
    }
  }
  if (options.resume && !options.checkpoint_path) {
    throw checkpointError("checkpoint_cli_resume_requires_path", "--resume requires --checkpoint-path.");
  }
  return { positional, ...options };
}
