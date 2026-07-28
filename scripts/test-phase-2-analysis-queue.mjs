import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  ANALYSIS_SCHEMA_VERSION,
  DEFAULT_PROMPT_VERSION,
  buildAnalysisInputFingerprint,
  buildAnalysisJobIdempotencyKey,
  buildAnalysisResultFingerprint,
  evaluateAnalysisReadiness,
  emptyScholarshipAnalysisEnvelope,
} from "../lib/analysis/analysis-readiness.mjs";
import { reconcileAnalysisJobs } from "../lib/analysis/analysis-job-reconciler.mjs";
import {
  AUTO_CLAIMABLE_JOB_STATUSES,
  EXPIRED_LEASE_CLAIMABLE_STATUSES,
  claimNoticeAnalysisJobs,
  completeNoticeAnalysisJob,
  failNoticeAnalysisJob,
  isJobClaimable,
} from "../lib/analysis/analysis-job-lease.mjs";
import { buildPrivacyRedactionContract } from "../lib/analysis/analysis-privacy-contract.mjs";

const NOTICE_ID = "22222222-2222-5222-8222-222222222222";
const USABLE_ATTACHMENT = "첨부 추출 텍스트가 충분히 길어서 의미 분석 입력이 가능한 신규 장학 모집 안내입니다. 신청 자격과 제출 서류를 확인하세요. 지원 대상은 재학생이며 성적과 소득 기준을 충족해야 합니다.";

function revisionFixture(overrides = {}) {
  return {
    id: "11111111-1111-5111-8111-111111111111",
    notice_id: NOTICE_ID,
    title: "2026 교내 장학금 모집",
    body: "본문 텍스트가 충분히 길어서 의미 분석 입력이 가능한 신규 장학 모집 안내입니다. 신청 자격과 제출 서류를 확인하세요. 지원 대상은 재학생이며 성적과 소득 기준을 충족해야 합니다. 자세한 일정은 공지 본문을 따릅니다.",
    ...overrides,
  };
}

function eligibleInput(overrides = {}) {
  return {
    revision: revisionFixture(),
    notice: { id: NOTICE_ID },
    assets: [],
    candidate_classification: "candidate",
    notice_type: "new_recruitment",
    privacy_status: "clear",
    existing_jobs: [],
    ...overrides,
  };
}

function assertAction(result, action) {
  assert.equal(result.action, action, `expected ${action}, got ${result.action}: ${result.reason_codes}`);
}

function validatedResultFor(job, runId = "run-1") {
  return {
    job_id: job.id,
    run_id: runId,
    notice_id: job.notice_id,
    revision_id: job.revision_id,
    result_status: "validated",
    analysis_schema_version: job.schema_version,
  };
}

const sql = fs.readFileSync(
  path.resolve("supabase/post-phase-l/004_notice_analysis_schema.sql"),
  "utf8",
);

// Case 1 — Eligible body-only Revision
{
  const readiness = evaluateAnalysisReadiness(eligibleInput());
  assert.equal(readiness.ready, true);
  assert.equal(readiness.status, "ready");
  const plan = reconcileAnalysisJobs(eligibleInput());
  assertAction(plan, "create_job");
  assert.equal(plan.job.status, "pending");
  assert.equal(plan.job.provider_policy, "anthropic");
  assert.notEqual(plan.job.provider_policy, "antropic");
}

// Case 2 — Waiting for attachment extraction
{
  const plan = reconcileAnalysisJobs(eligibleInput({
    revision: revisionFixture({ body: "짧은 본문" }),
    assets: [{
      original_url_hash: "a".repeat(64),
      verification_status: "pending",
      extracted_text: "",
    }],
  }));
  assertAction(plan, "defer_waiting_for_assets");
  assert.equal(plan.readiness.status, "waiting_for_assets");
}

// Case 3 — Excluded result/roster
{
  const plan = reconcileAnalysisJobs(eligibleInput({
    revision: revisionFixture({
      title: "2026 장학생 합격자 명단",
      body: "최종 합격자 명단을 안내합니다. ".repeat(10),
    }),
    notice_type: "result_or_roster",
  }));
  assertAction(plan, "skip_not_eligible");
  assert.equal(plan.readiness.status, "excluded_result_or_roster");
}

