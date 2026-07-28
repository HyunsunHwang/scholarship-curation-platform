function clean(value) {
  return String(value ?? "").trim();
}

function clone(value) {
  return structuredClone(value);
}

/** Statuses that may be claimed without an expired lease. budget_deferred requires explicit release to pending. */
export const AUTO_CLAIMABLE_JOB_STATUSES = Object.freeze([
  "pending",
  "retryable_failed",
]);

/** Statuses reclaimable only after lease expiry. */
export const EXPIRED_LEASE_CLAIMABLE_STATUSES = Object.freeze([
  "leased",
  "running",
]);

export function isJobClaimable({ job, now }) {
  const status = clean(job?.status);
  const attempts = Number(job?.attempt_count ?? 0);
  const maxAttempts = Number(job?.max_attempts ?? 3);
  if (!(attempts < maxAttempts)) return false;
  if (status === "budget_deferred") return false;
  if (["succeeded", "terminal_failed", "cancelled", "superseded"].includes(status)) {
    return false;
  }
  const leaseExpired = job?.lease_expires_at && clean(job.lease_expires_at) <= clean(now);
  if (AUTO_CLAIMABLE_JOB_STATUSES.includes(status)) {
    return clean(job.available_at || now) <= clean(now);
  }
  if (EXPIRED_LEASE_CLAIMABLE_STATUSES.includes(status)) {
    return Boolean(leaseExpired);
  }
  return false;
}

export function isLeaseActive({ job, now }) {
  if (!job?.lease_expires_at) return false;
  return clean(job.lease_expires_at) > clean(now);
}

/**
 * Pure in-memory lease queue contract mirroring planned SQL RPCs.
 * Used for fixture tests without DB access.
 */
export function claimNoticeAnalysisJobs({
  jobs = [],
  workerId,
  limit = 1,
  now = "2026-07-28T05:00:00.000Z",
  leaseSeconds = 300,
} = {}) {
  const owner = clean(workerId);
  if (!owner) throw new Error("worker_id_required");
  const claimed = [];
  const nextJobs = jobs.map((job) => clone(job));

  for (const job of nextJobs) {
    if (claimed.length >= limit) break;
    if (!isJobClaimable({ job, now })) continue;

    job.status = "leased";
    job.leased_by = owner;
    job.leased_at = now;
    job.lease_expires_at = new Date(Date.parse(now) + leaseSeconds * 1000).toISOString();
    job.attempt_count = Number(job.attempt_count ?? 0) + 1;
    job.updated_at = now;
    claimed.push(clone(job));
  }

  return { jobs: nextJobs, claimed };
}

function findValidatedResultForJob(results = [], job) {
  return (Array.isArray(results) ? results : []).find((result) =>
    clean(result.job_id) === clean(job.id)
    && clean(result.revision_id) === clean(job.revision_id)
    && clean(result.notice_id) === clean(job.notice_id)
    && clean(result.result_status) === "validated"
    && clean(result.run_id));
}

function findSucceededValidatedRun(runs = [], job, result) {
  return (Array.isArray(runs) ? runs : []).find((run) =>
    clean(run.id) === clean(result.run_id)
    && clean(run.job_id) === clean(job.id)
    && clean(run.status) === "succeeded"
    && clean(run.validation_status) === "validated"
    && Boolean(clean(run.finished_at)));
}

export function completeNoticeAnalysisJob({
  jobs = [],
  runs = [],
  results = [],
  jobId,
  workerId,
  now = "2026-07-28T05:00:00.000Z",
} = {}) {
  const nextJobs = jobs.map((job) => clone(job));
  const job = nextJobs.find((row) => clean(row.id) === clean(jobId));
  if (!job) return { ok: false, reason: "job_not_found", jobs: nextJobs };
  if (clean(job.leased_by) !== clean(workerId)) {
    return { ok: false, reason: "lease_owner_mismatch", jobs: nextJobs };
  }
  if (!["leased", "running"].includes(clean(job.status))) {
    return { ok: false, reason: "invalid_status", jobs: nextJobs };
  }
  if (!isLeaseActive({ job, now })) {
    return { ok: false, reason: "lease_expired", jobs: nextJobs };
  }
  const validated = findValidatedResultForJob(results, job);
  if (!validated) {
    return {
      ok: false,
      reason: "complete_notice_analysis_job_rejected_missing_validated_result",
      jobs: nextJobs,
    };
  }
  const run = findSucceededValidatedRun(runs, job, validated);
  if (!run) {
    return {
      ok: false,
      reason: "complete_notice_analysis_job_rejected_run_not_validated",
      jobs: nextJobs,
    };
  }

  job.status = "succeeded";
  job.completed_at = now;
  job.updated_at = now;
  job.leased_by = null;
  job.lease_expires_at = null;
  return { ok: true, reason: null, jobs: nextJobs, job: clone(job) };
}

export function failNoticeAnalysisJob({
  jobs = [],
  jobId,
  workerId,
  now = "2026-07-28T05:00:00.000Z",
  errorCode = "provider_error",
  errorMessage = "retryable failure",
  retryable = true,
  retryDelaySeconds = 60,
} = {}) {
  const nextJobs = jobs.map((job) => clone(job));
  const job = nextJobs.find((row) => clean(row.id) === clean(jobId));
  if (!job) return { ok: false, reason: "job_not_found", jobs: nextJobs };
  if (clean(job.leased_by) !== clean(workerId)) {
    return { ok: false, reason: "lease_owner_mismatch", jobs: nextJobs };
  }
  if (!["leased", "running"].includes(clean(job.status))) {
    return { ok: false, reason: "invalid_status", jobs: nextJobs };
  }
  if (!isLeaseActive({ job, now })) {
    return { ok: false, reason: "lease_expired", jobs: nextJobs };
  }
  const attempts = Number(job.attempt_count ?? 0);
  const maxAttempts = Number(job.max_attempts ?? 3);
  const terminal = !retryable || attempts >= maxAttempts;
  job.status = terminal ? "terminal_failed" : "retryable_failed";
  job.last_error_code = errorCode;
  job.last_error_message = errorMessage;
  job.updated_at = now;
  job.leased_by = null;
  job.lease_expires_at = null;
  job.available_at = terminal
    ? now
    : new Date(Date.parse(now) + retryDelaySeconds * 1000).toISOString();
  if (terminal) job.completed_at = now;
  return { ok: true, reason: null, jobs: nextJobs, job: clone(job) };
}
