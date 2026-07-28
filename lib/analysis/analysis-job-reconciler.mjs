import { createHash } from "node:crypto";
import {
  ANALYSIS_KIND_SCHOLARSHIP_SEMANTIC,
  ANALYSIS_SCHEMA_VERSION,
  DEFAULT_PROMPT_VERSION,
  buildAnalysisInputFingerprint,
  buildAnalysisJobIdempotencyKey,
  evaluateAnalysisReadiness,
} from "./analysis-readiness.mjs";

export const RECONCILE_ACTIONS = Object.freeze([
  "create_job",
  "reuse_existing_job",
  "defer_waiting_for_assets",
  "defer_budget",
  "skip_not_eligible",
  "supersede_old_job",
  "retry_existing_job",
  "no_action_completed",
  "mark_terminal_max_attempts",
]);

const ACTIVE_JOB_STATUSES = new Set([
  "pending",
  "leased",
  "running",
  "retryable_failed",
  "budget_deferred",
]);

function clean(value) {
  return String(value ?? "").trim();
}

function stableUuid(namespace, value) {
  const hash = createHash("sha256").update(`${namespace}\u0000${value}`).digest("hex");
  const chars = hash.slice(0, 32).split("");
  chars[12] = "5";
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const hex = chars.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function sameContract(job, contract) {
  return clean(job.analysis_kind) === contract.analysisKind
    && clean(job.prompt_version) === contract.promptVersion
    && clean(job.schema_version) === contract.schemaVersion
    && clean(job.input_fingerprint) === contract.inputFingerprint;
}

function buildJobRecord({
  noticeId,
  revisionId,
  readiness,
  contract,
  priority = 100,
  maxAttempts = 3,
  now,
}) {
  const idempotencyKey = buildAnalysisJobIdempotencyKey({
    revisionId,
    analysisKind: contract.analysisKind,
    promptVersion: contract.promptVersion,
    schemaVersion: contract.schemaVersion,
    inputFingerprint: contract.inputFingerprint,
  });
  return {
    id: stableUuid("notice_analysis_jobs", idempotencyKey),
    notice_id: noticeId,
    revision_id: revisionId,
    status: "pending",
    priority,
    analysis_kind: contract.analysisKind,
    provider_policy: contract.providerPolicy,
    model_policy: contract.modelPolicy,
    prompt_version: contract.promptVersion,
    schema_version: contract.schemaVersion,
    input_fingerprint: contract.inputFingerprint,
    idempotency_key: idempotencyKey,
    readiness_status: readiness.status,
    readiness_reason_codes: readiness.reason_codes,
    attempt_count: 0,
    max_attempts: maxAttempts,
    available_at: now,
    leased_at: null,
    lease_expires_at: null,
    leased_by: null,
    last_error_code: null,
    last_error_message: null,
    created_at: now,
    updated_at: now,
    completed_at: null,
    cancelled_at: null,
    metadata: {
      input_profile: readiness.input_profile,
    },
  };
}

/**
 * Pure deterministic job reconciliation planner.
 * Operates on in-memory snapshots only.
 *
 * Completed-result detection uses job.input_fingerprint (option B):
 * results do not duplicate input_fingerprint; join result → job.
 */
export function reconcileAnalysisJobs(input = {}) {
  const now = clean(input.now) || "2026-07-28T05:00:00.000Z";
  const revision = input.revision ?? null;
  const notice = input.notice ?? {};
  const assets = input.assets ?? [];
  const source = input.source ?? {};
  const existingJobs = Array.isArray(input.existing_jobs) ? input.existing_jobs : [];
  const existingResults = Array.isArray(input.existing_results) ? input.existing_results : [];
  const policy = input.policy ?? {};

  const analysisKind = clean(policy.analysis_kind) || ANALYSIS_KIND_SCHOLARSHIP_SEMANTIC;
  const promptVersion = clean(policy.prompt_version) || DEFAULT_PROMPT_VERSION;
  const schemaVersion = clean(policy.schema_version) || ANALYSIS_SCHEMA_VERSION;
  const providerPolicy = clean(policy.provider_policy) || "anthropic";
  const modelPolicy = clean(policy.model_policy) || "claude-sonnet-5";
  const maxAttempts = Number(policy.max_attempts ?? 3) || 3;
  const priority = Number(policy.priority ?? 100) || 100;

  const readiness = evaluateAnalysisReadiness({
    revision,
    notice,
    assets,
    source,
    candidate_classification: input.candidate_classification,
    document_type: input.document_type,
    notice_type: input.notice_type ?? "new_recruitment",
    multiple_programs_suspected: input.multiple_programs_suspected,
    personal_data_risk: input.personal_data_risk,
    scholarship_dedicated: input.scholarship_dedicated,
    budget_deferred: input.budget_deferred,
    privacy_status: input.privacy_status ?? "clear",
    privacy: input.privacy,
    redaction_version: input.redaction_version,
    detected_pattern_hints: input.detected_pattern_hints,
  });

  if (!revision?.id || !revision?.notice_id && !notice?.id) {
    return {
      action: "skip_not_eligible",
      job: null,
      readiness,
      reason_codes: ["MISSING_REVISION_OR_NOTICE"],
      supersede_job_ids: [],
    };
  }

  const noticeId = clean(notice.id ?? revision.notice_id);
  const revisionId = clean(revision.id);
  const inputFingerprint = buildAnalysisInputFingerprint({
    revision: { ...revision, notice_id: noticeId },
    assets,
    source: { ...source, source_id: source.source_id ?? notice.source_id, notice_id: noticeId },
  });
  const contract = {
    analysisKind,
    promptVersion,
    schemaVersion,
    providerPolicy,
    modelPolicy,
    inputFingerprint,
  };

  if (readiness.status === "waiting_for_assets") {
    return {
      action: "defer_waiting_for_assets",
      job: null,
      readiness,
      reason_codes: readiness.reason_codes,
      supersede_job_ids: [],
    };
  }

  if (readiness.status === "budget_deferred") {
    return {
      action: "defer_budget",
      job: null,
      readiness,
      reason_codes: readiness.reason_codes,
      supersede_job_ids: [],
    };
  }

  if (!readiness.ready) {
    return {
      action: "skip_not_eligible",
      job: null,
      readiness,
      reason_codes: readiness.reason_codes,
      supersede_job_ids: [],
    };
  }

  const matchingJobs = existingJobs.filter((job) =>
    clean(job.revision_id) === revisionId && sameContract(job, contract));

  const jobsById = new Map(existingJobs.map((job) => [clean(job.id), job]));
  const completedJob = matchingJobs.find((job) => clean(job.status) === "succeeded");
  const completedViaResult = existingResults.find((result) => {
    if (clean(result.revision_id) !== revisionId) return false;
    if (clean(result.result_status) !== "validated") return false;
    if (clean(result.analysis_schema_version ?? result.schema_version) !== schemaVersion) {
      return false;
    }
    const parentJob = jobsById.get(clean(result.job_id));
    if (!parentJob) return false;
    return sameContract(parentJob, contract);
  });

  if (completedJob || completedViaResult) {
    return {
      action: "no_action_completed",
      job: completedJob ?? jobsById.get(clean(completedViaResult.job_id)) ?? null,
      readiness,
      reason_codes: ["COMPLETED_RESULT_EXISTS"],
      supersede_job_ids: [],
    };
  }

  const retryable = matchingJobs.find((job) => clean(job.status) === "retryable_failed");
  if (retryable) {
    if (Number(retryable.attempt_count ?? 0) >= Number(retryable.max_attempts ?? maxAttempts)) {
      return {
        action: "mark_terminal_max_attempts",
        job: {
          ...retryable,
          status: "terminal_failed",
          completed_at: now,
          updated_at: now,
          leased_by: null,
          lease_expires_at: null,
        },
        readiness,
        reason_codes: ["MAX_ATTEMPTS_EXCEEDED"],
        supersede_job_ids: [],
      };
    }
    return {
      action: "retry_existing_job",
      job: {
        ...retryable,
        status: "pending",
        available_at: now,
        updated_at: now,
        leased_at: null,
        lease_expires_at: null,
        leased_by: null,
      },
      readiness,
      reason_codes: ["RETRYABLE_FAILURE"],
      supersede_job_ids: [],
    };
  }

  const active = matchingJobs.find((job) => ACTIVE_JOB_STATUSES.has(clean(job.status)));
  if (active) {
    return {
      action: "reuse_existing_job",
      job: active,
      readiness,
      reason_codes: ["EXISTING_ACTIVE_JOB"],
      supersede_job_ids: [],
    };
  }

  const pendingOlder = existingJobs.filter((job) =>
    clean(job.notice_id) === noticeId
    && clean(job.revision_id) !== revisionId
    && ["pending", "retryable_failed", "budget_deferred"].includes(clean(job.status)));

  const job = buildJobRecord({
    noticeId,
    revisionId,
    readiness,
    contract,
    priority,
    maxAttempts,
    now,
  });

  return {
    action: pendingOlder.length > 0 ? "supersede_old_job" : "create_job",
    job,
    readiness,
    reason_codes: pendingOlder.length > 0
      ? ["NEW_REVISION_REQUIRES_JOB", "SUPERSEDE_OLDER_PENDING"]
      : ["CREATE_NEW_JOB"],
    supersede_job_ids: pendingOlder.map((jobRow) => jobRow.id),
  };
}