// Case 4 — Low-quality Korean text
{
  const plan = reconcileAnalysisJobs(eligibleInput({
    revision: revisionFixture({
      body: `깨진 텍스트 ${"\uFFFD".repeat(40)} 추가 내용`,
    }),
  }));
  assertAction(plan, "skip_not_eligible");
  assert.equal(plan.readiness.status, "excluded_low_text_quality");
}

// Case 5 — Duplicate reconciliation
{
  const first = reconcileAnalysisJobs(eligibleInput());
  const second = reconcileAnalysisJobs(eligibleInput({ existing_jobs: [first.job] }));
  assertAction(second, "reuse_existing_job");
  assert.equal(second.job.id, first.job.id);
}

// Case 6 — Completed result reuse
{
  const created = reconcileAnalysisJobs(eligibleInput());
  const completedJob = { ...created.job, status: "succeeded" };
  const again = reconcileAnalysisJobs(eligibleInput({ existing_jobs: [completedJob] }));
  assertAction(again, "no_action_completed");
}

// Case 7 — New Revision supersedes pending old job
{
  const oldJob = reconcileAnalysisJobs(eligibleInput({
    revision: revisionFixture({ id: "aaaaaaaa-aaaa-5aaa-8aaa-aaaaaaaaaaaa" }),
  })).job;
  const next = reconcileAnalysisJobs(eligibleInput({
    revision: revisionFixture({
      id: "bbbbbbbb-bbbb-5bbb-8bbb-bbbbbbbbbbbb",
      body: `${revisionFixture().body} 정정 공지 본문 추가.`,
    }),
    existing_jobs: [oldJob],
  }));
  assertAction(next, "supersede_old_job");
  assert.deepEqual(next.supersede_job_ids, [oldJob.id]);
  assert.notEqual(next.job.revision_id, oldJob.revision_id);
}

// Case 8 — Prompt version change
{
  const v1 = reconcileAnalysisJobs(eligibleInput({
    policy: { prompt_version: "scholarship-analysis-prompt-v1" },
  }));
  const completed = { ...v1.job, status: "succeeded" };
  const v2 = reconcileAnalysisJobs(eligibleInput({
    policy: { prompt_version: "scholarship-analysis-prompt-v2" },
    existing_jobs: [completed],
  }));
  assertAction(v2, "create_job");
  assert.notEqual(v2.job.idempotency_key, completed.idempotency_key);
}

// Case 9 — Retryable failure
{
  const created = reconcileAnalysisJobs(eligibleInput()).job;
  const failed = {
    ...created,
    status: "retryable_failed",
    attempt_count: 1,
    max_attempts: 3,
  };
  const retry = reconcileAnalysisJobs(eligibleInput({ existing_jobs: [failed] }));
  assertAction(retry, "retry_existing_job");
  assert.equal(retry.job.status, "pending");
}

// Case 10 — Terminal/max-attempt failure
{
  const created = reconcileAnalysisJobs(eligibleInput()).job;
  const failed = {
    ...created,
    status: "retryable_failed",
    attempt_count: 3,
    max_attempts: 3,
  };
  const terminal = reconcileAnalysisJobs(eligibleInput({ existing_jobs: [failed] }));
  assertAction(terminal, "mark_terminal_max_attempts");
  assert.equal(terminal.job.status, "terminal_failed");
  assert.ok(terminal.reason_codes.includes("MAX_ATTEMPTS_EXCEEDED"));
}

// Case 11 — Lease contention
{
  const job = reconcileAnalysisJobs(eligibleInput()).job;
  const first = claimNoticeAnalysisJobs({
    jobs: [job],
    workerId: "worker-a",
    now: "2026-07-28T05:00:00.000Z",
    leaseSeconds: 300,
  });
  assert.equal(first.claimed.length, 1);
  const second = claimNoticeAnalysisJobs({
    jobs: first.jobs,
    workerId: "worker-b",
    now: "2026-07-28T05:01:00.000Z",
    leaseSeconds: 300,
  });
  assert.equal(second.claimed.length, 0);
}

// Case 12 — Expired lease reclaim
{
  const job = reconcileAnalysisJobs(eligibleInput()).job;
  const first = claimNoticeAnalysisJobs({
    jobs: [job],
    workerId: "worker-a",
    now: "2026-07-28T05:00:00.000Z",
    leaseSeconds: 60,
  });
  const reclaim = claimNoticeAnalysisJobs({
    jobs: first.jobs,
    workerId: "worker-b",
    now: "2026-07-28T05:02:00.000Z",
    leaseSeconds: 60,
  });
  assert.equal(reclaim.claimed.length, 1);
  assert.equal(reclaim.claimed[0].leased_by, "worker-b");
  const completed = completeNoticeAnalysisJob({
    jobs: reclaim.jobs,
    results: [validatedResultFor(reclaim.claimed[0])],
    jobId: reclaim.claimed[0].id,
    workerId: "worker-b",
    now: "2026-07-28T05:02:30.000Z",
  });
  assert.equal(completed.ok, true);
  assert.equal(completed.job.status, "succeeded");
}

// Case 13 — candidate unknown + general source → excluded
{
  const readiness = evaluateAnalysisReadiness(eligibleInput({
    candidate_classification: "",
    scholarship_dedicated: false,
    source: { scholarship_dedicated: false },
  }));
  assert.equal(readiness.ready, false);
  assert.equal(readiness.status, "excluded_not_candidate");
  assert.ok(readiness.reason_codes.includes("CANDIDATE_NOT_CONFIRMED"));
}

// Case 14 — candidate unknown + scholarship dedicated → eligible
{
  const readiness = evaluateAnalysisReadiness(eligibleInput({
    candidate_classification: "unknown",
    source: { scholarship_dedicated: true },
  }));
  assert.equal(readiness.ready, true);
  assert.equal(readiness.status, "ready");
}

// Case 15 — correction/extension/cancellation → excluded
{
  for (const noticeType of ["correction", "extension", "cancellation"]) {
    const readiness = evaluateAnalysisReadiness(eligibleInput({ notice_type: noticeType }));
    assert.equal(readiness.ready, false, noticeType);
    assert.equal(readiness.status, "excluded_notice_type", noticeType);
    assert.ok(readiness.reason_codes.includes("NOTICE_TYPE_NOT_NEW_RECRUITMENT"));
  }
}

// Case 16 — unknown notice type → excluded
{
  const readiness = evaluateAnalysisReadiness(eligibleInput({ notice_type: "unknown" }));
  assert.equal(readiness.ready, false);
  assert.equal(readiness.status, "excluded_notice_type");
}

// Case 17 — broken attachment text → excluded
{
  const readiness = evaluateAnalysisReadiness(eligibleInput({
    revision: revisionFixture({ body: "" }),
    assets: [{
      original_url_hash: "b".repeat(64),
      verification_status: "extracted",
      extracted_text: `깨짐 ${"\uFFFD".repeat(50)}`,
    }],
  }));
  assert.equal(readiness.ready, false);
  assert.ok(["excluded_low_text_quality", "blocked_invalid_payload"].includes(readiness.status));
}

// Case 18 — usable attachment text → eligible
{
  const readiness = evaluateAnalysisReadiness(eligibleInput({
    revision: revisionFixture({ body: "" }),
    assets: [{
      original_url_hash: "c".repeat(64),
      verification_status: "extracted",
      extracted_text: USABLE_ATTACHMENT,
    }],
  }));
  assert.equal(readiness.ready, true);
  assert.equal(readiness.input_profile.has_attachment_text, true);
}

// Case 19 — privacy not_scanned → provider blocked
{
  const contract = buildPrivacyRedactionContract({ status: "not_scanned" });
  assert.equal(contract.blocked_for_provider_call, true);
  const readiness = evaluateAnalysisReadiness(eligibleInput({ privacy_status: "not_scanned" }));
  assert.equal(readiness.ready, false);
  assert.equal(readiness.status, "excluded_privacy_risk");
  assert.ok(readiness.reason_codes.includes("PRIVACY_NOT_SCANNED"));
}

// Case 20 — privacy clear → provider allowed
{
  const contract = buildPrivacyRedactionContract({ status: "clear" });
  assert.equal(contract.blocked_for_provider_call, false);
  const readiness = evaluateAnalysisReadiness(eligibleInput({ privacy_status: "clear" }));
  assert.equal(readiness.ready, true);
}

// Case 21 — privacy redacted → provider allowed
{
  const contract = buildPrivacyRedactionContract({ status: "redacted" });
  assert.equal(contract.blocked_for_provider_call, false);
  const readiness = evaluateAnalysisReadiness(eligibleInput({ privacy_status: "redacted" }));
  assert.equal(readiness.ready, true);
}

// Case 22 — budget_deferred → claim 불가
{
  const deferred = {
    ...reconcileAnalysisJobs(eligibleInput()).job,
    status: "budget_deferred",
    attempt_count: 0,
    max_attempts: 3,
  };
  assert.equal(isJobClaimable({ job: deferred, now: "2026-07-28T05:00:00.000Z" }), false);
  const claim = claimNoticeAnalysisJobs({
    jobs: [deferred],
    workerId: "worker-a",
    now: "2026-07-28T05:00:00.000Z",
  });
  assert.equal(claim.claimed.length, 0);
  assert.doesNotMatch(sql, /status in \('pending', 'retryable_failed', 'budget_deferred'\)/);
  assert.match(sql, /status in \('pending', 'retryable_failed'\)/);
  const plan = reconcileAnalysisJobs(eligibleInput({ budget_deferred: true }));
  assertAction(plan, "defer_budget");
}

// Case 23 — max attempts 도달 → claim 불가
{
  const exhausted = {
    ...reconcileAnalysisJobs(eligibleInput()).job,
    status: "retryable_failed",
    attempt_count: 3,
    max_attempts: 3,
    available_at: "2026-07-28T04:00:00.000Z",
  };
  assert.equal(isJobClaimable({ job: exhausted, now: "2026-07-28T05:00:00.000Z" }), false);
  const claim = claimNoticeAnalysisJobs({
    jobs: [exhausted],
    workerId: "worker-a",
    now: "2026-07-28T05:00:00.000Z",
  });
  assert.equal(claim.claimed.length, 0);
  assert.match(sql, /j\.attempt_count < j\.max_attempts/);
}

// Case 24 — expired lease complete → reject
{
  const job = reconcileAnalysisJobs(eligibleInput()).job;
  const claimed = claimNoticeAnalysisJobs({
    jobs: [job],
    workerId: "worker-a",
    now: "2026-07-28T05:00:00.000Z",
    leaseSeconds: 60,
  });
  const stale = completeNoticeAnalysisJob({
    jobs: claimed.jobs,
    results: [validatedResultFor(claimed.claimed[0])],
    jobId: claimed.claimed[0].id,
    workerId: "worker-a",
    now: "2026-07-28T05:02:00.000Z",
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, "lease_expired");
}

// Case 25 — expired lease fail → reject
{
  const job = reconcileAnalysisJobs(eligibleInput()).job;
  const claimed = claimNoticeAnalysisJobs({
    jobs: [job],
    workerId: "worker-a",
    now: "2026-07-28T05:00:00.000Z",
    leaseSeconds: 60,
  });
  const stale = failNoticeAnalysisJob({
    jobs: claimed.jobs,
    jobId: claimed.claimed[0].id,
    workerId: "worker-a",
    now: "2026-07-28T05:02:00.000Z",
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, "lease_expired");

  // After reclaim, previous worker still rejected; current owner can complete.
  const reclaim = claimNoticeAnalysisJobs({
    jobs: claimed.jobs,
    workerId: "worker-b",
    now: "2026-07-28T05:02:00.000Z",
    leaseSeconds: 60,
  });
  assert.equal(reclaim.claimed.length, 1);
  const prevComplete = completeNoticeAnalysisJob({
    jobs: reclaim.jobs,
    results: [validatedResultFor(reclaim.claimed[0])],
    jobId: reclaim.claimed[0].id,
    workerId: "worker-a",
    now: "2026-07-28T05:02:30.000Z",
  });
  assert.equal(prevComplete.ok, false);
  assert.equal(prevComplete.reason, "lease_owner_mismatch");
  const okComplete = completeNoticeAnalysisJob({
    jobs: reclaim.jobs,
    results: [validatedResultFor(reclaim.claimed[0])],
    jobId: reclaim.claimed[0].id,
    workerId: "worker-b",
    now: "2026-07-28T05:02:30.000Z",
  });
  assert.equal(okComplete.ok, true);
}

// Case 26 — mismatched job/run/result lineage → DB contract rejects
{
  assert.match(sql, /unique \(id, notice_id, revision_id\)/);
  assert.match(sql, /unique \(id, job_id\)/);
  assert.match(sql, /foreign key \(run_id, job_id\) references public\.notice_analysis_runs\(id, job_id\)/);
  assert.match(
    sql,
    /foreign key \(job_id, notice_id, revision_id\)\s+references public\.notice_analysis_jobs\(id, notice_id, revision_id\)/s,
  );
}

// Case 27 — validated result 없는 job completion → 거부
{
  const job = reconcileAnalysisJobs(eligibleInput()).job;
  const claimed = claimNoticeAnalysisJobs({
    jobs: [job],
    workerId: "worker-a",
    now: "2026-07-28T05:00:00.000Z",
    leaseSeconds: 300,
  });
  const rejected = completeNoticeAnalysisJob({
    jobs: claimed.jobs,
    results: [],
    jobId: claimed.claimed[0].id,
    workerId: "worker-a",
    now: "2026-07-28T05:01:00.000Z",
  });
  assert.equal(rejected.ok, false);
  assert.equal(
    rejected.reason,
    "complete_notice_analysis_job_rejected_missing_validated_result",
  );
  assert.match(sql, /complete_notice_analysis_job_rejected_missing_validated_result/);
  assert.match(sql, /lease_expires_at > now\(\)/);
}

// Case 28 — migration transaction/environment guard 존재
{
  assert.match(sql, /^begin;/m);
  assert.match(sql, /Post-Phase L environment guard is required/);
  assert.match(sql, /perform public\.post_phase_l_assert_environment\(\)/);
  assert.match(sql, /ingestion_notices is required/);
  assert.match(sql, /ingestion_notice_revisions is required/);
  assert.match(sql, /ingestion_notice_assets is required/);
  assert.match(sql, /drop trigger if exists notice_analysis_jobs_set_updated_at/);
  assert.match(sql, /^commit;/m);
}

// Case 29 — SQL/JS claimable status parity
{
  assert.deepEqual([...AUTO_CLAIMABLE_JOB_STATUSES].sort(), ["pending", "retryable_failed"]);
  assert.deepEqual([...EXPIRED_LEASE_CLAIMABLE_STATUSES].sort(), ["leased", "running"]);
  assert.doesNotMatch(sql, /budget_deferred'\)\s*\n\s*and j\.available_at/);
  const claimWhere = sql.match(
    /create or replace function public\.claim_notice_analysis_jobs[\s\S]*?end;\s*\$\$;/,
  )?.[0] ?? "";
  assert.match(claimWhere, /j\.status in \('pending', 'retryable_failed'\)/);
  assert.doesNotMatch(claimWhere, /budget_deferred/);
  assert.match(claimWhere, /j\.attempt_count < j\.max_attempts/);
}

// Fingerprints deterministic
{
  const revision = revisionFixture();
  const left = buildAnalysisInputFingerprint({ revision, assets: [], source: { source_id: "s1" } });
  const right = buildAnalysisInputFingerprint({ revision, assets: [], source: { source_id: "s1" } });
  assert.equal(left, right);
  const key = buildAnalysisJobIdempotencyKey({
    revisionId: revision.id,
    inputFingerprint: left,
  });
  assert.ok(key.includes(revision.id));
  const envelope = emptyScholarshipAnalysisEnvelope();
  const fp1 = buildAnalysisResultFingerprint({ structuredResult: envelope });
  const fp2 = buildAnalysisResultFingerprint({
    structuredResult: {
      risk_flags: [],
      fields: envelope.fields,
      proposal: envelope.proposal,
      schema_version: ANALYSIS_SCHEMA_VERSION,
      document_classification: envelope.document_classification,
    },
  });
  assert.equal(fp1, fp2);
  assert.equal(DEFAULT_PROMPT_VERSION.includes("prompt"), true);
}

{
  const failed = failNoticeAnalysisJob({
    jobs: [{
      id: "job-1",
      status: "leased",
      leased_by: "worker-a",
      lease_expires_at: "2026-07-28T05:10:00.000Z",
      attempt_count: 3,
      max_attempts: 3,
    }],
    jobId: "job-1",
    workerId: "worker-a",
    now: "2026-07-28T05:00:00.000Z",
    retryable: true,
  });
  assert.equal(failed.ok, true);
  assert.equal(failed.job.status, "terminal_failed");
}

// Completed via result joins job.input_fingerprint (option B)
{
  const created = reconcileAnalysisJobs(eligibleInput());
  const resultOnly = reconcileAnalysisJobs(eligibleInput({
    existing_jobs: [created.job],
    existing_results: [{
      job_id: created.job.id,
      revision_id: created.job.revision_id,
      result_status: "validated",
      analysis_schema_version: created.job.schema_version,
    }],
  }));
  assertAction(resultOnly, "no_action_completed");
}

console.log("PASS phase 2-B analysis queue contract remediation");
